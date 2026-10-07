import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statSync, type BigIntStats } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { ToolFailure } from "../schema/errors.js";
import type { CheckLimits, LoadedSource } from "../schema/types.js";

function escapesRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

function sameFileState(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

export function loadSource(options: { root: string; file: string; limits: CheckLimits }): LoadedSource {
  if (!/\.(?:cfm|cfc)$/iu.test(options.file)) {
    throw new ToolFailure("UNSUPPORTED_EXTENSION", "Only .cfm and .cfc files are supported", 2);
  }
  const cwd = process.cwd();
  const rootPath = path.isAbsolute(options.root) ? options.root : path.resolve(cwd, options.root);
  const requestedPath = path.isAbsolute(options.file) ? options.file : path.resolve(cwd, options.file);
  if (escapesRoot(rootPath, requestedPath)) {
    throw new ToolFailure("FILE_OUTSIDE_ROOT", "The selected file resolves outside the explicit root", 4);
  }
  if (!existsSync(rootPath)) throw new ToolFailure("ROOT_NOT_FOUND", "The explicit root does not exist", 4);
  if (!existsSync(requestedPath)) throw new ToolFailure("FILE_NOT_FOUND", "The selected file does not exist", 2);

  let realRoot: string;
  let resolvedPath: string;
  try {
    realRoot = realpathSync(rootPath);
    resolvedPath = realpathSync(requestedPath);
  } catch {
    throw new ToolFailure("PATH_UNRESOLVED", "The root or file could not be resolved", 4);
  }
  if (escapesRoot(realRoot, resolvedPath)) {
    throw new ToolFailure("FILE_OUTSIDE_ROOT", "The selected file resolves outside the explicit root", 4);
  }
  const before = statSync(resolvedPath, { bigint: true });
  if (!before.isFile()) throw new ToolFailure("FILE_NOT_FOUND", "The selected path is not a regular file", 2);
  if (before.size > BigInt(options.limits.max_source_bytes)) {
    throw new ToolFailure("LIMIT_EXCEEDED", `Source exceeds the ${options.limits.max_source_bytes}-byte limit`, 3);
  }

  let descriptor: number | undefined;
  let bytes: Buffer;
  const changed = () => new ToolFailure("SOURCE_CHANGED", "The admitted source changed before or during reading", 3);
  const exceeded = () => new ToolFailure("LIMIT_EXCEEDED", "Source exceeds the configured byte limit", 3);
  try {
    // Admission must describe the descriptor we read, including ancestor replacements.
    descriptor = openSync(resolvedPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile()) throw changed();
    if (opened.size > BigInt(options.limits.max_source_bytes)) throw exceeded();
    const current = lstatSync(resolvedPath, { bigint: true });
    if (!current.isFile() || !sameFileState(before, opened) || !sameFileState(opened, current) ||
        realpathSync(resolvedPath) !== resolvedPath) throw changed();
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
      if (length > options.limits.max_source_bytes) throw exceeded();
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (after.size > BigInt(options.limits.max_source_bytes)) throw exceeded();
    if (!sameFileState(opened, after) || after.size !== BigInt(length) ||
        !sameFileState(after, lstatSync(resolvedPath, { bigint: true })) ||
        realpathSync(resolvedPath) !== resolvedPath) throw changed();
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof ToolFailure) throw error;
    throw changed();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (bytes.includes(0)) throw new ToolFailure("BINARY_INPUT", "Binary or NUL-containing input is not supported", 2);

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ToolFailure("ENCODING_UNSUPPORTED", "Source must be valid UTF-8", 2);
  }
  const relativePath = path.relative(realRoot, resolvedPath).split(path.sep).join("/");
  return {
    requested_path: options.file,
    resolved_path: resolvedPath,
    relative_path: relativePath,
    source,
    bytes,
    bom: source.startsWith("\uFEFF"),
  };
}
