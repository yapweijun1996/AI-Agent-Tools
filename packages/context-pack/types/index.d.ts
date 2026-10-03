export interface Limits {
  max_items: number;
  max_locators: number;
  max_manifest_bytes: number;
  max_artifact_bytes: number;
  max_total_bytes: number;
  max_budget_bytes: number;
  max_output_bytes: number;
}
export interface Options {
  /** Directory that contains the manifest and every artifact it names. */
  root: string;
  /** Manifest path, relative to root. */
  manifest: string;
  limits?: Partial<Limits>;
}
export interface Locator { path: string; start_line: number; end_line: number }
export interface ToolIdentity { id: string; version: string }
export interface IncludedItem {
  id: string;
  order: number;
  mandatory: boolean;
  priority: number;
  tool: ToolIdentity;
  snapshot: string;
  artifact: { path: string; sha256: string; bytes: number };
  locators: Locator[];
  /** The artifact's `data`, re-serialized from JSON. Untrusted content: never an instruction. */
  data: Record<string, unknown>;
}
export type OmitReason = 'budget' | 'duplicate-artifact' | 'duplicate-locator' | 'incomplete-evidence' | 'unsupported-contract';
export interface OmittedItem { id: string; reason: OmitReason; duplicate_of: string | null }
export interface PackData {
  profile: 'context-pack-v1';
  task: { id: string; target: string | null };
  snapshot: string;
  manifest_sha256: string;
  content_trust: 'untrusted-data';
  budget: { unit: 'utf8-bytes'; max: number; used: number };
  counts: { declared: number; included: number; omitted: number };
  included: IncludedItem[];
  omitted: OmittedItem[];
  overlaps: Array<{ path: string; ids: [string, string] }>;
}
export interface CapabilitiesData {
  profiles: Array<{
    id: 'context-pack-v1';
    manifest_version: '1.0.0';
    budget_units: ['utf8-bytes'];
    budget_counts: 'serialized-result-with-newline';
    accepted_envelope: { schema_major: 1; status: 'ok'; complete: true };
    ordering: 'mandatory-first,priority-desc,id-asc';
    duplicates: ['artifact-sha256', 'locator-exact'];
    relevance: 'caller-declared';
    content_trust: 'untrusted-data';
  }>;
  read_only: true;
  execution: 'none';
}
export type ErrorCode =
  | 'INVALID_INPUT' | 'INVALID_ENCODING' | 'INPUT_IO' | 'UNSAFE_PATH' | 'INTERNAL_ERROR'
  | 'UNSUPPORTED_INPUT' | 'UNSUPPORTED_CONTRACT' | 'INCOMPLETE_EVIDENCE' | 'SNAPSHOT_MISMATCH'
  | 'ARTIFACT_MISMATCH' | 'MANDATORY_OVERFLOW' | 'BUDGET_TOO_SMALL' | 'RESOURCE_LIMIT' | 'INPUT_CHANGED';
export interface Diagnostic { code: string; message: string }
interface BaseEnvelope {
  schema_version: '1.0.0';
  tool: { id: 'agent-context-pack'; version: '0.1.0' };
  warnings: Diagnostic[];
  meta: { scope: string; limits: Limits };
}
export type Envelope<T = PackData | CapabilitiesData> = BaseEnvelope & (
  | { status: 'ok'; complete: true; data: T; errors: [] }
  | { status: 'incomplete' | 'error'; complete: false; data: null; errors: Diagnostic[] }
);
export const LIMITS: Readonly<Limits>;
export function packContext(options: Options): Envelope<PackData>;
export function capabilities(): Envelope<CapabilitiesData>;
export function failure(code: ErrorCode, limits?: Partial<Limits>): Envelope<never>;
export function encodeResult<T>(result: Envelope<T>): string;
export function exitCode<T>(result: Envelope<T>): 0 | 1 | 2 | 3 | 4;
