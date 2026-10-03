# Agent Context Pack

Private, dependency-free source MVP (`agent-context-pack@0.1.0`, Apache-2.0). Assemble result artifacts that other AI-Agent-Tools already produced into one bounded, provenance-bearing pack for one explicit task. No npm release or universal agent compatibility is claimed. Node 22.13+ or Node 24 is required.

```sh
node packages/context-pack/src/cli.js pack --manifest examples/manifest.json --root packages/context-pack --json
```

The example packs a real Rules Resolve result (mandatory) and a real Patch Guard result (optional) under an 8,192-byte budget. Context Pack only selects, deduplicates, orders and counts supplied artifacts. It is **bounded context selection, not proof of the minimum context a task needs**, and it never decides relevance for you.

## What it does and does not do

Does: validate each artifact as a Hub result envelope; check it against the tool identity, digest and snapshot you declared; order items by your declared `mandatory` and `priority`; drop exact duplicates; keep the serialized result within a UTF-8 byte budget; report every omitted item with a stable reason.

Does not: run any other tool, build an execution graph, read source files, re-slice or merge source spans, score relevance, reason about the task, keep memory between runs, fetch Result Store locators (Result Store is still Planned), write files, use a network or an LLM, or adapt native contracts. The `target` in the manifest is an opaque label that is echoed back, not interpreted.

## Manifest (`context-pack-v1`)

One strict JSON file; unknown keys and duplicate keys are rejected. See [request schema](schema/request.schema.json) and [examples/manifest.json](examples/manifest.json).

```json
{
  "manifest_version": "1.0.0",
  "profile": "context-pack-v1",
  "task": { "id": "add-backend-module", "target": "src/backend/new.js" },
  "snapshot": "git:3f2a9c1",
  "budget": { "unit": "utf8-bytes", "max": 8192 },
  "items": [{
    "id": "rules",
    "artifact": "artifacts/rules-resolve.json",
    "tool": { "id": "agent-rules-resolve", "version": "0.1.0" },
    "snapshot": "git:3f2a9c1",
    "sha256": "<optional SHA-256 of the artifact file>",
    "mandatory": true,
    "priority": 100,
    "locators": [{ "path": "AGENTS.md", "start_line": 1, "end_line": 3 }]
  }]
}
```

- `artifact` is a root-relative `.json` path with `/` separators. Absolute paths, `..`, backslashes, symlinked components and files outside `--root` are rejected.
- `tool` is the tool id and exact version you expect. A mismatch with the artifact's own envelope is `ARTIFACT_MISMATCH`.
- `sha256` is optional but recommended: it binds the item to the exact artifact bytes.
- `mandatory` defaults to `false`; `priority` is an integer 0–1000 (default 0, higher first). `id` is `[A-Za-z0-9._-]`, at most 64 characters, unique.
- `locators` are optional one-based inclusive `path` + `start_line`/`end_line` spans of source that the item represents, declared by you. They are never read.

## Accepted artifacts

Only the Hub result envelope ([JSON standard](../../docs/JSON_STANDARD.md)) with `schema_version` major `1` is accepted. Native contracts (for example Code Slice's `schemaVersion`/`ok`/`result`) are **not** adapted; they are reported as `unsupported-contract`.

| Artifact | Optional item | Mandatory item |
| --- | --- | --- |
| `status: ok`, `complete: true`, consistent | included if it fits | included or `MANDATORY_OVERFLOW` |
| consistent `incomplete` or `error` envelope | omitted: `incomplete-evidence` | request fails: `INCOMPLETE_EVIDENCE` |
| native, wrong major, malformed or inconsistent envelope | omitted: `unsupported-contract` | request fails: `UNSUPPORTED_CONTRACT` |

An incomplete result is never treated as empty evidence. A missing, unreadable, non-UTF-8 or non-JSON artifact fails the whole request for every item, mandatory or not.

## Snapshot, identity and digest

The Hub envelope has no snapshot field, so the snapshot is **caller-declared**. Context Pack verifies that every item declares the manifest's snapshot (`SNAPSHOT_MISMATCH` otherwise, even for optional items) and that each artifact's tool id, version and optional digest match what you declared. It does **not** verify that an artifact was actually produced from that snapshot or that the snapshot matches any working tree. Treat it as a consistency check on your own declarations, not as attestation. `manifest_sha256` is the SHA-256 of the manifest file's exact bytes, so reordering items in the file changes that digest; the rest of the result does not depend on item order.

## Selection, order and budget

1. Items are processed in canonical order: mandatory first, then `priority` descending, then `id` ascending. Manifest order never matters.
2. An item is skipped as a duplicate if an already included item has the same artifact SHA-256 (`duplicate-artifact`). An optional item is also skipped when it declares locators and every one is an exact `path`+`start_line`+`end_line` match of an included item's locator (`duplicate-locator`). A mandatory item is never dropped for a locator duplicate; overlapping or partly identical spans are kept and listed in `data.overlaps`. Context Pack never merges spans — re-slicing source is Code Slice's job.
3. An item is included if the whole result still fits the budget. An optional item that does not fit is omitted (`budget`) and **later, smaller items are still tried**. This is greedy by rank, not optimal packing.
4. A mandatory item that does not fit fails the request with `MANDATORY_OVERFLOW`; nothing is clipped. If even the empty pack's metadata exceeds the budget the result is `BUDGET_TOO_SMALL`.

The budget unit is **UTF-8 bytes of the complete serialized result envelope plus its final line feed** — exactly what `--json` writes to stdout — so metadata (ids, tool identity, digests, locators, omissions, overlaps) counts, not only artifact payload. `data.budget.used` equals that length and never exceeds `budget.max`. Exact token counts need a pinned tokenizer and are unsupported (`UNSUPPORTED_INPUT`). The budget is separate from the tool's `max_output_bytes` safety cap: a result that fits its budget but exceeds the output cap becomes `RESOURCE_LIMIT`.

## Result and exit codes

[Result schema](schema/result.schema.json) describes the Hub `1.0.0` envelope. `data` contains the task, snapshot, `manifest_sha256`, `content_trust: "untrusted-data"`, `budget`, `counts`, `included` (rank order, each with tool identity, artifact path/digest/bytes, locators and the artifact's `data`), `omitted` (sorted by id, with reason and `duplicate_of`) and `overlaps`. Artifact `data` is re-serialized from parsed JSON, not byte-preserved; use the recorded SHA-256 to check the original file. Output has no timestamps or random values.

| Exit | Outcome / stable error codes |
| --- | --- |
| 0 | Complete pack (omissions are listed in `data.omitted`) or capabilities |
| 1 | `INTERNAL_ERROR` |
| 2 | `INVALID_INPUT`, `INVALID_ENCODING`, `INPUT_IO` |
| 3 | `UNSUPPORTED_INPUT`, `UNSUPPORTED_CONTRACT`, `INCOMPLETE_EVIDENCE`, `SNAPSHOT_MISMATCH`, `ARTIFACT_MISMATCH`, `MANDATORY_OVERFLOW`, `BUDGET_TOO_SMALL`, `RESOURCE_LIMIT`, `INPUT_CHANGED` |
| 4 | `UNSAFE_PATH` |

Incomplete and error results carry `data: null`; partial packs are never emitted. Failures are checked in a fixed order — manifest shape, snapshots, artifacts by ascending `id`, mandatory-item state, then budget — so the reported code never depends on manifest item order.

## CLI

```text
agent-context-pack pack --manifest FILE.json [--root DIR] [--json]
agent-context-pack capabilities [--json]
agent-context-pack --help | --version
```

`--root` (default: working directory) contains the manifest and every artifact; `--manifest` is resolved under it. No stdin, network or process execution. Each cap below is also a hard maximum; a flag can only lower it, and `max_budget_bytes` bounds the manifest's `budget.max`.

| Flag | JSON limit | Maximum / unit |
| --- | --- | --- |
| `--max-items` | `max_items` | 64 declared items |
| (no flag) | `max_locators` | 16 locators per item |
| (no flag) | `max_manifest_bytes` | 65,536 bytes |
| `--max-artifact-bytes` | `max_artifact_bytes` | 262,144 bytes per artifact |
| `--max-total-bytes` | `max_total_bytes` | 1,048,576 artifact bytes in total |
| `--max-budget-bytes` | `max_budget_bytes` | 1,048,576 (minimum manifest budget 1,024) |
| `--max-output-bytes` | `max_output_bytes` | 1,048,576 serialized bytes including final LF (minimum 1,024) |

JSON nesting is limited to 64 levels. Invalid caps are input errors.

```js
import { packContext, encodeResult, exitCode } from 'agent-context-pack';
const result = packContext({ root: '/absolute/work', manifest: 'manifest.json', limits: { max_items: 16 } });
const encoded = encodeResult(result); // Applies the output cap; does not append LF.
process.exitCode = exitCode(JSON.parse(encoded));
```

## Safety

Artifact content is untrusted data. It is passed through verbatim and never interpreted: text that looks like instructions, `mandatory`/`priority` fields, paths or `__proto__` keys inside an artifact cannot change selection, read files or execute anything. Consumers must keep treating `included[].data` as evidence, not as instructions (`content_trust` says so). The tool opens only the manifest and the artifacts it names, under the explicit root, and rejects symlinks, special files and observed substitution during capture. It never writes files. This is process-level discipline, not an OS sandbox, and it does not defend against arbitrary hostile concurrent filesystem mutation.

## Provenance of the examples

`examples/artifacts/rules-resolve.json` and `patch-guard.json` are unmodified outputs of the sibling source packages at version 0.1.0:

```sh
node packages/rules-resolve/src/cli.js resolve --root packages/rules-resolve/examples/project --target src/backend/new.js --target-kind file --profile agents-chain-v1 --include-content --json
node packages/patch-guard/src/cli.js check --diff examples/safe.diff --policy examples/policy.json --root packages/patch-guard --json
```

`patch-guard-error.json` is the real `error` envelope Patch Guard returned when invoked with a wrong `--diff` path; it is the incomplete-evidence fixture. The example snapshot `fixture:examples-v1` is a label, not a Git revision.

## Verification

```sh
npm --prefix packages/context-pack ci --ignore-scripts
npm --prefix packages/context-pack test
npm --prefix packages/context-pack run typecheck
npm --prefix packages/context-pack run smoke:pack
```

Root verification discovers this package. Tests cover canonical and permuted ordering, exact byte accounting at the budget boundary (including that the CLI's `used` equals stdout bytes), digest and locator duplicates, mandatory and optional overflow, incomplete and unsupported envelopes, snapshot/identity/digest mismatch, manifest shape, unsafe paths and symlinks, duplicate JSON keys, non-UTF-8 input, resource and output caps, hostile artifact text, read-only behavior, schemas, declarations and a packed consumer. Only macOS has been exercised; Windows and Linux are unverified.
