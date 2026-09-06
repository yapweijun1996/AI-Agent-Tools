# CLI standard

This is the target CLI contract for conforming tools, not an assertion that listed tools implement it today. Tools document their actual executable name, commands, supported runtime versions, and inputs in their own repository.

Known adoption gap: Code Slice uses its own versioned exit codes and can return a
bounded outline with a warning and exit 0; Change Impact's draft also allows partial
success. Do not reinterpret either as this contract. Compatibility work remains
HUB-04 in [TASK.md](../TASK.md); this clarification changes no target exit semantics.

## Invocation and streams

- Provide `--help`, `--version`, and `--json`. Help/version requests are explicit text modes; analysis with `--json` produces exactly one [JSON envelope](JSON_STANDARD.md), including handled failures.
- In JSON mode, stdout contains only UTF-8 JSON followed by a newline: no banners, progress, ANSI escapes, or diagnostics. stderr carries bounded diagnostics. Do not mix JSON objects or emit NDJSON unless a separately versioned streaming contract is explicitly introduced.
- Never prompt interactively in JSON mode. Reject unknown flags and missing or conflicting inputs.
- Document path resolution relative to the caller's working directory, the explicit repository root, glob/ignore semantics, stdin support, and encodings. Do not silently search outside the selected root.
- Core operations require no network. Do not install dependencies, run project scripts, or execute commands discovered in repository content as a side effect of analysis.

## Bounds and determinism

Declare finite defaults and hard maximums for applicable file count, bytes read, file size, traversal depth, output bytes/items, and processing time. Provide documented overrides within hard caps. Sort outputs predictably and define tie-breaking. Equivalent normalized inputs and the same tool version/configuration must yield equivalent results; disclose unavoidable variability.

Resource exhaustion produces `incomplete`, `complete: false`, and exit code `3`; do not silently clip a successful answer. Reserve enough output space for a valid bounded failure envelope even when results exceed the output cap. Invalid requested limits are input errors.

## Exit codes

| Code | Meaning | JSON status |
| --- | --- | --- |
| `0` | Complete supported analysis | `ok` |
| `1` | Execution or internal failure | `error` |
| `2` | Invalid invocation, input, or configuration | `error` |
| `3` | Unsupported input, insufficient evidence, or resource limit | `incomplete` |
| `4` | Explicit policy or security boundary rejection | `error` |

A completed check that finds violations can still exit `0`: its tool-specific `data` contract must express findings or a verdict. Consumers must inspect that contract as well as the exit code; `0` does not mean a patch or release is approved. An inconclusive check must use `3`.

Consumers must handle missing/malformed output and abnormal process termination as failures; operating-system kills cannot guarantee a JSON envelope. There are no automatic retries or fallbacks that turn uncertainty into success.

## Side effects and compatibility

Read-only is the default. Any approved write mode must be explicit, narrowly scoped, documented with preview and rollback behavior, and separate from ordinary analysis. Shell/platform-specific behavior must be documented and tested. Changes to flags, defaults, exit meanings, or output semantics follow [Release standard](RELEASE_STANDARD.md).
