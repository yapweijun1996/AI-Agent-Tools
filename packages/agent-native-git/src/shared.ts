import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const ASSET_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_JSON_BYTES = 1_048_576;
export const METADATA_COMMANDS = ['init', 'doctor', 'status', 'task add', 'task list', 'task show', 'task message', 'task cancel', 'worktree list', 'snapshot list'] as const;
export const IMPLEMENTED_COMMANDS = [...METADATA_COMMANDS, 'agent start', 'agent stop', 'run'] as const;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface CommandRequest {
  schemaVersion: 'angit-request/v1';
  requestId: string;
  command: string;
  projectId?: string;
  idempotencyKey?: string;
  options: Record<string, unknown>;
}
export interface CoreReply {
  data: Record<string, unknown>;
  coordinatorEpoch: number | null;
  warnings?: string[];
  maxJsonBytes?: number;
}
export interface FileIdentity {
  canonicalPath: string;
  identity: string;
  ownerSid: string;
  directory: boolean;
  reparsePoint: boolean;
  localDisk: boolean;
}
export interface OwnerContext {
  sid: string;
  stateRoot: string;
}
export interface PlatformAdapter {
  ownerContext(): OwnerContext;
  identify(path: string): FileIdentity;
  preparePrivateDirectory(path: string): FileIdentity;
  assertPrivateDirectory(path: string): FileIdentity;
  assertPrivateFile(path: string): FileIdentity;
}
export interface CoreOptions {
  assetRoot?: string;
  /** Internal harness injection only. No public CLI flag or environment override. */
  stateRoot?: string;
}
const ERROR_EXITS: Record<string, number> = {
  POLICY_DENIED: 4, POLICY_NOT_APPROVED: 4, POLICY_CHANGED: 4, ACCESS_DENIED: 4, INSECURE_STATE: 4, MESSAGE_SCOPE_DENIED: 4,
  EXECUTABLE_DENIED: 4, BROKER_PEER_DENIED: 4, BROKER_SCOPE_DENIED: 4, BROKER_REQUEST_DENIED: 4,
  CAPABILITY_UNAVAILABLE: 3, UNSUPPORTED_FILESYSTEM: 3, IDEMPOTENCY_CONFLICT: 3, RECOVERY_REQUIRED: 3,
  STALE_CONTENT_EPOCH: 3, STALE_AUTHORITY_TUPLE: 3, CURSOR_HISTORY_MISMATCH: 3, REPOSITORY_IDENTITY_CHANGED: 3, REPOSITORY_UNSUPPORTED: 3,
  NATIVE_EXECUTION_UNKNOWN: 3, EXECUTABLE_IDENTITY_MISMATCH: 3, EXECUTABLE_IDENTITY_CHANGED: 3, WORKTREE_IDENTITY_CHANGED: 3, ADMISSION_STOPPED: 3,
  COORDINATOR_ALREADY_RUNNING: 5, STORAGE_LIMIT_REACHED: 5, NATIVE_HELPER_UNAVAILABLE: 5, NATIVE_TIMEOUT: 5,
  BROKER_BIND_DENIED: 5,
  STATE_CORRUPT: 6, STATE_INVALID: 6, STATE_MISSING: 6, STATE_UNKNOWN: 6, SCHEMA_INCOMPLETE: 6,
  MIGRATION_INVALID: 6, MIGRATION_CHECKSUM_MISMATCH: 6, REGISTRY_WORKFLOW_MISMATCH: 6, STATE_IDENTITY_CHANGED: 6,
  GUARD_IDENTITY_CHANGED: 6, NATIVE_IDENTITY_MISMATCH: 6, NATIVE_PROTOCOL_ERROR: 6, NATIVE_IO_ERROR: 6,
};
export class AngitError extends Error {
  constructor(public readonly code: string, message: string, public readonly exitCode: number = ERROR_EXITS[code] ?? 2,
    public readonly retryable: boolean = false, public readonly operationId: string | null = null) {
    super(message);
    this.name = 'AngitError';
  }
}
