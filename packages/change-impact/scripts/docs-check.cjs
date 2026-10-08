const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

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

function checkGitReferences(texts, packageRoot = root) {
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: packageRoot, encoding: "utf8" }).trim();
  const packagePath = relative(repositoryRoot, packageRoot).replaceAll("\\", "/");
  const manifestPath = join(repositoryRoot, "docs/migration/SOURCE_MANIFEST.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
  const importedFiles = manifest.find((tool) => tool.package === "agent-change-impact")?.files ?? [];
  const historical = new Set();
  for (const [file, text] of texts) {
    for (const revision of new Set(text.match(/\b[0-9a-f]{7}\b/g) ?? [])) {
      try {
        execFileSync("git", ["cat-file", "-e", `${revision}^{commit}`], { cwd: repositoryRoot, stdio: "ignore" });
      } catch (error) {
        if (error.status === undefined) throw error;
        // Consolidation preserves immutable upstream documents, not their Git objects.
        // A missing revision is historical only while the entire import snapshot matches.
        const destination = [packagePath, file.replaceAll("\\", "/")].filter(Boolean).join("/");
        const imported = importedFiles.find((item) => item.destination === destination);
        const actualHash = createHash("sha256").update(readFileSync(join(packageRoot, file))).digest("hex");
        assert(imported?.imported_sha256 === actualHash, `unverified Git revision ${revision} in ${file}`);
        historical.add(revision);
      }
    }
  }
  const attributesPath = [packagePath, ".gitattributes"].filter(Boolean).join("/");
  const expected = execFileSync("git", ["show", `HEAD:${attributesPath}`], { cwd: repositoryRoot }).toString("utf8").replaceAll("\r\n", "\n");
  const actual = readFileSync(join(packageRoot, ".gitattributes"), "utf8").replaceAll("\r\n", "\n");
  assert(expected === actual, ".gitattributes differs from HEAD");
  return historical.size;
}

function main() {
  try {
    for (const file of requiredDocs) {
      assert(statSync(join(root, file)).isFile(), `missing required document: ${file}`);
    }
    const files = markdownFiles();
    const checked = checkMarkdown(files);
    const identifiers = checkIdentifiers(checked.texts);
    checkTaskDag(checked.texts.get("TASK.md"));
    const historical = checkGitReferences(checked.texts);
    if (historical) process.stdout.write(`docs-check: ${historical} historical revisions preserved from hash-verified import snapshots; upstream Git existence is not reverified\n`);
    process.stdout.write(`docs-check: pass (${files.length} files, ${checked.linkCount} links, ${checked.relativeLinkCount} relative, ${checked.anchorCount} anchors, ${identifiers.definitions} identifiers, ${checked.fencedBlocks} fenced blocks)\n`);
  } catch (error) {
    process.stderr.write(`docs-check: fail: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkGitReferences };
if (require.main === module) main();
