import { execFileSync } from "node:child_process";
import { closeSync, existsSync, lstatSync, openSync, readdirSync, realpathSync, readSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { ImpactError } from "./errors";
import type { Diagnostic, SnapshotRef } from "./types";
import { DEFAULT_LIMITS, type Limits, type SnapshotKind } from "./types";
import { compareText, createDiagnosticCollector, normalizeRepoPath, relativeRepoPath, sha256, snapshotId } from "./util";

export interface SnapshotLoadResult {
  snapshot: SourceSnapshot;
  diagnostics: Diagnostic[];
}

class GitOutputLimitError extends Error {
  public constructor() {
    super("Git output exceeded the configured read buffer");
    this.name = "GitOutputLimitError";
  }
}

export class SourceSnapshot {
  public readonly root: string;
  public readonly ref: SnapshotRef;
  public readonly files: ReadonlyMap<string, string>;
  public readonly externalFallback: boolean;
  private readonly lookupKeys: ReadonlyMap<string, string>;

  public constructor(
    root: string,
    kind: SnapshotKind,
    files: Map<string, string>,
    revision?: string,
    externalFallback = false,
  ) {
    this.root = resolve(root);
    this.files = new Map(files);
    const lookup = new Map<string, string>();
    for (const file of this.files.keys()) {
      const key = process.platform === "win32" ? file.toLowerCase() : file;
      if (!lookup.has(key)) {
        lookup.set(key, file);
      }
    }
    this.lookupKeys = lookup;
    this.externalFallback = externalFallback;
    this.ref = {
      kind,
      id: snapshotId(kind, revision, this.files),
      ...(revision ? { revision } : {}),
    };
  }

  public fileExists(fileName: string): boolean {
    try {
      const relativePath = this.toRepoPath(fileName);
      return this.lookupKeys.has(this.lookupKey(relativePath));
    } catch {
      return false;
    }
  }

  public readFile(fileName: string): string | undefined {
    try {
      const relativePath = this.toRepoPath(fileName);
      const storedPath = this.lookupKeys.get(this.lookupKey(relativePath));
      return storedPath === undefined ? undefined : this.files.get(storedPath);
    } catch {
      return undefined;
    }
  }

  private lookupKey(fileName: string): string {
    return process.platform === "win32" ? fileName.toLowerCase() : fileName;
  }

  public absolutePath(fileName: string): string {
    const relativePath = this.toRepoPath(fileName);
    return join(this.root, ...relativePath.split("/"));
  }

  public toRepoPath(fileName: string): string {
    if (!isAbsolute(fileName)) {
      return normalizeRepoPath(fileName);
    }
    return relativeRepoPath(this.root, fileName);
  }

  public projectFiles(): string[] {
    return [...this.files.keys()].sort(compareText);
  }
}

function attachSnapshotDiagnostics(diagnostics: readonly Diagnostic[], snapshot: SourceSnapshot): Diagnostic[] {
  return diagnostics.map((entry) => entry.snapshot ? entry : { ...entry, snapshot: snapshot.ref });
}

function runGit(root: string, args: string[], encoding: BufferEncoding = "utf8", maxBuffer = 64 * 1024 * 1024): string {
  // A repository can configure core.fsmonitor as an executable helper. Disable
  // it so read-only analysis never runs repository-configured processes.
  const safeArgs = ["-c", "core.fsmonitor=false", ...args];
  try {
    return execFileSync("git", safeArgs, {
      cwd: root,
      encoding,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpactError("GIT_ERROR", `Git command failed: git ${safeArgs.join(" ")}`, { cause: message });
  }
}

function runGitInput(root: string, args: string[], input: string | Buffer, encoding: BufferEncoding = "utf8", maxBuffer = 64 * 1024 * 1024): string {
  const safeArgs = ["-c", "core.fsmonitor=false", ...args];
  try {
    return execFileSync("git", safeArgs, {
      cwd: root,
      input,
      encoding,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpactError("GIT_ERROR", `Git command failed: git ${safeArgs.join(" ")}`, { cause: message });
  }
}

function isGitOutputLimitError(error: unknown, maxBuffer: number): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return true;
  }
  if (code !== "ENOBUFS") {
    return false;
  }
  const stdout = (error as Error & { stdout?: unknown }).stdout;
  return Buffer.isBuffer(stdout)
    ? stdout.byteLength >= maxBuffer
    : typeof stdout === "string" && Buffer.byteLength(stdout, "utf8") >= maxBuffer;
}

function runGitBuffer(root: string, args: string[], maxBuffer = 64 * 1024 * 1024): Buffer {
  const safeArgs = ["-c", "core.fsmonitor=false", ...args];
  try {
    const output = execFileSync("git", safeArgs, {
      cwd: root,
      encoding: "buffer",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer,
    });
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  } catch (error) {
    if (isGitOutputLimitError(error, maxBuffer)) {
      throw new GitOutputLimitError();
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpactError("GIT_ERROR", `Git command failed: git ${safeArgs.join(" ")}`, { cause: message });
  }
}

export function repositoryRoot(inputRoot?: string): string {
  const requested = resolve(inputRoot ?? process.cwd());
  if (inputRoot !== undefined) {
    let isDirectory = false;
    try {
      isDirectory = existsSync(requested) && statSync(requested).isDirectory();
    } catch {
      isDirectory = false;
    }
    if (!isDirectory) {
      throw new ImpactError("ROOT_NOT_FOUND", `Repository root does not exist or is not a directory: ${inputRoot}`);
    }
  }
  try {
    const root = runGit(requested, ["rev-parse", "--show-toplevel"]).trim();
    return resolve(root);
  } catch (error) {
    if (error instanceof ImpactError) {
      throw new ImpactError("NOT_A_REPOSITORY", `No Git repository found at or above ${requested}`);
    }
    throw error;
  }
}

export function shouldIncludePath(pathName: string): boolean {
  const segments = pathName.split("/");
  return !segments.includes(".git") && !segments.includes("node_modules") && !segments.includes("dist") && !segments.includes("coverage");
}

export interface BoundedTextRead {
  content: string;
  bytes: number;
  exceeded: false;
}

export interface ExceededTextRead {
  content?: undefined;
  bytes: number;
  exceeded: true;
}

export type BoundedTextReadResult = BoundedTextRead | ExceededTextRead;

/** Read UTF-8 text while never buffering more than maxBytes plus one byte. */
export function readTextFileBounded(fileName: string, maxBytes: number): BoundedTextReadResult {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative safe integer");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(fileName, "r");
    while (true) {
      // Once the limit is full, read one byte only to detect growth beyond it.
      const remaining = maxBytes - total;
      const size = remaining > 0 ? Math.min(remaining, 64 * 1024) : 1;
      const chunk = Buffer.allocUnsafe(size);
      const bytesRead = readSync(descriptor, chunk, 0, size, null);
      if (bytesRead === 0) {
        return { content: Buffer.concat(chunks, total).toString("utf8"), bytes: total, exceeded: false };
      }
      total += bytesRead;
      if (total > maxBytes) {
        return { bytes: total, exceeded: true };
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
  } finally {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
  }
}

function parseNullList(output: string): string[] {
  return output.split("\0").filter(Boolean).map(normalizeRepoPath);
}

function isGitIgnoredPath(root: string, relativePath: string): boolean {
  try {
    execFileSync("git", ["-c", "core.fsmonitor=false", "check-ignore", "-q", "--no-index", "--", relativePath], {
      cwd: root,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
    });
    return true;
  } catch (error) {
    // Exit code 1 means the path is not ignored. Other failures are treated
    // conservatively as visible so a Git helper problem cannot hide source.
    const status = typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
    return status === 0;
  }
}

function isResolvedPathInside(root: string, canonicalRoot: string, candidate: string): boolean {
  const relativeCandidate = relative(canonicalRoot, candidate);
  if (relativeCandidate === "" || (relativeCandidate !== ".." && !relativeCandidate.startsWith(`..${sep}`) && !isAbsolute(relativeCandidate))) {
    return true;
  }
  if (process.platform !== "win32") {
    return false;
  }
  // Windows can return an 8.3 short path for a symlink target while the root
  // retains its long spelling. Compare directory identities as a fallback so
  // equivalent spellings do not look like an escape.
  try {
    const rootStat = statSync(root);
    if (rootStat.dev === 0 || rootStat.ino === 0) {
      return false;
    }
    let current = candidate;
    while (true) {
      const currentStat = statSync(current);
      if (currentStat.dev === rootStat.dev && currentStat.ino === rootStat.ino) {
        return true;
      }
      const parent = dirname(current);
      if (parent === current) {
        return false;
      }
      current = parent;
    }
  } catch {
    return false;
  }
}

function discoverInternalSymlinks(root: string, existingPaths: readonly string[], limits: Limits): string[] {
  const canonicalRoot = realpathSync(root);
  const existing = new Set(existingPaths.map((pathName) => process.platform === "win32" ? pathName.toLowerCase() : pathName));
  const discovered: string[] = [];
  const pending = [root];
  const visitedDirectories = new Set<string>();
  while (pending.length > 0 && existing.size < limits.maxFiles) {
    const directory = pending.pop();
    if (!directory) {
      break;
    }
    let canonicalDirectory: string;
    try {
      canonicalDirectory = realpathSync(directory);
    } catch {
      continue;
    }
    const directoryKey = process.platform === "win32" ? canonicalDirectory.toLowerCase() : canonicalDirectory;
    if (visitedDirectories.has(directoryKey)) {
      continue;
    }
    visitedDirectories.add(directoryKey);
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (existing.size >= limits.maxFiles) {
        break;
      }
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") {
        continue;
      }
      const absolutePath = join(directory, entry.name);
      let entryStat: ReturnType<typeof lstatSync>;
      try {
        // Dirent reparse-point flags are inconsistent across Windows runner
        // images, so lstat is the source of truth for supplemental aliases.
        entryStat = lstatSync(absolutePath);
      } catch {
        continue;
      }
      if (!entryStat.isSymbolicLink()) {
        if (entryStat.isDirectory()) {
          pending.push(absolutePath);
        }
        continue;
      }
      let realPath: string;
      try {
        realPath = realpathSync(absolutePath);
        if (!isResolvedPathInside(root, canonicalRoot, realPath) || !statSync(realPath).isFile()) {
          continue;
        }
      } catch {
        continue;
      }
      const relativePath = normalizeRepoPath(relative(root, absolutePath).split(sep).join("/"));
      const key = process.platform === "win32" ? relativePath.toLowerCase() : relativePath;
      if (existing.has(key) || !shouldIncludePath(relativePath) || isGitIgnoredPath(root, relativePath)) {
        continue;
      }
      discovered.push(relativePath);
      existing.add(key);
    }
  }
  return discovered.sort(compareText);
}

function loadWorkingTreeFiles(root: string, limits: Limits): { files: Map<string, string>; diagnostics: Diagnostic[] } {
  const names = parseNullList(runGit(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]));
  names.push(...discoverInternalSymlinks(root, names, limits));
  const files = new Map<string, string>();
  const diagnostics = createDiagnosticCollector(limits.maxDiagnostics);
  const canonicalRoot = realpathSync(root);
  let totalBytes = 0;
  for (const relativePath of names.sort(compareText)) {
    if (!shouldIncludePath(relativePath)) {
      continue;
    }
    if (files.size >= limits.maxFiles) {
      diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Stopped reading files after ${limits.maxFiles} files`, severity: "warning" });
      break;
    }
    const absolutePath = join(root, ...relativePath.split("/"));
    try {
      const stat = statSync(absolutePath);
      if (!stat.isFile()) {
        continue;
      }
      const real = realpathSync(absolutePath);
      if (!isResolvedPathInside(root, canonicalRoot, real)) {
        diagnostics.add({ code: "PATH_OUTSIDE_ROOT", message: `Skipped symlink outside root: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      if (stat.size > limits.maxFileBytes || totalBytes + stat.size > limits.maxTotalFileBytes) {
        diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Skipped oversized file: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      const remainingBytes = limits.maxTotalFileBytes - totalBytes;
      if (remainingBytes <= 0) {
        diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Skipped file after reaching total byte budget: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      const bounded = readTextFileBounded(real, Math.min(limits.maxFileBytes, remainingBytes));
      if (bounded.exceeded) {
        diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Skipped file after content-size check: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      files.set(relativePath, bounded.content);
      totalBytes += bounded.bytes;
    } catch (error) {
      diagnostics.add({ code: "FILE_READ_FAILED", message: `Skipped unreadable file: ${relativePath}`, file: relativePath, severity: "warning" });
    }
  }
  return { files, diagnostics: diagnostics.toArray() };
}

export function loadWorkingTree(rootInput?: string, limits: Limits = DEFAULT_LIMITS): SnapshotLoadResult {
  const root = repositoryRoot(rootInput);
  const loaded = loadWorkingTreeFiles(root, limits);
  const snapshot = new SourceSnapshot(root, "working-tree", loaded.files, undefined, true);
  return {
    snapshot,
    diagnostics: attachSnapshotDiagnostics(loaded.diagnostics, snapshot),
  };
}

export function loadWorkingTreeStable(rootInput?: string, limits: Limits = DEFAULT_LIMITS): SnapshotLoadResult {
  const root = repositoryRoot(rootInput);
  const first = loadWorkingTreeFiles(root, limits);
  const firstSnapshot = new SourceSnapshot(root, "working-tree", first.files, undefined, true);
  const second = loadWorkingTreeFiles(root, limits);
  const secondSnapshot = new SourceSnapshot(root, "working-tree", second.files, undefined, true);
  const diagnostics = createDiagnosticCollector(limits.maxDiagnostics);
  for (const entry of [
    ...attachSnapshotDiagnostics(first.diagnostics, firstSnapshot),
    ...attachSnapshotDiagnostics(second.diagnostics, secondSnapshot),
  ]) {
    diagnostics.add(entry);
  }
  if (firstSnapshot.ref.id !== secondSnapshot.ref.id) {
    diagnostics.add({
      code: "WORKTREE_CHANGED_DURING_CAPTURE",
      message: "Working-tree contents changed between stable snapshot reads; results are partial",
      severity: "warning",
    });
  }
  return { snapshot: secondSnapshot, diagnostics: diagnostics.toArray() };
}

export function resolveRevision(root: string, revision: string): string {
  const normalized = revision.trim();
  if (!normalized || normalized.startsWith("-") || normalized.includes("\0")) {
    throw new ImpactError("INVALID_ARGUMENT", "Git revision must be a non-empty revision name");
  }
  return runGit(root, ["rev-parse", "--verify", `${normalized}^{commit}`]).trim();
}

export function loadRevision(rootInput: string | undefined, revisionInput: string, limits: Limits = DEFAULT_LIMITS): SnapshotLoadResult {
  const root = repositoryRoot(rootInput);
  const revision = resolveRevision(root, revisionInput);
  const names = parseNullList(runGit(root, ["ls-tree", "-r", "--name-only", "-z", revision]));
  const files = new Map<string, string>();
  const diagnostics = createDiagnosticCollector(limits.maxDiagnostics);
  let totalBytes = 0;
  for (const relativePath of names.sort(compareText)) {
    if (!shouldIncludePath(relativePath)) {
      continue;
    }
    if (files.size >= limits.maxFiles) {
      diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Stopped reading revision after ${limits.maxFiles} files`, severity: "warning" });
      break;
    }
    try {
      const contentBuffer = runGitBuffer(root, ["show", `${revision}:${relativePath}`], Math.min(64 * 1024 * 1024, limits.maxFileBytes + 1));
      const bytes = contentBuffer.byteLength;
      if (bytes > limits.maxFileBytes || totalBytes + bytes > limits.maxTotalFileBytes) {
        diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Skipped revision file after content-size check: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      files.set(relativePath, contentBuffer.toString("utf8"));
      totalBytes += bytes;
    } catch (error) {
      if (error instanceof GitOutputLimitError) {
        diagnostics.add({ code: "FILE_BUDGET_EXCEEDED", message: `Skipped oversized revision file: ${relativePath}`, file: relativePath, severity: "warning" });
        continue;
      }
      throw error;
    }
  }
  const snapshot = new SourceSnapshot(root, "revision", files, revision, true);
  return { snapshot, diagnostics: attachSnapshotDiagnostics(diagnostics.toArray(), snapshot) };
}

export function readGitText(root: string, revision: string, relativePath: string): string {
  return runGit(root, ["show", `${resolveRevision(root, revision)}:${normalizeRepoPath(relativePath)}`]);
}

export function gitOutput(root: string, args: string[]): string {
  return runGit(root, args);
}

/** Hash raw working-tree files without applying repository clean filters. */
export function gitHashObjectPaths(root: string, paths: readonly string[]): Map<string, string> {
  const hashes = new Map<string, string>();
  const batchable = paths.filter((path) => !path.includes("\n") && !path.includes("\r"));
  if (batchable.length > 0) {
    const output = runGitInput(root, ["hash-object", "--no-filters", "--stdin-paths"], `${batchable.join("\n")}\n`);
    const values = output.split(/\r?\n/).filter(Boolean);
    if (values.length !== batchable.length) {
      throw new ImpactError("GIT_ERROR", "Git returned an unexpected number of raw working-tree hashes");
    }
    batchable.forEach((path, index) => hashes.set(path, values[index]));
  }
  for (const path of paths) {
    if (hashes.has(path)) {
      continue;
    }
    const output = runGitInput(root, ["hash-object", "--no-filters", "--", path], "");
    hashes.set(path, output.trim());
  }
  return hashes;
}

/** Hash raw content without applying repository clean filters. */
export function gitHashObjectText(root: string, content: string | Buffer): string {
  return runGitInput(root, ["hash-object", "--no-filters", "--stdin"], content).trim();
}

/** Read Git's built-in text attribute without evaluating a content filter. */
export function gitTextAttributes(root: string, paths: readonly string[]): Map<string, string> {
  const attributes = new Map<string, string>();
  if (paths.length === 0) {
    return attributes;
  }
  const input = Buffer.from(`${paths.join("\0")}\0`, "utf8");
  const output = runGitInput(root, ["check-attr", "-z", "--stdin", "text"], input);
  const tokens = output.split("\0");
  for (let index = 0; index + 2 < tokens.length; index += 3) {
    const path = normalizeRepoPath(tokens[index]);
    const attribute = tokens[index + 1];
    const value = tokens[index + 2];
    if (attribute === "text") {
      attributes.set(path, value);
    }
  }
  return attributes;
}

/** Run a content-only Git diff outside the repository attribute scope. */
export function gitDiffNoIndex(cwd: string, left: string, right: string): string {
  const safeArgs = ["-c", "core.fsmonitor=false", "diff", "--no-index", "--unified=0", "--no-ext-diff", "--no-textconv", "--", left, right];
  try {
    return execFileSync("git", safeArgs, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    const stdout = (error as { stdout?: unknown }).stdout;
    if (status === 1) {
      return Buffer.isBuffer(stdout) ? stdout.toString("utf8") : typeof stdout === "string" ? stdout : "";
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ImpactError("GIT_ERROR", `Git content diff failed: git ${safeArgs.join(" ")}`, { cause: message });
  }
}

export function fileHash(content: string): string {
  return sha256(content);
}
