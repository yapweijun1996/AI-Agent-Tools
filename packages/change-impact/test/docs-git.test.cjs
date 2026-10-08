"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { checkGitReferences } = require("../scripts/docs-check.cjs");

function fixture(callback) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "impact-docs-git-"));
  const packageRoot = path.join(repository, "packages/change-impact");
  fs.mkdirSync(packageRoot, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  try {
    git("init");
    fs.writeFileSync(path.join(repository, ".gitattributes"), "* text=auto eol=lf\n");
    fs.writeFileSync(path.join(packageRoot, ".gitattributes"), "* text=auto\n");
    git("add", ".");
    git("-c", "user.name=Validation", "-c", "user.email=validation@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--no-gpg-sign", "-m", "Fixture baseline");
    const revision = git("rev-parse", "--short=7", "HEAD").trim();
    return callback({ repository, packageRoot, revision });
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
}

test("documentation Git evidence uses the package path inside the monorepo", () => fixture(({ packageRoot, revision }) => {
  assert.equal(checkGitReferences(new Map([["README.md", `Current revision: ${revision}`]]), packageRoot), 0);
  fs.writeFileSync(path.join(packageRoot, ".gitattributes"), "* text=auto eol=crlf\n");
  assert.throws(() => checkGitReferences(new Map(), packageRoot), /differs from HEAD/);
}));

test("missing upstream revisions require an exact immutable imported document", () => fixture(({ repository, packageRoot }) => {
  const text = "Historical revision: deadbee\n";
  fs.writeFileSync(path.join(packageRoot, "README.md"), text);
  const texts = new Map([["README.md", text]]);
  assert.throws(() => checkGitReferences(texts, packageRoot), /unverified Git revision/);
  const directory = path.join(repository, "docs/migration");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "SOURCE_MANIFEST.json"), JSON.stringify([{
    package: "agent-change-impact",
    files: [{ destination: "packages/change-impact/README.md", imported_sha256: createHash("sha256").update(text).digest("hex") }],
  }]));
  assert.equal(checkGitReferences(texts, packageRoot), 1);
  fs.appendFileSync(path.join(packageRoot, "README.md"), "Unreviewed change\n");
  assert.throws(() => checkGitReferences(texts, packageRoot), /unverified Git revision/);
}));
