import { Worker } from 'node:worker_threads';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AngitError } from '../shared.js';
import type { FileIdentity, PlatformAdapter } from '../shared.js';
import { sha256 } from '../json.js';
import { object, selector, text } from './values.js';
import type { GitProcessRequest, GitProcessResult } from './git-process.js';

export interface Repository { root: FileIdentity; gitDir: FileIdentity; common: FileIdentity; repositoryIdentity: string; projectId: string }
export function contained(parent: string, child: string): boolean {
  const part = relative(parent, child);
  return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}
function localDirectory(platform: PlatformAdapter, path: string): FileIdentity {
  const id = platform.identify(path);
  if (!id.directory || !id.localDisk) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Repository directories require a verified local disk');
  return id;
}
function boundedPointer(path: string): string {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git directory pointer is not a bounded regular file');
  const bytes = readFileSync(path);
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  if (!value || /[\r\n\u0000]/u.test(value)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git directory pointer must contain one path');
  return value;
}
export function discover(platform: PlatformAdapter, repoPath: string): Repository {
  let root = localDirectory(platform, resolve(repoPath));
  for (let depth = 0; depth < 64; depth++) {
    const marker = join(root.canonicalPath, '.git');
    if (existsSync(marker)) {
      const entry = lstatSync(marker);
      if (entry.isSymbolicLink()) throw new AngitError('REPOSITORY_UNSUPPORTED', 'A .git symlink is unsupported');
      let gitPath = marker;
      if (!entry.isDirectory()) {
        const pointer = boundedPointer(marker);
        if (!pointer.startsWith('gitdir: ')) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Invalid .git file');
        gitPath = resolve(root.canonicalPath, pointer.slice(8));
      }
      const gitDir = localDirectory(platform, gitPath);
      const commonPointer = join(gitDir.canonicalPath, 'commondir');
      const common = localDirectory(platform, existsSync(commonPointer) ? resolve(gitDir.canonicalPath, boundedPointer(commonPointer)) : gitDir.canonicalPath);
      if (!existsSync(join(common.canonicalPath, 'config')) || !existsSync(join(common.canonicalPath, 'objects')) || !existsSync(join(gitDir.canonicalPath, 'HEAD'))) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Incomplete Git directory layout');
      const repositoryIdentity = sha256(common.identity);
      return { root, gitDir, common, repositoryIdentity, projectId: `prj_${repositoryIdentity.slice(0, 48)}` };
    }
    const parent = dirname(root.canonicalPath);
    if (parent === root.canonicalPath) break;
    root = localDirectory(platform, parent);
  }
  throw new AngitError('REPOSITORY_UNSUPPORTED', 'No bounded existing checkout/common-directory discovery succeeded');
}
export interface GitBinding { path: string; sha256: string }
export interface BaseIdentity { oid: string; tree: string; format: 'sha1' | 'sha256' }
export interface CheckoutReceipt { headHash: string; indexHash: string | null; refs: string }
export class ApprovedGit {
  readonly binding: GitBinding;
  constructor(private readonly platform: PlatformAdapter, private readonly repository: Repository,
    private readonly gitPolicy: Record<string, unknown>, private readonly privateRoot: string) {
    const binding = object(gitPolicy.executable, 'git.executable');
    this.binding = { path: text(binding.path, 'git.executable.path'), sha256: text(binding.sha256, 'git.executable.sha256') };
    if (!isAbsolute(this.binding.path) || !/\.exe$/iu.test(this.binding.path)) throw new AngitError('POLICY_NOT_APPROVED', 'Approve a real absolute Git executable, not a shell launcher');
  }
  private admissionCheck: (() => void) | undefined;
  setAdmissionCheck(check: () => void): void { this.admissionCheck = check; }
  forWorktree(repository: Repository): ApprovedGit {
    if (repository.common.identity !== this.repository.common.identity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Managed worktree must retain the approved common directory');
    const scoped = new ApprovedGit(this.platform, repository, this.gitPolicy, this.privateRoot);
    if (this.admissionCheck) scoped.setAdmissionCheck(this.admissionCheck);
    return scoped;
  }
  async runBytes(args: string[], input?: string): Promise<Buffer> { return this.runResult(args, input); }
  private fingerprint(): string {
    const id = this.platform.identify(this.binding.path);
    const before = statSync(id.canonicalPath);
    if (id.directory || id.reparsePoint || !id.localDisk || !before.isFile() || before.size > 268_435_456) throw new AngitError('POLICY_NOT_APPROVED', 'Git executable must be a bounded regular local executable');
    const digest = sha256(readFileSync(id.canonicalPath));
    const after = statSync(id.canonicalPath), readback = this.platform.identify(this.binding.path);
    if (digest !== this.binding.sha256 || readback.identity !== id.identity || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new AngitError('EXECUTABLE_IDENTITY_CHANGED', 'Approved Git executable hash or identity does not match');
    return id.canonicalPath;
  }
  async run(args: string[], input?: string): Promise<string> {
    const bytes = await this.runBytes(args, input);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git metadata must be valid UTF-8'); }
  }
  private async runResult(args: string[], input?: string): Promise<Buffer>;
  private async runResult(args: string[], input: string | undefined, absentExitCode: number): Promise<Buffer | null>;
  private async runResult(args: string[], input?: string, absentExitCode?: number): Promise<Buffer | null> {
    this.admissionCheck?.();
    if (args.length > 64 || args.some(arg => arg.includes('\0')) || args.reduce((n, arg) => n + Buffer.byteLength(arg), 0) > 32768 || input !== undefined && Buffer.byteLength(input) > 32768) throw new AngitError('INPUT_TOO_LARGE', 'Git argument/input bound exceeded');
    const executable = this.fingerprint();
    if (this.platform.identify(this.repository.common.canonicalPath).identity !== this.repository.common.identity ||
      this.platform.identify(this.repository.gitDir.canonicalPath).identity !== this.repository.gitDir.identity ||
      this.platform.identify(this.repository.root.canonicalPath).identity !== this.repository.root.identity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Repository identity changed before approved Git execution');
    const hooks = this.platform.identify(join(this.privateRoot, 'hooks'));
    if (!hooks.directory || hooks.reparsePoint || !hooks.localDisk || readdirSync(hooks.canonicalPath).length !== 0) throw new AngitError('POLICY_NOT_APPROVED', 'Controlled hooks directory must remain empty');
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (!systemRoot || !isAbsolute(systemRoot)) throw new AngitError('PLATFORM_UNSUPPORTED', 'Verified Windows system root is required');
    const system = this.platform.identify(join(systemRoot, 'System32'));
    if (!system.directory || !system.localDisk) throw new AngitError('PLATFORM_UNSUPPORTED', 'Windows system directory is unsupported');
    const env: NodeJS.ProcessEnv = {
      SystemRoot: systemRoot, WINDIR: systemRoot, PATH: `${dirname(executable)};${system.canonicalPath}`,
      HOME: this.privateRoot, USERPROFILE: this.privateRoot, TEMP: this.privateRoot, TMP: this.privateRoot,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_PAGER: '', PAGER: '', GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1',
      GIT_ALLOW_PROTOCOL: '', GIT_PROTOCOL_FROM_USER: '0', LC_ALL: 'C', LANG: 'C'
    };
    const controlled = ['--no-pager', '-c', `core.hooksPath=${hooks.canonicalPath}`, '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'core.attributesFile=NUL',
      '-c', 'credential.helper=', '-c', 'core.askPass=', '-c', 'protocol.allow=never', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
      `--git-dir=${this.repository.gitDir.canonicalPath}`, `--work-tree=${this.repository.root.canonicalPath}`, ...args];
    const result = await new Promise<GitProcessResult>((resolveResult, reject) => {
      const request: GitProcessRequest = { executable, args: controlled, cwd: this.repository.root.canonicalPath, env, input };
      let worker: Worker;
      try {
        worker = new Worker(new URL('./git-process.js', import.meta.url), {
          workerData: request, execArgv: [], env: {}, stdout: true, stderr: true,
        });
      } catch {
        reject(new AngitError('GIT_EXECUTION_FAILED', 'Approved Git process worker could not start'));
        return;
      }
      // Retain the worker until actual closure; never turn a pending Git effect into a daemon.
      worker.stdout.resume();
      worker.stderr.resume();
      let response: GitProcessResult | undefined, failure: AngitError | undefined;
      worker.on('message', (value: GitProcessResult) => {
        if (response) failure ??= new AngitError('GIT_EXECUTION_FAILED', 'Approved Git returned more than one process result');
        else response = value;
      });
      worker.once('error', () => { failure ??= new AngitError('GIT_EXECUTION_FAILED', 'Approved Git process worker failed'); });
      worker.once('exit', code => {
        if (failure) reject(failure);
        else if (code !== 0 || response === undefined) reject(new AngitError('GIT_EXECUTION_FAILED', 'Approved Git process worker closed without its completed result'));
        else resolveResult(response);
      });
    });
    if (result.errorCode === 'ETIMEDOUT') throw new AngitError('GIT_TIMEOUT', 'Git exceeded its metadata deadline');
    if (result.errorCode === 'ENOBUFS' || result.stdout.byteLength + result.stderr.byteLength > 4_194_304) throw new AngitError('GIT_OUTPUT_TOO_LARGE', 'Git output exceeded its bound');
    if (result.errorCode !== null) throw new AngitError('GIT_EXECUTION_FAILED', 'Approved Git could not execute its bounded command');
    if (result.signal !== null || result.status !== 0 && result.status !== absentExitCode) {
      const error = new AngitError('GIT_EXECUTION_FAILED', `Approved Git failed with exit ${result.status}; no whole-command retry is performed`);
      // Bounded raw diagnostics are internal only, never part of the public error message/JSON.
      Object.defineProperty(error, 'cause', { value: { command: args[0], exitCode: result.status, stderr: Buffer.from(result.stderr.buffer, result.stderr.byteOffset, result.stderr.byteLength) } });
      throw error;
    }
    this.admissionCheck?.();
    return result.status === absentExitCode ? null : Buffer.from(result.stdout.buffer, result.stdout.byteOffset, result.stdout.byteLength);
  }
  async audit(): Promise<void> {
    // worktreeConfig is unsupported below, so the common local config is the only
    // effective repository config. --worktree itself fails once a second checkout exists.
    const values = (await this.run(['config', '--local', '--no-includes', '--null', '--list'])).split('\0').filter(Boolean);
    for (const entry of values) {
      const split = entry.indexOf('\n'), key = entry.slice(0, split).toLowerCase(), value = entry.slice(split + 1).toLowerCase();
      if (split < 1 || /^(?:include\.|includeif\.|filter\.|credential\.|url\.|submodule\.)/u.test(key) || /^merge\..*\.(?:driver|recursive)$/u.test(key) ||
        ['core.sshcommand', 'core.gitproxy', 'core.worktree', 'core.hookspath', 'core.attributesfile'].includes(key) ||
        ['core.fsmonitor', 'core.sparsecheckout', 'core.sparsecheckoutcone'].includes(key) && value !== 'false' ||
        key === 'extensions.worktreeconfig' && value !== 'false' || key.startsWith('extensions.') && !['extensions.objectformat', 'extensions.worktreeconfig'].includes(key)) {
        throw new AngitError('REPOSITORY_UNSUPPORTED', `Unsupported executable/configuration authority: ${key}`);
      }
    }
    if ((await this.run(['rev-parse', '--is-shallow-repository'])).trim() !== 'false' || existsSync(join(this.repository.gitDir.canonicalPath, 'info', 'sparse-checkout'))) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Shallow and sparse repositories are unsupported');
    const format = (await this.run(['rev-parse', '--show-object-format'])).trim();
    if (!['sha1', 'sha256'].includes(format)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Unsupported Git object format');
    try {
      const head = (await this.run(['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
      if (!new RegExp(`^[0-9a-f]{${format === 'sha1' ? 40 : 64}}$`, 'u').test(head)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Owner checkout has no full existing commit');
    } catch (error) {
      if (error instanceof AngitError && error.code === 'GIT_EXECUTION_FAILED') throw new AngitError('REPOSITORY_UNSUPPORTED', 'Unborn owner repositories are unsupported');
      throw error;
    }
    if (existsSync(join(this.repository.common.canonicalPath, 'modules'))) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Configured submodules are unsupported');
    const attributesPath = join(this.repository.common.canonicalPath, 'info', 'attributes');
    if (existsSync(attributesPath)) {
      const info = lstatSync(attributesPath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git info attributes require a bounded regular file');
      const attributes = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(attributesPath));
      if (/(?:^|\s)(?:filter(?:=|\s|$)|merge=(?!(?:text|binary|union)(?:\s|$)))/mu.test(attributes)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Unapproved info filter/merge attributes are unsupported');
    }
  }
  async contractPin(oid: string, path: string, digest: string): Promise<void> {
    if ((await this.run(['cat-file', '-t', oid])).trim() !== 'commit') throw new AngitError('INVALID_INPUT', 'Contract pin must bind an existing commit');
    const bytes = await this.runBytes(['cat-file', 'blob', `${oid}:${path}`]);
    if (sha256(bytes) !== digest) throw new AngitError('CONTRACT_HASH_MISMATCH', 'Immutable contract bytes do not match their approved pin');
  }
  async base(oid: string): Promise<BaseIdentity> {
    const format = (await this.run(['rev-parse', '--show-object-format'])).trim();
    if (format !== 'sha1' && format !== 'sha256' || !new RegExp(`^[0-9a-f]{${format === 'sha1' ? 40 : 64}}$`, 'u').test(oid)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Base must be a full object-format-matching OID');
    if ((await this.run(['cat-file', '-t', oid])).trim() !== 'commit') throw new AngitError('REPOSITORY_UNSUPPORTED', 'Approved base must identify an existing commit');
    const tree = (await this.run(['rev-parse', '--verify', `${oid}^{tree}`])).trim();
    const names = new Set<string>(), cases = new Map<string, string>();
    let attributeFiles = 0;
    for (const entry of (await this.run(['ls-tree', '-r', '-z', '--full-tree', oid])).split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t'), mode = entry.slice(0, 6), path = entry.slice(tab + 1);
      if (tab < 0 || mode === '160000' || mode === '120000' || path !== path.normalize('NFC')) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Submodule, symlink or unsupported tree path');
      selector(path);
      if (path.split('/')[0]?.toLowerCase() === '.git') throw new AngitError('REPOSITORY_UNSUPPORTED', 'Source tree cannot contain Git administrative paths');
      if (path.split('/').at(-1) === '.gitattributes') {
        if (++attributeFiles > 100) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Attribute audit bound exceeded');
        const attributes = await this.run(['cat-file', 'blob', `${oid}:${path}`]);
        if (/(?:^|\s)(?:filter(?:=|\s|$)|merge=(?!(?:text|binary|union)(?:\s|$)))/mu.test(attributes)) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Unapproved filter/LFS/merge attributes are unsupported');
      }
      if (names.has(path.toLowerCase())) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git tree has a case collision');
      names.add(path.toLowerCase());
      let prefix = '';
      for (const part of path.split('/')) {
        prefix = prefix ? `${prefix}/${part}` : part;
        const prior = cases.get(prefix.toLowerCase());
        if (prior !== undefined && prior !== prefix) throw new AngitError('REPOSITORY_UNSUPPORTED', 'Git tree has a directory case collision');
        cases.set(prefix.toLowerCase(), prefix);
      }
    }
    return { oid, tree, format };
  }
  async ref(name: string): Promise<string | null> {
    // Unlike for-each-ref, symbolic-ref also observes dangling symbolic refs.
    // Exit 1 means "not symbolic"; exit 128 and execution failures remain errors.
    if (await this.runResult(['symbolic-ref', '--quiet', '--no-recurse', name], undefined, 1) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Managed refs must be direct refs; existing symbolic refs are preserved, not adopted or repaired');
    const result = await this.run(['for-each-ref', '--format=%(refname) %(objectname) %(symref)', name]);
    const exact = result.split('\n').find(line => line.startsWith(`${name} `));
    if (!exact) return null;
    const [oid, symbolicTarget] = exact.slice(name.length + 1).split(' ');
    if (symbolicTarget) throw new AngitError('RECOVERY_REQUIRED', 'Managed ref changed to a symbolic ref during observation; preserve it for recovery');
    return oid!;
  }
  async checkoutReceipt(): Promise<CheckoutReceipt> {
    const index = join(this.repository.gitDir.canonicalPath, 'index');
    if (existsSync(index) && statSync(index).size > 67_108_864) throw new AngitError('INPUT_TOO_LARGE', 'Owner index observation exceeds its bound');
    return { headHash: sha256(readFileSync(join(this.repository.gitDir.canonicalPath, 'HEAD'))), indexHash: existsSync(index) ? sha256(readFileSync(index)) : null,
      refs: (await this.run(['for-each-ref', '--format=%(refname) %(objectname)'])).split('\n').filter(line => line && !line.startsWith('refs/angit/')).sort().join('\n') };
  }
  async createRefs(baseline: string, integration: string, oid: string): Promise<void> {
    if (await this.ref(baseline) !== null || await this.ref(integration) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Generated refs already exist before the create-only transaction; no adoption or force is allowed');
    const current = this.platform.identify(this.repository.common.canonicalPath);
    if (current.identity !== this.repository.common.identity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Common-directory identity changed before Git effect');
    await this.run(['update-ref', '--no-deref', '--stdin'], `start\ncreate ${baseline} ${oid}\ncreate ${integration} ${oid}\nprepare\ncommit\n`);
  }
}
