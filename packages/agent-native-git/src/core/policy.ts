import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { AngitError } from '../shared.js';
import type { PlatformAdapter } from '../shared.js';
import { canonical, readJsonFile, sha256, validateSchema } from '../json.js';
import { contained, discover } from './git.js';
import type { Repository } from './git.js';
import { integer, object, selector, strings, text } from './values.js';

export interface ApprovedPolicy {
  value: Record<string, unknown>; path: string; fileIdentity: string; hash: string; bytes: string;
  profiles: Record<string, unknown>[]; profilesPath: string | null; profilesIdentity: string | null;
  profilesHash: string; profilesBytes: string; ownerCapabilities: string[];
  allowedPaths: string[]; protectedPaths: string[]; allowedProfiles: string[]; requiredChecks: string[];
  heartbeatIntervalMs: number; leaseDurationMs: number; maxJsonBytes: number; maxEventBytes: number; maxStoredBytes: number;
}
function externalFile(platform: PlatformAdapter, path: string, repo: Repository, assetRoot: string): { value: unknown; bytes: string; sha256: string; path: string; identity: string } {
  if (!isAbsolute(path)) throw new AngitError('POLICY_NOT_APPROVED', 'Approval files require absolute external paths');
  const file = platform.assertPrivateFile(path);
  if (contained(repo.root.canonicalPath, file.canonicalPath) || contained(repo.common.canonicalPath, file.canonicalPath) || contained(assetRoot, file.canonicalPath)) throw new AngitError('POLICY_NOT_APPROVED', 'Approval file must be outside repository and package source');
  const before = statSync(file.canonicalPath), result = readJsonFile(file.canonicalPath);
  const after = statSync(file.canonicalPath), current = platform.assertPrivateFile(path);
  if (current.identity !== file.identity || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new AngitError('POLICY_NOT_APPROVED', 'Approval file changed during bounded read');
  return { value: result.value, bytes: result.bytes.toString('utf8'), sha256: result.sha256, path: file.canonicalPath, identity: file.identity };
}
export function loadPolicy(platform: PlatformAdapter, repo: Repository, path: string, assetRoot: string): ApprovedPolicy {
  const file = externalFile(platform, path, repo, assetRoot);
  validateSchema('policy.schema.json', file.value);
  const value = object(file.value, 'policy'), workspace = object(value.workspace, 'workspace'), execution = object(value.execution, 'execution');
  const ownerRepo = discover(platform, text(value.repoRoot, 'repoRoot'));
  if (ownerRepo.common.identity !== repo.common.identity || contained(ownerRepo.root.canonicalPath, file.path)) throw new AngitError('POLICY_NOT_APPROVED', 'Owner policy must be external to the approved canonical repository');
  if (value.trustMode !== 'cooperative-local' || execution.requireSandbox !== false) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Stage1 has no verified sandbox backend');
  const grants = value.grants;
  if (!Array.isArray(grants)) throw new AngitError('POLICY_NOT_APPROVED', 'No owner grants');
  const principals = new Set<string>();
  let ownerCapabilities: string[] = [];
  for (const item of grants) {
    const grant = object(item, 'grant'), principal = text(grant.principal, 'principal');
    if (principals.has(principal)) throw new AngitError('POLICY_NOT_APPROVED', 'Ambiguous duplicate principal policy');
    principals.add(principal);
    if (principal === 'owner') ownerCapabilities = strings(grant.capabilities, 'capabilities');
  }
  const allowedPaths = strings(workspace.allowedPaths, 'allowedPaths').map(selector), protectedPaths = strings(workspace.protectedPaths, 'protectedPaths').map(selector);
  for (const paths of [allowedPaths, protectedPaths]) {
    const observed = new Set<string>();
    for (const item of paths) {
      if (observed.has(item.toLowerCase())) throw new AngitError('POLICY_NOT_APPROVED', 'Case-colliding selectors are unsupported');
      observed.add(item.toLowerCase());
    }
  }
  const git = object(value.git, 'git');
  for (const ref of strings(git.protectedRefs, 'protectedRefs')) if (!ref.startsWith('refs/') || /[\s\u0000-\u001f~^:?*\[\\]/u.test(ref) || ref.includes('..') || ref.startsWith('refs/angit/')) throw new AngitError('POLICY_NOT_APPROVED', 'Protected refs cannot overlap managed refs or use unsupported syntax');
  const allowedProfiles = strings(execution.allowedProfiles, 'allowedProfiles');
  let profilesPath: string | null = null, profilesIdentity: string | null = null, profilesHash = sha256(canonical({ schemaVersion: 'angit-profiles/v1', profiles: [] }));
  let profilesBytes = canonical({ schemaVersion: 'angit-profiles/v1', profiles: [] });
  let profiles: Record<string, unknown>[] = [];
  if (execution.profilesFile !== undefined) {
    const approved = externalFile(platform, text(execution.profilesFile, 'profilesFile'), repo, assetRoot);
    validateSchema('runtime-profiles.schema.json', approved.value);
    if (contained(ownerRepo.root.canonicalPath, approved.path)) throw new AngitError('POLICY_NOT_APPROVED', 'Approved profiles must be external to owner source');
    const declaration = object(approved.value, 'profiles');
    if (!Array.isArray(declaration.profiles)) throw new AngitError('POLICY_NOT_APPROVED', 'Profiles must be declared');
    profiles = declaration.profiles.map((item: unknown) => object(item, 'profile'));
    profilesPath = approved.path; profilesIdentity = approved.identity; profilesHash = approved.sha256; profilesBytes = approved.bytes;
    const ids = new Set<string>();
    for (const profile of profiles) {
      const id = text(profile.id, 'profile.id');
      if (ids.has(id)) throw new AngitError('POLICY_NOT_APPROVED', 'Duplicate profile declaration');
      ids.add(id);
    }
  } else if (allowedProfiles.length) throw new AngitError('POLICY_NOT_APPROVED', 'Allowed profiles require an explicit external owner profilesFile');
  for (const id of allowedProfiles) if (!profiles.some(profile => profile.id === id)) throw new AngitError('POLICY_NOT_APPROVED', `Allowed profile ${id} is not declared`);
  const requiredChecks = strings(object(value.integration, 'integration').requiredChecks, 'requiredChecks');
  if (ownerCapabilities.includes('task.create')) for (const id of requiredChecks) {
    if (!allowedProfiles.includes(id) || !profiles.some(profile => profile.id === id && profile.kind === 'check')) throw new AngitError('POLICY_NOT_APPROVED', 'Required checks must be allowed declared check profiles');
  }
  const lease = object(execution.lease, 'lease'), heartbeatIntervalMs = integer(lease.heartbeatIntervalMs, 'heartbeatIntervalMs'), leaseDurationMs = integer(lease.durationMs, 'durationMs');
  if (!heartbeatIntervalMs || heartbeatIntervalMs > leaseDurationMs / 3 || Date.now() > Number.MAX_SAFE_INTEGER - leaseDurationMs) throw new AngitError('POLICY_NOT_APPROVED', 'Owner lease timing profile is invalid');
  const limits = object(value.limits, 'limits');
  return { value, path: file.path, fileIdentity: file.identity, hash: file.sha256, bytes: file.bytes,
    profiles, profilesPath, profilesIdentity, profilesHash, profilesBytes, ownerCapabilities, allowedPaths, protectedPaths, allowedProfiles, requiredChecks,
    heartbeatIntervalMs, leaseDurationMs, maxJsonBytes: integer(limits.maxJsonBytes, 'maxJsonBytes'), maxEventBytes: integer(limits.maxEventBytes, 'maxEventBytes'), maxStoredBytes: integer(limits.maxStoredBytes, 'maxStoredBytes') };
}
export function authorize(policy: ApprovedPolicy, capability: string): void {
  if (!policy.ownerCapabilities.includes(capability)) throw new AngitError('POLICY_DENIED', `External owner policy does not grant ${capability}`);
}
