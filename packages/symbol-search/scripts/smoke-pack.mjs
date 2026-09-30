import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repository = resolve(".");
const fixtureRoot = resolve("test/fixtures/typescript");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const useShell = process.platform === "win32";
const cliExecutable = process.platform === "win32" ? "agent-symbol-search.cmd" : "agent-symbol-search";
const temporary = mkdtempSync(join(tmpdir(), "agent-symbol-search-pack-"));
try {
  execFileSync(npmExecutable, ["run", "build"], { cwd: repository, stdio: "inherit", shell: useShell });
  const packOutput = execFileSync(npmExecutable, ["pack", "--json", "--pack-destination", temporary], { cwd: repository, encoding: "utf8", shell: useShell });
  const packageFile = JSON.parse(packOutput)[0]?.filename;
  if (!packageFile) throw new Error("npm pack did not report a package file");
  const archive = join(temporary, packageFile);
  const installRoot = join(temporary, "installed");
  execFileSync(npmExecutable, ["install", "--prefix", installRoot, "--no-save", "--ignore-scripts", "--no-audit", "--no-fund", archive], { cwd: repository, stdio: "inherit", shell: useShell });

  const skillPath = join(installRoot, "node_modules", "agent-symbol-search", "skills", "agent-symbol-search", "SKILL.md");
  const skill = readFileSync(skillPath, "utf8");
  if (!skill.startsWith("---") || !skill.includes("name: agent-symbol-search")) throw new Error("packaged agent skill is missing or invalid");

  const cli = join(installRoot, "node_modules", ".bin", cliExecutable);
  const cliRun = spawnSync(cli, ["symbols", "--root", fixtureRoot, "--path", "src/config.ts"], { encoding: "utf8", shell: useShell });
  if (cliRun.status !== 0) throw new Error(`packaged CLI exited ${cliRun.status}: ${cliRun.stderr}`);
  const cliResult = JSON.parse(cliRun.stdout);
  if (cliResult.status !== "complete" || !cliResult.data.matches?.some((match) => match.name === "resolveConfig")) throw new Error(`packaged CLI did not list the fixture symbols: ${JSON.stringify(cliResult)}`);

  const libraryRun = spawnSync(process.execPath, ["-e", [
    "const api = require('agent-symbol-search');",
    `const result = api.findReferences({ root: ${JSON.stringify(fixtureRoot)}, project: 'tsconfig.json', symbol: 'resolveConfig' });`,
    "if (result.status !== 'complete' || !result.data.matches.length) process.exit(1);"
  ].join("\n")], { cwd: installRoot, encoding: "utf8" });
  if (libraryRun.status !== 0) throw new Error(`packaged library failed: ${libraryRun.stderr}`);
  const moduleRoot = join(temporary, "module-fixture");
  mkdirSync(moduleRoot);
  writeFileSync(join(moduleRoot, "main.mts"), 'export class Store { save() {} }\nconst store = new Store();\nstore.save();\nstore["save"]();\n');
  const moduleCli = spawnSync(cli, ["references", "--root", moduleRoot, "--symbol", "Store.save"], { cwd: installRoot, encoding: "utf8", shell: useShell });
  if (moduleCli.status !== 0) throw new Error(`packaged module CLI failed: ${moduleCli.stderr}`);
  const moduleResult = JSON.parse(moduleCli.stdout);
  if (moduleResult.status !== "complete" || moduleResult.data.matches.length !== 2) throw new Error(`packaged CLI missed instance method references in .mts: ${JSON.stringify(moduleResult)}`);
  const esmRun = spawnSync(process.execPath, ["--input-type=module", "-e", [
    "import { findDefinition } from 'agent-symbol-search';",
    `const root = ${JSON.stringify(moduleRoot)};`,
    "const result = findDefinition({ root, symbol: 'save', from: { path: 'main.mts', line: 3, column: 7 } });",
    "if (result.status !== 'complete' || result.data.matches[0]?.qualifiedName !== 'Store.save') process.exit(1);",
    "const invalid = findDefinition({ root, symbol: 'save', operation: 'references' });",
    "if (invalid.status !== 'error' || invalid.diagnostics[0]?.code !== 'INVALID_REQUEST') process.exit(1);"
  ].join("\n")], { cwd: installRoot, encoding: "utf8" });
  if (esmRun.status !== 0) throw new Error(`packaged ESM library failed: ${esmRun.stderr}`);
  console.log("smoke: packaged CLI, CommonJS, ESM, agent skill, and review regressions passed outside the source checkout");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
