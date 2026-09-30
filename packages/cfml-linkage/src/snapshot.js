import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_EXTENSIONS = Object.freeze([".cfm", ".cfml", ".cfc", ".html", ".htm", ".js", ".mjs", ".css", ".sql"]);
const DEFAULT_IGNORED_DIRECTORY_NAMES = Object.freeze([".git", "node_modules", "vendor", "generated", "cache", "secrets", ".agent-cfml-linkage-cache"]);
const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 10_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
});
const REGEX_SPECIAL_CHARACTERS = new Set(["\\", "^", "$", "+", "?", ".", "(", ")", "|", "{", "}", "[", "]"]);

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function toPosixRelative(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).split(path.sep).join("/");
}

function normalizeExtensions(extensions) {
  const values = extensions ?? DEFAULT_EXTENSIONS;
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("extensions must be a non-empty array");
  }
  return new Set(values.map((value) => {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError("each extension must be a non-empty string");
    }
    const normalized = value.startsWith(".") ? value : `.${value}`;
    return normalized.toLowerCase();
  }));
}

function normalizePositiveLimit(value, fallback, name) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return result;
}

function hashSnapshotFiles(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file.path, "utf8");
    hash.update("\0", "utf8");
    hash.update(file.content_sha256, "utf8");
    hash.update("\n", "utf8");
  }
  return `sha256:${hash.digest("hex")}`;
}

function addDiagnostic(diagnostics, code, filePath, message) {
  diagnostics.push({ code, path: filePath, message });
}

function isIgnoredDirectory(name, ignoredDirectoryNames) {
  return ignoredDirectoryNames.has(name);
}

function globRegExp(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    source += REGEX_SPECIAL_CHARACTERS.has(character) ? `\\${character}` : character;
  }
  return new RegExp(`${source}$`, "u");
}

function normalizeIgnoreGlobs(globs) {
  if (globs === undefined || globs === null) return [];
  if (!Array.isArray(globs) || globs.length > 256) throw new TypeError("ignoreGlobs must be an array with at most 256 entries");
  return [...new Set(globs.map((value) => {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError("each ignore glob must be a non-empty string");
    if (value.includes("\0")) throw new TypeError("ignore globs must not contain null bytes");
    let normalized = value.trim().replaceAll("\\", "/");
    while (normalized.startsWith("./")) normalized = normalized.slice(2);
    if (normalized === "" || normalized.startsWith("/") || normalized.split("/").includes("..") || (normalized.length >= 3 && /^[A-Za-z]:/u.test(normalized) && normalized[2] === "/")) throw new TypeError("ignore globs must be root-relative paths");
    return normalized;
  }))].map(globRegExp);
}

function normalizeFilePolicy(value, name, fallback = "include") {
  const policy = value ?? fallback;
  if (policy !== "include" && policy !== "ignore") throw new TypeError(`${name} must be include or ignore`);
  return policy;
}

/**
 * Build a deterministic byte snapshot without decoding or executing source.
 * Configured ignoreGlobs and hidden-file policy are applied before source admission.
 *
 * @param {{rootPath: string, resolve: Function}} rootGuard canonical root guard
 * @param {object} options discovery policy and hard limits
 * @returns {{version: string, root_path: string, files: object[], source_fingerprint: string, file_count: number, complete: boolean, diagnostics: object[]}}
 */
export function createSnapshot(rootGuard, options = {}) {
  if (!rootGuard || typeof rootGuard.rootPath !== "string" || typeof rootGuard.resolve !== "function") {
    throw new TypeError("rootGuard must be created by createRootGuard");
  }

  const extensions = normalizeExtensions(options.extensions);
  const ignoredDirectoryNames = new Set(options.ignoreDirectoryNames ?? DEFAULT_IGNORED_DIRECTORY_NAMES);
  const ignoreGlobs = normalizeIgnoreGlobs(options.ignoreGlobs);
  const hiddenFilePolicy = normalizeFilePolicy(options.hiddenFilePolicy, "hiddenFilePolicy");
  const generatedFilePolicy = normalizeFilePolicy(options.generatedFilePolicy, "generatedFilePolicy", "ignore");
  if (generatedFilePolicy === "include" && options.ignoreDirectoryNames === undefined) ignoredDirectoryNames.delete("generated");
  const maxFiles = normalizePositiveLimit(options.maxFiles, DEFAULT_LIMITS.maxFiles, "maxFiles");
  const maxFileBytes = normalizePositiveLimit(options.maxFileBytes, DEFAULT_LIMITS.maxFileBytes, "maxFileBytes");
  const maxTotalBytes = normalizePositiveLimit(options.maxTotalBytes, DEFAULT_LIMITS.maxTotalBytes, "maxTotalBytes");
  const shouldStop = options.shouldStop ?? (() => false);
  if (typeof shouldStop !== "function") throw new TypeError("shouldStop must be a function");
  const files = [];
  const diagnostics = [];
  let totalBytes = 0;
  let complete = true;
  let stoppedByLimit = false;

  function walk(directoryPath, relativeDirectory) {
    if (shouldStop(relativeDirectory || ".")) {
      complete = false;
      stoppedByLimit = true;
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(directoryPath, { withFileTypes: true }).sort((left, right) => compareNames(left.name, right.name));
    } catch (error) {
      complete = false;
      addDiagnostic(diagnostics, "DISCOVERY_ACCESS_ERROR", relativeDirectory || ".", `Unable to read directory: ${error?.code ?? "unknown"}`);
      return;
    }

    for (const entry of entries) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (shouldStop(relativePath)) {
        complete = false;
        stoppedByLimit = true;
        return;
      }

      if (entry.isDirectory()) {
        const ignoredByGlob = ignoreGlobs.some((glob) => glob.test(relativePath) || glob.test(`${relativePath}/`));
        const hidden = entry.name.startsWith(".");
        if (!isIgnoredDirectory(entry.name, ignoredDirectoryNames) && !ignoredByGlob && !(hiddenFilePolicy === "ignore" && hidden)) {
          walk(path.join(directoryPath, entry.name), relativePath);
        }
        if (stoppedByLimit) return;
        continue;
      }

      if (entry.isSymbolicLink()) {
        complete = false;
        addDiagnostic(diagnostics, "SYMLINK_SKIPPED", relativePath, "Symbolic links are not followed during discovery.");
        continue;
      }

      if (!entry.isFile() || stoppedByLimit) {
        continue;
      }

      if (ignoreGlobs.some((glob) => glob.test(relativePath))) continue;
      if (hiddenFilePolicy === "ignore" && entry.name.startsWith(".")) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!extensions.has(extension)) {
        continue;
      }

      if (files.length >= maxFiles) {
        complete = false;
        stoppedByLimit = true;
        addDiagnostic(diagnostics, "RESOURCE_LIMIT", relativePath, `Maximum file count exceeded: ${maxFiles}`);
        return;
      }

      let canonicalPath;
      let before;
      try {
        canonicalPath = rootGuard.resolve(relativePath, { mustExist: true });
        before = fs.statSync(canonicalPath);
      } catch (error) {
        complete = false;
        addDiagnostic(diagnostics, error?.code ?? "PATH_REJECTED", relativePath, error?.message ?? "Path could not be admitted.");
        continue;
      }

      if (!before.isFile()) {
        complete = false;
        addDiagnostic(diagnostics, "NOT_REGULAR_FILE", relativePath, "Discovered path is not a regular file.");
        continue;
      }
      if (before.size > maxFileBytes || totalBytes + before.size > maxTotalBytes) {
        complete = false;
        stoppedByLimit = before.size > maxFileBytes;
        addDiagnostic(
          diagnostics,
          "RESOURCE_LIMIT",
          relativePath,
          before.size > maxFileBytes ? `Maximum file size exceeded: ${maxFileBytes}` : `Maximum total source bytes exceeded: ${maxTotalBytes}`,
        );
        if (stoppedByLimit) return;
        continue;
      }

      let bytes;
      try {
        bytes = fs.readFileSync(canonicalPath);
      } catch (error) {
        complete = false;
        addDiagnostic(diagnostics, "FILE_READ_ERROR", relativePath, `Unable to read file: ${error?.code ?? "unknown"}`);
        continue;
      }

      let after;
      try {
        after = fs.statSync(canonicalPath);
      } catch (error) {
        complete = false;
        addDiagnostic(diagnostics, "SNAPSHOT_DRIFT", relativePath, `Unable to confirm file stability: ${error?.code ?? "unknown"}`);
        continue;
      }

      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || bytes.byteLength !== before.size) {
        complete = false;
        addDiagnostic(diagnostics, "SNAPSHOT_DRIFT", relativePath, "File metadata changed while the snapshot was being read.");
      }

      const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
      files.push({
        path: relativePath,
        real_path: canonicalPath,
        bytes: bytes.byteLength,
        mtime_ms: before.mtimeMs,
        content_sha256: `sha256:${contentHash}`,
      });
      totalBytes += bytes.byteLength;
    }
  }

  walk(rootGuard.rootPath, "");
  files.sort((left, right) => compareNames(left.path, right.path));
  diagnostics.sort((left, right) => compareNames(`${left.path}\0${left.code}`, `${right.path}\0${right.code}`));

  return Object.freeze({
    version: "agent-cfml-linkage-snapshot/v0.1",
    root_path: rootGuard.rootPath,
    files: Object.freeze(files),
    source_fingerprint: hashSnapshotFiles(files),
    file_count: files.length,
    complete,
    diagnostics: Object.freeze(diagnostics),
  });
}
