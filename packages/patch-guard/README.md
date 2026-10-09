# Agent Patch Guard

Check a supplied Git unified diff against an explicit machine-readable policy.
The tool reports changed paths, line counts and exact rule IDs without applying
the patch, executing Git or reading changed source files. It works locally with
no LLM, API key, runtime dependency or network service.

This is a private `agent-patch-guard@0.1.0` source package under Apache-2.0.
Its source, tests and CLI are separate from npm publication and Hub protocol
conformance. No public release or universal patch-safety guarantee is claimed.

## Run

Node 22.13+ in the 22 line or Node 24 is supported. From this package directory:

```sh
node src/cli.js capabilities --json
node src/cli.js check --root . --diff examples/safe.diff --policy examples/policy.json --origin snapshot --json
node src/cli.js --help
```

From the repository root, use `node packages/patch-guard/src/cli.js` and set
`--root packages/patch-guard` for the same relative example paths. An explicit
local installation can expose `agent-patch-guard`; there is no published npm
identity for AIT installation in this source MVP.

`--root` defaults to the working directory. Relative input paths resolve within
that root; absolute paths must remain inside it. The diff artifact must end in
`.diff` or `.patch`, and the policy artifact in `.json`. The CLI resolves the
explicit root, rejects symlink child components and out-of-root inputs, and reads
only these two supplied artifacts. Policy JSON must have unique keys and stay
within the parser's depth bound of 32.

Path and file-identity checks reject observed boundary changes before returning
captured bytes. This is a local snapshot reader, with no OS sandbox or confinement
guarantee against arbitrary concurrent hostile filesystem mutation.

`--origin staged|unstaged|untracked|snapshot` is the caller's evidence label;
the tool does not certify Git state or compare the artifact with the worktree.
`untracked` accepts added-file patches only. `snapshot` is the default.

The current source accepts LF or CRLF framing on Git metadata headers and
no-newline markers. Only those structural lines lose a final framing CR; added,
deleted and context source lines retain their original CR characters. This does
not normalize the proposed source change or weaken relative-path checks.

## Policy

The policy [schema](schema/policy.schema.json) and [example](examples/policy.json)
define the supported `schema_version: "1.0.0"` format. `allowed_paths` is required
and nonempty. A selector is an exact root-relative path, a directory prefix ending
in `/`, or `*` for the entire declared root. Arbitrary globs and regular expressions
are unsupported. Matching is literal and case-sensitive.

`protected_paths`, `generated_paths` and `lockfile_paths` are explicit selector
lists, defaulting to empty. The tool does not guess generated or lockfile status
from filenames. Deletions, renames, binary changes, symlink mode changes, generated
paths and lockfiles require their respective `allow_deletions`, `allow_renames`,
`allow_binary`, `allow_symlinks`, `allow_generated` and `allow_lockfiles` booleans;
all default to false. Protected paths remain separately governed by policy.

`max_files`, `max_added_lines` and `max_deleted_lines` are optional policy
thresholds. The file threshold is positive; line thresholds may be zero. Exceeding
them produces findings rather than silently excluding changes.

`content_rules` match literal nonempty `needle` strings of up to 128 characters
against added lines. Each rule has a unique safe `id` of up to 64 characters and
an explicit `error` or `warning` severity. They are policy matches, not proof of
defects or comprehensive secret detection. Results contain locators, never source
snippets or matched text.

`exceptions` contain a supported `rule_id` and nonempty `paths` selectors.
They suppress only matching path-local findings and appear in `exceptions_applied`.
Global size thresholds cannot be waived by a path exception. Rule IDs are:

```text
OUT_OF_SCOPE PROTECTED_PATH DELETION RENAME BINARY SYMLINK
GENERATED_PATH LOCKFILE MAX_FILES MAX_ADDED_LINES MAX_DELETED_LINES
```

## Diff coverage

The parser supports explicit `diff --git` unified patches, text hunks with
validated line counts, added/deleted files, rename metadata, mode metadata and
binary-change markers. Space-containing filenames are supported only when the
path pair is unambiguous, including Git's terminal tab delimiter on file markers.
The format reference is Git's primary
[diff format documentation](https://git-scm.com/docs/diff-format); this package
implements the declared subset and does not claim complete Git parser coverage.

Quoted or escaped path syntax, ambiguous path pairs, copy records, Git binary
payloads, submodule/gitlink patches, combined diffs and unsupported metadata
return `incomplete` with no data. A hunk whose declared body ends early is
incomplete evidence and returns exit 3 with no data. Malformed syntax, extra hunk
body and contradictory line counts are invalid input and return exit 2. Unsafe paths are
rejected. An empty supplied patch may complete with zero files; it proves only
that the supplied artifact contains no changes.

A rename without changed content must declare 100% similarity. A lower-similarity
rename with no supplied content is incomplete. Mode and symlink classifications
come from supplied patch metadata; absent metadata does not establish actual
filesystem file type or mode.

Binary markers establish only that binary content changed. Their contents are
uninspected; any configured content rule or added/deleted-line policy threshold
makes a binary-marker patch incomplete, even when `allow_binary` is true.

Rename checks consider both the previous and current path. Content locations are
one-based destination line numbers for added lines, with one-based `diff_line`
coordinates into the supplied artifact. File-level and global findings may have
null line or path values. The JSON [result schema](schema/result.schema.json)
defines these fields.

## Results, limits and exits

The result uses the Hub-style `schema_version: "1.0.0"` envelope with
`tool: {id, version}`, `status`, `complete`, `data`, `errors`, `warnings`, and
`meta` containing scope and effective limits. A complete check returns
`data.verdict: "pass" | "violations"`, the supplied origin, file and line
summaries, changed-file records, findings and applied exceptions. `violations`
means at least one unsuppressed error finding. Warning findings can coexist with
`pass`. Inspect `data.verdict` and findings: exit 0 does not mean policy approval.

| Exit | Meaning |
| --- | --- |
| 0 | Completed capabilities or check, including a check with findings |
| 1 | Internal failure |
| 2 | Invalid arguments, policy, encoding, input I/O, or structurally invalid diff |
| 3 | Unsupported, ambiguous, truncated, changed or resource-limited evidence; `data: null` |
| 4 | Unsafe input path rejected; `data: null` |

All failures have `complete: false` and `data: null`. Diagnostics use safe codes
and messages without quoting input contents. Parser caps are independent of the
policy thresholds:

| Resource | Default and hard maximum | CLI override |
| --- | ---: | --- |
| Diff input bytes | 1,048,576 | `--max-input-bytes` |
| Files | 256 | `--max-files` |
| Added + deleted lines | 20,000 | `--max-changed-lines` |
| Findings + applied exceptions | 256 | `--max-findings` |
| Encoded result bytes | 65,536 | `--max-output-bytes` |

Overrides can only lower caps. The output cap has a minimum of 1,024 bytes;
other caps have a minimum of 1. When complete output cannot fit, the tool returns
an incomplete result rather than clipped findings or source data. CLI input
artifact loading is bounded. Policy artifacts have a fixed 65,536-byte hard cap
and a 256-entry hard cap for each selector, content-rule and exception array.
Lowering `--max-input-bytes` also lowers CLI policy capture when below 65,536.
Policy file-count thresholds cannot exceed 256, and line-count thresholds cannot
exceed 20,000. Policy resource exhaustion remains incomplete rather than a policy
finding.

Example failure: an unsupported copy patch yields `status: "incomplete"`,
`complete: false`, `data: null`, and exit 3. A patch outside `allowed_paths` yields
a completed check with an `OUT_OF_SCOPE` finding and exit 0.

## JavaScript API

```js
import { checkPatch, encodeResult, exitCode } from "agent-patch-guard";

const result = checkPatch(diffText, {
  schema_version: "1.0.0",
  allowed_paths: ["src/"],
}, { origin: "snapshot", limits: { max_files: 8 } });
process.stdout.write(encodeResult(result));
process.exitCode = exitCode(result);
```

The API consumes strings and a policy object; it performs no filesystem access.
`capabilities()` reports the subset and hard caps. Type declarations are in
[`types/index.d.ts`](types/index.d.ts). No source compilation is needed.

## Verification

```sh
npm ci --ignore-scripts
npm run build
npm run lint
npm run typecheck
npm test
npm run smoke:pack
```

Build and lint check JavaScript syntax and schema JSON. TypeScript 5.9.3 and
Ajv 8.20.0 are isolated development dependencies for declaration and schema checks.
Pack smoke installs a
temporary tarball with lifecycle scripts disabled, runs the CLI and JS API,
checks the safe fixture, and verifies shipped schemas, declarations and license.
Temporary consumers are removed after the check.

Agents and developers retain responsibility for choosing policy, reviewing
exceptions, interpreting incomplete evidence and deciding whether to apply a
patch. Patch Guard does not validate runtime behavior, API compatibility,
test coverage or publication readiness.
