import fs from "node:fs";
import path from "node:path";

export interface FixtureDefinition {
  id: string;
  files: Record<string, string>;
  populate?: (root: string) => void;
  expected: {
    status: "complete" | "partial" | "unsupported";
    projectKind: "single-package" | "workspace" | "unknown";
    packageManager: { name: "npm" | "pnpm" | "yarn" | null; version: string | null; invocationAvailable: boolean };
    ecosystems: string[];
    warningCodes: string[];
    workspace?: { returned: number; total: number | null; truncated: boolean; paths: string[] };
  };
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const FIXTURES: FixtureDefinition[] = [
  {
    id: "01-npm-single-package",
    files: {
      "package.json": json({
        name: "fixture-npm-single",
        packageManager: "npm@10.2.0+sha512-fixture",
        engines: { node: ">=20" },
        main: "src/index.js",
        module: "dist/index.js",
        bin: { fixture: "bin/cli.js" },
        exports: { ".": { import: "./src/index.js", require: "./dist/index.cjs" } },
        scripts: { build: "node scripts/build.js", test: "node scripts/test.js", lint: "eslint .", typecheck: "tsc", dev: "node dev.js", start: "node start.js", format: "prettier --write .", "test:unit": "node scripts/unit.js" },
      }),
      "src/index.js": "export const value = 1;\n",
      "bin/cli.js": "#!/usr/bin/env node\n",
      ".nvmrc": "22\n",
      "tsconfig.json": "CANARY_CONFIG_BODY_SHOULD_NOT_BE_READ\n",
      ".eslintrc.json": "CANARY_ESLINT_BODY_SHOULD_NOT_BE_READ\n",
      "AGENTS.md": "CANARY_AGENTS_BODY_SHOULD_NOT_BE_READ\n",
      ".github/copilot-instructions.md": "CANARY_COPILOT_BODY_SHOULD_NOT_BE_READ\n",
      ".github/workflows/ci.yml": "run: CANARY_WORKFLOW_BODY_SHOULD_NOT_BE_READ\n",
      "package-lock.json": "CANARY_LOCK_BODY_SHOULD_NOT_BE_READ\n",
      ".env": "CANARY_SECRET_BODY_SHOULD_NOT_BE_READ\n",
      ".ssh/id_rsa": "CANARY_SSH_BODY_SHOULD_NOT_BE_READ\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: "10.2.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["ENTRYPOINT_MISSING"],
    },
  },
  {
    id: "02-pnpm-single-package",
    files: {
      "package.json": json({ name: "fixture-pnpm", packageManager: "pnpm@9.1.0", scripts: { test: "vitest" } }),
      "pnpm-lock.yaml": "CANARY_PNPM_LOCK_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "pnpm", version: "9.1.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND"],
    },
  },
  {
    id: "03-yarn-single-package",
    files: {
      "package.json": json({ name: "fixture-yarn", packageManager: "yarn@1.22.22", scripts: { start: "node server.js" } }),
      "yarn.lock": "CANARY_YARN_LOCK_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "yarn", version: "1.22.22", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND", "NO_TEST_COMMAND"],
    },
  },
  {
    id: "04-npm-workspace",
    files: {
      "package.json": json({ name: "fixture-workspace", packageManager: "npm@10.0.0", workspaces: ["packages/*"], scripts: { build: "echo root" } }),
      "packages/a/package.json": json({ name: "@fixture/a", scripts: { test: "node test.js" } }),
      "packages/b/package.json": json({ name: "@fixture/b", scripts: { lint: "eslint ." } }),
      "packages/ignored.txt": "not a package\n",
    },
    expected: {
      status: "complete",
      projectKind: "workspace",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND", "NO_TEST_COMMAND"],
      workspace: { returned: 2, total: 2, truncated: false, paths: ["packages/a", "packages/b"] },
    },
  },
  {
    id: "05-pnpm-workspace",
    files: {
      "package.json": json({ name: "fixture-pnpm-workspace", packageManager: "pnpm@9.0.0" }),
      "pnpm-workspace.yaml": "packages:\n  - \"packages/*\"\n  - \"!packages/excluded\"\n",
      "packages/core/package.json": json({ name: "@fixture/core", scripts: { build: "build-core" } }),
      "packages/app/package.json": json({ name: "@fixture/app", scripts: { dev: "dev-app" } }),
      "packages/excluded/package.json": json({ name: "@fixture/excluded", scripts: { test: "must-not-appear" } }),
    },
    expected: {
      status: "complete",
      projectKind: "workspace",
      packageManager: { name: "pnpm", version: "9.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND", "NO_TEST_COMMAND"],
      workspace: { returned: 2, total: 2, truncated: false, paths: ["packages/app", "packages/core"] },
    },
  },
  {
    id: "06-typescript-vite",
    files: {
      "package.json": json({ name: "fixture-vite", packageManager: "npm@10.0.0", scripts: { build: "vite build" } }),
      "tsconfig.json": "CANARY_TS_CONFIG_BODY\n",
      "vite.config.ts": "CANARY_VITE_CONFIG_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_LINT_COMMAND", "NO_TEST_COMMAND"],
    },
  },
  {
    id: "07-vitest",
    files: {
      "package.json": json({ name: "fixture-vitest", packageManager: "npm@10.0.0", devDependencies: { vitest: "^2.0.0" }, scripts: { test: "vitest run" } }),
      "vitest.config.ts": "CANARY_VITEST_CONFIG_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND"],
    },
  },
  {
    id: "08-jest",
    files: {
      "package.json": json({ name: "fixture-jest", scripts: { test: "jest" } }),
      "package-lock.json": "CANARY_NPM_LOCK_BODY\n",
      "jest.config.cjs": "CANARY_JEST_CONFIG_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: null, invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND"],
    },
  },
  {
    id: "09-conflicting-lockfiles",
    files: {
      "package.json": json({ name: "fixture-conflict", scripts: { test: "node tests.js" } }),
      "package-lock.json": "CANARY_NPM_LOCK_BODY\n",
      "pnpm-lock.yaml": "CANARY_PNPM_LOCK_BODY\n",
    },
    expected: {
      status: "partial",
      projectKind: "single-package",
      packageManager: { name: null, version: null, invocationAvailable: false },
      ecosystems: ["node"],
      warningCodes: ["MULTIPLE_LOCKFILES", "NO_BUILD_COMMAND", "NO_LINT_COMMAND", "PACKAGE_MANAGER_CONFLICT"],
    },
  },
  {
    id: "10-missing-package-manager",
    files: {
      "package.json": json({ name: "fixture-no-manager", scripts: { build: "node build.js", test: "node test.js" } }),
    },
    expected: {
      status: "partial",
      projectKind: "single-package",
      packageManager: { name: null, version: null, invocationAvailable: false },
      ecosystems: ["node"],
      warningCodes: ["NO_LINT_COMMAND", "NO_PACKAGE_MANAGER"],
    },
  },
  {
    id: "11-invalid-package-json",
    files: {
      "package.json": "{ invalid JSON CANARY_INVALID_MANIFEST_BODY\n",
      "pyproject.toml": "CANARY_PYPROJECT_BODY\n",
    },
    expected: {
      status: "partial",
      projectKind: "unknown",
      packageManager: { name: null, version: null, invocationAvailable: false },
      ecosystems: ["python"],
      warningCodes: ["MANIFEST_INVALID", "UNSUPPORTED_ECOSYSTEM"],
    },
  },
  {
    id: "12-no-test-script",
    files: {
      "package.json": json({ name: "fixture-no-test", packageManager: "npm@10.0.0", scripts: { build: "build", lint: "lint" } }),
      "package-lock.json": "CANARY_LOCK_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_TEST_COMMAND"],
    },
  },
  {
    id: "13-nested-agents",
    files: {
      "package.json": json({ name: "fixture-instructions", packageManager: "npm@10.0.0", workspaces: ["packages/*"] }),
      "AGENTS.md": "CANARY_ROOT_AGENTS_BODY\n",
      "packages/AGENTS.md": "CANARY_ANCESTOR_AGENTS_BODY\n",
      "packages/app/package.json": json({ name: "@fixture/app", scripts: { test: "test" } }),
      "packages/app/CLAUDE.md": "CANARY_MEMBER_CLAUDE_BODY\n",
      ".github/copilot-instructions.md": "CANARY_ROOT_COPILOT_BODY\n",
    },
    expected: {
      status: "complete",
      projectKind: "workspace",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND", "NO_TEST_COMMAND"],
      workspace: { returned: 1, total: 1, truncated: false, paths: ["packages/app"] },
    },
  },
  {
    id: "14-github-actions",
    files: {
      "package.json": json({ name: "fixture-ci", packageManager: "npm@10.0.0", scripts: { test: "node test.js" } }),
      ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: CANARY_ACTION_BODY_SHOULD_NOT_BE_READ\n",
      ".gitlab-ci.yml": "CANARY_GITLAB_BODY_SHOULD_NOT_BE_READ\n",
    },
    expected: {
      status: "complete",
      projectKind: "single-package",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND"],
    },
  },
  {
    id: "15-huge-workspace",
    files: {
      "package.json": json({ name: "fixture-huge", packageManager: "npm@10.0.0", workspaces: ["packages/*", "huge/*"] }),
    },
    populate: (root) => {
      // The test harness creates deterministic filler names to exercise the
      // directory-entry budget without storing thousands of fixture files.
      const directory = path.join(root, "huge");
      fs.mkdirSync(directory, { recursive: true });
      for (let index = 0; index < 10001; index += 1) fs.writeFileSync(path.join(directory, `filler-${String(index).padStart(5, "0")}.txt`), "x\n");
    },
    expected: {
      status: "partial",
      projectKind: "workspace",
      packageManager: { name: "npm", version: "10.0.0", invocationAvailable: true },
      ecosystems: ["node"],
      warningCodes: ["NO_BUILD_COMMAND", "NO_LINT_COMMAND", "NO_TEST_COMMAND", "SCAN_LIMIT_REACHED", "WORKSPACE_UNRESOLVED"],
      workspace: { returned: 0, total: null, truncated: true, paths: [] },
    },
  },
  {
    id: "16-unsupported-python",
    files: {
      "pyproject.toml": "CANARY_PYPROJECT_BODY_SHOULD_NOT_BE_READ\n",
      "requirements.txt": "CANARY_REQUIREMENTS_BODY_SHOULD_NOT_BE_READ\n",
    },
    expected: {
      status: "unsupported",
      projectKind: "unknown",
      packageManager: { name: null, version: null, invocationAvailable: false },
      ecosystems: ["python"],
      warningCodes: ["UNSUPPORTED_ECOSYSTEM"],
    },
  },
];
