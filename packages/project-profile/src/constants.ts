import type { CommandPurpose, Coverage } from "./types.js";

export const TOOL_VERSION = "0.1.2";
export const SCHEMA_VERSION = "1.0" as const;

export const PURPOSES: readonly CommandPurpose[] = [
  "build",
  "test",
  "lint",
  "typecheck",
  "dev",
  "start",
  "format",
];

export const BUDGETS = {
  workspacePackages: 100,
  directoryDepth: 12,
  directoryEntries: 10_000,
  metadataFiles: 1_000,
  metadataFileBytes: 256 * 1024,
  metadataTotalBytes: 8 * 1024 * 1024,
  outputBytes: 1 * 1024 * 1024,
  sourceStringBytes: 4 * 1024,
} as const satisfies Coverage["budgets"];

export const FORBIDDEN_DIRECTORY_NAMES = new Set([
  ".cache",
  ".git",
  ".ssh",
  ".aws",
  ".azure",
  ".config",
  ".npm",
  ".pnpm-store",
  ".secrets",
  "build",
  "coverage",
  "credentials",
  "dist",
  "node_modules",
  "secrets",
]);

export const CONFIG_DETECTORS: readonly { type: string; test: (name: string) => boolean }[] = [
  { type: "tsconfig", test: (name) => name === "tsconfig.json" || /^tsconfig\.[^/]+\.json$/u.test(name) },
  { type: "vite", test: (name) => /^vite\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "vitest", test: (name) => /^vitest\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "jest", test: (name) => /^jest\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "eslint", test: (name) => name === ".eslintrc" || /^\.eslintrc\.(json|yml|yaml|js|cjs)$/u.test(name) || /^eslint\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "prettier", test: (name) => name === ".prettierrc" || /^\.prettierrc\.(json|yml|yaml|js|cjs)$/u.test(name) || /^prettier\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "turbo", test: (name) => name === "turbo.json" },
  { type: "nx", test: (name) => name === "nx.json" },
  { type: "webpack", test: (name) => /^webpack\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
  { type: "rollup", test: (name) => /^rollup\.config\.(js|mjs|cjs|ts|mts|cts)$/u.test(name) },
];

export const ECOSYSTEM_SENTINELS: readonly { name: string; files: readonly string[] }[] = [
  { name: "python", files: ["pyproject.toml", "requirements.txt"] },
  { name: "go", files: ["go.mod"] },
  { name: "rust", files: ["Cargo.toml"] },
  { name: "java", files: ["pom.xml", "build.gradle", "build.gradle.kts"] },
];

export const LOCKFILE_FAMILIES = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
} as const;

export const CI_ROOT_FILES: readonly { provider: "gitlab" | "jenkins" | "circleci" | "azure"; path: string }[] = [
  { provider: "gitlab", path: ".gitlab-ci.yml" },
  { provider: "jenkins", path: "Jenkinsfile" },
  { provider: "circleci", path: ".circleci/config.yml" },
  { provider: "azure", path: "azure-pipelines.yml" },
];

export const EMPTY_COMMANDS = (): Record<CommandPurpose, never[]> => ({
  build: [],
  test: [],
  lint: [],
  typecheck: [],
  dev: [],
  start: [],
  format: [],
});
