import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

export class InputError extends Error {
  constructor(code, status = "error") {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const changed = () => { throw new InputError("INPUT_CHANGED", "incomplete"); };
const unsafe = () => { throw new InputError("UNSAFE_PATH"); };
const resource = () => { throw new InputError("RESOURCE_LIMIT", "incomplete"); };
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DEVICE = /^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?: *\.|$)/iu;
const samePath = (left, right) => process.platform === "win32"
  ? left.toLowerCase() === right.toLowerCase() : left === right;
const identity = (left, right) => left.dev === right.dev && left.ino === right.ino;
const unchanged = (left, right) => identity(left, right) && left.size === right.size &&
  left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.mode === right.mode;

function relativeTarget(value, kind) {
  if (!value || Buffer.byteLength(value, "utf8") > 4096 || CONTROL.test(value) ||
      value.startsWith("/") || /[\\:*?<>"|]/u.test(value)) unsafe();
  const path = value.startsWith("./") ? value.slice(2) : value;
  if (path === ".") {
    if (kind !== "directory") throw new InputError("INVALID_INPUT");
    return path;
  }
  const parts = path.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." ||
      /[. ]$/u.test(part) || DEVICE.test(part))) unsafe();
  return path;
}

// Path snapshots detect observed substitutions; they do not establish an atomic
// filesystem snapshot or confine reads against arbitrary hostile directory races.
export function captureRules(root, requestedTarget, kind, includeContent, limits) {
  const start = performance.now();
  const checkTime = () => { if (performance.now() - start > limits.max_duration_ms) resource(); };
  const io = (operation, mutation = false) => {
    checkTime();
    try {
      const value = operation();
      checkTime();
      return value;
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (mutation && ["ENOENT", "ENOTDIR"].includes(error?.code)) changed();
      if (["EACCES", "EPERM", "ELOOP"].includes(error?.code)) unsafe();
      throw new InputError("INPUT_IO");
    }
  };
  const optionalStat = (path, mutation = false) => {
    checkTime();
    try {
      const stat = lstatSync(path, { bigint: true });
      checkTime();
      return stat;
    } catch (error) {
      if (error instanceof InputError) throw error;
      if (error?.code === "ENOENT") { checkTime(); return null; }
      if (mutation && error?.code === "ENOTDIR") changed();
      if (["EACCES", "EPERM", "ELOOP"].includes(error?.code)) unsafe();
      throw new InputError("INPUT_IO");
    }
  };
  if (!root || Buffer.byteLength(root, "utf8") > 4096 || CONTROL.test(root)) unsafe();
  const target = relativeTarget(requestedTarget, kind);
  const parts = target === "." ? [] : target.split("/");
  const directoryParts = kind === "file" ? parts.slice(0, -1) : parts;
  if (directoryParts.length > limits.max_depth) resource();
  const base = io(() => realpathSync(resolve(root)));
  const rootStat = io(() => lstatSync(base, { bigint: true }));
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) unsafe();
  const directories = [{ absolute: base, relative: ".", stat: rootStat }];
  let current = base;
  for (let index = 0; index < directoryParts.length; index++) {
    current = join(current, directoryParts[index]);
    const stat = io(() => lstatSync(current, { bigint: true }));
    if (stat.isSymbolicLink() || !stat.isDirectory()) unsafe();
    if (!samePath(io(() => realpathSync(current)), current)) unsafe();
    directories.push({ absolute: current, relative: directoryParts.slice(0, index + 1).join("/"), stat });
  }
  const targetAbsolute = kind === "directory" ? current : join(current, parts.at(-1));
  const targetStat = kind === "directory" ? directories.at(-1).stat : optionalStat(targetAbsolute);
  if (targetStat && (targetStat.isSymbolicLink() || (kind === "file" && !targetStat.isFile()))) unsafe();
  if (targetStat && !samePath(io(() => realpathSync(targetAbsolute)), targetAbsolute)) unsafe();
  const verifyDirectories = (canonical = false) => {
    for (const directory of directories) {
      const now = io(() => lstatSync(directory.absolute, { bigint: true }), true);
      if (now.isSymbolicLink() || !now.isDirectory()) unsafe();
      if (!identity(directory.stat, now)) changed();
      if (canonical && !samePath(io(() => realpathSync(directory.absolute), true), directory.absolute)) unsafe();
    }
  };
  const verifyFile = (path, expected) => {
    const now = optionalStat(path, true);
    if (!expected) {
      if (now) changed();
      return;
    }
    if (!now) changed();
    if (now.isSymbolicLink() || !now.isFile()) unsafe();
    if (!unchanged(expected, now)) changed();
    if (!samePath(io(() => realpathSync(path), true), path)) unsafe();
  };
  const inventory = [];
  const sources = [];
  const ignored = [];
  let files = 0;
  let totalBytes = 0;
  const readCandidate = (candidate) => {
    if (files >= limits.max_files) resource();
    files++;
    if (candidate.stat.size > BigInt(limits.max_file_bytes) ||
        candidate.stat.size > BigInt(limits.max_total_bytes - totalBytes)) resource();
    verifyDirectories();
    verifyFile(candidate.absolute, candidate.stat);
    let fd;
    try {
      fd = io(() => openSync(candidate.absolute,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0)));
      const before = io(() => fstatSync(fd, { bigint: true }));
      if (!before.isFile()) unsafe();
      if (!unchanged(candidate.stat, before)) changed();
      verifyFile(candidate.absolute, before);
      if (before.size > BigInt(limits.max_file_bytes) ||
          before.size > BigInt(limits.max_total_bytes - totalBytes)) resource();
      const cap = Math.min(limits.max_file_bytes, limits.max_total_bytes - totalBytes);
      // One extra byte detects growth, while the prior size bound avoids a large
      // allocation for a tiny file. Empty candidates still count as opened files.
      const bytes = Buffer.alloc(Number(before.size) + 1);
      let length = 0;
      while (length < bytes.length) {
        const count = io(() => readSync(fd, bytes, length, bytes.length - length, length));
        if (count === 0) break;
        length += count;
        if (length > cap) resource();
      }
      const after = io(() => fstatSync(fd, { bigint: true }));
      if (!unchanged(before, after) || after.size !== BigInt(length)) changed();
      verifyFile(candidate.absolute, after);
      verifyDirectories();
      totalBytes += length;
      const captured = bytes.subarray(0, length);
      let content;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(captured); }
      catch { throw new InputError("INVALID_ENCODING"); }
      checkTime();
      return { bytes: length, sha256: createHash("sha256").update(captured).digest("hex"), content };
    } finally {
      // Cleanup must run even when the cooperative deadline has already expired.
      if (fd !== undefined) {
        try { closeSync(fd); }
        catch { throw new InputError("INPUT_IO"); }
      }
    }
  };
  for (const directory of directories) {
    let selected = null;
    for (const filename of ["AGENTS.override.md", "AGENTS.md"]) {
      const path = directory.relative === "." ? filename : `${directory.relative}/${filename}`;
      const absolute = join(directory.absolute, filename);
      const stat = optionalStat(absolute);
      const candidate = { absolute, path, stat };
      inventory.push(candidate);
      if (!stat) continue;
      if (stat.isSymbolicLink() || !stat.isFile()) unsafe();
      if (!samePath(io(() => realpathSync(absolute)), absolute)) unsafe();
      if (selected) {
        ignored.push({ path, reason: "shadowed", selected_by: selected });
        continue;
      }
      const captured = readCandidate(candidate);
      if (/^[\p{White_Space}\uFEFF]*$/u.test(captured.content)) {
        ignored.push({ path, reason: "empty", selected_by: null });
        continue;
      }
      selected = path;
      let lines = captured.content.endsWith("\n") ? 0 : 1;
      for (const character of captured.content) if (character === "\n") lines++;
      const source = {
        path, directory: directory.relative, order: sources.length + 1,
        sha256: captured.sha256, bytes: captured.bytes, lines,
      };
      if (includeContent) source.content = captured.content;
      sources.push(source);
    }
  }
  verifyDirectories(true);
  for (const candidate of inventory) verifyFile(candidate.absolute, candidate.stat);
  if (kind === "file") verifyFile(targetAbsolute, targetStat);
  checkTime();
  return {
    target: { path: target, kind, directory: directoryParts.length ? directoryParts.join("/") : "." },
    sources, ignored, directories: directories.map((directory) => directory.relative),
  };
}
