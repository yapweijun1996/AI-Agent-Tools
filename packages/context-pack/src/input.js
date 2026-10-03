import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

export class InputError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DEVICE = /^(?:con|conin\$|conout\$|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?: *\.|$)/iu;

// Root-relative paths use "/" separators and never name the root itself.
export function relativePath(value, code = "UNSAFE_PATH") {
  const reject = () => { throw new InputError(code); };
  if (typeof value !== "string") throw new InputError("INVALID_INPUT");
  if (!value || Buffer.byteLength(value, "utf8") > 1024 ||
      CONTROL.test(value) || value.startsWith("/") || /[\\:*?<>"|]/u.test(value)) reject();
  if (value.split("/").some((part) => !part || part === "." || part === ".." ||
      /[. ]$/u.test(part) || DEVICE.test(part))) reject();
  return value;
}

// Reads one explicit regular file under root. Symlinked components, substitution
// between validation and read, and growth beyond the cap are rejected, not followed.
export function readArtifact(root, name, extensions, cap) {
  let fd;
  try {
    if (typeof name !== "string" || !name || name.includes("\0") || name.split(/[\\/]/).includes(".."))
      throw new InputError("UNSAFE_PATH");
    const requestedBase = resolve(root);
    const base = realpathSync(requestedBase);
    let file = isAbsolute(name) ? resolve(name) : resolve(base, name);
    const requestedRelative = relative(requestedBase, file);
    if (isAbsolute(name) && requestedRelative && requestedRelative !== ".." &&
        !requestedRelative.startsWith(".." + sep) && !isAbsolute(requestedRelative))
      file = resolve(base, requestedRelative);
    const rel = relative(base, file);
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
      throw new InputError("UNSAFE_PATH");
    if (!extensions.includes(extname(file))) throw new InputError("INVALID_INPUT");
    let current = base;
    for (const component of rel.split(sep)) {
      current = resolve(current, component);
      if (lstatSync(current).isSymbolicLink()) throw new InputError("UNSAFE_PATH");
    }
    const expected = lstatSync(file, { bigint: true });
    if (realpathSync(file) !== file) throw new InputError("UNSAFE_PATH");
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile()) throw new InputError("UNSAFE_PATH");
    if (expected.dev !== before.dev || expected.ino !== before.ino || realpathSync(file) !== file)
      throw new InputError("UNSAFE_PATH");
    const openedPath = lstatSync(file, { bigint: true });
    if (openedPath.isSymbolicLink() || openedPath.dev !== before.dev || openedPath.ino !== before.ino)
      throw new InputError("UNSAFE_PATH");
    if (before.size > BigInt(cap)) throw new InputError("RESOURCE_LIMIT");
    const bytes = Buffer.alloc(cap + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = readSync(fd, bytes, length, bytes.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > cap) throw new InputError("RESOURCE_LIMIT");
    const after = fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        before.ino !== after.ino || before.dev !== after.dev || BigInt(length) !== after.size)
      throw new InputError("INPUT_CHANGED");
    const raw = bytes.subarray(0, length);
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw); }
    catch { throw new InputError("INVALID_ENCODING"); }
    return { text, bytes: length, sha256: createHash("sha256").update(raw).digest("hex") };
  } catch (error) {
    if (error instanceof InputError) throw error;
    if (["EACCES", "EPERM", "ELOOP"].includes(error?.code)) throw new InputError("UNSAFE_PATH");
    throw new InputError("INPUT_IO");
  } finally { if (fd !== undefined) closeSync(fd); }
}

const JSON_VALUE = /(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;

// Strict JSON: a duplicate object key must not silently replace an earlier value.
// Objects have a null prototype so "__proto__" is an ordinary own key.
export function parseJson(text, maxDepth = 64) {
  let cursor = 0;
  const invalid = () => { throw new InputError("INVALID_INPUT"); };
  const space = () => { while (cursor < text.length && /[\t\n\r ]/.test(text[cursor])) cursor++; };
  function string() {
    if (text[cursor++] !== '"') invalid();
    const start = cursor - 1;
    while (cursor < text.length) {
      const ch = text[cursor++];
      if (ch === '"') {
        try { return JSON.parse(text.slice(start, cursor)); } catch { invalid(); }
      }
      if (ch === "\\") cursor++;
    }
    invalid();
  }
  function value(depth) {
    if (depth > maxDepth) throw new InputError("RESOURCE_LIMIT");
    space();
    const ch = text[cursor];
    if (ch === '"') return string();
    if (ch === "{") {
      cursor++; space();
      const object = Object.create(null);
      if (text[cursor] === "}") { cursor++; return object; }
      while (cursor < text.length) {
        space(); const key = string();
        if (Object.hasOwn(object, key)) invalid();
        space(); if (text[cursor++] !== ":") invalid();
        object[key] = value(depth + 1); space();
        if (text[cursor] === "}") { cursor++; return object; }
        if (text[cursor++] !== ",") invalid();
      }
      invalid();
    }
    if (ch === "[") {
      cursor++; space();
      const array = [];
      if (text[cursor] === "]") { cursor++; return array; }
      while (cursor < text.length) {
        array.push(value(depth + 1)); space();
        if (text[cursor] === "]") { cursor++; return array; }
        if (text[cursor++] !== ",") invalid();
      }
      invalid();
    }
    JSON_VALUE.lastIndex = cursor;
    const match = JSON_VALUE.exec(text);
    if (!match) invalid();
    cursor += match[0].length;
    const result = JSON.parse(match[0]);
    if (typeof result === "number" && !Number.isFinite(result)) invalid();
    return result;
  }
  const parsed = value(0);
  space();
  if (cursor !== text.length) invalid();
  return parsed;
}
