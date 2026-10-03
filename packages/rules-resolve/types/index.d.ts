export interface Limits {
  max_depth: number;
  max_files: number;
  max_file_bytes: number;
  max_total_bytes: number;
  max_output_bytes: number;
  max_duration_ms: number;
}
export type TargetKind = 'file' | 'directory';
export interface Options {
  root: string;
  target: string;
  targetKind: TargetKind;
  profile: 'agents-chain-v1';
  includeContent?: boolean;
  limits?: Partial<Limits>;
}
export interface Source {
  path: string;
  directory: string;
  order: number;
  sha256: string;
  bytes: number;
  lines: number;
  content?: string;
}
export interface ResolveData {
  profile: 'agents-chain-v1';
  target: { path: string; kind: TargetKind; directory: string };
  precedence: 'root-to-target';
  sources: Source[];
  ignored: Array<{ path: string; reason: 'empty' | 'shadowed'; selected_by: string | null }>;
  directories: string[];
  include_content: boolean;
  references: 'not-followed';
}
export interface CapabilitiesData {
  profiles: Array<{
    id: 'agents-chain-v1';
    filenames: ['AGENTS.override.md', 'AGENTS.md'];
    selection: 'first-nonempty-per-directory';
    order: 'root-to-target';
    references: 'not-followed';
  }>;
  read_only: true;
  content_opt_in: true;
}
export interface Diagnostic { code: string; message: string }
interface BaseEnvelope {
  schema_version: '1.0.0';
  tool: { id: 'agent-rules-resolve'; version: '0.1.0' };
  warnings: Diagnostic[];
  meta: { scope: string; limits: Limits };
}
export type Envelope<T = ResolveData | CapabilitiesData> = BaseEnvelope & (
  | { status: 'ok'; complete: true; data: T; errors: [] }
  | { status: 'incomplete' | 'error'; complete: false; data: null; errors: Diagnostic[] }
);
export const LIMITS: Readonly<Limits>;
export function resolveRules(options: Options): Envelope<ResolveData>;
export function capabilities(): Envelope<CapabilitiesData>;
export function failure(code: string, status?: 'error' | 'incomplete', limits?: Limits): Envelope<never>;
export function encodeResult<T>(result: Envelope<T>): string;
export function exitCode<T>(result: Envelope<T>): 0 | 1 | 2 | 3 | 4;
