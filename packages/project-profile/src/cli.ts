import { createErrorProfile, profileRepository } from "./core/profiler.js";
import { TOOL_VERSION } from "./constants.js";
import type { Profile } from "./types.js";

interface ParsedArgs {
  root: string | null;
  format: "json" | "text";
  pretty: boolean;
  strict: boolean;
  help: boolean;
  version: boolean;
}

class CliUsageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

const HELP = `agent-project-profile — deterministic, read-only repository profiling

Usage:
  agent-project-profile <directory> [--format json|text] [--pretty] [--strict]
  agent-project-profile --help
  agent-project-profile --version

The profiler reads bounded repository metadata only. It never executes project
commands, installs dependencies, uses the network, reads secrets, or writes
the inspected repository.
`;

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    const message = error instanceof CliUsageError ? error.message : "Invalid command-line arguments.";
    const profile = createErrorProfile("INVALID_ARGUMENT", message);
    process.stdout.write(`${JSON.stringify(profile)}\n`);
    process.stderr.write(`error: INVALID_ARGUMENT: ${message}\n`);
    return 1;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }
  if (args.root === null) {
    const profile = createErrorProfile("INVALID_ARGUMENT", "A single inspection directory is required.");
    return printProfile(profile, "json", false, false, "A single inspection directory is required.");
  }
  if (args.pretty && args.format !== "json") {
    const profile = createErrorProfile("INVALID_ARGUMENT", "--pretty is valid only with --format json.");
    return printProfile(profile, "json", false, false, "--pretty is valid only with --format json.");
  }
  const profile = profileRepository(args.root, { pretty: args.pretty });
  return printProfile(profile, args.format, args.pretty, args.strict);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let root: string | null = null;
  let format: "json" | "text" = "json";
  let pretty = false;
  let strict = false;
  let help = false;
  let version = false;
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
    if (argument === "--pretty") {
      pretty = true;
      continue;
    }
    if (argument === "--strict") {
      strict = true;
      continue;
    }
    if (argument === "--format" || argument.startsWith("--format=")) {
      const value = argument === "--format" ? argv[++index] : argument.slice("--format=".length);
      if (value !== "json" && value !== "text") throw new CliUsageError("--format must be json or text.");
      format = value;
      continue;
    }
    if (argument.startsWith("--")) throw new CliUsageError(`Unknown flag ${argument}.`);
    if (root !== null) throw new CliUsageError("Only one inspection directory may be supplied.");
    root = argument;
  }
  if (help && (version || root !== null || pretty || strict || format !== "json")) throw new CliUsageError("--help cannot be combined with other options.");
  if (version && (root !== null || pretty || strict || format !== "json")) throw new CliUsageError("--version cannot be combined with other options.");
  return { root, format, pretty, strict, help, version };
}

function printProfile(
  profile: Profile,
  format: "json" | "text",
  pretty: boolean,
  strict: boolean,
  extraDiagnostic?: string,
): number {
  if (format === "json") {
    process.stdout.write(`${JSON.stringify(profile, null, pretty ? 2 : undefined)}\n`);
  } else {
    process.stdout.write(renderText(profile));
  }
  for (const warning of profile.warnings) {
    const prefix = warning.severity === "error" ? "error" : warning.severity === "warning" ? "warning" : "info";
    process.stderr.write(`${prefix}: ${warning.code}: ${warning.message}\n`);
  }
  if (extraDiagnostic !== undefined && !profile.warnings.some((warning) => warning.message === extraDiagnostic)) {
    process.stderr.write(`error: INVALID_ARGUMENT: ${extraDiagnostic}\n`);
  }
  if (profile.status === "error") return 1;
  if (profile.status === "partial" || profile.status === "unsupported") return 2;
  if (strict && profile.warnings.some((warning) => warning.severity === "warning" || warning.severity === "error")) return 2;
  return 0;
}

function renderText(profile: Profile): string {
  const lines = [
    "agent-project-profile",
    `status: ${profile.status}`,
    `project: ${profile.project.name ?? "unknown"}`,
    `kind: ${profile.project.kind}`,
    `repository: ${profile.project.repository.kind}`,
    `package-manager: ${profile.packageManager.name ?? "unknown"}${profile.packageManager.version ? `@${profile.packageManager.version}` : ""}`,
    `workspace: ${profile.workspace.enabled === null ? "unknown" : profile.workspace.enabled ? `${profile.workspace.returned}${profile.workspace.total === null ? "+" : `/${profile.workspace.total}`} packages` : "disabled"}`,
    "commands:",
  ];
  for (const [purpose, commands] of Object.entries(profile.commands)) {
    const values = commands.map((command) => `${command.cwd}:${command.script}${command.argv === null ? " (argv unavailable)" : ` (${command.argv.join(" ")})`}`);
    lines.push(`  ${purpose}: ${values.length > 0 ? values.join(", ") : "none"}`);
  }
  lines.push(`runtimes: ${profile.runtimes.length}`, `entrypoints: ${profile.entrypoints.length}`, `configs: ${profile.configs.length}`, `instructions: ${profile.instructions.length}`, `ci: ${profile.ci.length}`, `warnings: ${profile.warnings.length}`);
  return `${lines.join("\n")}\n`;
}
