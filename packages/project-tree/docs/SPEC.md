# MVP Spec

## Commands

- `context`: full bounded graph envelope.
- `impact`: path-scoped impacted nodes plus reverse local import and filename-linked test edges.
- `changed`: read-only Git HEAD comparison using `.git` metadata and loose or packed object files; emits bounded root-relative changed paths and never executes Git or target project commands.
- `tests-for`: test nodes linked by local imports and filename heuristics.
- `evidence`: evidence-plane nodes.
- `goals`: goal/work docs, discovered by filename pattern only (e.g. `GOAL.md`, `ROADMAP.md`, `TASK.md`, `EPIC.md`, `PROGRESS.md`); it does not parse task status or content.
- `progress`: progress/task docs, discovered by filename pattern only (e.g. `PROGRESS.md`, `TASK.md`); it does not parse task status or content.
- `path-to-done`: a fixed, non-project-specific checklist of scan/inspect/verify steps plus available test-evidence nodes; it is not a computed critical path over real task state.

## Non-goals

No server, database, cloud dependency, API key, LLM dependency, telemetry, or target project command execution.

## JS/TS dependency edges

The scanner extracts static local-only JavaScript/TypeScript edges from `import`, `export ... from`, dynamic `import("./x")`, and `require("./x")` forms. Bare package specifiers are intentionally ignored in the MVP to keep the graph local and bounded.

## Package and test evidence

The scanner includes static evidence adapters that read only repository files already within the bounded scan. Package evidence is derived from `package.json`, npm/pnpm/Yarn/Bun lock or workspace/config files, the `packageManager` field, `engines`, scripts, workspaces, and dependency declaration blocks. Script text is inert data and is never executed. Conflicting package-manager signals are surfaced as `package-manager` evidence with `status: "conflict"`; malformed package JSON becomes deterministic `package` evidence with `status: "malformed"` rather than crashing the scan.

Test evidence remains file-node based for deterministic `tests-for` compatibility and is enriched by static framework signals from package declarations, scripts, config filenames, and test-file imports. The MVP recognizes Node built-in `node:test` plus common JS/TS frameworks when explicit evidence exists; it does not run test runners or infer a single framework winner from ambiguous evidence.

## Git changed adapter

The `changed` query compares scanned workspace files with the current Git `HEAD` tree by reading `.git/HEAD`, refs, packed refs, and Git object data directly — both loose objects and objects stored in `.git/objects/pack/*.pack` (including `OFS_DELTA`/`REF_DELTA` chains), resolved via each pack's `.idx`. This covers the common case of a fresh `git clone` or any repository that has run `git gc`/`git repack`, where objects are packed rather than loose. It reports `modified`, `deleted`, and `untracked` root-relative paths. It is intentionally read-only, does not inspect the index/staging area, does not invoke `git`, and reports unavailable only when HEAD itself cannot be resolved (no `.git` directory, unresolvable ref, or an object that is genuinely missing/corrupt in both loose and packed storage) — each `changed` response includes a `note` explaining which case applied.

## JSON schema and compatibility

Public graph/query envelopes are described by the hand-maintained JSON Schema at `schemas/aptree.schema.v1.json`, packaged in npm and exported as `ai-agent-tool-project-tree/schema`. The schema covers the stable envelope, graph node/edge, metadata, provenance/freshness, change adapter, and command-specific optional arrays. During the `0.x` package phase, additive optional fields, new evidence/node kinds, and new edge kinds are compatible when existing required fields and path/ID semantics remain unchanged. Removing or renaming required fields, changing stable field types or meanings, or changing root-relative path and stable ID semantics is breaking and requires compatibility/schema-version work. Schema versions may advance for compatible clarifications and must advance for breaking public JSON contract changes; npm versions communicate package delivery and may include the same schema version across patch/minor releases. Consumers should ignore unknown optional fields and unknown node/evidence kinds they do not understand.
