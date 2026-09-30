import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync,
  type Dirent,
  type Stats,
} from "node:fs";
import path from "node:path";
import { BUDGETS, FORBIDDEN_DIRECTORY_NAMES } from "../constants.js";
import { DiagnosticCollector } from "./diagnostics.js";
import { compareCodePoint, EvidenceStore } from "./evidence.js";

export type ProbeKind = "missing" | "file" | "directory" | "symlink" | "outside" | "other";

export interface ProbeResult {
  kind: ProbeKind;
  relativePath: string;
  stat?: Stats;
}

export interface DirectoryListing {
  entries: Dirent[];
  complete: boolean;
  exists: boolean;
}

export interface MetadataText {
  text: string;
  path: string;
}

export interface ScannerUsage {
  directoryEntries: number;
  metadataFiles: number;
  metadataBytes: number;
}

export interface ScannerObserverEvent {
  operation: "read-body" | "lstat" | "directory";
  path: string;
}

export class RootScannerError extends Error {
  public readonly code = "ROOT_UNREADABLE";

  public constructor() {
    super("The selected inspection root is not readable.");
    this.name = "RootScannerError";
  }
}

export class Scanner {
  public readonly root: string;
  private readonly diagnostics: DiagnosticCollector;
  private readonly evidence: EvidenceStore;
  private readonly observer: ((event: ScannerObserverEvent) => void) | undefined;
  private readonly directoryCache = new Map<string, DirectoryListing>();
  private readonly usageState: ScannerUsage = { directoryEntries: 0, metadataFiles: 0, metadataBytes: 0 };
  private readonly truncatedState = {
    directoryEntries: false,
    metadataFiles: false,
    metadataBytes: false,
    depth: false,
  };

  private constructor(
    root: string,
    diagnostics: DiagnosticCollector,
    evidence: EvidenceStore,
    observer?: (event: ScannerObserverEvent) => void,
  ) {
    this.root = root;
    this.diagnostics = diagnostics;
    this.evidence = evidence;
    this.observer = observer;
  }

  public static open(
    requestedRoot: string,
    diagnostics: DiagnosticCollector,
    evidence: EvidenceStore,
    observer?: (event: ScannerObserverEvent) => void,
  ): Scanner {
    if (typeof requestedRoot !== "string" || requestedRoot.trim().length === 0) {
      throw new RootScannerError();
    }
    try {
      const absolute = path.resolve(process.cwd(), requestedRoot);
      const selected = lstatSync(absolute);
      if (!selected.isDirectory()) throw new RootScannerError();
      const resolved = realpathSync(absolute);
      const resolvedStat = lstatSync(resolved);
      if (!resolvedStat.isDirectory()) throw new RootScannerError();
      if (FORBIDDEN_DIRECTORY_NAMES.has(path.basename(resolved).toLowerCase())) throw new RootScannerError();
      return new Scanner(resolved, diagnostics, evidence, observer);
    } catch (error) {
      if (error instanceof RootScannerError) throw error;
      throw new RootScannerError();
    }
  }

  public usage(): ScannerUsage {
    return { ...this.usageState };
  }

  public truncated(): typeof this.truncatedState {
    return { ...this.truncatedState };
  }

  public normalizeRelative(relativePath: string): string | null {
    if (typeof relativePath !== "string" || relativePath.length === 0) return null;
    if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || /^[A-Za-z]:/u.test(relativePath)) return null;
    const normalized = relativePath.replaceAll("\\", "/");
    const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
    if (segments.some((segment) => segment === "..")) return null;
    return segments.length === 0 ? "." : segments.join("/");
  }

  public absolute(relativePath: string): string | null {
    const normalized = this.normalizeRelative(relativePath);
    if (normalized === null) return null;
    const candidate = path.resolve(this.root, normalized.split("/").join(path.sep));
    return this.isWithinRoot(candidate) ? candidate : null;
  }

  public relativeFromAbsolute(absolutePath: string): string | null {
    if (!this.isWithinRoot(absolutePath)) return null;
    const relative = path.relative(this.root, absolutePath);
    return relative.length === 0 ? "." : relative.split(path.sep).join("/");
  }

  public isForbiddenDirectory(relativePath: string): boolean {
    const normalized = this.normalizeRelative(relativePath);
    if (normalized === null || normalized === ".") return false;
    return normalized.split("/").some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment.toLowerCase()));
  }

  public probe(relativePath: string, report = true): ProbeResult {
    const normalized = this.normalizeRelative(relativePath);
    if (normalized === null) {
      if (report) this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata path resolved outside the selected root.");
      return { kind: "outside", relativePath: "." };
    }
    const absolute = this.absolute(normalized);
    if (absolute === null) {
      if (report) this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata path resolved outside the selected root.");
      return { kind: "outside", relativePath: normalized };
    }
    this.observe({ operation: "lstat", path: normalized });
    let stat: Stats;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (!isMissingError(error)) {
        if (report) this.diagnostics.add("METADATA_UNREADABLE", "warning", "A metadata path could not be inspected.", normalized);
        return { kind: "other", relativePath: normalized };
      }
      return { kind: "missing", relativePath: normalized };
    }
    if (stat.isSymbolicLink()) {
      if (report) this.diagnostics.add("SYMLINK_SKIPPED", "warning", "A symbolic link or reparse point was not followed.", normalized);
      return { kind: "symlink", relativePath: normalized, stat };
    }
    try {
      const real = realpathSync(absolute);
      if (!this.pathsEquivalent(real, absolute)) {
        if (report) this.diagnostics.add("SYMLINK_SKIPPED", "warning", "A symbolic link or reparse point was not followed.", normalized);
        return { kind: "symlink", relativePath: normalized, stat };
      }
      if (!this.isWithinRoot(real)) {
        if (report) this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata path resolved outside the selected root.", normalized);
        return { kind: "outside", relativePath: normalized, stat };
      }
    } catch {
      if (report) this.diagnostics.add("METADATA_UNREADABLE", "warning", "A metadata path could not be resolved.", normalized);
      return { kind: "other", relativePath: normalized, stat };
    }
    if (stat.isFile()) return { kind: "file", relativePath: normalized, stat };
    if (stat.isDirectory()) return { kind: "directory", relativePath: normalized, stat };
    return { kind: "other", relativePath: normalized, stat };
  }

  public readMetadata(relativePath: string): MetadataText | null {
    const normalized = this.normalizeRelative(relativePath);
    if (normalized === null) {
      this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata path resolved outside the selected root.");
      return null;
    }
    const probe = this.probe(normalized);
    if (probe.kind !== "file" || probe.stat === undefined) return null;
    if (this.usageState.metadataFiles >= BUDGETS.metadataFiles) {
      this.truncatedState.metadataFiles = true;
      this.diagnostics.add("SCAN_LIMIT_REACHED", "warning", "The metadata file budget was reached.", normalized);
      return null;
    }
    const totalRemaining = BUDGETS.metadataTotalBytes - this.usageState.metadataBytes;
    if (probe.stat.size > BUDGETS.metadataFileBytes || probe.stat.size > totalRemaining) {
      if (probe.stat.size > totalRemaining) this.truncatedState.metadataBytes = true;
      this.diagnostics.add("METADATA_TOO_LARGE", "warning", "A metadata file exceeded the bounded read budget.", normalized);
      return null;
    }
    const absolute = this.absolute(normalized);
    if (absolute === null) {
      this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata path resolved outside the selected root.", normalized);
      return null;
    }
    const before = probe.stat;
    const noFollow = (constants as typeof constants & { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
    let descriptor: number | undefined;
    let buffer: Buffer | undefined;
    try {
      descriptor = openSync(absolute, constants.O_RDONLY | noFollow);
      const opened = fstatSync(descriptor);
      const maxReadable = Math.min(BUDGETS.metadataFileBytes, totalRemaining);
      if (!opened.isFile() || opened.size > maxReadable) {
        if (opened.size > maxReadable) this.truncatedState.metadataBytes = opened.size > totalRemaining;
        this.diagnostics.add("METADATA_TOO_LARGE", "warning", "A metadata file exceeded the bounded read budget.", normalized);
        return null;
      }
      buffer = this.readBounded(descriptor, maxReadable);
      const after = fstatSync(descriptor);
      if (!sameFileState(before, after)) {
        this.diagnostics.add("REPOSITORY_CHANGED", "warning", "The inspected repository changed while metadata was being read.", normalized);
      }
    } catch {
      this.diagnostics.add("METADATA_UNREADABLE", "warning", "A metadata file could not be read.", normalized);
      return null;
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor);
        } catch {
          // The read boundary is already closed or rejected; no raw error escapes.
        }
      }
    }
    if (buffer === undefined) return null;
    this.usageState.metadataFiles += 1;
    this.usageState.metadataBytes += buffer.byteLength;
    this.observe({ operation: "read-body", path: normalized });
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
    } catch {
      this.diagnostics.add("METADATA_UNREADABLE", "warning", "A metadata file was not valid UTF-8.", normalized);
      return null;
    }
    return { text, path: normalized };
  }

  public listDirectory(relativePath: string): DirectoryListing {
    const normalized = this.normalizeRelative(relativePath);
    if (normalized === null) {
      this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata directory resolved outside the selected root.");
      return { entries: [], complete: false, exists: false };
    }
    const cached = this.directoryCache.get(normalized);
    if (cached) return { entries: [...cached.entries], complete: cached.complete, exists: cached.exists };
    const probe = this.probe(normalized);
    if (probe.kind === "missing") {
      const listing = { entries: [], complete: true, exists: false };
      this.directoryCache.set(normalized, listing);
      return { ...listing, entries: [] };
    }
    if (probe.kind !== "directory") {
      const listing = { entries: [], complete: false, exists: true };
      this.directoryCache.set(normalized, listing);
      return { ...listing, entries: [] };
    }
    const remaining = BUDGETS.directoryEntries - this.usageState.directoryEntries;
    if (remaining <= 0) {
      this.truncatedState.directoryEntries = true;
      this.diagnostics.add("SCAN_LIMIT_REACHED", "warning", "The directory entry budget was reached.", normalized);
      const listing = { entries: [], complete: false, exists: true };
      this.directoryCache.set(normalized, listing);
      return { ...listing, entries: [] };
    }
    const absolute = this.absolute(normalized);
    if (absolute === null) {
      this.diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A metadata directory resolved outside the selected root.", normalized);
      return { entries: [], complete: false, exists: true };
    }
    const entries: Dirent[] = [];
    let complete = false;
    try {
      const directory = opendirSync(absolute);
      try {
        while (entries.length < remaining) {
          const entry = directory.readSync();
          if (entry === null) {
            complete = true;
            break;
          }
          entries.push(entry);
        }
      } finally {
        directory.closeSync();
      }
    } catch {
      this.diagnostics.add("METADATA_UNREADABLE", "warning", "A metadata directory could not be inspected.", normalized);
      const listing = { entries: [], complete: false, exists: true };
      this.directoryCache.set(normalized, listing);
      return { ...listing, entries: [] };
    }
    this.usageState.directoryEntries += entries.length;
    this.observe({ operation: "directory", path: normalized });
    if (!complete) {
      this.truncatedState.directoryEntries = true;
      this.diagnostics.add("SCAN_LIMIT_REACHED", "warning", "A directory exceeded the bounded entry budget.", normalized);
      const listing = { entries: [], complete: false, exists: true };
      this.directoryCache.set(normalized, listing);
      return { ...listing, entries: [] };
    }
    entries.sort((left, right) => compareCodePoint(left.name, right.name));
    const listing = { entries, complete: true, exists: true };
    this.directoryCache.set(normalized, listing);
    return { ...listing, entries: [...entries] };
  }

  public markDepthLimit(relativePath: string): void {
    this.truncatedState.depth = true;
    this.diagnostics.add("SCAN_LIMIT_REACHED", "warning", "A workspace path exceeded the directory depth budget.", relativePath);
  }

  public fileEvidence(relativePath: string): string {
    return this.evidence.file(relativePath);
  }

  public manifestEvidence(relativePath: string, pointer: string): string {
    return this.evidence.manifest(relativePath, pointer);
  }

  private readBounded(descriptor: number, limit: number): Buffer {
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= limit) {
      const size = Math.min(64 * 1024, limit + 1 - total);
      if (size <= 0) break;
      const chunk = Buffer.allocUnsafe(size);
      const count = readSync(descriptor, chunk, 0, size, null);
      if (count === 0) break;
      chunks.push(chunk.subarray(0, count));
      total += count;
      if (total > limit) break;
    }
    if (total > limit) throw new Error("bounded read exceeded");
    return Buffer.concat(chunks, total);
  }

  private isWithinRoot(candidate: string): boolean {
    const relative = path.relative(this.root, candidate);
    return relative.length === 0 || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }

  private pathsEquivalent(left: string, right: string): boolean {
    const normalize = (value: string) => {
      const resolved = path.resolve(value).replace(/[\\/]$/u, "");
      return process.platform === "win32" ? resolved.toLowerCase() : resolved;
    };
    return normalize(left) === normalize(right);
  }

  private observe(event: ScannerObserverEvent): void {
    try {
      this.observer?.(event);
    } catch {
      // Observability must never change profiler behavior.
    }
  }
}

function sameFileState(before: Stats, after: Stats): boolean {
  return before.size === after.size && before.mtimeMs === after.mtimeMs && before.mode === after.mode;
}

function isMissingError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}
