---
name: agent-cfml-check
description: Use agent-cfml-check for deterministic, read-only structural checks of one explicitly selected CFML .cfm or .cfc file under an explicit root.
---

# Agent CFML Check

## Use when

Use this skill when a task needs bounded structural evidence about one CFML source file: tag nesting, `cfelse`/`cfelseif` ownership, bodyless-tag usage, nested CFML comments, quoted attributes, CFScript delimiters, or recognized pure-script `.cfc` structure.

Do not use it as a full CFML parser, formatter, compiler, SQL/HTML validator, include resolver, or Lucee/Adobe runtime compatibility test.

## Preconditions

- Identify the repository root and the exact source file.
- Confirm the file is one `.cfm` or `.cfc` file under that root.
- Prefer an already installed project/package binary. Do not use unpinned `npx` to download code implicitly.
- If the package is not installed, request or follow the project's approved dependency-install process.

## Commands

From a project with the package installed:

```sh
agent-cfml-check capabilities --json
agent-cfml-check check --root <root-directory> <source-file> --json
```

For this repository's checkout, the equivalent fallback is:

```sh
node dist/cli/index.js capabilities --json
node dist/cli/index.js check --root . <source-file> --json
```

Use `--pretty` only with `--json`. Check limits may be overridden with `--max-source-bytes`, `--max-nesting`, `--max-findings`, `--max-output-bytes`, and `--time-limit-ms`, subject to the hard caps reported by `capabilities`.

## Interpret results

- Exit `0` with `status: "ok"` is a completed result. Inspect `data.verdict`: `pass` means no reported structural findings; `violations` means findings were completed and must be reviewed.
- Exit `3` or `status: "incomplete"` means unsupported syntax, unstable input, insufficient evidence, or a resource limit. Never treat it as a clean result.
- Exit `4` means the explicit root/path policy rejected the request.
- Exit `2` means invalid arguments, limits, extension, or ordinary input rejection.
- Exit `1` means an unexpected internal failure without a safe result.

JSON stdout is the machine-readable envelope. Diagnostics may also appear on stderr. Validate the envelope against `schema/agent-cfml-check-result-v1.schema.json` when schema tooling is available.

## Safety boundary

The checker reads exactly one regular UTF-8 file, rejects root escapes and invalid input, never executes CFML, does not follow includes, does not access the network or database, and does not modify the inspected source tree. Unsupported/custom/imported tags and CFML tag islands inside `cfscript` fail closed.

Record the exact command, root/file scope, tool version, exit code, result status, verdict, finding codes, and any incomplete/error codes in the task evidence. Do not claim Lucee/Adobe compatibility or full-language coverage from this tool alone.
