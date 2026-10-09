#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TestScopeEngine } from "./core/engine.js";
import { toPlanSummary } from "./cli-summary.js";
import type { Operation, Result } from "./types.js";

const operations = new Set<Operation>(["capabilities", "discover", "plan", "explain"]);

function usage(): string {
  return [
    "Usage: agent-test-scope <operation> --root <path> [options]",
    "",
    "Operations: capabilities, discover, plan, explain",
    "Common options: --include <glob> --exclude <glob> --limit <1..200> --compact --max-output-bytes <1024..8388608>",
    "Plan options: --changed <path> (repeatable) --changed-stdin --summary",
    "Explain options: --path <test-path> | --command <command>",
    "",
    "JSON results are written to stdout; human-readable diagnostics are written to stderr.",
    "--compact removes JSON whitespace without omitting evidence or changing the result.",
    "--summary keeps all plan recommendations and diagnostics, replacing evidence with counts/types.",
    "Summary output has view: summary and its own summary.schema.json; use full output for evidence details.",
    "--max-output-bytes withholds oversized results as partial RESOURCE_LIMIT; narrow --include/--exclude and retry.",
    "Commands in results are recommendations only and are never executed by this tool."
  ].join("\n");
}

interface ParsedArguments {
  operation?: string;
  values: Record<string, string | undefined>;
  changed: string[];
  include: string[];
  exclude: string[];
  changedStdin: boolean;
  compact: boolean;
  summary: boolean;
  errors: string[];
}

export interface CliOutput {
  write(chunk: string): unknown;
}

export interface CliStreams {
  stdout: CliOutput;
  stderr: CliOutput;
}

function parseArguments(argv: readonly string[]): ParsedArguments {
  const parsed: ParsedArguments = { values: {}, changed: [], include: [], exclude: [], changedStdin: false, compact: false, summary: false, errors: [] };
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") return parsed;
  parsed.operation = argv[0];
  if (!operations.has(parsed.operation as Operation)) parsed.errors.push(`Unknown operation: ${parsed.operation}`);
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--json") continue;
    if (argument === "--summary" || argument.startsWith("--summary=")) {
      if (parsed.summary) parsed.errors.push("Duplicate option: --summary");
      if (argument !== "--summary") parsed.errors.push("--summary does not accept a value");
      parsed.summary = true;
      continue;
    }
    if (argument === "--compact") {
      if (parsed.compact) parsed.errors.push("Duplicate option: --compact");
      parsed.compact = true;
      continue;
    }
    if (argument === "--changed-stdin") {
      parsed.changedStdin = true;
      continue;
    }
    const equals = argument.indexOf("=");
    const key = equals >= 0 ? argument.slice(0, equals) : argument;
    let value = equals >= 0 ? argument.slice(equals + 1) : undefined;
    if (!key.startsWith("--")) {
      parsed.errors.push(`Unexpected positional argument: ${argument}`);
      continue;
    }
    if (value === undefined) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed.errors.push(`Missing value for ${key}`);
        continue;
      }
      value = next;
      index += 1;
    }
    if (key === "--changed") parsed.changed.push(value);
    else if (key === "--include") parsed.include.push(value);
    else if (key === "--exclude") parsed.exclude.push(value);
    else if (["--root", "--limit", "--path", "--command", "--max-output-bytes"].includes(key)) {
      if (parsed.values[key] !== undefined) parsed.errors.push(`Duplicate option: ${key}`);
      else parsed.values[key] = value;
    } else parsed.errors.push(`Unknown option: ${key}`);
  }
  if (parsed.summary && parsed.operation !== "plan") parsed.errors.push("--summary is supported only for plan");
  const outputCap = parsed.values["--max-output-bytes"];
  if (outputCap !== undefined && (!/^\d+$/.test(outputCap) || !Number.isSafeInteger(Number(outputCap)) || Number(outputCap) < 1024 || Number(outputCap) > 8 * 1024 * 1024)) {
    parsed.errors.push("--max-output-bytes must be an integer from 1024 to 8388608");
  }
  return parsed;
}

function stdinChanged(): string[] {
  try {
    return readFileSync(0, "utf8").split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function toRequest(parsed: ParsedArguments): unknown {
  const operation = parsed.operation;
  const values = parsed.values;
  const changed = [...parsed.changed, ...(parsed.changedStdin ? stdinChanged() : [])];
  const request: Record<string, unknown> = { operation, root: values["--root"], ...(parsed.include.length > 0 ? { include: parsed.include } : {}), ...(parsed.exclude.length > 0 ? { exclude: parsed.exclude } : {}) };
  if (values["--limit"] !== undefined) request.limit = Number(values["--limit"]);
  if (operation === "plan" || operation === "explain") request.changed = changed;
  if (operation === "explain") request.target = values["--path"] !== undefined ? { path: values["--path"] } : values["--command"] !== undefined ? { command: values["--command"] } : {};
  return request;
}

export function main(argv: readonly string[] = process.argv.slice(2), engine = new TestScopeEngine(), streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }): number {
  const parsed = parseArguments(argv);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    streams.stdout.write(`${usage()}\n`);
    return 0;
  }
  const invalidArguments = parsed.errors.length > 0;
  const request = invalidArguments ? {} : toRequest(parsed);
  let result = engine.execute(request);
  if (invalidArguments) result = { ...result, diagnostics: parsed.errors.map(message => ({ code: "INVALID_REQUEST", message, severity: "error" })) };
  const serialize = (value: Result): string => `${JSON.stringify(parsed.summary ? toPlanSummary(value) : value, null, parsed.compact ? undefined : 2)}\n`;
  let output = serialize(result);
  const cap = Number(parsed.values["--max-output-bytes"]);
  if (!invalidArguments && Number.isFinite(cap) && Buffer.byteLength(output, "utf8") > cap) {
    result = {
      schemaVersion: result.schemaVersion,
      status: result.status === "error" ? "error" : "partial",
      data: {},
      diagnostics: [{
        code: "RESOURCE_LIMIT", severity: "warning",
        message: "Serialized CLI output exceeds --max-output-bytes; results withheld. Narrow --include/--exclude or choose --summary --compact before retrying.",
        details: { maxOutputBytes: cap, actualBytes: Buffer.byteLength(output, "utf8"), originalStatus: result.status, withheldDiagnostics: result.diagnostics.length }
      }],
      truncation: { truncated: true, reasons: ["RESOURCE_LIMIT"] },
      stats: {}
    };
    output = serialize(result);
  }
  streams.stdout.write(output);
  for (const item of result.diagnostics) streams.stderr.write(`[${item.code}] ${item.message}${item.path ? ` (${item.path})` : ""}\n`);
  if (parsed.errors.length > 0) return 2;
  return result.status === "error" ? 1 : 0;
}

const argvPath = process.argv[1];
const invokedAsCli = (() => {
  if (argvPath === undefined || !/(?:^|[\\/])cli\.js$/.test(argvPath)) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(argvPath));
  } catch {
    return false;
  }
})();
if (invokedAsCli) process.exitCode = main();
