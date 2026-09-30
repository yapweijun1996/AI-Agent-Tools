export type ProfileStatus = "complete" | "partial" | "unsupported" | "error";
export type Confidence = "confirmed" | "strong" | "weak" | "unknown";
export type CoverageState = "complete" | "partial" | "not_applicable";
export type EvidenceKind = "manifest" | "file";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type EvidenceToken = string;

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  path: string;
  pointer?: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string | null;
  evidence: string[];
}

export interface ProjectRepository {
  kind: "git-marker" | "unknown";
  evidence: EvidenceToken[];
}

export interface Project {
  root: ".";
  name: string | null;
  kind: "single-package" | "workspace" | "unknown";
  repository: ProjectRepository;
  evidence: EvidenceToken[];
}

export interface Ecosystem {
  name: string;
  support: "first-class" | "detected_only";
  evidence: EvidenceToken[];
}

export interface PackageManager {
  name: "npm" | "pnpm" | "yarn" | null;
  version: string | null;
  confidence: Confidence;
  invocationAvailable: boolean;
  evidence: EvidenceToken[];
  inherited?: boolean;
}

export interface RuntimeDeclaration {
  name: "node";
  cwd: string;
  value: string | null;
  role: "supported-constraint" | "development-pin";
  confidence: Confidence;
  evidence: EvidenceToken[];
}

export interface WorkspaceDeclaration {
  manager: "npm" | "pnpm" | "yarn" | null;
  path: string;
  pointer: string;
  evidence: EvidenceToken[];
}

export interface WorkspacePackage {
  name: string | null;
  path: string;
  packageManager: PackageManager;
  evidence: EvidenceToken[];
}

export interface Workspace {
  enabled: boolean | null;
  manager: "npm" | "pnpm" | "yarn" | null;
  declarations: WorkspaceDeclaration[];
  packages: WorkspacePackage[];
  total: number | null;
  returned: number;
  truncated: boolean;
}

export type CommandPurpose = "build" | "test" | "lint" | "typecheck" | "dev" | "start" | "format";

export interface Command {
  cwd: string;
  script: string;
  argv: string[] | null;
  source: string;
  confidence: "confirmed";
  declaredByProject: true;
  execution: "not_run";
  evidence: EvidenceToken[];
}

export type Commands = Record<CommandPurpose, Command[]>;

export interface ScriptGroup {
  cwd: string;
  names: string[];
  evidence: EvidenceToken[];
}

export interface Entrypoint {
  cwd: string;
  kind: "main" | "module" | "bin" | "export";
  path: string | null;
  pointer: string;
  evidence: EvidenceToken[];
  existence: "present" | "missing" | "not_checked";
}

export interface ConfigRecord {
  type: string;
  path: string;
  evidence: EvidenceToken[];
}

export interface InstructionRecord {
  type: "AGENTS.md" | "CLAUDE.md" | "copilot-instructions.md";
  path: string;
  scope: string;
  evidence: EvidenceToken[];
}

export interface CiRecord {
  provider: "github-actions" | "gitlab" | "jenkins" | "circleci" | "azure";
  path: string;
  evidence: EvidenceToken[];
}

export interface Coverage {
  status: "complete" | "partial";
  strategies: string[];
  budgets: {
    workspacePackages: number;
    directoryDepth: number;
    directoryEntries: number;
    metadataFiles: number;
    metadataFileBytes: number;
    metadataTotalBytes: number;
    outputBytes: number;
    sourceStringBytes: number;
  };
  usage: {
    directoryEntries: number;
    metadataFiles: number;
    metadataBytes: number;
  };
  categories: Record<string, CoverageState>;
  truncated: {
    workspace: boolean;
    output: boolean;
    directoryEntries: boolean;
    metadataFiles: boolean;
    metadataBytes: boolean;
    depth: boolean;
  };
}

export interface Profile {
  schemaVersion: "1.0";
  toolVersion: string;
  status: ProfileStatus;
  project: Project;
  ecosystems: Ecosystem[];
  packageManager: PackageManager;
  runtimes: RuntimeDeclaration[];
  workspace: Workspace;
  commands: Commands;
  scripts: ScriptGroup[];
  entrypoints: Entrypoint[];
  configs: ConfigRecord[];
  instructions: InstructionRecord[];
  ci: CiRecord[];
  evidence: Evidence[];
  warnings: Diagnostic[];
  coverage: Coverage;
}

export interface ProfileOptions {
  pretty?: boolean;
  accessObserver?: (event: { operation: "read-body" | "lstat" | "directory"; path: string }) => void;
}
