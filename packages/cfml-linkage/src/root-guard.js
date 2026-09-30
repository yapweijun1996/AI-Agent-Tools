import fs from "node:fs";
import path from "node:path";

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * Error raised when a path cannot be admitted to the analysis root.
 */
export class RootGuardError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RootGuardError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function isAbsoluteReference(value) {
  return path.isAbsolute(value) || value.startsWith("/") || value.startsWith("\\") || WINDOWS_ABSOLUTE_PATH.test(value);
}

function hasParentSegment(value) {
  return value.split(/[\\/]+/u).some((segment) => segment === "..");
}

function isWithinRoot(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function pathExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false;
    }
    throw new RootGuardError("REFERENCE_ACCESS_ERROR", `Unable to inspect referenced path: ${targetPath}`, {
      path: targetPath,
      cause: error?.code ?? "unknown",
    });
  }
}

function assertNoSymlinkSegments(targetPath, code = "SYMLINK_NOT_ALLOWED") {
  const parsed = path.parse(targetPath);
  let current = parsed.root;
  const remainder = targetPath.slice(parsed.root.length);
  const segments = remainder.split(/[\\/]+/u).filter(Boolean);

  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        return;
      }
      throw new RootGuardError("ROOT_ACCESS_ERROR", `Unable to inspect path segment: ${current}`, {
        path: current,
        cause: error?.code ?? "unknown",
      });
    }

    if (stat.isSymbolicLink()) {
      throw new RootGuardError(code, `Symbolic links are not allowed in analysis paths: ${current}`, {
        path: current,
      });
    }
  }
}

function canonicalizeRoot(rootPath) {
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    throw new RootGuardError("INVALID_ROOT", "The analysis root must be a non-empty path.");
  }
  if (rootPath.includes("\0")) {
    throw new RootGuardError("INVALID_ROOT", "The analysis root must not contain a null byte.");
  }

  const lexicalRoot = path.resolve(rootPath);
  assertNoSymlinkSegments(lexicalRoot);

  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync.native(lexicalRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new RootGuardError("ROOT_NOT_FOUND", `Analysis root does not exist: ${rootPath}`, {
        path: lexicalRoot,
      });
    }
    throw new RootGuardError("ROOT_ACCESS_ERROR", `Unable to resolve analysis root: ${rootPath}`, {
      path: lexicalRoot,
      cause: error?.code ?? "unknown",
    });
  }

  let stat;
  try {
    stat = fs.statSync(canonicalRoot);
  } catch (error) {
    throw new RootGuardError("ROOT_ACCESS_ERROR", `Unable to inspect analysis root: ${rootPath}`, {
      path: canonicalRoot,
      cause: error?.code ?? "unknown",
    });
  }
  if (!stat.isDirectory()) {
    throw new RootGuardError("ROOT_NOT_DIRECTORY", `Analysis root is not a directory: ${rootPath}`, {
      path: canonicalRoot,
    });
  }

  return canonicalRoot;
}

function resolveCandidate(rootPath, candidatePath, { mustExist = false } = {}) {
  if (typeof candidatePath !== "string" || candidatePath.trim() === "") {
    throw new RootGuardError("INVALID_REFERENCE", "A referenced path must be a non-empty string.");
  }
  if (candidatePath.includes("\0")) {
    throw new RootGuardError("INVALID_REFERENCE", "A referenced path must not contain a null byte.");
  }
  if (isAbsoluteReference(candidatePath)) {
    throw new RootGuardError("ABSOLUTE_REFERENCE", `Absolute references are not allowed: ${candidatePath}`, {
      candidatePath,
    });
  }
  if (hasParentSegment(candidatePath)) {
    throw new RootGuardError("PATH_TRAVERSAL", `Parent path segments are not allowed: ${candidatePath}`, {
      candidatePath,
    });
  }

  const lexicalTarget = path.resolve(rootPath, candidatePath);
  if (!isWithinRoot(rootPath, lexicalTarget)) {
    throw new RootGuardError("OUTSIDE_ROOT", `Reference resolves outside the analysis root: ${candidatePath}`, {
      candidatePath,
      path: lexicalTarget,
    });
  }

  assertNoSymlinkSegments(lexicalTarget);
  const targetExists = pathExists(lexicalTarget);
  if (mustExist && !targetExists) {
    throw new RootGuardError("REFERENCE_NOT_FOUND", `Referenced path does not exist: ${candidatePath}`, {
      candidatePath,
      path: lexicalTarget,
    });
  }

  if (targetExists) {
    let canonicalTarget;
    try {
      canonicalTarget = fs.realpathSync.native(lexicalTarget);
    } catch (error) {
      throw new RootGuardError("REFERENCE_ACCESS_ERROR", `Unable to resolve referenced path: ${candidatePath}`, {
        candidatePath,
        cause: error?.code ?? "unknown",
      });
    }
    if (!isWithinRoot(rootPath, canonicalTarget)) {
      throw new RootGuardError("OUTSIDE_ROOT", `Reference resolves outside the analysis root: ${candidatePath}`, {
        candidatePath,
        path: canonicalTarget,
      });
    }
    return canonicalTarget;
  }

  let nearestExisting = lexicalTarget;
  while (!pathExists(nearestExisting)) {
    const parent = path.dirname(nearestExisting);
    if (parent === nearestExisting) {
      break;
    }
    nearestExisting = parent;
  }

  try {
    const canonicalParent = fs.realpathSync.native(nearestExisting);
    if (!isWithinRoot(rootPath, canonicalParent)) {
      throw new RootGuardError("OUTSIDE_ROOT", `Reference parent resolves outside the analysis root: ${candidatePath}`, {
        candidatePath,
        path: canonicalParent,
      });
    }
  } catch (error) {
    if (error instanceof RootGuardError) {
      throw error;
    }
    throw new RootGuardError("REFERENCE_ACCESS_ERROR", `Unable to inspect referenced path: ${candidatePath}`, {
      candidatePath,
      cause: error?.code ?? "unknown",
    });
  }

  return lexicalTarget;
}

/**
 * Create a read-only path guard for one canonical analysis root.
 *
 * @param {string} rootPath explicit local analysis root
 * @returns {{rootPath: string, resolve: (candidatePath: string, options?: {mustExist?: boolean}) => string}}
 */
export function createRootGuard(rootPath) {
  const canonicalRoot = canonicalizeRoot(rootPath);

  return Object.freeze({
    rootPath: canonicalRoot,
    resolve(candidatePath, options = {}) {
      return resolveCandidate(canonicalRoot, candidatePath, options);
    },
  });
}
