import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AngitError } from '../shared.js';
import type { FileIdentity, PlatformAdapter } from '../shared.js';
import { canonical, sha256 } from '../json.js';
import { contained, discover } from './git.js';
import type { ApprovedGit, CheckoutReceipt, Repository } from './git.js';
import type { ApprovedPolicy } from './policy.js';
import type { Registration } from './store.js';
import { covers, intersects, object, selector, strings } from './values.js';

export interface WorktreeDescription {
  attemptId: string; worktreeId: string; managedParent: string; canonicalPath: string;
  branchRef: string; ownershipMarkerId: string; baseOid: string; baseTreeOid: string;
}
export interface WorktreeAllocation extends WorktreeDescription {
  pathIdentity: FileIdentity; markerPath: string; markerFileIdentity: FileIdentity; markerHash: string;
  commonDirectoryIdentity: string; ownerCheckout: CheckoutReceipt; ownerSourceHash: string;
}
export interface WorktreeReceipt extends WorktreeAllocation { gitDirectory: FileIdentity; gitPointer: FileIdentity }
export interface SubmissionReceipt { oid: string; treeOid: string; submissionRef: string }

const LOCKFILES: Record<string, true> = {
  'package-lock.json': true, 'npm-shrinkwrap.json': true, 'pnpm-lock.yaml': true, 'yarn.lock': true,
  'bun.lock': true, 'bun.lockb': true, 'cargo.lock': true, 'composer.lock': true, 'pipfile.lock': true,
  'poetry.lock': true, 'uv.lock': true, 'gemfile.lock': true, 'go.sum': true, 'packages.lock.json': true,
};
function absent(path: string): boolean {
  try { lstatSync(path); return false; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}
function boundedFile(path: string, maximum: number): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed metadata must remain a bounded regular file; workspace is preserved');
  const bytes = readFileSync(path);
  if (bytes.length > maximum) throw new AngitError('INPUT_TOO_LARGE', 'Managed metadata read exceeded its bound');
  return bytes;
}
function utf8(bytes: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new AngitError('REPOSITORY_UNSUPPORTED', 'Managed source metadata must be valid UTF-8'); }
}
function identifier(value: string): void {
  if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(value)) throw new AngitError('STATE_INVALID', 'Worktree and attempt identities must be generated bounded identifiers');
}

/** Effects require the caller's durable intent and live serialized mutation authority. */
export class WorktreeBroker {
  constructor(private readonly platform: PlatformAdapter, private readonly repo: Repository,
    private readonly git: ApprovedGit, private readonly registration: Registration, private readonly policy: ApprovedPolicy) {}

  describe(attemptId: string, worktreeId: string, baseOid: string, baseTreeOid: string): WorktreeDescription {
    identifier(attemptId); identifier(worktreeId); identifier(this.repo.projectId);
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(baseOid) || baseTreeOid.length !== baseOid.length || !/^[0-9a-f]+$/u.test(baseTreeOid)) throw new AngitError('STATE_INVALID', 'Worktree intent requires full base commit and tree OIDs');
    const managedParent = join(this.registration.directory, 'worktrees');
    return { attemptId, worktreeId, managedParent, canonicalPath: join(managedParent, worktreeId),
      branchRef: `refs/angit/${this.repo.projectId}/tasks/${attemptId}`,
      ownershipMarkerId: `own_${sha256(`${this.registration.registrationId}:${attemptId}:${worktreeId}`).slice(0, 48)}`, baseOid, baseTreeOid };
  }

  private assertDescription(description: WorktreeDescription): void {
    if (canonical(description) !== canonical(this.describe(description.attemptId, description.worktreeId, description.baseOid, description.baseTreeOid))) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed destinations and refs must exactly match the generated durable intent');
  }
  private description(receipt: WorktreeAllocation): WorktreeDescription {
    const { attemptId, worktreeId, managedParent, canonicalPath, branchRef, ownershipMarkerId, baseOid, baseTreeOid } = receipt;
    return { attemptId, worktreeId, managedParent, canonicalPath, branchRef, ownershipMarkerId, baseOid, baseTreeOid };
  }
  private stateDirectory(): FileIdentity {
    const state = this.platform.assertPrivateDirectory(this.registration.directory);
    if (state.identity !== this.registration.directoryIdentity || state.canonicalPath !== this.registration.directory ||
      this.registration.projectId !== this.repo.projectId || this.registration.repositoryIdentity !== this.repo.repositoryIdentity ||
      this.registration.commonDir !== this.repo.common.canonicalPath || contained(this.repo.root.canonicalPath, state.canonicalPath) || contained(this.repo.common.canonicalPath, state.canonicalPath)) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Registered owner-private state and repository identities must remain exact');
    return state;
  }
  private privateChild(path: string, create: boolean): FileIdentity {
    const state = this.stateDirectory();
    if (!contained(state.canonicalPath, path) || path === state.canonicalPath) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed storage must remain beneath registered owner-private state');
    const id = create && absent(path) ? this.platform.preparePrivateDirectory(path) : this.platform.assertPrivateDirectory(path);
    if (id.canonicalPath !== path || id.ownerSid !== state.ownerSid || !id.directory || id.reparsePoint || !id.localDisk) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed directory must have exact protected local owner identity');
    return id;
  }
  private markerBytes(description: WorktreeDescription, identity: FileIdentity): string {
    return canonical({ schemaVersion: 'angit-worktree-ownership/v1', projectId: this.repo.projectId,
      registrationId: this.registration.registrationId, repositoryIdentity: this.repo.repositoryIdentity,
      commonDirectoryIdentity: this.repo.common.identity, ...description, pathIdentity: identity });
  }
  private async ownerSource(): Promise<string> {
    const status = await this.git.runBytes(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching']);
    const diff = await this.git.runBytes(['diff', '--no-ext-diff', '--no-textconv', '--binary', '--']);
    const hash = createHash('sha256').update(`${status.length}:`).update(status).update(`${diff.length}:`).update(diff);
    const untracked = utf8(await this.git.runBytes(['ls-files', '--others', '-z'])).split('\0').filter(Boolean);
    let bytesRead = 0;
    if (untracked.length > 32_768) throw new AngitError('INPUT_TOO_LARGE', 'Owner untracked source observation exceeded its file bound');
    for (const path of untracked) {
      selector(path);
      const filename = join(this.repo.root.canonicalPath, path), identity = this.platform.identify(filename);
      if (identity.reparsePoint || identity.directory || !identity.localDisk || !contained(this.repo.root.canonicalPath, identity.canonicalPath)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Owner untracked source requires ordinary local files for preservation evidence');
      const bytes = boundedFile(filename, 4_194_304);
      bytesRead += bytes.length;
      if (bytesRead > 33_554_432) throw new AngitError('INPUT_TOO_LARGE', 'Owner untracked source observation exceeded its byte bound');
      hash.update(`${Buffer.byteLength(path)}:${path}:${bytes.length}:`).update(bytes);
    }
    return hash.digest('hex');
  }
  private async preserveOwner(receipt: WorktreeAllocation): Promise<void> {
    if (canonical(await this.git.checkoutReceipt()) !== canonical(receipt.ownerCheckout) || await this.ownerSource() !== receipt.ownerSourceHash) throw new AngitError('OWNER_CHECKOUT_CHANGED', 'Owner checkout, index, nonmanaged refs or source changed; managed workspace is preserved');
  }

  async provision(description: WorktreeDescription, onAllocated: (allocation: WorktreeAllocation) => Promise<void>): Promise<WorktreeReceipt> {
    this.assertDescription(description);
    this.stateDirectory();
    await this.git.audit();
    const base = await this.git.base(description.baseOid);
    if (base.tree !== description.baseTreeOid) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Approved base tree does not match the durable worktree intent');
    if (await this.git.ref(description.branchRef) !== null || await this.git.ref(`refs/angit/${this.repo.projectId}/submissions/${description.attemptId}`) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Private branch or submission ref already exists; no adoption or force is permitted');
    const registrations = (await this.git.run(['worktree', 'list', '--porcelain', '-z'])).split('\0');
    if (registrations.some(entry => entry.startsWith('worktree ') && resolve(entry.slice(9)).toLowerCase() === description.canonicalPath.toLowerCase())) throw new AngitError('RECOVERY_REQUIRED', 'Git already registers this managed destination; preserve unknown worktree metadata');
    this.privateChild(description.managedParent, true);
    const markerParent = join(this.registration.directory, 'worktree-ownership');
    this.privateChild(markerParent, true);
    const markerPath = join(markerParent, `${description.worktreeId}.json`);
    if (!absent(description.canonicalPath) || !absent(markerPath)) throw new AngitError('RECOVERY_REQUIRED', 'Managed target or ownership marker already exists; preserve it without adoption');
    const ownerCheckout = await this.git.checkoutReceipt(), ownerSourceHash = await this.ownerSource();
    const pathIdentity = this.platform.preparePrivateDirectory(description.canonicalPath);
    if (pathIdentity.canonicalPath !== description.canonicalPath || pathIdentity.ownerSid !== this.stateDirectory().ownerSid || readdirSync(pathIdentity.canonicalPath).length !== 0) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Native allocation did not produce the exact protected empty target');
    const markerBytes = this.markerBytes(description, pathIdentity);
    const descriptor = openSync(markerPath, 'wx', 0o600);
    try { writeFileSync(descriptor, markerBytes); fsyncSync(descriptor); }
    finally { closeSync(descriptor); }
    const markerFileIdentity = this.platform.assertPrivateFile(markerPath);
    if (markerFileIdentity.canonicalPath !== markerPath || markerFileIdentity.ownerSid !== pathIdentity.ownerSid) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Ownership marker does not have exact owner-private identity');
    const allocation: WorktreeAllocation = { ...description, pathIdentity, markerPath, markerFileIdentity,
      markerHash: sha256(markerBytes), commonDirectoryIdentity: this.repo.common.identity, ownerCheckout, ownerSourceHash };
    // Allocation facts must be durable before any branch, checkout or HEAD effect.
    await onAllocated(allocation);
    this.assertAllocation(allocation);
    if (readdirSync(description.canonicalPath).length !== 0 || await this.git.ref(description.branchRef) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Allocated path or private ref changed before checkout; preserve the unresolved effect');
    await this.preserveOwner(allocation);
    await this.git.audit();
    await this.git.run(['update-ref', '--no-deref', '--stdin'], `start\ncreate ${description.branchRef} ${base.oid}\nprepare\ncommit\n`);
    this.assertAllocation(allocation);
    if (await this.git.ref(description.branchRef) !== base.oid || readdirSync(description.canonicalPath).length !== 0) throw new AngitError('RECOVERY_REQUIRED', 'Allocated path or create-only private ref changed before worktree creation');
    await this.git.run(['worktree', 'add', '--detach', '--', description.canonicalPath, base.oid]);
    const managed = this.managedRepository(allocation);
    const managedGit = this.git.forWorktree(managed);
    await managedGit.audit();
    if ((await managedGit.run(['rev-parse', '--verify', 'HEAD^{commit}'])).trim() !== base.oid) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'New managed HEAD does not match approved base');
    await managedGit.run(['symbolic-ref', 'HEAD', description.branchRef]);
    const receipt: WorktreeReceipt = { ...allocation, gitDirectory: managed.gitDir,
      gitPointer: this.platform.identify(join(description.canonicalPath, '.git')) };
    await this.inspect(receipt);
    return receipt;
  }

  private assertAllocation(receipt: WorktreeAllocation): void {
    const description = this.description(receipt);
    this.assertDescription(description);
    this.privateChild(description.managedParent, false);
    const path = this.privateChild(description.canonicalPath, false);
    const markerPath = join(this.registration.directory, 'worktree-ownership', `${receipt.worktreeId}.json`);
    this.privateChild(dirname(markerPath), false);
    const marker = this.platform.assertPrivateFile(markerPath);
    const markerBytes = boundedFile(markerPath, 65_536);
    if (receipt.markerPath !== markerPath || marker.canonicalPath !== markerPath || marker.identity !== receipt.markerFileIdentity.identity ||
      marker.ownerSid !== path.ownerSid || canonical(path) !== canonical(receipt.pathIdentity) || receipt.commonDirectoryIdentity !== this.repo.common.identity ||
      this.platform.identify(this.repo.common.canonicalPath).identity !== this.repo.common.identity ||
      sha256(markerBytes) !== receipt.markerHash || markerBytes.toString('utf8') !== this.markerBytes(description, path)) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed path or ownership marker identity changed; preserve the workspace');
  }
  private managedRepository(receipt: WorktreeAllocation): Repository {
    const managed = discover(this.platform, receipt.canonicalPath);
    if (managed.root.canonicalPath !== receipt.canonicalPath || managed.root.identity !== receipt.pathIdentity.identity ||
      managed.common.identity !== this.repo.common.identity || managed.gitDir.identity === this.repo.gitDir.identity ||
      !contained(join(this.repo.common.canonicalPath, 'worktrees'), managed.gitDir.canonicalPath) || managed.gitDir.reparsePoint) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed checkout must point to its own administrative directory in the exact approved common root');
    const pointer = this.platform.identify(join(receipt.canonicalPath, '.git'));
    if (pointer.directory || pointer.reparsePoint || !pointer.localDisk) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed .git pointer must be a regular local file');
    const backlink = utf8(boundedFile(join(managed.gitDir.canonicalPath, 'gitdir'), 8192)).trim();
    if (resolve(managed.gitDir.canonicalPath, backlink) !== pointer.canonicalPath) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed Git administrative backlink does not match the owned checkout');
    return managed;
  }

  async inspect(receipt: WorktreeReceipt): Promise<void> {
    this.assertAllocation(receipt);
    const managed = this.managedRepository(receipt);
    const pointer = this.platform.identify(join(receipt.canonicalPath, '.git'));
    if (canonical(managed.gitDir) !== canonical(receipt.gitDirectory) || canonical(pointer) !== canonical(receipt.gitPointer)) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed Git directory or pointer FileID changed');
    const managedGit = this.git.forWorktree(managed);
    await managedGit.audit();
    if ((await managedGit.run(['symbolic-ref', '--no-recurse', 'HEAD'])).trim() !== receipt.branchRef) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed HEAD must route only to the exact owned private branch');
    const head = (await managedGit.run(['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    if (await this.git.ref(receipt.branchRef) !== head) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Managed branch must be a direct ref to current owned HEAD');
    await this.preserveOwner(receipt);
  }

  private sourceObjects(root: string): void {
    const pending = [root];
    const cases: Record<string, string> = Object.create(null) as Record<string, string>;
    let count = 0;
    while (pending.length) {
      const directory = pending.pop()!;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (directory === root && entry.name === '.git') continue;
        if (++count > 32_768) throw new AngitError('INPUT_TOO_LARGE', 'Managed source filesystem audit exceeded its bound');
        const path = join(directory, entry.name), stat = lstatSync(path), identity = this.platform.identify(path);
        const sourcePath = selector(relative(root, path).replaceAll('\\', '/'));
        if (sourcePath.split('/').some(part => part.toLowerCase() === '.git') || Object.hasOwn(cases, sourcePath.toLowerCase())) throw new AngitError('SUBMISSION_INVALID', 'Source paths contain administrative escapes or case collisions');
        cases[sourcePath.toLowerCase()] = sourcePath;
        if (stat.isSymbolicLink() || identity.reparsePoint || !identity.localDisk || !stat.isFile() && !stat.isDirectory() ||
          !contained(root, identity.canonicalPath) || identity.canonicalPath !== path) throw new AngitError('SUBMISSION_INVALID', 'Source symlinks, reparse/device objects and path aliases are unsupported; workspace is preserved');
        if (stat.isDirectory()) pending.push(path);
      }
    }
  }
  private scope(path: string, taskPaths: string[], workspace: Record<string, unknown>): void {
    selector(path);
    const parts = path.split('/');
    if (parts.some(part => part.toLowerCase() === '.git') ||
      !taskPaths.some(allowed => covers(allowed, path)) || !this.policy.allowedPaths.some(allowed => covers(allowed, path)) ||
      this.policy.protectedPaths.some(protectedPath => intersects(protectedPath, path)) ||
      workspace.allowLockfileChange !== true && Object.hasOwn(LOCKFILES, parts.at(-1)!.toLowerCase())) throw new AngitError('SUBMISSION_SCOPE_DENIED', 'Submission path exceeds immutable task/owner scope or modifies a protected path');
  }

  /** Caller proves writer-tree termination and serializes cancellation before entering capture. */
  async capture(receipt: WorktreeReceipt, baseOid: string, spec: Record<string, unknown>, submissionRef: string): Promise<SubmissionReceipt> {
    return await this.submission(receipt, baseOid, spec, submissionRef, 'pin');
  }

  /** Reconcile only an already persisted capture intent after independently proved termination. */
  async verifySubmission(receipt: WorktreeReceipt, baseOid: string, spec: Record<string, unknown>, submissionRef: string): Promise<SubmissionReceipt> {
    return await this.submission(receipt, baseOid, spec, submissionRef, 'verify');
  }

  private async submission(receipt: WorktreeReceipt, baseOid: string, spec: Record<string, unknown>, submissionRef: string, mode: 'pin' | 'verify'): Promise<SubmissionReceipt> {
    if (baseOid !== receipt.baseOid || submissionRef !== `refs/angit/${this.repo.projectId}/submissions/${receipt.attemptId}`) throw new AngitError('SUBMISSION_INVALID', 'Submission base and create-only ref must bind the exact managed attempt');
    const taskPaths = strings(spec.scopePaths, 'scopePaths').map(selector);
    const workspace = object(this.policy.value.workspace, 'workspace');
    await this.inspect(receipt);
    const existingPin = await this.git.ref(submissionRef);
    if (mode === 'pin' && existingPin !== null || mode === 'verify' && existingPin === null) throw new AngitError('RECOVERY_REQUIRED', 'Submission ref presence does not match the durable capture or reconciliation operation');
    const managedGit = this.git.forWorktree(this.managedRepository(receipt));
    this.sourceObjects(receipt.canonicalPath);
    // Ignored files are also source dirtiness: no hidden generated output is silently accepted.
    if ((await managedGit.runBytes(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'])).length !== 0) throw new AngitError('SUBMISSION_DIRTY', 'Tracked, untracked or ignored source remains dirty; no autocommit or cleanup is performed');
    const index = utf8(await managedGit.runBytes(['ls-files', '-v', '-z']));
    if (index.split('\0').some(entry => entry && (!/^[HMRCK?] /u.test(entry) || entry[0] !== entry[0]!.toUpperCase()))) throw new AngitError('SUBMISSION_INVALID', 'Skip-worktree or assume-unchanged index flags cannot establish clean source');
    const oid = (await managedGit.run(['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    if (mode === 'verify' && existingPin !== oid) throw new AngitError('RECOVERY_REQUIRED', 'Persisted submission ref does not match the exact current owned HEAD; preserve unknown history');
    const current = await managedGit.base(oid);
    if ((await managedGit.run(['merge-base', baseOid, oid])).trim() !== baseOid) throw new AngitError('SUBMISSION_ANCESTRY_DENIED', 'Managed HEAD does not descend from its immutable approved base');
    const raw = utf8(await managedGit.runBytes(['diff-tree', '--no-commit-id', '-r', '--raw', '-z', '--no-abbrev', '--no-ext-diff', '--no-textconv', '-M', baseOid, oid, '--'])).split('\0');
    const auditedBlobs: Record<string, true> = Object.create(null) as Record<string, true>;
    for (let position = 0; position < raw.length && raw[position];) {
      const header = raw[position++]!;
      const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-9a-f]{40}|[0-9a-f]{64}) ([AMDT]|R[0-9]+)$/u.exec(header);
      if (!match) throw new AngitError('SUBMISSION_INVALID', 'Unsupported or malformed committed change metadata');
      const [, oldMode, newMode, oldOid, newOid, status] = match;
      for (const mode of [oldMode, newMode]) if (!['000000', '100644', '100755'].includes(mode!)) throw new AngitError('SUBMISSION_INVALID', 'Submission symlink, submodule or unsupported source mode is forbidden');
      if ((status === 'D' || status!.startsWith('R')) && workspace.allowDeletion !== true) throw new AngitError('SUBMISSION_SCOPE_DENIED', 'Owner policy does not permit source deletion or rename removal');
      const path = raw[position++];
      if (!path) throw new AngitError('SUBMISSION_INVALID', 'Committed change path is missing');
      this.scope(path, taskPaths, workspace);
      if (status!.startsWith('R')) {
        const destination = raw[position++];
        if (!destination) throw new AngitError('SUBMISSION_INVALID', 'Rename destination is missing');
        this.scope(destination, taskPaths, workspace);
      }
      if (workspace.allowBinary !== true) for (const blobOid of [oldOid!, newOid!]) {
        if (/^0+$/u.test(blobOid) || Object.hasOwn(auditedBlobs, blobOid)) continue;
        const bytes = await managedGit.runBytes(['cat-file', 'blob', blobOid]);
        if (bytes.includes(0)) throw new AngitError('SUBMISSION_SCOPE_DENIED', 'Owner policy does not permit binary source changes');
        try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new AngitError('SUBMISSION_SCOPE_DENIED', 'Owner policy does not permit non-UTF-8 binary source changes'); }
        auditedBlobs[blobOid] = true;
      }
    }
    if (workspace.allowBinary !== true && utf8(await managedGit.runBytes(['diff', '--numstat', '-z', '--no-ext-diff', '--no-textconv', baseOid, oid, '--'])).split('\0').some(entry => entry.startsWith('-\t-\t'))) throw new AngitError('SUBMISSION_SCOPE_DENIED', 'Owner policy does not permit Git-classified binary changes');
    await this.inspect(receipt);
    if ((await managedGit.run(['rev-parse', '--verify', 'HEAD^{commit}'])).trim() !== oid ||
      (await managedGit.runBytes(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignored=matching'])).length !== 0) throw new AngitError('SUBMISSION_INVALID', 'Owned HEAD or source cleanliness changed before pinning');
    if (mode === 'pin') {
      if (await this.git.ref(submissionRef) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Submission namespace changed before its create-only effect');
      await this.git.run(['update-ref', '--no-deref', '--stdin'], `start\nverify ${receipt.branchRef} ${oid}\ncreate ${submissionRef} ${oid}\nprepare\ncommit\n`);
    }
    if (await this.git.ref(submissionRef) !== oid) throw new AngitError('RECOVERY_REQUIRED', 'Submission effect readback is unknown; do not replay or release its ownership');
    await this.preserveOwner(receipt);
    return { oid, treeOid: current.tree, submissionRef };
  }
}
