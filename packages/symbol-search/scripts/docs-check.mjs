import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const documents = [
  "README.md",
  "DESIGN.md",
  "SPEC.md",
  "EPIC.md",
  "ROADMAP.md",
  "TASK.md",
  "DOCUMENTATION_STANDARD.md",
  "CHANGELOG.md",
  "BENCHMARK.md",
  "RELEASE.md"
];
const failures = [];
const contents = new Map();
const fail = (message) => failures.push(message);

for (const document of documents) {
  const path = resolve(document);
  if (!existsSync(path)) {
    fail(`${document}: missing`);
    continue;
  }
  const content = readFileSync(path, "utf8");
  contents.set(document, content);
  for (const field of ["Status", "Owner", "Last reviewed"]) {
    if (!new RegExp(`\\| ${field} \\| .+\\|`).test(content)) fail(`${document}: missing ${field} metadata`);
  }
  if (document !== "DOCUMENTATION_STANDARD.md" && !content.includes("| Status | Active |")) {
    fail(`${document}: current implementation document is not marked Active`);
  }
  for (const match of content.matchAll(/\]\((\.\/[^)#]+)(?:#[^)]+)?\)/g)) {
    if (!existsSync(resolve(match[1]))) fail(`${document}: broken local link ${match[1]}`);
  }
}

const readme = contents.get("README.md") ?? "";
const design = contents.get("DESIGN.md") ?? "";
const spec = contents.get("SPEC.md") ?? "";
const epic = contents.get("EPIC.md") ?? "";
const roadmap = contents.get("ROADMAP.md") ?? "";
const task = contents.get("TASK.md") ?? "";
const changelog = contents.get("CHANGELOG.md") ?? "";
const benchmark = contents.get("BENCHMARK.md") ?? "";
const version = packageJson.version;
const agentSkillPath = resolve("skills/agent-symbol-search/SKILL.md");
if (!existsSync(agentSkillPath)) {
  fail("skills/agent-symbol-search/SKILL.md: missing");
} else {
  const agentSkill = readFileSync(agentSkillPath, "utf8").replace(/\r\n/g, "\n");
  const frontmatter = agentSkill.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter || !/^name:\s*agent-symbol-search\s*$/m.test(frontmatter[1]) || !/^description:\s*.+$/m.test(frontmatter[1])) {
    fail("skills/agent-symbol-search/SKILL.md: missing required frontmatter");
  }
  if (!readme.includes("./skills/agent-symbol-search/SKILL.md")) {
    fail("README.md: missing bundled agent skill link");
  }
  if (!packageJson.files?.includes("skills")) {
    fail("package.json: npm files list does not include skills");
  }
}

for (const phrase of ["npm ci", "npm run verify", "TypeScript", "JSON", "read-only", "SPEC.md", "TASK.md"]) {
  if (!readme.includes(phrase)) fail(`README.md: missing required phrase ${phrase}`);
}
for (const phrase of ["schemaVersion", "AMBIGUOUS_SYMBOL", "MAX_RESULTS_REACHED", "PATH_OUTSIDE_ROOT", "UTF-16", "project"]) {
  if (!spec.includes(phrase)) fail(`SPEC.md: missing contract phrase ${phrase}`);
}
for (const document of documents.filter((name) => name !== "DOCUMENTATION_STANDARD.md")) {
  if (!contents.get(document)?.includes(version)) fail(`${document}: missing package version ${version}`);
}
for (const script of ["build", "prepack", "typecheck", "lint", "test", "coverage", "schema:check", "verify", "smoke:pack", "capability:check", "benchmark:check", "docs:check", "release:check", "prepublishOnly"]) {
  if (typeof packageJson.scripts?.[script] !== "string") fail(`package.json: missing npm script ${script}`);
}
for (const command of ["npm run verify", "npm run coverage", "npm run schema:check", "npm run smoke:pack", "npm run capability:check", "npm run benchmark:check", "npm run docs:check", "npm run release:check"]) {
  if (!readme.includes(command) && !spec.includes(command) && !task.includes(command)) fail(`documentation: missing ${command}`);
}

const operations = ["capabilities", "search", "symbols", "definition", "references", "implementations"];
for (const operation of operations) {
  if (!spec.includes(`\`${operation}\``)) fail(`SPEC.md: missing operation ${operation}`);
  if (!changelog.includes(operation)) fail(`CHANGELOG.md: missing shipped operation ${operation}`);
}
for (const id of ["CORE-001", "CONTRACT-001", "DISCOVERY-001", "TS-001", "TS-002", "TS-003", "API-001", "VERIFY-001", "BENCH-001"]) {
  const start = task.indexOf(`### ${id}`);
  const end = start < 0 ? -1 : task.indexOf("\n### ", start + 5);
  const block = start < 0 ? "" : task.slice(start, end < 0 ? task.length : end);
  if (!/\*\*Status:\*\* Complete/.test(block)) fail(`TASK.md: ${id} is not marked Complete`);
}
for (const phase of ["Phase 0", "Phase 1"]) {
  const start = roadmap.indexOf(`## ${phase}`);
  const end = start < 0 ? -1 : roadmap.indexOf("\n## ", start + 4);
  const block = start < 0 ? "" : roadmap.slice(start, end < 0 ? roadmap.length : end);
  if (!/\*\*Status: Completed\*\*/.test(block)) fail(`ROADMAP.md: ${phase} is not marked Completed`);
}
const completedWorkstreams = (epic.match(/\| [^|]+ \| Completed(?: locally; publication pending)? \|/g) ?? []).length;
if (completedWorkstreams < 7) fail(`EPIC.md: expected 7 completed V1 workstreams, found ${completedWorkstreams}`);
if (/documentation-only initial baseline|no runtime implementation|No runtime, package manifest/.test(`${readme}\n${design}\n${task}`)) fail("current-status documents still contain stale documentation-only claims");
if (/### Runtime[\s\S]*None\. No CLI/.test(changelog)) fail("CHANGELOG.md: runtime is still described as empty");
if (/`HEAD` is the historical documentation baseline/i.test(task)) fail("TASK.md: HEAD is still described as a historical/baseline checkout");
if (!task.includes("HEAD` is the current V1 implementation line")) fail("TASK.md: current HEAD reconciliation is missing");
if (!readme.includes("Node.js 22") || !readme.includes("Node.js 24") || !readme.includes("Node.js 26")) fail("README.md: supported Node.js majors are missing");
if (packageJson.engines?.node !== "^22.0.0 || ^24.0.0 || ^26.0.0") fail("package.json: supported Node.js engine range is incorrect");
if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/" || packageJson.publishConfig?.access !== "public") fail("package.json: public npm publish configuration is incorrect");
if (packageJson.repository?.url !== "git+https://github.com/yapweijun1996/AI-Agent-Tools.git") fail("package.json: repository URL is incorrect");
const gitHeadFiles = spawnSync("git", ["ls-tree", "-r", "--name-only", "HEAD:packages/symbol-search"], { encoding: "utf8" });
if (gitHeadFiles.error || gitHeadFiles.status !== 0) fail("Git evidence: unable to inspect HEAD");
else {
  for (const path of ["package.json", "src/index.ts", "schemas/request.schema.json"]) {
    if (!gitHeadFiles.stdout.split(/\r?\n/).includes(path)) fail(`Git evidence: HEAD is missing implementation file ${path}`);
  }
}
for (const document of [readme, design, spec]) {
  if (!document.includes("node_modules")) fail("documentation: node_modules boundary is missing");
}

let api;
try {
  api = require(resolve("dist/index.js"));
  const capabilities = api.getCapabilitiesData();
  const capabilityValidation = api.validateCapabilities(capabilities);
  if (!capabilityValidation.valid) fail(`capabilities: runtime output failed schema validation: ${capabilityValidation.errors.join("; ")}`);
  const tsOperations = capabilities.languages?.typescript?.operations ?? {};
  const documentedSupport = { capabilities: "full", search: "full", symbols: "full", definition: "full", references: "full", implementations: "partial" };
  for (const [operation, expected] of Object.entries(documentedSupport)) {
    if (tsOperations[operation] !== expected) fail(`capabilities: TypeScript ${operation} is ${tsOperations[operation]}, expected ${expected}`);
    const line = readme.split(/\r?\n/).find((candidate) => candidate.includes(`| \`${operation}\` |`));
    const expectedLabel = expected === "full" ? "Full" : "Partial";
    if (!line?.includes(`| ${expectedLabel} |`)) fail(`README.md: ${operation} support claim does not match runtime capability`);
  }
  if (tsOperations.implementations !== "partial") fail("capabilities: TypeScript implementations is not partial");
  for (const language of ["javascript", "python", "cfml"]) {
    if (Object.values(capabilities.languages?.[language]?.operations ?? {}).some((value) => value === "full")) fail(`capabilities: ${language} is incorrectly full`);
  }
  const limits = new api.SymbolSearchEngine().getLimits();
  for (const [key, expected] of [["maxFiles", 10_000], ["maxSingleFileBytes", 2 * 1024 * 1024], ["maxParsedBytes", 100 * 1024 * 1024], ["defaultResults", 50], ["maxResults", 500], ["timeoutMs", 5_000]]) {
    if (limits[key] !== expected) fail(`runtime limits: ${key} is ${limits[key]}, expected ${expected}`);
  }
  const validResult = api.execute({ operation: "search", root: resolve("test/fixtures/typescript"), symbol: "FileAdapter" });
  if (!api.validateResult(validResult).valid) fail("result example: executable result failed result schema validation");
} catch (error) {
  fail(`runtime evidence: unable to load built API (${error instanceof Error ? error.message : String(error)})`);
}

const cli = spawnSync(process.execPath, [resolve("dist/cli.js"), "capabilities", "--root", process.cwd()], { encoding: "utf8" });
if (cli.error || cli.status !== 0) fail(`CLI quick-start: exited ${cli.status ?? "unknown"}`);
else {
  try {
    const cliResult = JSON.parse(cli.stdout);
    if (cliResult.status !== "complete") fail("CLI quick-start: result is not complete");
  } catch (error) {
    fail(`CLI quick-start: stdout is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (cli.stderr.length !== 0) fail(`CLI quick-start: stderr was not empty (${cli.stderr.length} bytes)`);
}

const recovery = spawnSync(process.execPath, [resolve("dist/cli.js"), "search", "--root", process.cwd(), "--project", "tsconfig.json", "--symbol", "SymbolSearchEngine"], { encoding: "utf8" });
if (recovery.error || recovery.status !== 0) fail(`project recovery command: exited ${recovery.status ?? "unknown"}`);
else {
  try {
    const recoveryResult = JSON.parse(recovery.stdout);
    if (recoveryResult.status !== "complete" || !recoveryResult.data?.matches?.some((match) => match.name === "SymbolSearchEngine")) fail("project recovery command: SymbolSearchEngine was not found");
  } catch (error) {
    fail(`project recovery command: stdout is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (recovery.stderr.length !== 0) fail(`project recovery command: stderr was not empty (${recovery.stderr.length} bytes)`);
}

const jsonBlocks = [...spec.matchAll(/```json\n([\s\S]*?)\n```/g)];
for (const blockMatch of jsonBlocks) {
  const blockStart = blockMatch.index ?? 0;
  const context = spec.slice(Math.max(0, blockStart - 120), blockStart).toLowerCase();
  let value;
  try {
    value = JSON.parse(blockMatch[1]);
  } catch {
    if (!context.includes("illustrative")) fail("SPEC.md: non-illustrative JSON example is not parseable");
    continue;
  }
  if (context.includes("illustrative") || (typeof value === "object" && value !== null && "path" in value && "line" in value && "column" in value && !("operation" in value))) continue;
  if (value?.schemaVersion === "1" && "status" in value && api && !api.validateResult(value).valid) fail("SPEC.md: result JSON example fails the maintained result schema");
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`docs: ${documents.length} documents, runtime capabilities/limits, executable examples, cross-document status, links, and schemas checked`);
}
