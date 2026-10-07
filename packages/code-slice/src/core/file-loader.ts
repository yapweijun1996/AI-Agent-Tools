import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync, type BigIntStats } from "node:fs";
import path from "node:path";
import { CodeSliceError } from "../schema/errors.js";
import { DEFAULT_MAX_BYTES, normalizeMaxBytes } from "./limits.js";

export { DEFAULT_MAX_BYTES } from "./limits.js";

export interface LoadFileOptions {
  /** Constrains readable paths (docs/CLI_CONTRACT.md `--root`). Resolved+realpath'd to block symlink escapes. */
  root?: string;
  maxBytes?: number;
}

export interface LoadedFile {
  /** The path as given, preserved verbatim (docs/CLI_CONTRACT.md "File paths"). */
  requestedPath: string;
  resolvedPath: string;
  source: string;
}

/**
 * The file-loading boundary (docs/ARCHITECTURE.md "File loading boundary").
 * Read-only. Never follows a symlink outside an allowed root (AGENTS.md
 * Security). Fails closed on any ambiguity rather than guessing.
 */
function escapesRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function sameFileState(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

export function loadFile(requestedPath: string, options: LoadFileOptions = {}): LoadedFile {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new CodeSliceError("INVALID_ARGUMENT", "file must be a non-empty string");
  }
  if (options.root !== undefined && (typeof options.root !== "string" || options.root.length === 0)) {
    throw new CodeSliceError("INVALID_ARGUMENT", "root must be a non-empty string");
  }
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  const cwd = process.cwd();
  const absolutePath = path.isAbsolute(requestedPath) ? requestedPath : path.resolve(cwd, requestedPath);

  // Lexical containment check first, before touching the filesystem at all:
  // a path outside --root must fail the same way (FILE_OUTSIDE_ROOT)
  // whether or not it happens to exist, so existence can't be probed across
  // the root boundary by an OUTSIDE_ROOT vs NOT_FOUND response difference.
  const lexicalRoot =
    options.root !== undefined
      ? path.isAbsolute(options.root)
        ? options.root
        : path.resolve(cwd, options.root)
      : undefined;
  if (lexicalRoot !== undefined && escapesRoot(lexicalRoot, absolutePath)) {
    throw new CodeSliceError("FILE_OUTSIDE_ROOT", `File "${requestedPath}" resolves outside root "${options.root}"`);
  }

  if (!existsSync(absolutePath)) {
    throw new CodeSliceError("FILE_NOT_FOUND", `File not found: ${requestedPath}`);
  }

  let realPath: string;
  try {
    realPath = realpathSync(absolutePath);
  } catch (err) {
    throw new CodeSliceError("FILE_NOT_FOUND", `Could not resolve file: ${requestedPath} (${(err as Error).message})`);
  }

  // Re-check after realpath: a symlink that lexically sat inside root can
  // still resolve to a target outside it.
  if (lexicalRoot !== undefined) {
    let realRoot: string;
    try {
      realRoot = realpathSync(lexicalRoot);
    } catch (err) {
      throw new CodeSliceError(
        "FILE_NOT_FOUND",
        `Could not resolve root "${options.root}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (escapesRoot(realRoot, realPath)) {
      throw new CodeSliceError("FILE_OUTSIDE_ROOT", `File "${requestedPath}" resolves outside root "${options.root}"`);
    }
  }

  const stat = statSync(realPath, { bigint: true });
  if (!stat.isFile()) {
    throw new CodeSliceError("FILE_NOT_FOUND", `Not a regular file: ${requestedPath}`);
  }
  if (stat.size > BigInt(maxBytes)) {
    throw new CodeSliceError(
      "FILE_TOO_LARGE",
      `File "${requestedPath}" is ${stat.size} bytes, exceeding the ${maxBytes}-byte limit`,
    );
  }

  let descriptor: number | undefined;
  let buffer: Buffer;
  try {
    // Bind the read to the admitted file, including when an ancestor changes.
    descriptor = openSync(realPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(realPath, { bigint: true });
    if (!opened.isFile() || !current.isFile() || !sameFileState(stat, opened) ||
        !sameFileState(opened, current) || realpathSync(realPath) !== realPath) {
      throw new CodeSliceError("FILE_NOT_FOUND", "The selected file changed before it could be read safely");
    }
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
      if (length > maxBytes) throw new CodeSliceError("FILE_TOO_LARGE", "The selected file exceeded its byte limit while being read");
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.size > BigInt(maxBytes)) throw new CodeSliceError("FILE_TOO_LARGE", "The selected file exceeded its byte limit while being read");
    if (!sameFileState(opened, after) || after.size !== BigInt(length) ||
        !sameFileState(after, lstatSync(realPath, { bigint: true })) || realpathSync(realPath) !== realPath) {
      throw new CodeSliceError("FILE_NOT_FOUND", "The selected file changed while it was being read");
    }
    buffer = bytes.subarray(0, length);
  } catch (error) {
    if (error instanceof CodeSliceError) throw error;
    throw new CodeSliceError("FILE_NOT_FOUND", "The selected file could not be read safely");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let source: string;
  try {
    // Keep a leading UTF-8 BOM in the decoded source. Public byte ranges are
    // measured against the original file, so dropping these three bytes here
    // would shift every later range and break byte-for-byte extraction.
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new CodeSliceError("ENCODING_UNSUPPORTED", `File "${requestedPath}" is not valid UTF-8`);
  }

  return { requestedPath, resolvedPath: realPath, source };
}
