#!/usr/bin/env node
import { capabilities, checkFile } from "../core/checker.js";
import { DEFAULT_LIMITS } from "../core/limits.js";
import { ToolFailure } from "../schema/errors.js";
import { TOOL_ID, TOOL_VERSION } from "../schema/types.js";
import type { CheckLimits, Envelope } from "../schema/types.js";
import { pathToFileURL } from "node:url";
import path from "node:path";

interface Arguments {
  operation: "capabilities" | "check";
  file: string | undefined;
  root: string | undefined;
  json: boolean;
  pretty: boolean;
  limits: Partial<CheckLimits>;
  help: boolean;
  version: boolean;
}

const HELP = `agent-cfml-check — deterministic, read-only structural checks for a bounded CFML subset

Usage:
  agent-cfml-check capabilities [--json] [--pretty]
  agent-cfml-check check --root <directory> <file> [--json] [--pretty]

The checker reads exactly one .cfm or .cfc file under the explicit root. It never
executes CFML, follows includes, uses the network, or modifies source files.
`;

function parseInteger(value: string, name: string): number {
  if (!/^\d+$/u.test(value)) throw new ToolFailure("INVALID_ARGUMENT", `${name} must be a positive integer`, 2);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ToolFailure("INVALID_ARGUMENT", `${name} must be a positive integer`, 2);
  return parsed;
}

function parseArgs(argv: readonly string[]): Arguments {
  let operation: Arguments["operation"] | null = null;
  let file: string | undefined;
  let root: string | undefined;
  let json = false;
  let pretty = false;
  let help = false;
  let version = false;
  const limits: Partial<CheckLimits> = {};
  const nextValue = (index: number, flag: string): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new ToolFailure("INVALID_ARGUMENT", `${flag} requires a value`, 2);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version") {
      version = true;
      continue;
    }
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    if (argument === "--root") {
      root = nextValue(index, argument);
      index += 1;
      continue;
    }
    const limitsMap: Record<string, keyof CheckLimits> = {
      "--max-source-bytes": "max_source_bytes",
      "--max-nesting": "max_nesting",
      "--max-findings": "max_findings",
      "--max-output-bytes": "max_output_bytes",
      "--time-limit-ms": "time_limit_ms",
    };
    const limitName = limitsMap[argument];
    if (limitName !== undefined) {
      limits[limitName] = parseInteger(nextValue(index, argument), argument);
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) throw new ToolFailure("INVALID_ARGUMENT", `Unknown flag ${argument}`, 2);
    if (operation === null && (argument === "capabilities" || argument === "check")) {
      operation = argument;
      continue;
    }
    if (operation === "check" && file === undefined) {
      file = argument;
      continue;
    }
    throw new ToolFailure("INVALID_ARGUMENT", "Unexpected positional argument", 2);
  }
  if (help && (version || operation !== null || file !== undefined || root !== undefined || json || pretty || Object.keys(limits).length > 0)) {
    throw new ToolFailure("INVALID_ARGUMENT", "--help cannot be combined with other options", 2);
  }
  if (version && (help || operation !== null || file !== undefined || root !== undefined || json || pretty || Object.keys(limits).length > 0)) {
    throw new ToolFailure("INVALID_ARGUMENT", "--version cannot be combined with other options", 2);
  }
  if (help || version) return { operation: "capabilities", file: undefined, root: undefined, json, pretty, limits, help, version };
  if (operation === null) throw new ToolFailure("INVALID_ARGUMENT", "An operation is required: capabilities or check", 2);
  if (operation === "capabilities" && (file !== undefined || root !== undefined || Object.keys(limits).length > 0)) throw new ToolFailure("INVALID_ARGUMENT", "capabilities does not accept a file, root, or check limits", 2);
  if (operation === "check" && (file === undefined || root === undefined)) throw new ToolFailure("INVALID_ARGUMENT", "check requires --root and one source file", 2);
  if (pretty && !json) throw new ToolFailure("INVALID_ARGUMENT", "--pretty requires --json", 2);
  return { operation, file, root, json, pretty, limits, help, version };
}

function renderText(envelope: Envelope<unknown>): string {
  if (envelope.status !== "ok" || envelope.data === null) return `${envelope.status}: ${envelope.errors.map((error) => `${error.code}: ${error.message}`).join("; ")}\n`;
  const data = envelope.data as { verdict?: string; source?: { path?: string }; findings?: Array<{ code: string; message: string; location: { start: { line: number; column: number } } }> };
  const lines = [`${envelope.tool.id} ${envelope.tool.version}`, `status: ${envelope.status}`, `verdict: ${data.verdict ?? "n/a"}`, `source: ${data.source?.path ?? "n/a"}`, `findings: ${data.findings?.length ?? 0}`];
  for (const item of data.findings ?? []) lines.push(`  ${item.code} at ${item.location.start.line}:${item.location.start.column}: ${item.message}`);
  return `${lines.join("\n")}\n`;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(HELP);
      return 0;
    }
    if (args.version) {
      process.stdout.write(`${TOOL_VERSION}\n`);
      return 0;
    }
    const result = args.operation === "capabilities"
      ? { envelope: capabilities(args.limits), exit_code: 0 as const }
      : checkFile({ root: args.root!, file: args.file!, limits: args.limits });
    if (args.json) process.stdout.write(`${JSON.stringify(result.envelope, null, args.pretty ? 2 : undefined)}\n`);
    else process.stdout.write(renderText(result.envelope));
    if (result.envelope.status !== "ok") for (const error of result.envelope.errors) process.stderr.write(`error: ${error.code}: ${error.message}\n`);
    return result.exit_code;
  } catch (error) {
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INTERNAL_ERROR", "The CLI failed without a safe result", 1);
    const envelope: Envelope<null> = {
      schema_version: "1.0.0",
      tool: { id: TOOL_ID, version: TOOL_VERSION },
      status: "error",
      complete: false,
      data: null,
      errors: [{ code: failure.code, message: failure.message }],
      warnings: [],
      meta: { scope: "CLI invocation", limits: DEFAULT_LIMITS },
    };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    process.stderr.write(`error: ${failure.code}: ${failure.message}\n`);
    return failure.exitCode;
  }
}

if (process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main();
