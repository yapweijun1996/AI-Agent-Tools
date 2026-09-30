import type ts from "typescript";

export type Language = "javascript" | "typescript" | "tsx";
export type SnapshotKind = "working-tree" | "revision";
export type NodeKind = "file" | "symbol";
export type Relation =
  | "imports"
  | "reexports"
  | "references"
  | "calls"
  | "extends"
  | "implements";
export type EvidenceLevel = "resolved" | "syntactic" | "heuristic";
export type AnalysisStatus = "complete" | "partial";

export interface Position {
  line: number;
  column: number;
}

export interface TextRange {
  start: Position;
  end: Position;
}

export interface SnapshotRef {
  kind: SnapshotKind;
  id: string;
  revision?: string;
}

export interface ProjectRef {
  configPath: string;
  files: string[];
}

export interface EvidenceLocation {
  snapshot: SnapshotRef;
  file: string;
  range: TextRange;
}

export interface Evidence {
  provider: string;
  level: EvidenceLevel;
  location?: EvidenceLocation;
  detail?: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  snapshot: SnapshotRef;
  file: string;
  symbol?: string;
  declaration?: TextRange;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  relation: Relation;
  evidence: Evidence;
}

export interface Seed {
  node: string;
  reason: "requested-target" | "changed-symbol" | "changed-file" | "configuration-change";
}

export interface ImpactItem {
  node: string;
  seed: string;
  distance: number;
  relations: Relation[];
  path: string[];
  evidenceLevels: EvidenceLevel[];
  granularity: NodeKind;
}

export interface CandidateTest {
  node: string;
  file: string;
  role: "configured-test-candidate" | "name-pattern-candidate";
  dependencyEdges: string[];
  evidenceLevels: EvidenceLevel[];
}

export interface UnresolvedObservation {
  code: string;
  snapshot: SnapshotRef;
  file: string;
  range?: TextRange;
  detail: string;
}

export interface AnalysisScope {
  status: AnalysisStatus;
  project: ProjectRef;
  limits: Limits;
  includedFiles: number;
  excludedFiles: number;
  limitations: string[];
  stopReasons: string[];
  observedNodes?: number;
  returnedNodes: number;
  observedEdges?: number;
  returnedEdges: number;
}

export interface AnalysisContext {
  provider: string;
  providerVersion: string;
  root: string;
  project: ProjectRef;
  snapshots: SnapshotRef[];
  resolution: "local-project" | "local-project-with-external-fallback";
}

export interface ResultEnvelope {
  schemaVersion: "0.1-draft";
  ok: true;
  operation: "capabilities" | "file-impact" | "symbol-impact" | "changed-impact";
  context?: AnalysisContext;
  target?: Record<string, unknown>;
  changed?: ChangedSeed[];
  seeds?: Seed[];
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  impact?: {
    direct: ImpactItem[];
    transitive: ImpactItem[];
  };
  tests?: CandidateTest[];
  unresolved: UnresolvedObservation[];
  analysis?: AnalysisScope;
  warnings: Diagnostic[];
}

export interface ErrorEnvelope {
  schemaVersion: "0.1-draft";
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  warnings: Diagnostic[];
}

export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "ROOT_NOT_FOUND"
  | "NOT_A_REPOSITORY"
  | "FILE_NOT_FOUND"
  | "FILE_OUTSIDE_ROOT"
  | "LANGUAGE_UNSUPPORTED"
  | "PROJECT_CONFIG_NOT_FOUND"
  | "PROJECT_CONFIG_INVALID"
  | "TARGET_NOT_FOUND"
  | "TARGET_AMBIGUOUS"
  | "GIT_ERROR"
  | "OUTPUT_LIMIT_EXCEEDED"
  | "ANALYSIS_LIMIT_EXCEEDED"
  | "INTERNAL_ERROR";

export interface Diagnostic {
  code: string;
  message: string;
  snapshot?: SnapshotRef;
  file?: string;
  range?: TextRange;
  severity: "warning" | "info";
}

export interface ChangedSeed {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "configuration" | "unsupported";
  oldPath?: string;
  oldSymbols: string[];
  newSymbols: string[];
  snapshots: SnapshotRef[];
}

export interface Limits {
  depth: number;
  maxNodes: number;
  maxEdges: number;
  maxPathsPerTarget: number;
  maxOutputBytes: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalFileBytes: number;
  maxDiagnostics: number;
}

export const DEFAULT_LIMITS: Limits = {
  depth: 2,
  maxNodes: 100,
  maxEdges: 300,
  maxPathsPerTarget: 1,
  maxOutputBytes: 1024 * 1024,
  maxFiles: 10000,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalFileBytes: 64 * 1024 * 1024,
  maxDiagnostics: 1000,
};

export interface TargetSelector {
  file: string;
  name?: string;
  line?: number;
  column?: number;
}

export interface ImpactRequestOptions {
  root?: string;
  project?: string;
  limits?: Partial<Limits>;
}

export interface FileImpactRequest extends ImpactRequestOptions {
  file: string;
}

export interface SymbolImpactRequest extends ImpactRequestOptions {
  file: string;
  name: string;
  line?: number;
  column?: number;
}

export interface ChangedImpactRequest extends ImpactRequestOptions {
  base: string;
  head?: string;
  worktree?: boolean;
}

export interface CapabilitiesResult {
  schemaVersion: "0.1-draft";
  ok: true;
  operation: "capabilities";
  capabilities: {
    languages: Language[];
    operations: string[];
    relations: Relation[];
    evidenceLevels: EvidenceLevel[];
    projectModes: string[];
    snapshotModes: string[];
    readOnly: true;
    network: "disabled";
    heuristics: false;
  };
  unresolved: UnresolvedObservation[];
  warnings: Diagnostic[];
}

export interface DeclarationInfo {
  file: string;
  name: string;
  kind: string;
  range: TextRange;
  position: number;
  key: string;
  node: ts.Node;
}
