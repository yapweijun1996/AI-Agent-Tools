import crypto from "node:crypto";
import fs from "node:fs";

const CACHE_SCHEMA_VERSION = "agent-cfml-linkage-cache/v0.1";
const DEFAULT_CACHE_DIRECTORY = ".agent-cfml-linkage-cache";
const MAX_CACHE_BYTES = 50 * 1024 * 1024;
const DEFAULT_VERSIONS = Object.freeze({
  parser: "unselected",
  extractor: "unselected",
  resolver: "unselected",
});

export class CacheError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CacheError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  const json = JSON.stringify(sortObject(value));
  if (json === undefined) {
    throw new TypeError("value must be JSON serializable");
  }
  return json;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function normalizeVersion(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.root_path !== "string" || typeof snapshot.source_fingerprint !== "string" || !Array.isArray(snapshot.files)) {
    throw new TypeError("snapshot must be a snapshot result from createSnapshot");
  }
  return snapshot;
}

function normalizeFileEntries(files) {
  return files.map((file) => {
    if (!file || typeof file.path !== "string" || typeof file.content_sha256 !== "string") {
      throw new TypeError("snapshot files must contain path and content_sha256");
    }
    return {
      path: file.path,
      content_sha256: file.content_sha256,
      bytes: file.bytes,
    };
  }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function expectedContextFields(context) {
  return {
    source_fingerprint: context.source_fingerprint,
    config_fingerprint: context.config_fingerprint,
    parser_fingerprint: context.parser_fingerprint,
    extractor_fingerprint: context.extractor_fingerprint,
    resolver_fingerprint: context.resolver_fingerprint,
  };
}

function validCacheRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const strings = [
    "schema_version",
    "root_path",
    "cache_key",
    "source_fingerprint",
    "config_fingerprint",
    "parser_fingerprint",
    "extractor_fingerprint",
    "resolver_fingerprint",
  ];
  if (record.schema_version !== CACHE_SCHEMA_VERSION || strings.some((key) => typeof record[key] !== "string") || !Array.isArray(record.files)) {
    return false;
  }
  const paths = record.files.map((file) => file?.path);
  const hasSafeUniqueSortedPaths = paths.every((filePath, index) => {
    if (typeof filePath !== "string" || filePath === "" || filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:[\\/]/u.test(filePath)) return false;
    if (filePath.split(/[\\/]+/u).some((segment) => segment === "..")) return false;
    return index === 0 || paths[index - 1] < filePath;
  }) && new Set(paths).size === paths.length;
  return hasSafeUniqueSortedPaths && record.files.every((file) => typeof file?.content_sha256 === "string");
}

/**
 * Fingerprint a JSON-safe configuration with recursively sorted object keys.
 * Array order remains significant because some policy arrays are ordered inputs.
 */
export function fingerprintConfig(config) {
  return sha256(canonicalJson(config));
}

/**
 * Build the versioned cache context used for freshness checks.
 */
export function createCacheContext(snapshot, { config = {}, parserVersion = DEFAULT_VERSIONS.parser, extractorVersion = DEFAULT_VERSIONS.extractor, resolverVersion = DEFAULT_VERSIONS.resolver } = {}) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const fields = {
    source_fingerprint: normalizedSnapshot.source_fingerprint,
    config_fingerprint: fingerprintConfig(config),
    parser_fingerprint: sha256(normalizeVersion(parserVersion, "parserVersion")),
    extractor_fingerprint: sha256(normalizeVersion(extractorVersion, "extractorVersion")),
    resolver_fingerprint: sha256(normalizeVersion(resolverVersion, "resolverVersion")),
  };
  return Object.freeze({
    schema_version: CACHE_SCHEMA_VERSION,
    root_path: normalizedSnapshot.root_path,
    ...fields,
    cache_key: sha256(canonicalJson(fields)),
  });
}

/**
 * Create a metadata-only disposable cache record. Source text and ASTs are not stored.
 */
export function createCacheRecord(snapshot, options = {}) {
  const normalizedSnapshot = normalizeSnapshot(snapshot);
  const context = createCacheContext(normalizedSnapshot, options);
  return Object.freeze({
    schema_version: CACHE_SCHEMA_VERSION,
    root_path: context.root_path,
    cache_key: context.cache_key,
    ...expectedContextFields(context),
    files: Object.freeze(normalizeFileEntries(normalizedSnapshot.files)),
  });
}

/**
 * Return sorted added, changed, and removed paths between two file metadata sets.
 */
export function compareSnapshotFiles(previousFiles, currentFiles) {
  const previous = new Map(normalizeFileEntries(previousFiles).map((file) => [file.path, file.content_sha256]));
  const current = new Map(normalizeFileEntries(currentFiles).map((file) => [file.path, file.content_sha256]));
  const added = [];
  const changed = [];
  const removed = [];

  for (const [filePath, hash] of current) {
    if (!previous.has(filePath)) added.push(filePath);
    else if (previous.get(filePath) !== hash) changed.push(filePath);
  }
  for (const filePath of previous.keys()) {
    if (!current.has(filePath)) removed.push(filePath);
  }
  return {
    added: added.sort(),
    changed: changed.sort(),
    removed: removed.sort(),
  };
}

/**
 * Classify a loaded cache record against the current snapshot/configuration versions.
 */
export function inspectCacheRecord(record, context, currentSnapshot = null) {
  if (record === null || record === undefined) {
    return { status: "miss", reason: "CACHE_MISS", changed_files: { added: [], changed: [], removed: [] } };
  }
  if (!validCacheRecord(record)) {
    return { status: "corrupt", reason: "CACHE_CORRUPT", changed_files: { added: [], changed: [], removed: [] } };
  }
  if (!context || typeof context.root_path !== "string") {
    throw new TypeError("context must be created by createCacheContext");
  }

  const changedFiles = currentSnapshot
    ? compareSnapshotFiles(record.files, currentSnapshot.files)
    : { added: [], changed: [], removed: [] };
  if (record.root_path !== context.root_path) return { status: "stale", reason: "ROOT_CHANGED", changed_files: changedFiles };
  if (record.source_fingerprint !== context.source_fingerprint) return { status: "stale", reason: "SOURCE_CHANGED", changed_files: changedFiles };
  if (record.config_fingerprint !== context.config_fingerprint) return { status: "stale", reason: "CONFIG_CHANGED", changed_files: changedFiles };
  if (record.parser_fingerprint !== context.parser_fingerprint) return { status: "stale", reason: "PARSER_CHANGED", changed_files: changedFiles };
  if (record.extractor_fingerprint !== context.extractor_fingerprint) return { status: "stale", reason: "EXTRACTOR_CHANGED", changed_files: changedFiles };
  if (record.resolver_fingerprint !== context.resolver_fingerprint) return { status: "stale", reason: "RESOLVER_CHANGED", changed_files: changedFiles };
  if (record.cache_key !== context.cache_key) return { status: "stale", reason: "CONTEXT_CHANGED", changed_files: changedFiles };
  return { status: "fresh", reason: null, changed_files: changedFiles };
}

function validateCacheDirectory(rootGuard, directory) {
  if (typeof directory !== "string" || directory.trim() === "" || directory.includes("\0")) {
    throw new TypeError("cacheDirectory must be a non-empty path without null bytes");
  }
  return rootGuard.resolve(directory);
}

/**
 * Create a root-contained, disposable JSON cache store.
 */
export function createDisposableCache(rootGuard, { cacheDirectory = DEFAULT_CACHE_DIRECTORY } = {}) {
  if (!rootGuard || typeof rootGuard.resolve !== "function") {
    throw new TypeError("rootGuard must be created by createRootGuard");
  }
  const cacheDirectoryPath = validateCacheDirectory(rootGuard, cacheDirectory);
  const cacheFileRelativePath = `${cacheDirectory}/state.json`;

  function cacheFilePath() {
    return rootGuard.resolve(cacheFileRelativePath, { mustExist: true });
  }

  function ensureDirectory() {
    try {
      fs.mkdirSync(cacheDirectoryPath, { recursive: true });
      return rootGuard.resolve(cacheDirectory, { mustExist: true });
    } catch (error) {
      if (error instanceof CacheError) throw error;
      throw new CacheError("CACHE_WRITE_ERROR", `Unable to create cache directory: ${error?.code ?? "unknown"}`, { path: cacheDirectory });
    }
  }

  return Object.freeze({
    directory: cacheDirectoryPath,
    get file() {
      return rootGuard.resolve(cacheFileRelativePath);
    },
    load() {
      let filePath;
      try {
        filePath = cacheFilePath();
      } catch (error) {
        if (error?.code === "REFERENCE_NOT_FOUND") return { status: "miss", reason: "CACHE_MISS", record: null };
        throw error;
      }
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (error) {
        throw new CacheError("CACHE_READ_ERROR", `Unable to inspect cache: ${error?.code ?? "unknown"}`, { path: filePath });
      }
      if (!stat.isFile() || stat.size > MAX_CACHE_BYTES) {
        return { status: "corrupt", reason: "CACHE_CORRUPT", record: null };
      }
      let text;
      try {
        text = fs.readFileSync(filePath, "utf8");
      } catch (error) {
        throw new CacheError("CACHE_READ_ERROR", `Unable to read cache: ${error?.code ?? "unknown"}`, { path: filePath });
      }
      try {
        const record = JSON.parse(text);
        return validCacheRecord(record)
          ? { status: "loaded", reason: null, record }
          : { status: "corrupt", reason: "CACHE_CORRUPT", record: null };
      } catch {
        return { status: "corrupt", reason: "CACHE_CORRUPT", record: null };
      }
    },
    write(record) {
      if (!validCacheRecord(record)) {
        throw new CacheError("CACHE_INVALID_RECORD", "Only a valid cache record can be written.");
      }
      ensureDirectory();
      const finalPath = rootGuard.resolve(cacheFileRelativePath);
      const temporaryRelativePath = `${cacheDirectory}/state.${crypto.randomUUID()}.tmp`;
      const temporaryPath = rootGuard.resolve(temporaryRelativePath);
      const content = `${JSON.stringify(record, null, 2)}\n`;
      if (Buffer.byteLength(content, "utf8") > MAX_CACHE_BYTES) {
        throw new CacheError("CACHE_INVALID_RECORD", `Cache record exceeds ${MAX_CACHE_BYTES} bytes.`);
      }
      let descriptor;
      try {
        descriptor = fs.openSync(temporaryPath, "wx", 0o600);
        fs.writeFileSync(descriptor, content, "utf8");
        fs.closeSync(descriptor);
        descriptor = undefined;
        fs.renameSync(temporaryPath, finalPath);
        rootGuard.resolve(cacheFileRelativePath, { mustExist: true });
      } catch (error) {
        if (descriptor !== undefined) {
          try { fs.closeSync(descriptor); } catch { /* best-effort descriptor cleanup */ }
        }
        throw new CacheError("CACHE_WRITE_ERROR", `Unable to write cache: ${error?.code ?? "unknown"}`, { path: finalPath });
      }
      return { status: "written", path: finalPath };
    },
    discard() {
      let filePath;
      try {
        filePath = cacheFilePath();
      } catch (error) {
        if (error?.code === "REFERENCE_NOT_FOUND") return { status: "absent" };
        throw error;
      }
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        throw new CacheError("CACHE_WRITE_ERROR", `Unable to discard cache: ${error?.code ?? "unknown"}`, { path: filePath });
      }
      return { status: "discarded" };
    },
  });
}

export { CACHE_SCHEMA_VERSION };
