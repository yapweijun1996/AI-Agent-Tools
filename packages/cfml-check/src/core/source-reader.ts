import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { ToolFailure } from "../schema/errors.js";
import type { CheckLimits, LoadedSource } from "../schema/types.js";

function escapesRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.startsWith("..") || path.isAbsolute(relative);
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
  const before = statSync(resolvedPath);
  if (!before.isFile()) throw new ToolFailure("FILE_NOT_FOUND", "The selected path is not a regular file", 2);
  if (before.size > options.limits.max_source_bytes) {
    throw new ToolFailure("LIMIT_EXCEEDED", `Source exceeds the ${options.limits.max_source_bytes}-byte limit`, 3);
  }

  const bytes = readFileSync(resolvedPath);
  const after = statSync(resolvedPath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new ToolFailure("SOURCE_CHANGED", "The source changed while it was being read", 3);
  }
  if (bytes.byteLength > options.limits.max_source_bytes) {
    throw new ToolFailure("LIMIT_EXCEEDED", `Source exceeds the ${options.limits.max_source_bytes}-byte limit`, 3);
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
