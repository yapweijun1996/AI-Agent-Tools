const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "..");
const requiredDocs = [
  "README.md",
  "AGENT_GUIDE.md",
  "DESIGN.md",
  "SPEC.md",
  "EPIC.md",
  "ROADMAP.md",
  "TASK.md",
  "VALIDATION.md",
  "DOCUMENTATION_INDEX.md",
  "CHANGELOG.md",
  "spike/PROJECT_HOST_FINDINGS.md",
  "spike/PERFORMANCE_FINDINGS.md",
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function markdownFiles() {
  const rootFiles = readdirSync(root).filter((name) => name.endsWith(".md"));
  const spikeRoot = join(root, "spike");
  const spikeFiles = statSync(spikeRoot).isDirectory()
    ? readdirSync(spikeRoot).filter((name) => name.endsWith(".md")).map((name) => join("spike", name))
    : [];
  return [...rootFiles, ...spikeFiles].sort();
}

function slugHeading(value) {
  return value
    .replace(/[`*_~]/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function checkMarkdown(files) {
  const texts = new Map();
  let linkCount = 0;
  let relativeLinkCount = 0;
  let anchorCount = 0;
  let fencedBlocks = 0;
  for (const relativeFile of files) {
    const file = join(root, relativeFile);
    const text = readFileSync(file, "utf8");
    texts.set(relativeFile, text);
    assert(text.endsWith("\n"), `${relativeFile} has no final newline`);
    assert(!text.split(/\r?\n/).some((line) => /[ \t]$/.test(line)), `${relativeFile} has trailing whitespace`);
    const fenceCount = text.match(/```/g)?.length ?? 0;
    assert(fenceCount % 2 === 0, `${relativeFile} has unbalanced code fences`);
    fencedBlocks += fenceCount / 2;
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1];
      linkCount += 1;
      const [targetPath, anchor] = target.split("#", 2);
      if (anchor !== undefined) {
        anchorCount += 1;
      }
      if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("mailto:") || target.startsWith("codex://")) {
        continue;
      }
      relativeLinkCount += 1;
      const destination = targetPath ? resolve(join(root, relativeFile, ".."), targetPath) : file;
      assert(!targetPath || existsSync(destination), `${relativeFile} links to missing file: ${target}`);
      if (anchor !== undefined && anchor.length > 0) {
        const destinationText = destination === file ? text : readFileSync(destination, "utf8");
        const destinationAnchors = new Set([...destinationText.matchAll(/^#{1,6}\s+(.+)$/gm)].map((heading) => slugHeading(heading[1])));
        assert(destinationAnchors.has(anchor.toLowerCase()), `${relativeFile} links to missing anchor: ${target}`);
      }
    }
  }
  return { texts, linkCount, relativeLinkCount, anchorCount, fencedBlocks };
}

function checkIdentifiers(texts) {
  const definitions = new Set();
  const mentions = new Set();
  for (const text of texts.values()) {
    for (const match of text.matchAll(/^\|\s*((?:R|V|CI|DOC)-\d+)\s*\|/gm)) {
      definitions.add(match[1]);
    }
    for (const match of text.matchAll(/^###\s+(D-\d+):/gm)) {
      definitions.add(match[1]);
    }
    for (const match of text.matchAll(/^###\s+(E-\d+):/gm)) {
      definitions.add(match[1]);
    }
    for (const match of text.matchAll(/^\|\s*(M-\d+):/gm)) {
      definitions.add(match[1]);
    }
    for (const match of text.matchAll(/\b(?:R|V|CI|DOC|D|E|M)-\d+\b/g)) {
      mentions.add(match[0]);
    }
  }
  const undefinedIdentifiers = [...mentions].filter((identifier) => !definitions.has(identifier)).sort();
  assert(undefinedIdentifiers.length === 0, `undefined identifiers: ${undefinedIdentifiers.join(", ")}`);
  return { definitions: definitions.size };
}

function checkTaskDag(text) {
  const dependencies = new Map();
  for (const match of text.matchAll(/^\|\s*(CI-\d+)\s*\|[^|]*\|[^|]*\|([^|]*)\|/gm)) {
    dependencies.set(match[1], new Set(match[2].match(/CI-\d+/g) ?? []));
  }
  const visited = new Set();
  const active = new Set();
  function visit(node) {
    assert(!active.has(node), `cycle in CI dependency graph at ${node}`);
    if (visited.has(node)) {
      return;
    }
    active.add(node);
    for (const dependency of dependencies.get(node) ?? []) {
      visit(dependency);
    }
    active.delete(node);
    visited.add(node);
  }
  for (const node of dependencies.keys()) {
    visit(node);
  }
}

function checkGitReferences(texts) {
  const allText = [...texts.values()].join("\n");
  const revisions = new Set(allText.match(/\b[0-9a-f]{7}\b/g) ?? []);
  for (const revision of revisions) {
    execFileSync("git", ["cat-file", "-e", `${revision}^{commit}`], { cwd: root, stdio: "ignore" });
  }
  const expected = execFileSync("git", ["show", "HEAD:.gitattributes"], { cwd: root }).toString("utf8").replaceAll("\r\n", "\n");
  const actual = readFileSync(join(root, ".gitattributes"), "utf8").replaceAll("\r\n", "\n");
  assert(expected === actual, ".gitattributes differs from HEAD");
}

try {
  for (const file of requiredDocs) {
    assert(statSync(join(root, file)).isFile(), `missing required document: ${file}`);
  }
  const files = markdownFiles();
  const checked = checkMarkdown(files);
  const identifiers = checkIdentifiers(checked.texts);
  checkTaskDag(checked.texts.get("TASK.md"));
  checkGitReferences(checked.texts);
  process.stdout.write(`docs-check: pass (${files.length} files, ${checked.linkCount} links, ${checked.relativeLinkCount} relative, ${checked.anchorCount} anchors, ${identifiers.definitions} identifiers, ${checked.fencedBlocks} fenced blocks)\n`);
} catch (error) {
  process.stderr.write(`docs-check: fail: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
