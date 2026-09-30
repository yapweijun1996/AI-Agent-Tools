#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import {
  capabilities,
  compareContracts,
  readJson,
  selectPointer,
  encodeResult,
  exitCode,
  invalid,
} from "./index.js";
const HELP = `agent-contract-check compare --before FILE --after FILE [--before-pointer POINTER] [--after-pointer POINTER] [--json]
agent-contract-check capabilities [--json]
Read-only JSON Schema acceptance comparison. Exit: compatible=0, potential-breaking=1, invalid=2, unknown=3.
Patterns are not assumed equivalent. API/MCP inputs must select actual JSON Schema input contracts.
`;
export function runCli(args = process.argv.slice(2)) {
  args = [...args];
  const json = args.includes("--json");
  if (args.includes("--help") || args.length === 0) {
    console.log(HELP);
    return 0;
  }
  let result;
  try {
    const operation = args.shift(),
      flags = {};
    while (args.length) {
      const k = args.shift();
      if (
        ![
          "--json",
          "--before",
          "--after",
          "--before-pointer",
          "--after-pointer",
          "--samples",
        ].includes(k) ||
        Object.hasOwn(flags, k)
      )
        throw invalid();
      if (k === "--json") flags[k] = true;
      else {
        if (!args.length || args[0].startsWith("--")) throw invalid();
        flags[k] = args.shift();
      }
    }
    if (operation === "capabilities") {
      if (Object.keys(flags).some((x) => x !== "--json")) throw invalid();
      result = capabilities();
    } else if (operation === "compare" && flags["--before"] && flags["--after"])
      result = compareContracts(
        selectPointer(readJson(flags["--before"]), flags["--before-pointer"]),
        selectPointer(readJson(flags["--after"]), flags["--after-pointer"]),
        {
          beforePointer: flags["--before-pointer"],
          afterPointer: flags["--after-pointer"],
          samples: flags["--samples"]
            ? readJson(flags["--samples"])
            : undefined,
        },
      );
    else throw invalid();
  } catch {
    result = {
      schemaVersion: "1.0",
      tool: "agent-contract-check",
      operation: "compare",
      status: "error",
      complete: false,
      data: null,
      diagnostics: [
        {
          code: "INVALID_INPUT",
          message: "Unable to compare bounded valid schema inputs",
        },
      ],
    };
  }
  const output = encodeResult(result);
  console.log(
    json
      ? output
      : JSON.parse(output).status +
          "\n" +
          (JSON.parse(output).data?.changes ?? [])
            .map((x) => `${x.classification}: ${x.pointer} (${x.reason})`)
            .join("\n"),
  );
  return exitCode(JSON.parse(output));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = runCli();
