export interface Provenance {
  source: string;
  path?: string;
  [key: string]: unknown;
}

export interface Freshness {
  scannedAt: string;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  plane: string;
  kind: string;
  path?: string;
  language?: string;
  bytes?: number;
  lines?: number | null;
  digest?: string | null;
  metadata?: Record<string, unknown>;
  signals?: Array<Record<string, unknown>>;
  provenance: Provenance;
  freshness: Freshness;
  [key: string]: unknown;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  specifier?: string;
  provenance: Provenance;
  [key: string]: unknown;
}

export type ChangeStatus = 'modified' | 'deleted' | 'untracked';

export interface ChangeEntry {
  path: string;
  status: ChangeStatus;
  nodeId?: string;
  provenance: Provenance;
}

export interface ChangeAdapter {
  vcs: string;
  available: boolean;
  base?: { commit: string };
  changed: ChangeEntry[];
  truncated?: boolean;
  note?: string;
  freshness: Freshness;
}

export interface GraphMeta {
  tool: 'aptree';
  version: string;
  root: string;
  generatedAt: string;
  deterministic: boolean;
  truncated: boolean;
  [key: string]: unknown;
}

export type Command = 'context' | 'impact' | 'changed' | 'tests-for' | 'evidence' | 'goals' | 'progress' | 'path-to-done';

export interface QueryDescriptor {
  command: Command;
  path?: string;
}

export interface GraphEnvelope {
  schema: 'aptree.graph.v1';
  meta: GraphMeta;
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  change: ChangeAdapter;
  query?: QueryDescriptor;
}

export interface QueryEnvelope {
  schema: 'aptree.query.v1';
  query: QueryDescriptor;
  evidence?: GraphNode[];
  tests?: GraphNode[];
  impacted?: GraphNode[];
  changed?: ChangeEntry[];
  adapter?: ChangeAdapter;
  goals?: GraphNode[];
  progress?: GraphNode[];
  steps?: string[];
  note?: string;
}

export interface CliErrorEnvelope {
  schema: 'aptree.error.v1';
  error: {
    code: 'INVALID_COMMAND' | 'CLI_ERROR';
    message: string;
  };
}

export interface BuildProjectGraphInput {
  root?: string;
  cwd?: string;
  maxFiles?: number;
  maxBytesPerFile?: number;
  ignore?: string[];
  scannedAt?: string;
}

export interface QueryOptions {
  root?: string;
  path?: string;
}

export interface CliIo {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
  cwd: string;
}

export const DEFAULT_IGNORE_DIRS: Set<string>;

export function buildProjectGraph(input?: BuildProjectGraphInput): Promise<GraphEnvelope>;

export function readGitChanges(root: string, nodes: GraphNode[], options?: { scannedAt?: string; maxChanges?: number; maxFiles?: number; ignore?: string[] }): Promise<ChangeAdapter>;

export function queryGraph(graph: GraphEnvelope, command: Command, options?: QueryOptions): GraphEnvelope | QueryEnvelope;

export function runCli(argv: string[], io: CliIo): Promise<number>;
