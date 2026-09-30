#!/usr/bin/env node

import { SymbolSearchEngine } from "./core/engine";
import type { Operation } from "./types";

const operations = new Set<Operation>(["capabilities", "search", "definition", "references", "implementations", "symbols"]);

function usage(): string {
  return [
    "Usage: agent-symbol-search <operation> --root <path> [options]",
    "",
    "Operations: capabilities, search, definition, references, implementations, symbols",
    "Common options: --symbol <name> --path <file> --project <tsconfig.json> --limit <1..500>",
    "Position options: --from-path <file> --line <1-based> --column <0-based UTF-16>",
    "Discovery options: --include <glob> --exclude <glob> (repeatable)",
    "",
    "JSON results are written to stdout; human diagnostics are written to stderr."
  ].join("\n");
}

interface ParsedArguments {
  operation?: string;
  values: Record<string, string | undefined>;
  include: string[];
  exclude: string[];
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
  const parsed: ParsedArguments = { values: {}, include: [], exclude: [], errors: [] };
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    return parsed;
  }
  parsed.operation = argv[0];
  if (!operations.has(parsed.operation as Operation)) {
    parsed.errors.push(`Unknown operation: ${parsed.operation}`);
  }
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") continue;
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
    if (key === "--include") {
      parsed.include.push(value);
    } else if (key === "--exclude") {
      parsed.exclude.push(value);
    } else if (["--root", "--symbol", "--match", "--from-path", "--line", "--column", "--project", "--path", "--limit"].includes(key)) {
      if (parsed.values[key] !== undefined) {
        parsed.errors.push(`Duplicate option: ${key}`);
      } else {
        parsed.values[key] = value;
      }
    } else {
      parsed.errors.push(`Unknown option: ${key}`);
    }
  }
  return parsed;
}

function toRequest(parsed: ParsedArguments): unknown {
  const operation = parsed.operation;
  const values = parsed.values;
  const request: Record<string, unknown> = {
    operation,
    root: values["--root"],
    ...(parsed.include.length > 0 ? { include: parsed.include } : {}),
    ...(parsed.exclude.length > 0 ? { exclude: parsed.exclude } : {})
  };
  if (values["--symbol"] !== undefined) request.symbol = values["--symbol"];
  if (values["--match"] !== undefined) request.match = values["--match"];
  if (values["--project"] !== undefined) request.project = values["--project"];
  if (values["--path"] !== undefined) request.path = values["--path"];
  if (values["--limit"] !== undefined) request.limit = Number(values["--limit"]);
  const fromValues = [values["--from-path"], values["--line"], values["--column"]];
  if (fromValues.some((value) => value !== undefined)) {
    request.from = {
      path: values["--from-path"],
      line: values["--line"] === undefined ? undefined : Number(values["--line"]),
      column: values["--column"] === undefined ? undefined : Number(values["--column"])
    };
  }
  return request;
}

export function main(
  argv: readonly string[] = process.argv.slice(2),
  engine = new SymbolSearchEngine(),
  streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }
): number {
  const parsed = parseArguments(argv);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    streams.stdout.write(`${usage()}\n`);
    return 0;
  }
  const request = toRequest(parsed);
  if (parsed.errors.length > 0 && typeof request === "object" && request !== null) {
    (request as Record<string, unknown>).__parseErrors = parsed.errors;
  }
  const result = engine.execute(request);
  streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  for (const item of result.diagnostics) {
    const location = item.path ? ` (${item.path})` : "";
    streams.stderr.write(`[${item.code}] ${item.message}${location}\n`);
  }
  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) streams.stderr.write(`[INVALID_REQUEST] ${error}\n`);
    return 2;
  }
  return result.status === "error" ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main();
}
