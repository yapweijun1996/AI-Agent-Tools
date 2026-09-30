import {
  openSync,
  closeSync,
  fstatSync,
  readSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
export const LIMITS = {
  inputBytes: 1048576,
  outputBytes: 65536,
  nodes: 4096,
  depth: 32,
  changes: 512,
};
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const escape = (x) => x.replace(/~/g, "~0").replace(/\//g, "~1");
export function invalid(message = "Invalid bounded JSON Schema input") {
  const e = new Error(message);
  e.code = "INVALID_INPUT";
  return e;
}
export function readJson(file) {
  let fd;
  try {
    if (
      [
        ".env",
        ".npmrc",
        "auth.json",
        "credentials.json",
        "tokens.json",
      ].includes(path.basename(realpathSync(file)).toLowerCase())
    )
      throw invalid("Credential files are not inputs");
    fd = openSync(file, "r");
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > LIMITS.inputBytes) throw invalid();
    const buffer = Buffer.alloc(LIMITS.inputBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > LIMITS.inputBytes) throw invalid();
    return JSON.parse(buffer.subarray(0, size).toString("utf8"));
  } catch {
    throw invalid();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function selectPointer(value, pointer = "") {
  if (pointer === "") return value;
  if (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer))
    throw invalid("Invalid JSON pointer");
  for (const part of pointer
    .slice(1)
    .split("/")
    .map((x) => x.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, part)
    )
      throw invalid("JSON pointer not found");
    value = value[part];
  }
  return value;
}
const known = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "$comment",
  "default",
  "examples",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "pattern",
]);
const types = new Set([
  "null",
  "boolean",
  "object",
  "array",
  "number",
  "integer",
  "string",
]);
function validate(schema) {
  let nodes = 0;
  function visit(s, d) {
    if (++nodes > LIMITS.nodes || d > LIMITS.depth)
      throw invalid("Schema complexity budget exceeded");
    if (typeof s === "boolean") return;
    if (!object(s)) throw invalid();
    if (
      s.type !== undefined &&
      !(typeof s.type === "string"
        ? types.has(s.type)
        : Array.isArray(s.type) &&
          s.type.length > 0 &&
          s.type.every((x) => types.has(x)) &&
          new Set(s.type).size === s.type.length)
    )
      throw invalid("Invalid type");
    if (
      s.required !== undefined &&
      (!Array.isArray(s.required) ||
        s.required.some((x) => typeof x !== "string") ||
        new Set(s.required).size !== s.required.length)
    )
      throw invalid("Invalid required fields");
    if (s.properties !== undefined) {
      if (!object(s.properties)) throw invalid();
      for (const v of Object.values(s.properties)) visit(v, d + 1);
    }
    for (const k of ["items", "additionalProperties"])
      if (s[k] !== undefined) visit(s[k], d + 1);
    if (s.enum !== undefined && (!Array.isArray(s.enum) || !s.enum.length))
      throw invalid("Invalid enum");
    for (const k of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minProperties",
      "maxProperties",
    ])
      if (
        s[k] !== undefined &&
        (typeof s[k] !== "number" ||
          !Number.isFinite(s[k]) ||
          (/^(min|max)(Length|Items|Properties)$/.test(k) &&
            (!Number.isInteger(s[k]) || s[k] < 0)))
      )
        throw invalid("Invalid bound");
    if (s.pattern !== undefined) {
      if (typeof s.pattern !== "string" || s.pattern.length > 256)
        throw invalid("Invalid pattern");
      try {
        new RegExp(s.pattern);
      } catch {
        throw invalid("Invalid regex syntax");
      }
    }
  }
  visit(schema, 0);
}
function evidence(value, key) {
  if (value === undefined) return null;
  if (key === "enum" || key === "const")
    return {
      fingerprint: hash(value),
      ...(Array.isArray(value) ? { count: value.length } : {}),
    };
  if (key === "pattern")
    return { fingerprint: hash(value), length: value.length };
  return value;
}
export function capabilities() {
  return {
    schemaVersion: "1.0",
    tool: "agent-contract-check",
    operation: "capabilities",
    status: "compatible",
    complete: true,
    data: {
      operations: ["compare", "capabilities"],
      direction: "previous accepted inputs to next accepted inputs",
      subset:
        "JSON Schema draft-07 constraints; unsupported semantics are unknown",
      limits: LIMITS,
    },
    diagnostics: [],
  };
}
export function compareContracts(before, after, options = {}) {
  validate(before);
  validate(after);
  if (
    options.samples !== undefined &&
    (!Array.isArray(options.samples) ||
      options.samples.length > 32 ||
      options.samples.some((x) => typeof x !== "string" || x.length > 512))
  )
    throw invalid("Samples must be at most 32 bounded strings");
  const changes = [];
  let exhausted = false;
  const add = (pointer, keyword, classification, a, b, reason) => {
    if (changes.length >= LIMITS.changes) {
      exhausted = true;
      return;
    }
    changes.push({
      pointer,
      keyword,
      classification,
      before: evidence(a, keyword),
      after: evidence(b, keyword),
      reason,
    });
  };
  function walk(a, b, p) {
    if (typeof a === "boolean" || typeof b === "boolean") {
      if (a !== b)
        add(
          p,
          "schema",
          a === false || b === true ? "compatible" : "potential-breaking",
          a,
          b,
          "BOOLEAN_SCHEMA_CHANGE",
        );
      return;
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
      if (
        !known.has(key) ||
        (key === "$schema" &&
          [a[key], b[key]].some(
            (x) =>
              x !== undefined &&
              x !== "http://json-schema.org/draft-07/schema#" &&
              x !== "https://json-schema.org/draft-07/schema#",
          ))
      )
        add(
          p + "/" + escape(key),
          key,
          "unknown",
          undefined,
          undefined,
          "UNSUPPORTED_KEYWORD",
        );
    const ta =
        a.type === undefined
          ? [...types]
          : Array.isArray(a.type)
            ? a.type
            : [a.type],
      tb =
        b.type === undefined
          ? [...types]
          : Array.isArray(b.type)
            ? b.type
            : [b.type];
    const accepts = (set, t) =>
      set.includes(t) || (t === "integer" && set.includes("number"));
    if (JSON.stringify([...ta].sort()) !== JSON.stringify([...tb].sort()))
      add(
        p + "/type",
        "type",
        ta.some((t) => !accepts(tb, t)) ? "potential-breaking" : "compatible",
        a.type,
        b.type,
        "TYPE_ACCEPTANCE_CHANGE",
      );
    const ra = a.required ?? [],
      rb = b.required ?? [];
    if (JSON.stringify([...ra].sort()) !== JSON.stringify([...rb].sort()))
      add(
        p + "/required",
        "required",
        rb.some((x) => !ra.includes(x)) ? "potential-breaking" : "compatible",
        ra,
        rb,
        "REQUIRED_FIELDS_CHANGE",
      );
    for (const key of ["enum", "const"])
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
        let restrictive = b[key] !== undefined;
        if (key === "enum" && a.enum && b.enum)
          restrictive = a.enum.some(
            (x) => !b.enum.some((y) => hash(x) === hash(y)),
          );
        add(
          p + "/" + key,
          key,
          restrictive ? "potential-breaking" : "compatible",
          a[key],
          b[key],
          "VALUE_SET_CHANGE",
        );
      }
    for (const key of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "minLength",
      "maxLength",
      "minItems",
      "maxItems",
      "minProperties",
      "maxProperties",
    ])
      if (a[key] !== b[key]) {
        const lower = key.startsWith("min") || key === "exclusiveMinimum";
        const restrictive =
          b[key] !== undefined &&
          (a[key] === undefined || (lower ? b[key] > a[key] : b[key] < a[key]));
        add(
          p + "/" + key,
          key,
          restrictive ? "potential-breaking" : "compatible",
          a[key],
          b[key],
          "BOUND_CHANGE",
        );
      }
    if (a.pattern !== b.pattern) {
      add(
        p + "/pattern",
        "pattern",
        b.pattern === undefined ? "compatible" : "unknown",
        a.pattern,
        b.pattern,
        "PATTERN_ACCEPTANCE_REQUIRES_SAMPLE_OR_VALIDATOR_REVIEW",
      );
      if (options.samples && p === "") {
        const probe = spawnSync(
          process.execPath,
          [fileURLToPath(new URL("./pattern-worker.js", import.meta.url))],
          {
            input: JSON.stringify({
              before: a.pattern,
              after: b.pattern,
              samples: options.samples,
            }),
            encoding: "utf8",
            timeout: 750,
            maxBuffer: 16384,
            env: {},
            shell: false,
            windowsHide: true,
          },
        );
        if (probe.status === 0) {
          const samples = JSON.parse(probe.stdout);
          changes.at(-1).samples = samples;
          if (samples.some((x) => x.before.substring && !x.after.substring))
            changes.at(-1).classification = "potential-breaking";
        } else
          changes.at(-1).sampleEvidence =
            "unknown: regex probe failed or timed out";
      }
    }
    if (
      a.additionalProperties !== b.additionalProperties &&
      !(object(a.additionalProperties) && object(b.additionalProperties))
    ) {
      if (
        typeof a.additionalProperties === "object" ||
        typeof b.additionalProperties === "object"
      )
        add(
          p + "/additionalProperties",
          "additionalProperties",
          "unknown",
          undefined,
          undefined,
          "SCHEMA_VALUED_ADDITIONAL_PROPERTIES",
        );
      else if (
        (a.additionalProperties ?? true) !== (b.additionalProperties ?? true)
      )
        add(
          p + "/additionalProperties",
          "additionalProperties",
          b.additionalProperties === false
            ? "potential-breaking"
            : "compatible",
          a.additionalProperties ?? true,
          b.additionalProperties ?? true,
          "ADDITIONAL_PROPERTIES_CHANGE",
        );
    }
    if (object(a.additionalProperties) && object(b.additionalProperties))
      walk(
        a.additionalProperties,
        b.additionalProperties,
        p + "/additionalProperties",
      );
    for (const name of [
      ...new Set([
        ...Object.keys(a.properties ?? {}),
        ...Object.keys(b.properties ?? {}),
      ]),
    ].sort()) {
      const x = Object.hasOwn(a.properties ?? {}, name)
          ? a.properties[name]
          : undefined,
        y = Object.hasOwn(b.properties ?? {}, name)
          ? b.properties[name]
          : undefined,
        q = p + "/properties/" + escape(name);
      if (x === undefined)
        add(
          q,
          "properties",
          a.additionalProperties === false && !rb.includes(name)
            ? "compatible"
            : "potential-breaking",
          null,
          null,
          "PROPERTY_ADDED_ACCEPTANCE_DEPENDS_ON_PREVIOUS_OPEN_OBJECT",
        );
      else if (y === undefined)
        add(
          q,
          "properties",
          b.additionalProperties === false
            ? "potential-breaking"
            : "compatible",
          null,
          null,
          "PROPERTY_REMOVED",
        );
      else walk(x, y, q);
    }
    if (a.items !== undefined && b.items !== undefined)
      walk(a.items, b.items, p + "/items");
    else if (a.items !== b.items)
      add(
        p + "/items",
        "items",
        b.items === undefined ? "compatible" : "potential-breaking",
        null,
        null,
        "ITEM_CONSTRAINT_CHANGE",
      );
  }
  // Inspect unsupported semantics even inside added/removed schema branches.
  const inspect = (schema, pointer) => {
    if (typeof schema === "boolean") return;
    for (const key of Object.keys(schema)) {
      const unsupported =
        !known.has(key) ||
        (key === "$schema" &&
          ![
            "http://json-schema.org/draft-07/schema#",
            "https://json-schema.org/draft-07/schema#",
          ].includes(schema[key]));
      const location = pointer + "/" + escape(key);
      if (
        unsupported &&
        !changes.some(
          (x) => x.pointer === location && x.reason === "UNSUPPORTED_KEYWORD",
        )
      )
        add(
          location,
          key,
          "unknown",
          undefined,
          undefined,
          "UNSUPPORTED_KEYWORD",
        );
    }
    for (const [name, child] of Object.entries(schema.properties ?? {}))
      inspect(child, pointer + "/properties/" + escape(name));
    for (const key of ["items", "additionalProperties"])
      if (schema[key] !== undefined) inspect(schema[key], pointer + "/" + key);
  };
  walk(before, after, "");
  inspect(before, "");
  inspect(after, "");
  changes.sort((a, b) =>
    a.pointer + "\0" + a.reason < b.pointer + "\0" + b.reason
      ? -1
      : a.pointer + "\0" + a.reason > b.pointer + "\0" + b.reason
        ? 1
        : 0,
  );
  if (exhausted) add("", "limit", "unknown", null, null, "CHANGE_LIMIT");
  const unknown =
    exhausted ||
    changes.some(
      (x) =>
        x.classification === "unknown" ||
        (x.keyword === "pattern" && x.after !== null),
    );
  const status = changes.some((x) => x.classification === "potential-breaking")
    ? "potential-breaking"
    : unknown
      ? "unknown"
      : "compatible";
  return {
    schemaVersion: "1.0",
    tool: "agent-contract-check",
    operation: "compare",
    status,
    complete: !unknown,
    data: {
      direction: "previous accepted inputs to next accepted inputs",
      sources: {
        before: "before" + (options.beforePointer ?? ""),
        after: "after" + (options.afterPointer ?? ""),
      },
      changes,
    },
    diagnostics: exhausted
      ? [{ code: "CHANGE_LIMIT", message: "Change budget exceeded" }]
      : [],
  };
}
export function encodeResult(result) {
  const value = JSON.stringify(result);
  return Buffer.byteLength(value) <= LIMITS.outputBytes
    ? value
    : JSON.stringify({
        schemaVersion: "1.0",
        tool: "agent-contract-check",
        operation: "compare",
        status: "unknown",
        complete: false,
        data: null,
        diagnostics: [
          { code: "OUTPUT_LIMIT", message: "Result exceeds output budget" },
        ],
      });
}
export const exitCode = (result) =>
  ({ compatible: 0, "potential-breaking": 1, unknown: 3, error: 2 })[
    result.status
  ] ?? 2;
