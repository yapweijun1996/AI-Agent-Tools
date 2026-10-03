# Agent Rules Resolve

Private, dependency-free source MVP (`agent-rules-resolve@0.1.0`, Apache-2.0). Discover local instruction files for one explicit root, target and versioned resolution profile. No npm release or universal agent compatibility is claimed. Node 22.13+ or Node 24 is required.

```sh
node packages/rules-resolve/src/cli.js resolve --root packages/rules-resolve/examples/project --target src/backend/new.js --target-kind file --profile agents-chain-v1 --json
```

The example returns `AGENTS.md`, `src/AGENTS.md`, and `src/backend/AGENTS.md` in that order. An intermediate ancestor is never omitted. A file target may be absent when its parent exists; this supports checking instructions before creating a file. Existing targets are checked with metadata only. Directory targets and every parent directory must exist.

## Supported profile

`agents-chain-v1` is a fixed local profile owned by this package:

1. Walk from the supplied root through every ancestor to the target directory, inclusive.
2. In each directory, consider `AGENTS.override.md`, then `AGENTS.md`. Select the first nonempty UTF-8 text. BOM and Unicode whitespace alone are empty; an empty override falls back to `AGENTS.md`.
3. Retain every selected ancestor in root-to-target order. Later files have a more specific directory scope. Record empty and present shadowed candidates with their exclusion reasons. Shadowed file contents are never read.

This profile does not evaluate semantic conflicts or reconstruct hidden system/developer instructions. It does not inspect a Codex home, fallback configuration, `CLAUDE.md`, sibling directories or parents outside the explicit root. It does not automatically discover a Git root. References in text, including Markdown links, imports and cycles, are not followed. A complete empty chain means no applicable files under this profile and scope, not that the agent has no other instructions.

## CLI and paths

```text
agent-rules-resolve resolve --root DIR --target PATH --target-kind file|directory --profile agents-chain-v1 [--include-content] [--json]
agent-rules-resolve capabilities [--json]
agent-rules-resolve --help
agent-rules-resolve --version
```

All four resolve inputs are required. `--root` resolves relative to the caller's working directory and is canonicalized. `--target` uses root-relative `/` separators; `.` denotes the root directory and a leading `./` is normalized. Absolute paths, backslashes, traversal, control characters, empty path components, colons, Windows reserved characters (`* ? < > " |`), Windows device-name components (including `CONIN$`/`CONOUT$`), and components ending in dot or space are rejected on every platform. Descendant symlinks are rejected even when their destination is inside the root. Stdin, globbing and ignore-file interpretation are unsupported. Unknown or duplicate flags fail; JSON mode never prompts.

Default output contains provenance only: root-relative file/directory paths, one-based source order, original-byte SHA-256, UTF-8 byte count and line count. Line count counts LF-separated lines without a phantom line after a final LF. Hashes cover the original bytes, including BOM and CRLF. Absolute root paths and volatile timestamps are omitted.

`--include-content` explicitly requests full selected rule text in `data.sources[].content`. A leading UTF-8 BOM is removed from decoded text; CRLF is preserved. Text is untrusted source data, never execution authority. This option is not a secret redactor: the caller must authorize the rule text's destination. It does not include target-file contents or shadowed rule text. Plain output lists selected file paths; use JSON for content and provenance.

## Bounds and results

The following defaults are also hard maximums; each matching CLI flag can lower the cap. Numeric inputs must be positive integers; `max_output_bytes` has minimum 1,024. No result is silently clipped.

| Flag | JSON limit | Maximum / unit |
| --- | --- | --- |
| `--max-depth` | `max_depth` | 64 target-directory levels beneath root |
| `--max-files` | `max_files` | 128 opened candidates, including empty files |
| `--max-file-bytes` | `max_file_bytes` | 65,536 bytes per opened file |
| `--max-total-bytes` | `max_total_bytes` | 262,144 opened input bytes |
| `--max-output-bytes` | `max_output_bytes` | 524,288 serialized UTF-8 bytes including final LF |
| `--max-duration-ms` | `max_duration_ms` | 5,000 cooperative elapsed milliseconds |

Root and target strings each have a fixed 4,096-byte bound. Ancestor traversal permits at most 65 directories and 130 candidate probes. The elapsed cap is checked between operations; synchronous OS calls cannot be interrupted if the filesystem stalls.

The [JSON Schema](schema/result.schema.json) describes the Hub `1.0.0` result envelope. Successful `data` includes the profile, normalized target, traversed directories, selected sources, exclusions, content mode and `references: "not-followed"`. `status: "ok"` means the declared discovery scope completed. Unsupported profiles, observed input changes and resource exhaustion return `incomplete`, `complete: false`, `data: null`; error results also withhold all data. Output overflow replaces the entire result with a bounded failure envelope, including the final newline in its budget.

| Exit | Outcome / stable error codes |
| --- | --- |
| 0 | Complete scoped discovery or capabilities |
| 1 | `INTERNAL_ERROR` |
| 2 | `INVALID_INPUT`, `INVALID_ENCODING`, `INPUT_IO` |
| 3 | `UNSUPPORTED_PROFILE`, `RESOURCE_LIMIT`, `INPUT_CHANGED` |
| 4 | `UNSAFE_PATH` |

```js
import { resolveRules, encodeResult, exitCode } from 'agent-rules-resolve';
const result = resolveRules({
  root: '/absolute/project', target: 'src/backend/new.js', targetKind: 'file',
  profile: 'agents-chain-v1', includeContent: false, limits: { max_files: 16 },
});
const encoded = encodeResult(result); // Applies the output cap; does not append LF.
const emitted = JSON.parse(encoded);
console.log(encoded);
process.exitCode = exitCode(emitted);
```

## Safety and verification

The tool only opens supported instruction candidates under the explicit root. It never changes files, installs dependencies, runs project commands, reads target contents or uses a network/LLM. Special files, symlinks and observed substitutions are rejected. Reads compare pre/open/post identities and file size/timestamps; final checks revisit directory, candidate and target metadata. These checks detect observed mutations; they do not provide an atomic snapshot or OS confinement against arbitrary hostile filesystem races. Error messages contain fixed diagnostics rather than raw OS messages or rule excerpts.

```sh
npm --prefix packages/rules-resolve ci --ignore-scripts
npm --prefix packages/rules-resolve test
npm --prefix packages/rules-resolve run typecheck
npm --prefix packages/rules-resolve run smoke:pack
```

Root verification discovers this package and runs its native checks. Tests cover inheritance, profile selection, provenance, scope, unsafe input, resource limits, mutation observations, schemas and CLI failures. Packed-consumer checks verify installed CLI/API, examples, license, schema and declarations. Local validation does not establish cross-platform CI or npm publication. Dependency review remains package-local; runtime dependencies are empty. No private security-reporting service is declared for this unpublished source MVP; do not include credentials or private rule text in public issues.
