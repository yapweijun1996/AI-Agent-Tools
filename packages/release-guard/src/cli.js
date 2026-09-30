#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import {
  capabilities,
  verifyDeployment,
  readJson,
  encodeResult,
  exitCode,
  invalid,
} from "./index.js";
const HELP = `agent-release-guard deploy-verify --input FILE [--json]\nagent-release-guard capabilities [--json]\nOffline evidence only. No deployment, network, command execution or PWA installation claim.\nExit 0 pass, 1 fail, 2 invalid input, 3 unknown.\n`;
export function runCli(args) {
  if (!args.length || args.includes("--help")) return { stdout: HELP, code: 0 };
  const json = args.includes("--json");
  let result;
  try {
    const [op, ...rest] = args,
      flags = {};
    for (let i = 0; i < rest.length; i++) {
      const k = rest[i];
      if (own(flags, k)) throw invalid();
      if (k === "--json") flags[k] = true;
      else if (k === "--input" && rest[i + 1] && !rest[i + 1].startsWith("--"))
        flags[k] = rest[++i];
      else throw invalid();
    }
    if (op === "capabilities" && !flags["--input"]) result = capabilities();
    else if (op === "deploy-verify" && flags["--input"])
      result = verifyDeployment(readJson(flags["--input"]));
    else throw invalid();
  } catch {
    result = {
      schemaVersion: "1.0",
      tool: "agent-release-guard",
      operation: "deploy-verify",
      status: "error",
      complete: false,
      data: null,
      diagnostics: [
        {
          code: "INVALID_INPUT",
          message: "Provide valid bounded sanitized evidence; use --help",
        },
      ],
    };
  }
  const bounded = JSON.parse(encodeResult(result));
  return {
    stdout: json
      ? JSON.stringify(bounded) + "\n"
      : `${bounded.tool}: ${bounded.status}\n` +
        (bounded.data?.checks ?? [])
          .map((x) => `${x.status} ${x.id}: ${x.reason}`)
          .join("\n") +
        "\n",
    code: exitCode(bounded),
  };
}
const own = (o, k) => Object.hasOwn(o, k);
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const out = runCli(process.argv.slice(2));
  process.stdout.write(out.stdout);
  process.exitCode = out.code;
}
