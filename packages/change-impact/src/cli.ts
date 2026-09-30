#!/usr/bin/env node
import { analyzeChanged, analyzeFile, analyzeSymbol, capabilities, type ImpactResult } from "./analysis";
import { ImpactError } from "./errors";
import type { Limits } from "./types";
import { boundedJson, mergeLimits } from "./util";

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let result: ImpactResult;
  let json = false;
  let maxOutputBytes = 1024 * 1024;
  try {
    const args = parseArgs(argv);
    json = args.flags.get("json") === true;
    const limits = parseLimits(args.flags);
    maxOutputBytes = limits.maxOutputBytes;
    switch (args.command) {
      case "capabilities":
        assertPositionalCount(args, 0);
        result = capabilities();
        break;
      case "file":
        assertPositionalCount(args, 1);
        result = analyzeFile({
          file: requiredPositional(args, 0, "file"),
          root: flagString(args, "root"),
          project: flagString(args, "project"),
          limits,
        });
        break;
      case "symbol":
        {
          assertPositionalCount(args, 2);
          const location = parseAt(args);
          result = analyzeSymbol({
            file: requiredPositional(args, 0, "file"),
            name: requiredPositional(args, 1, "symbol"),
            line: location?.line,
            column: location?.column,
            root: flagString(args, "root"),
            project: flagString(args, "project"),
            limits,
          });
        }
        break;
      case "changed":
        assertPositionalCount(args, 0);
        result = analyzeChanged({
          base: requiredFlag(args, "base"),
          head: flagString(args, "head"),
          worktree: args.flags.get("worktree") === true,
          root: flagString(args, "root"),
          project: flagString(args, "project"),
          limits,
        });
        break;
      default:
        throw new ImpactError("INVALID_ARGUMENT", `Unknown command: ${args.command || "(missing)"}`);
    }
  } catch (error) {
    const value = error instanceof ImpactError ? error : new ImpactError("INVALID_ARGUMENT", error instanceof Error ? error.message : String(error));
    result = {
      schemaVersion: "0.1-draft",
      ok: false,
      error: {
        code: value.code,
        message: value.message,
        ...(value.details ? { details: value.details } : {}),
      },
      warnings: [],
    };
  }
  try {
    const output = boundedCliOutput(result, json, maxOutputBytes);
    process.stdout.write(output);
  } catch (error) {
    const value = error instanceof ImpactError ? error : new ImpactError("OUTPUT_LIMIT_EXCEEDED", String(error));
    const fallback = {
      schemaVersion: "0.1-draft" as const,
      ok: false as const,
      error: { code: value.code, message: value.message, ...(value.details ? { details: value.details } : {}) },
      warnings: [],
    };
    process.stdout.write(`${JSON.stringify(fallback)}\n`);
    return 1;
  }
  return result.ok ? 0 : result.error.code === "INVALID_ARGUMENT" ? 2 : 1;
}

function boundedCliOutput(result: ImpactResult, json: boolean, maxOutputBytes: number): string {
  const compact = boundedJson(result, maxOutputBytes);
  const body = json ? compact : JSON.stringify(JSON.parse(compact), null, 2);
  const bytes = Buffer.byteLength(body);
  if (bytes > maxOutputBytes) {
    throw new ImpactError("OUTPUT_LIMIT_EXCEEDED", `JSON output exceeds ${maxOutputBytes} bytes after CLI formatting`, {
      maxOutputBytes,
      actualBytes: bytes,
    });
  }
  return `${body}\n`;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command = "", ...tokens] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const tokenBody = token.slice(2);
    const separator = tokenBody.indexOf("=");
    const rawName = separator === -1 ? tokenBody : tokenBody.slice(0, separator);
    const inlineValue = separator === -1 ? undefined : tokenBody.slice(separator + 1);
    if (!rawName) {
      throw new ImpactError("INVALID_ARGUMENT", "Flag name cannot be empty");
    }
    if (!new Set(["json", "worktree", "root", "project", "base", "head", "line", "column", "at", "depth", "max-nodes", "max-edges", "max-paths", "max-output-bytes", "max-files", "max-file-bytes", "max-total-file-bytes", "max-diagnostics"]).has(rawName)) {
      throw new ImpactError("INVALID_ARGUMENT", `Unknown flag: --${rawName}`);
    }
    const booleanFlags = new Set(["json", "worktree"]);
    if (booleanFlags.has(rawName)) {
      if (inlineValue !== undefined) {
        throw new ImpactError("INVALID_ARGUMENT", `Flag --${rawName} does not take a value`);
      }
      flags.set(rawName, true);
      continue;
    }
    const value = inlineValue ?? tokens[index + 1];
    if (value === undefined || value.length === 0 || (inlineValue === undefined && value.startsWith("--"))) {
      throw new ImpactError("INVALID_ARGUMENT", `Flag --${rawName} requires a value`);
    }
    if (inlineValue === undefined) {
      index += 1;
    }
    flags.set(rawName, value);
  }
  return { command, positional, flags };
}

function parseLimits(flags: ParsedArgs["flags"]): Limits {
  const values: Partial<Limits> = {};
  for (const [flag, property] of [
    ["depth", "depth"],
    ["max-nodes", "maxNodes"],
    ["max-edges", "maxEdges"],
    ["max-paths", "maxPathsPerTarget"],
    ["max-output-bytes", "maxOutputBytes"],
    ["max-files", "maxFiles"],
    ["max-file-bytes", "maxFileBytes"],
    ["max-total-file-bytes", "maxTotalFileBytes"],
    ["max-diagnostics", "maxDiagnostics"],
  ] as const) {
    const raw = flags.get(flag);
    if (raw !== undefined) {
      if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
        throw new ImpactError("INVALID_ARGUMENT", `Flag --${flag} must be a positive integer`);
      }
      values[property] = Number(raw);
    }
  }
  return mergeLimits(values);
}

function requiredPositional(args: ParsedArgs, index: number, name: string): string {
  const value = args.positional[index];
  if (!value) {
    throw new ImpactError("INVALID_ARGUMENT", `${name} is required`);
  }
  return value;
}

function assertPositionalCount(args: ParsedArgs, expected: number): void {
  if (args.positional.length !== expected) {
    throw new ImpactError("INVALID_ARGUMENT", `${args.command || "command"} expects ${expected} positional argument${expected === 1 ? "" : "s"}`);
  }
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value) {
    throw new ImpactError("INVALID_ARGUMENT", `--${name} is required`);
  }
  return value;
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) {
    return undefined;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new ImpactError("INVALID_ARGUMENT", `--${name} must be a positive integer`);
  }
  return Number(value);
}

function parseAt(args: ParsedArgs): { line: number; column: number } | undefined {
  const at = flagString(args, "at");
  const line = flagNumber(args, "line");
  const column = flagNumber(args, "column");
  if (at !== undefined) {
    if (line !== undefined || column !== undefined || !/^(\d+):(\d+)$/.test(at)) {
      throw new ImpactError("INVALID_ARGUMENT", "--at must be LINE:COLUMN and cannot be combined with --line/--column");
    }
    const match = /^(\d+):(\d+)$/.exec(at);
    if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
      throw new ImpactError("INVALID_ARGUMENT", "--at must use positive LINE:COLUMN values");
    }
    return { line: Number(match[1]), column: Number(match[2]) };
  }
  if (line !== undefined || column !== undefined) {
    if (line === undefined || column === undefined) {
      throw new ImpactError("INVALID_ARGUMENT", "--line and --column must be supplied together");
    }
    return { line, column };
  }
  return undefined;
}

if (require.main === module) {
  process.exitCode = main();
}
