import { inspectFiles } from "../core/inspect.js";
import type { InspectOptions, InspectResult, LineRange } from "../core/inspect.js";
import { DEFAULT_LIMITS } from "../core/limits.js";
import { ToolFailure } from "../schema/errors.js";
import { TOOL_ID, TOOL_VERSION } from "../schema/types.js";
import type { CheckLimits } from "../schema/types.js";

const HELP = `agent-cfml-check inspect --root <directory> <file> [file ...] [--lines <start:end>] [--json] [--pretty]\nagent-cfml-check inspect --root <directory> --baseline <file> <current-file> [--lines <start:end>] [--json] [--pretty]\n`;

function safeText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`);
}

function errorResult(failure: ToolFailure): InspectResult {
  return { schema_version: "2.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status: failure.exitCode === 3 ? "incomplete" : "error", complete: false, mode: "inspect", files: [], comparison: null, comparison_basis: null, errors: [{ code: failure.code, message: failure.message }], limits: DEFAULT_LIMITS };
}

function textResult(result: InspectResult): string {
  const lines = [`${result.status}: ${result.mode}`];
  for (const file of result.files) {
    lines.push(`${safeText(file.path)}: ${file.status}${file.range === null ? "" : ` (lines ${file.range.start}-${file.range.end})`}`);
    for (const item of [...file.unsupported, ...file.findings]) {
      const location = item.location === null ? "" : `:${item.location.start.line}:${item.location.start.column}`;
      lines.push(`  ${safeText(item.file)}${location}: ${item.code}: ${safeText(item.message)} [${item.confidence}]`);
      if (item.related_open !== null) lines.push(`    opening: ${item.related_open.start.line}:${item.related_open.start.column}`);
      lines.push(`    hint: ${item.hint}`);
    }
    for (const error of file.errors) lines.push(`  ${error.code}: ${safeText(error.message)}`);
  }
  if (result.comparison !== null) {
    if (result.comparison_basis !== null) lines.push(result.comparison_basis);
    for (const item of result.comparison) lines.push(`  ${item.classification}: ${item.finding.code} at ${item.finding.location?.start.line ?? "unknown"}`);
  }
  for (const error of result.errors) lines.push(`${error.code}: ${safeText(error.message)}`);
  return `${lines.join("\n")}\n`;
}

export function inspectMain(argv: readonly string[]): number {
  let json = argv.includes("--json");
  let pretty = false;
  try {
    if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { process.stdout.write(HELP); return 0; }
    const options: InspectOptions = { root: "", files: [], limits: {} };
    const seen = new Set<string>();
    const limitFlags: Record<string, keyof CheckLimits> = { "--max-source-bytes": "max_source_bytes", "--max-nesting": "max_nesting", "--max-findings": "max_findings", "--max-output-bytes": "max_output_bytes", "--time-limit-ms": "time_limit_ms" };
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index]!;
      if (arg === "--json" || arg === "--pretty") {
        if (seen.has(arg)) throw new ToolFailure("INVALID_ARGUMENT", `Duplicate option ${arg}`, 2);
        seen.add(arg);
        if (arg === "--json") json = true; else pretty = true;
        continue;
      }
      if (arg === "--root" || arg === "--baseline" || arg === "--lines" || limitFlags[arg] !== undefined) {
        if (seen.has(arg)) throw new ToolFailure("INVALID_ARGUMENT", `Duplicate option ${arg}`, 2);
        seen.add(arg);
        const value = argv[++index];
        if (value === undefined || value.startsWith("--")) throw new ToolFailure("INVALID_ARGUMENT", `${arg} requires a value`, 2);
        if (arg === "--root") options.root = value;
        else if (arg === "--baseline") options.baseline = value;
        else if (arg === "--lines") {
          const match = /^(\d+):(\d+)$/u.exec(value);
          if (match === null) throw new ToolFailure("INVALID_ARGUMENT", "--lines requires start:end", 2);
          options.range = { start: Number(match[1]), end: Number(match[2]) } as LineRange;
        } else {
          if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new ToolFailure("INVALID_ARGUMENT", `${arg} requires an integer`, 2);
          options.limits![limitFlags[arg]!] = Number(value);
        }
        continue;
      }
      if (arg.startsWith("-")) throw new ToolFailure("INVALID_ARGUMENT", `Unknown option ${arg}`, 2);
      options.files.push(arg);
    }
    if (pretty && !json) throw new ToolFailure("INVALID_ARGUMENT", "--pretty requires --json", 2);
    const checked = inspectFiles(options);
    let result = checked.result;
    let output = json ? `${JSON.stringify(result, null, pretty ? 2 : undefined)}\n` : textResult(result);
    let exitCode = checked.exit_code;
    if (Buffer.byteLength(output) > result.limits.max_output_bytes) {
      result = { ...result, status: "incomplete", complete: false, files: [], comparison: null, errors: [{ code: "LIMIT_EXCEEDED", message: "The output limit was reached; partial results were withheld" }] };
      output = json ? `${JSON.stringify(result)}\n` : textResult(result);
      exitCode = 3;
    }
    process.stdout.write(output);
    return exitCode;
  } catch (error) {
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INTERNAL_ERROR", "The inspection failed without a safe result", 1);
    const result = errorResult(failure);
    process.stdout.write(json ? `${JSON.stringify(result)}\n` : textResult(result));
    process.stderr.write(`error: ${failure.code}: ${safeText(failure.message)}\n`);
    return failure.exitCode;
  }
}
