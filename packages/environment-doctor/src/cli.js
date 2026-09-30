#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  capabilities,
  checkEnvironment,
  collectSnapshot,
  encodeResult,
  exitCode,
  invalid,
  readJson,
} from "./index.js";
const HELP = `agent-env-doctor check --requirements FILE [--snapshot FILE | --live] [--manifest package.json] [--probe-paths] [--json]\nagent-env-doctor capabilities [--json]\nOffline by default. Live probes are explicit fixed version commands; paths require --probe-paths.\nExit: 0 pass, 1 fail, 2 invalid input, 3 unknown; no install or auto-fix.`;
export function runCli(args) {
  if (args.includes("--help") || args[0] === "help" || args.length === 0)
    return { stdout: HELP + "\n", code: 0 };
  let result;
  const json = args.includes("--json");
  try {
    const command = args[0];
    const options = {};
    for (let i = 1; i < args.length; i++) {
      const flag = args[i];
      if (["--json", "--live", "--probe-paths"].includes(flag)) {
        if (options[flag]) throw invalid();
        options[flag] = true;
      } else if (
        ["--requirements", "--snapshot", "--manifest"].includes(flag) &&
        args[i + 1] &&
        !args[i + 1].startsWith("--")
      ) {
        if (options[flag]) throw invalid();
        options[flag] = args[++i];
      } else throw invalid("Unknown or incomplete option");
    }
    if (command === "capabilities") {
      if (Object.keys(options).some((k) => k !== "--json")) throw invalid();
      result = capabilities();
    } else if (command === "check") {
      if (
        !options["--requirements"] ||
        Boolean(options["--snapshot"]) === Boolean(options["--live"]) ||
        (options["--probe-paths"] && !options["--live"])
      )
        throw invalid(
          "Provide requirements and exactly one snapshot or explicit live mode",
        );
      const requirements = readJson(options["--requirements"]);
      const manifest = options["--manifest"]
        ? readJson(options["--manifest"])
        : undefined;
      let probeRequirements = requirements;
      if (manifest?.engines) {
        probeRequirements = {
          ...requirements,
          runtimes: {
            ...requirements.runtimes,
            ...Object.fromEntries(
              Object.entries(manifest.engines).filter(([k]) =>
                ["node", "npm"].includes(k),
              ),
            ),
          },
        };
      }
      const snapshot = options["--live"]
        ? collectSnapshot(probeRequirements, {
            probePaths: options["--probe-paths"],
            baseDirectory: path.dirname(
              path.resolve(options["--requirements"]),
            ),
          })
        : readJson(options["--snapshot"]);
      result = checkEnvironment(requirements, snapshot, {
        requirementsSource: options["--requirements"],
        snapshotSource:
          options["--snapshot"] ?? "live-version-and-presence-probes",
        manifest,
        manifestSource: options["--manifest"],
      });
    } else throw invalid("Unknown command");
  } catch {
    result = {
      schemaVersion: "1.0",
      tool: "agent-env-doctor",
      operation: "check",
      status: "error",
      complete: false,
      data: null,
      diagnostics: [
        {
          code: "INVALID_INPUT",
          message: "Invalid, unavailable or oversized input; use --help",
        },
      ],
    };
  }
  const encoded = encodeResult(result);
  const bounded = JSON.parse(encoded);
  return {
    stdout: json
      ? encoded + "\n"
      : `${bounded.tool}: ${bounded.status}\n` +
        (bounded.data?.checks ?? [])
          .map((x) => `${x.status} ${x.id}: ${x.reason}`)
          .join("\n") +
        "\n",
    code: exitCode(bounded),
  };
}
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = runCli(process.argv.slice(2));
  process.stdout.write(out.stdout);
  process.exitCode = out.code;
}
