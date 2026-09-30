#!/usr/bin/env node

import { parse, capabilities } from "./index.js";
import { serializeCapabilities, serializeResult } from "./core/serialize.js";
import { readUtf8Stream } from "./core/cli-input.js";
import { isWellFormedUnicode, stringLength } from "./core/validation.js";

const usage = "Usage: agent-error-lens <parse|capabilities> --format json [--stdin] [--root <path>]";

function writeUsage(message?: string): void {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(`${usage}\n`);
  process.exitCode = 2;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parseFlags(args: string[]): { root?: string; error?: string } {
  let root: string | undefined;
  let rootSeen = false;
  let formatSeen = false;
  let stdinSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--stdin" && !stdinSeen) {
      stdinSeen = true;
      continue;
    }
    if (arg === "--format" && !formatSeen) {
      if (args[index + 1] !== "json") return { error: "--format requires json" };
      formatSeen = true;
      index += 1;
      continue;
    }
    if (arg === "--root" && !rootSeen) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { error: "--root requires a path" };
      root = value;
      rootSeen = true;
      index += 1;
      continue;
    }
    return { error: `unknown or duplicate option: ${arg}` };
  }
  return root === undefined ? {} : { root };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "--help" || command === "-h") {
    process.stderr.write(`${usage}\n`);
    return;
  }

  if (command === "capabilities") {
    const flags = parseFlags(args);
    if (flags.error || args.length !== 2 || !hasFlag(args, "--format") || !hasFlag(args, "json")) {
      writeUsage("capabilities requires --format json");
      return;
    }
    process.stdout.write(serializeCapabilities(capabilities()));
    return;
  }

  if (command !== "parse") {
    writeUsage("unknown command");
    return;
  }

  const flags = parseFlags(args);
  if (flags.error || !hasFlag(args, "--stdin") || !hasFlag(args, "--format")) {
    writeUsage("parse requires --stdin --format json");
    return;
  }

  const input = await readUtf8Stream(process.stdin);
  if (!input.ok) {
    writeUsage(input.message);
    return;
  }

  let request: unknown;
  try {
    request = JSON.parse(input.text) as unknown;
  } catch {
    writeUsage("stdin must contain a JSON request");
    return;
  }

  if (flags.root !== undefined) {
    const rootValue = flags.root;
    if (!rootValue) {
      writeUsage("--root requires a path");
      return;
    }
    const requestRecord = isRecord(request) ? request : null;
    const requestOptions = requestRecord?.options;
    if (requestRecord && (requestOptions === undefined || isRecord(requestOptions))) {
      const validOptions = isRecord(requestOptions) ? requestOptions : null;
      if (validOptions && Object.hasOwn(validOptions, "root")) {
        if (typeof validOptions.root === "string" && isWellFormedUnicode(validOptions.root) && stringLength(validOptions.root) > 0 && stringLength(validOptions.root) <= 4096) {
          if (validOptions.root !== rootValue) {
            writeUsage("--root conflicts with options.root");
            return;
          }
        }
      } else {
        request = { ...requestRecord, options: { ...validOptions, root: rootValue } };
      }
    }
  }

  const result = parse(request);
  process.stdout.write(serializeResult(result));
  process.exitCode = result.status === "error" ? 1 : 0;
}

await main();
