import { lstatSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChangedSeed, Diagnostic, Limits, TextRange } from "./types";
import { ImpactError } from "./errors";
import { gitDiffNoIndex, gitHashObjectPaths, gitHashObjectText, gitOutput, gitTextAttributes, repositoryRoot, shouldIncludePath } from "./snapshot";
import { compareText, normalizeRepoPath } from "./util";

export interface GitChange {
  status: "added" | "modified" | "deleted" | "renamed";
  path: string;
  oldPath?: string;
  oldRanges: TextRange[];
  newRanges: TextRange[];
}

export interface GitChangeResult {
  root: string;
  base: string;
  head?: string;
  changes: GitChange[];
  diagnostics: Diagnostic[];
}

export function collectGitChanges(rootInput: string | undefined, baseInput: string, headInput?: string, worktree = false, limits?: Limits): GitChangeResult {
  const root = repositoryRoot(rootInput);
  if (worktree === (headInput !== undefined)) {
    throw new ImpactError("INVALID_ARGUMENT", "Pass exactly one of head or worktree for changed analysis");
  }
  const base = baseInput.trim();
  if (!base || base.startsWith("-") || base.includes("\0")) {
    throw new ImpactError("INVALID_ARGUMENT", "A valid base revision is required");
  }
  const head = headInput?.trim();
  if (!worktree && (!head || head.startsWith("-") || head.includes("\0"))) {
    throw new ImpactError("INVALID_ARGUMENT", "A valid head revision is required when worktree is false");
  }
  const captureBefore = worktree ? worktreeCaptureSignature(root, base, limits) : undefined;
  const worktreeState = worktree ? collectWorktreeState(root, limits) : undefined;
  const endpoint = worktree ? undefined : head;
  const diffArgs = ["--name-status", "-z", "--find-renames", "--no-ext-diff", "--no-textconv"];
  const raw = worktree
    ? worktreeDiff(root, base, diffArgs, "", worktreeState!)
    : gitOutput(root, ["diff", ...diffArgs, base, endpoint!]);
  const changes = worktree ? mergeGitChanges(parseNameStatus(raw)) : parseNameStatus(raw);
  const patchArgs = ["--unified=0", "--find-renames", "--no-ext-diff", "--no-textconv"];
  const patchOutput = worktree
    ? worktreeDiff(root, base, patchArgs, "\n", worktreeState!)
    : gitOutput(root, ["diff", ...patchArgs, base, endpoint!]);
  const ranges = parsePatchRanges(patchOutput);
  for (const change of changes) {
    const key = `${change.oldPath ?? ""}->${change.path}`;
    const range = ranges.get(key) ?? ranges.get(change.path);
    if (range) {
      change.oldRanges = range.oldRanges;
      change.newRanges = range.newRanges;
    }
  }
  const diagnostics: Diagnostic[] = [];
  const hasConflictStatus = hasUnmergedStatus(raw);
  const hasIndexConflict = worktreeState?.hasConflict ?? false;
  if (hasConflictStatus || hasIndexConflict) {
    diagnostics.push({ code: "GIT_CONFLICT_STATE", message: "Git reported an unmerged/conflicted path; impact results are partial", severity: "warning" });
  }
  const untracked = worktree ? parseUntracked(root) : [];
  for (const path of untracked) {
    if (!changes.some((change) => change.path === path)) {
      changes.push({ status: "added", path, oldRanges: [], newRanges: [{ start: { line: 1, column: 1 }, end: { line: Number.MAX_SAFE_INTEGER, column: 1 } }] });
    }
  }
  changes.sort((a, b) => compareText(`${a.path}:${a.oldPath ?? ""}`, `${b.path}:${b.oldPath ?? ""}`));
  if (worktree) {
    const captureAfter = worktreeCaptureSignature(root, base, limits);
    if (captureBefore !== captureAfter) {
      diagnostics.push({ code: "WORKTREE_CHANGED_DURING_CAPTURE", message: "Working-tree contents or status changed while the snapshot was being captured; results are partial", severity: "warning" });
    }
    diagnostics.push({ code: "WORKTREE_SNAPSHOT", message: "Working-tree analysis includes tracked net changes and non-ignored untracked files", severity: "info" });
  }
  return { root, base, head: endpoint, changes, diagnostics };
}

function worktreeCaptureSignature(root: string, base: string, limits?: Limits): string {
  // `git diff` and `git status` can execute repository-configured clean
  // filters while inspecting worktree content. Tree, index, and raw-file
  // comparisons provide the same change-state signal without invoking them.
  const state = collectWorktreeState(root, limits);
  return worktreeDiff(root, base, ["--raw", "-z", "--no-ext-diff", "--no-textconv"], "", state);
}

interface IndexEntry {
  mode: string;
  object: string;
  stage: number;
}

interface WorktreeState {
  changes: GitChange[];
  index: Map<string, IndexEntry>;
  workingHashes: Map<string, string>;
  hasConflict: boolean;
  signature: string;
}

function collectWorktreeState(root: string, limits?: Limits): WorktreeState {
  const index = parseIndexEntries(gitOutput(root, ["ls-files", "--stage", "-z"]));
  const stageZero = new Map<string, IndexEntry>();
  const conflictPaths = new Set<string>();
  for (const [path, entries] of index.entries()) {
    const normal = entries.find((entry) => entry.stage === 0);
    if (normal) {
      stageZero.set(path, normal);
    }
    if (entries.some((entry) => entry.stage !== 0)) {
      conflictPaths.add(path);
    }
  }

  const hashablePaths: string[] = [];
  const missingPaths = new Set<string>();
  const symlinkHashes = new Map<string, string>();
  for (const [path, entry] of stageZero.entries()) {
    const absolute = join(root, ...path.split("/"));
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        symlinkHashes.set(path, gitHashObjectText(root, readlinkSync(absolute, "utf8")));
      } else if (stat.isFile()) {
        hashablePaths.push(path);
      } else if (entry.mode !== "160000") {
        missingPaths.add(path);
      }
    } catch {
      missingPaths.add(path);
    }
  }
  const workingHashes = gitHashObjectPaths(root, hashablePaths);
  for (const [path, hash] of symlinkHashes) {
    workingHashes.set(path, hash);
  }

  // Compare raw content without invoking repository-configured clean filters.
  // Git normalizes text line endings at checkout on Windows, so reconcile a
  // CRLF-only difference with the index object before classifying a change.
  reconcileCheckoutLineEndings(root, stageZero, workingHashes, limits);
  const changes: GitChange[] = [];
  for (const [path, entry] of stageZero.entries()) {
    if (missingPaths.has(path) || (!workingHashes.has(path) && entry.mode !== "160000")) {
      changes.push({ status: "deleted", path, oldRanges: [], newRanges: [] });
      continue;
    }
    const current = workingHashes.get(path);
    if (entry.mode !== "160000" && current !== entry.object) {
      changes.push({ status: "modified", path, oldRanges: [], newRanges: [] });
    }
  }
  for (const path of conflictPaths) {
    if (!changes.some((change) => change.path === path)) {
      changes.push({ status: "modified", path, oldRanges: [], newRanges: [] });
    }
  }

  const untracked = parseUntracked(root);
  const unmerged = gitOutput(root, ["ls-files", "-u", "-z"]);
  const signature = JSON.stringify({
    index: [...index.entries()].sort(([a], [b]) => compareText(a, b)),
    working: [...workingHashes.entries()].sort(([a], [b]) => compareText(a, b)),
    missing: [...missingPaths].sort(compareText),
    untracked,
    unmerged,
  });
  return { changes, index: stageZero, workingHashes, hasConflict: conflictPaths.size > 0 || unmerged.length > 0, signature };
}

function reconcileCheckoutLineEndings(root: string, index: Map<string, IndexEntry>, workingHashes: Map<string, string>, limits?: Limits): void {
  const candidates = [...index.entries()].filter(([path, entry]) => entry.mode !== "160000" && workingHashes.get(path) !== entry.object).map(([path]) => path);
  if (candidates.length === 0) {
    return;
  }
  let attributes: Map<string, string>;
  try {
    attributes = gitTextAttributes(root, candidates);
  } catch {
    attributes = new Map();
  }
  let autocrlf = "";
  let eol = "";
  try {
    autocrlf = gitOutput(root, ["config", "--get", "core.autocrlf"]).trim().toLowerCase();
  } catch {
    // An unset core.autocrlf is equivalent to no implicit checkout conversion.
  }
  try {
    eol = gitOutput(root, ["config", "--get", "core.eol"]).trim().toLowerCase();
  } catch {
    // An unset core.eol follows the platform default.
  }
  const maxBytes = limits?.maxFileBytes ?? 16 * 1024 * 1024;
  for (const path of candidates) {
    const attribute = attributes.get(path) ?? "unspecified";
    const platformCheckout = process.platform === "win32" && autocrlf !== "false" && autocrlf !== "input" && eol !== "lf";
    const textCheckout = (attribute === "set" || attribute === "auto") && (platformCheckout || autocrlf === "true")
      || attribute === "unspecified" && autocrlf === "true" && eol !== "lf";
    if (!textCheckout) {
      continue;
    }
    const absolute = join(root, ...path.split("/"));
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maxBytes) {
        continue;
      }
      const raw = readFileSync(absolute);
      const normalized = normalizeCheckoutLineEndings(raw);
      if (normalized && gitHashObjectText(root, normalized) === index.get(path)?.object) {
        workingHashes.set(path, index.get(path)!.object);
      }
    } catch {
      // Keep the raw hash when normalization cannot be proven equivalent.
    }
  }
}

function normalizeCheckoutLineEndings(value: Buffer): Buffer | undefined {
  if (value.includes(0) || !value.includes(13)) {
    return undefined;
  }
  const normalized: number[] = [];
  let changed = false;
  for (let index = 0; index < value.length; index += 1) {
    const byte = value[index];
    if (byte === 13 && value[index + 1] === 10) {
      normalized.push(10);
      index += 1;
      changed = true;
    } else {
      normalized.push(byte);
    }
  }
  return changed ? Buffer.from(normalized) : undefined;
}

function worktreeDiff(root: string, base: string, diffArgs: string[], separator: string, state: WorktreeState): string {
  const head = gitOutput(root, ["rev-parse", "HEAD"]).trim();
  const sections = [
    // Compare immutable Git trees first, then the index. Both comparisons are
    // independent of worktree content and therefore cannot execute clean filters.
    gitOutput(root, ["diff", ...diffArgs, base, head]),
    gitOutput(root, ["diff", "--cached", ...diffArgs, head]),
  ];
  if (diffArgs[0] === "--name-status") {
    sections.push(serializeNameStatus(state.changes));
  } else if (diffArgs[0] === "--raw") {
    sections.push(state.signature);
  } else {
    sections.push(renderWorktreePatch(root, state));
  }
  return sections.join(separator);
}

function parseIndexEntries(raw: string): Map<string, IndexEntry[]> {
  const entries = new Map<string, IndexEntry[]>();
  for (const record of raw.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    if (separator < 0) {
      continue;
    }
    const header = record.slice(0, separator).split(" ");
    const path = normalizeRepoPath(record.slice(separator + 1));
    const mode = header[0] ?? "";
    const object = header[1] ?? "";
    const stage = Number(header[2] ?? "0");
    if (!mode || !object || !Number.isInteger(stage)) {
      continue;
    }
    const list = entries.get(path) ?? [];
    list.push({ mode, object, stage });
    entries.set(path, list);
  }
  return entries;
}

function serializeNameStatus(changes: readonly GitChange[]): string {
  return changes.map((change) => {
    if (change.status === "renamed" && change.oldPath) {
      return `R100\0${change.oldPath}\0${change.path}\0`;
    }
    const status = change.status === "added" ? "A" : change.status === "deleted" ? "D" : "M";
    return `${status}\0${change.path}\0`;
  }).join("");
}

function renderWorktreePatch(root: string, state: WorktreeState): string {
  const sections: string[] = [];
  for (const change of state.changes) {
    const entry = state.index.get(change.path);
    const oldText = entry ? gitOutput(root, ["cat-file", "blob", entry.object]) : "";
    const newText = change.status === "deleted" ? "" : readWorkingText(root, change.path) ?? "";
    const temporary = mkdtempSync(join(tmpdir(), "agent-impact-diff-"));
    try {
      const oldFile = join(temporary, "old.impact");
      const newFile = join(temporary, "new.impact");
      writeFileSync(oldFile, oldText);
      writeFileSync(newFile, newText);
      const output = gitDiffNoIndex(temporary, oldFile, newFile);
      const hunks = output.split(/\r?\n/).filter((line) => line.startsWith("@@ "));
      if (hunks.length > 0) {
        sections.push(`diff --git a/${change.path} b/${change.path}\n${hunks.join("\n")}`);
      } else if (oldText !== newText) {
        sections.push(`diff --git a/${change.path} b/${change.path}\n${fullFileHunk(oldText, newText)}`);
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
  return sections.join("\n");
}

function readWorkingText(root: string, path: string): string | undefined {
  const absolute = join(root, ...path.split("/"));
  try {
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      return readlinkSync(absolute, "utf8");
    }
    return stat.isFile() ? readFileSync(absolute, "utf8") : undefined;
  } catch {
    return undefined;
  }
}

function fullFileHunk(oldText: string, newText: string): string {
  const oldCount = oldText.length === 0 ? 0 : oldText.split("\n").length - (oldText.endsWith("\n") ? 1 : 0);
  const newCount = newText.length === 0 ? 0 : newText.split("\n").length - (newText.endsWith("\n") ? 1 : 0);
  return `@@ -1,${oldCount} +1,${newCount} @@`;
}

function parseUntracked(root: string): string[] {
  return gitOutput(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepoPath)
    .filter(shouldIncludePath)
    .filter((path) => !path.split("/").includes("node_modules"));
}

function parseNameStatus(raw: string): GitChange[] {
  const tokens = raw.split("\0").filter(Boolean);
  const changes: GitChange[] = [];
  for (let index = 0; index < tokens.length;) {
    const statusToken = tokens[index++];
    const status = statusToken[0];
    if (status === "R" || status === "C") {
      const oldPath = normalizeRepoPath(tokens[index++] ?? "");
      const path = normalizeRepoPath(tokens[index++] ?? "");
      changes.push({ status: "renamed", path, oldPath, oldRanges: [], newRanges: [] });
      continue;
    }
    const path = normalizeRepoPath(tokens[index++] ?? "");
    const mapped = status === "A" ? "added" : status === "D" ? "deleted" : "modified";
    changes.push({ status: mapped, path, oldRanges: [], newRanges: [] });
  }
  return changes;
}

function mergeGitChanges(changes: GitChange[]): GitChange[] {
  const merged = new Map<string, GitChange>();
  for (const change of changes) {
    const current = merged.get(change.path);
    if (!current) {
      merged.set(change.path, { ...change, oldRanges: [], newRanges: [] });
      continue;
    }
    const status = mergeGitStatus(current.status, change.status);
    const oldPath = current.oldPath ?? change.oldPath;
    merged.set(change.path, {
      ...current,
      status,
      ...(oldPath ? { oldPath } : {}),
    });
  }
  return [...merged.values()];
}

function mergeGitStatus(current: GitChange["status"], incoming: GitChange["status"]): GitChange["status"] {
  if (current === incoming) {
    return current;
  }
  if (current === "renamed" || incoming === "renamed") {
    return "renamed";
  }
  if (incoming === "deleted") {
    return "deleted";
  }
  if (current === "deleted") {
    return incoming === "added" ? "modified" : "deleted";
  }
  if (current === "added") {
    return "added";
  }
  if (incoming === "added") {
    return "modified";
  }
  return "modified";
}

function hasUnmergedStatus(raw: string): boolean {
  const tokens = raw.split("\0").filter(Boolean);
  for (let index = 0; index < tokens.length;) {
    const statusToken = tokens[index++];
    if (/^U/.test(statusToken)) {
      return true;
    }
    index += statusToken[0] === "R" || statusToken[0] === "C" ? 2 : 1;
  }
  return false;
}

interface RangePair {
  oldRanges: TextRange[];
  newRanges: TextRange[];
}

function parsePatchRanges(patch: string): Map<string, RangePair> {
  const result = new Map<string, RangePair>();
  let oldPath = "";
  let newPath = "";
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (match) {
        oldPath = normalizeRepoPath(match[1]);
        newPath = normalizeRepoPath(match[2]);
      }
      continue;
    }
    if (!line.startsWith("@@ ")) {
      continue;
    }
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }
    const oldStart = Number(match[1]);
    const oldCount = Number(match[2] ?? "1");
    const newStart = Number(match[3]);
    const newCount = Number(match[4] ?? "1");
    const oldRange = lineRange(oldStart, oldCount);
    const newRange = lineRange(newStart, newCount);
    const key = `${oldPath}->${newPath}`;
    const current = result.get(key) ?? { oldRanges: [], newRanges: [] };
    current.oldRanges.push(oldRange);
    current.newRanges.push(newRange);
    result.set(key, current);
    result.set(newPath, current);
  }
  return result;
}

function lineRange(start: number, count: number): TextRange {
  const safeStart = Math.max(1, start);
  const endLine = count === 0 ? safeStart : safeStart + count - 1;
  return { start: { line: safeStart, column: 1 }, end: { line: Math.max(safeStart, endLine), column: Number.MAX_SAFE_INTEGER } };
}

export function changedSeedFromChange(change: GitChange, oldSymbols: string[], newSymbols: string[], snapshots: ChangedSeed["snapshots"]): ChangedSeed {
  const configuration = /(?:^|\/)(?:tsconfig|jsconfig)\.json$|(?:^|\/)package\.json$/.test(change.path);
  return {
    path: change.path,
    ...(change.oldPath ? { oldPath: change.oldPath } : {}),
    status: configuration ? "configuration" : change.status,
    oldSymbols: [...oldSymbols].sort(compareText),
    newSymbols: [...newSymbols].sort(compareText),
    snapshots,
  };
}
