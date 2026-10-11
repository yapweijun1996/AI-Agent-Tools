# Codebase bug review

Review date: 2026-10-11. Source baseline:
`f7a94a59bf9c9b6353901e19433a6e54fe38c36d`.

The initial review confirmed **15 defects: three P1 and twelve P2**. P1 means a
credential-export risk or silent loss of verification evidence/success semantics;
P2 means a conditional correctness, availability, input-validation, or automation
defect. Every finding was reproduced locally and traced to source. The review
stage changed documentation only. The owner subsequently selected all fifteen
findings for repair; the implementation and regression map below records those
corrections. [TASK](../TASK.md) owns current acceptance status;
[VALIDATION](../VALIDATION.md#codebase-bug-repairs-2026-10-11) owns the dated repair
verification record. The findings and line numbers retain the original baseline
observations, rather than describe the repaired worktree.

## Repair and regression map

| Finding | Correction | Native regression evidence |
| --- | --- | --- |
| BUG-001 | Redact GitHub provider prefixes and quoted authorization through a closing quote or truncated tail before diagnostic identity construction. | [Multiline redaction](../packages/error-lens/test/multiline-redaction.test.mjs) checks all six prefixes, both quotes, LF/CRLF, closed/truncated tails and stable IDs. |
| BUG-002 | Derive exit 3 from the final incomplete envelope after withholding output. | [Checker tests](../packages/cfml-check/test/check.test.ts) and [CLI tests](../packages/cfml-check/test/cli.test.ts) check status, data and exit agreement. |
| BUG-003 | Keep basename include patterns reachable and propagate globstar states through arbitrary directory depth. | [Discovery regressions](../packages/test-scope/test/review-regressions.test.mjs) retain shallow/deep matches with exclusion controls. |
| BUG-004 | Require an observed regular file before open, open nonblocking on POSIX and validate the admitted descriptor. | [Input boundary tests](../packages/contract-check/test/input-boundary.test.js) reject initial FIFOs and a real file-to-FIFO substitution without a writer. |
| BUG-005 | Decode JSON input with fatal UTF-8 validation before parsing. | [Input boundary tests](../packages/contract-check/test/input-boundary.test.js) reject invalid bytes and preserve a valid replacement-character literal. |
| BUG-006 | Use the pinned TypeScript compiler's filesystem matcher over snapshot directory entries, forwarding include/exclude/depth arguments. | [Project filtering](../packages/change-impact/test/project-filtering.test.cjs) compares root membership with the compiler, uses revision-only inventory and retains explicitly imported excluded sources. |
| BUG-007 | Run nested targeted framework commands in the owning package with package-relative test paths. | [Planner regressions](../packages/test-scope/test/review-regressions.test.mjs) execute inert local Vitest/Jest runners offline, including package paths with spaces and apostrophes. |
| BUG-008 | Retain discovered repository verification commands in release plans alongside changed-owner commands. | [Planner regressions](../packages/test-scope/test/review-regressions.test.mjs) retain the root verify gate for child-only changes. |
| BUG-009 | Reserve a minimum 512-byte output budget; account for actual rendering and newline, withholding oversized output and compacting a pretty failure when necessary. | [CLI tests](../packages/cfml-check/test/cli.test.ts) check compact/pretty byte ceilings; [checker tests](../packages/cfml-check/test/check.test.ts) cover the minimum with all other limits at their hard caps. |
| BUG-010 | Distinguish an exact parent path segment from legal names beginning with two dots. | [Code Slice file boundary](../packages/code-slice/test/unit/file-boundary.test.ts) and [CFML checker](../packages/cfml-check/test/check.test.ts) accept legal names and retain escape rejection. |
| BUG-011 | Validate file-count and per-file byte limits as positive safe integers before scanning. | [Project Tree regressions](../packages/project-tree/test/review-regressions.test.js) reject invalid CLI/API file limits and retain a valid bounded scan. |
| BUG-012 | Extract local module references from lexical tokens, keeping comments, strings and template text opaque. | [Graph regressions](../packages/project-tree/test/review-regressions.test.js) and [lexer controls](../packages/project-tree/test/module-imports.test.js) check inert text, real module syntax, template expressions and regex literals. |
| BUG-013 | Check pack-index table lengths, fanout and extended offsets before reading them; withhold malformed Git evidence. | [Project Tree regressions](../packages/project-tree/test/review-regressions.test.js) cover multiple truncated index sizes; existing packed-Git tests retain ordinary behavior. |
| BUG-014 | Validate installation records and check the real installed manifest, identity, containment and executable without launching a tool. | [AIT regressions](../tests/ait-review.test.js) reject malformed/duplicate records, wrong identity/bin and missing executables; a valid installed package remains healthy. |
| BUG-015 | Preserve JSON output intent on parse failures while respecting the dispatch boundary. | [AIT regressions](../tests/ait-review.test.js) check unknown options, missing values and a native-only JSON flag after `--`. |

The corrections preserve package identities, versions, dependencies and native
module systems. The CFML Check output minimum is an explicit contract correction,
documented in its README, SPEC and result schema. Project Tree remains a lexical
adapter rather than a complete JS/TS parser. File admission checks do not provide
an atomic filesystem snapshot or operating-system confinement.

## Scope and evidence

The review covered AIT and eighteen packages through repository/package contracts,
CLI/API entry points, selected core implementations, and the full native suite.
Targeted probes examined root containment, decoding, file types, discovery filters,
project ownership, redaction, resource ceilings, and exit/output consistency.
This is a bounded review, not proof that every source line or possible failure has
been examined.

| Area | Targeted finding IDs |
| --- | --- |
| AIT runtime | BUG-014, BUG-015 |
| CFML Check | BUG-002, BUG-009, BUG-010 |
| CFML Linkage | No additional confirmed defect in the inspected paths |
| CFML Policy Check | No additional confirmed defect in the inspected paths |
| Change Impact | BUG-006 |
| Code Slice | BUG-010 |
| Context Pack | No additional confirmed defect in the inspected paths |
| Contract Check | BUG-004, BUG-005 |
| Environment Doctor | No additional confirmed defect under its documented input contract |
| Error Lens | BUG-001 |
| Patch Guard | No additional confirmed defect in the inspected paths |
| Project Profile | No additional confirmed defect in the inspected paths |
| Project Tree | BUG-011, BUG-012, BUG-013 |
| Release Guard | No additional confirmed defect in the inspected paths |
| Rules Resolve | No additional confirmed defect in the inspected paths |
| Runtime Trace | No additional confirmed defect in the inspected paths |
| Symbol Search | No additional confirmed defect in the inspected paths |
| Test Evidence | No additional confirmed defect in the inspected paths |
| Test Scope | BUG-003, BUG-007, BUG-008 |

Probes used synthetic files in disposable temporary directories and local built
outputs. No real credential was used. The runner-location probe disabled npm
network access and used an inert fixture runner. The FIFO probe had a 500 ms
termination bound. Temporary fixture trees were removed.

The supported local runtime was Node `24.21.0` on macOS. Native baseline checks
passed: 968 Node tests (967 passed, one Windows-only test skipped), twelve Python
tests, eighteen dry-run package checks, and eight packed consumer checks. Existing
passing tests do not cover the reproduced failures. Node 22, Windows/Linux
reproduction, live Lucee/browser/database execution, optional native parsers, and
published-package behavior were not verified in this review. Historical release
and functional assessments remain unchanged.

## Findings

### BUG-001 — P1 — Error Lens exports unredacted credential forms

Location: [redact.ts](../packages/error-lens/src/core/redact.ts), lines 3 and 6;
contract: [Error Lens README](../packages/error-lens/README.md).

`PROVIDER_TOKEN_PATTERN` recognizes `ghp_` but omits `github_pat_`.
`AUTHORIZATION_PATTERN` requires a closing quote for quoted values, so a log
truncated after an opening quote bypasses both authorization alternatives. The
general key/value patterns do not cover `authorization`.

Reproduce through `parse()` with a stderr artifact using the TypeScript diagnostic
prefix `src/a.ts(1,1): error TS1005:` and either of these synthetic messages:

- `unexpected ` followed by `github_pat_` plus 48 synthetic `x` characters;
- `Authorization: "Bearer synthetic-credential-tail-0123456789` without a closing quote.

Both results have `status: "complete"` and retain the entire value in the exported
diagnostic. Logs containing these forms can disclose credentials through output
promised to redact sensitive values. GitHub documents `github_pat_` as its
fine-grained personal access token prefix.
[GitHub token formats](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github)

Suggested correction: cover documented provider prefixes and consume quoted
authorization values through their closing quote or remaining truncated tail.
Check serialized output and stable identities with malformed/multiline controls.

### BUG-002 — P1 — CFML Check returns exit 0 after withholding an oversized result

Location: [checker.ts](../packages/cfml-check/src/core/checker.ts), lines 18–24 and
88–90; [CLI](../packages/cfml-check/src/cli/index.ts), lines 133–139.

`fitOutput()` converts an oversized successful envelope to `incomplete`, but its
caller still returns hardcoded `exit_code: 0`. The CLI forwards that code. The
[native contract](../packages/cfml-check/README.md) assigns exit 3 to insufficient
evidence or a resource limit.

Reproduce with a regular `simple.cfm` containing `<cfset n = 1>` and
`check --root <fixture> simple.cfm --json --max-output-bytes 512`. API and CLI
return exit 0 with `status: "incomplete"`, `complete: false`, and `data: null`.
An exit-code-based caller accepts a check whose findings were withheld; the AIT
CFML consumer profile also rejects this status/exit mismatch.

Suggested correction: derive the final exit code after output fitting. Regress a
normally successful check that becomes output-limited.

### BUG-003 — P1 — Test Scope silently prunes tests matching include globs

Location: [discovery.ts](../packages/test-scope/src/core/discovery.ts), lines
92–103 and 169.

Directory reachability treats a basename-only glob as a directory-name glob and
treats a noninitial `**` as one segment. It prunes directories before the correct
file matcher can run.

Reproduce with root `package.json` declaring `scripts.test: "node --test"` and
`src/a/deep/file.test.js` importing `node:test`. `discoverTests({root})` returns
the test. Either `include: ["*.test.js"]` or `include: ["src/**/*.js"]` returns
no tests, with `status: "complete"` and no diagnostic. The basename matcher
explicitly permits the former pattern; the latter matches the nested file.

Suggested correction: align directory reachability with file-glob semantics,
including basename patterns and zero/multiple segments for `**`. Compare filtered
discovery with matching the unfiltered inventory.

### BUG-004 — P2 — Contract Check hangs while opening a writerless FIFO

Location: [index.js](../packages/contract-check/src/index.js), lines 35–52.

`readJson()` uses blocking `openSync(file, "r")` before checking whether the
opened descriptor is a regular file. The rejection cannot run until a FIFO writer
connects.

Reproduce on POSIX: create `fifo.json` with `mkfifo`, then run
`compare --before fifo.json --after fifo.json --json` without a writer. The child
produces no output and must be terminated; the bounded probe reported
`ETIMEDOUT`/`SIGTERM` at 500 ms. Automation can wait indefinitely on unsupported
input instead of receiving an invalid-input result.

Suggested correction: reject nonregular inputs before opening and use a
nonblocking descriptor plus descriptor validation for substitution races.
Environment Doctor already demonstrates this approach locally.

### BUG-005 — P2 — Contract Check repairs invalid UTF-8 into compatible input

Location: [index.js](../packages/contract-check/src/index.js), line 61;
contract: [Contract Check README](../packages/contract-check/README.md).

`Buffer.toString("utf8")` replaces invalid bytes instead of rejecting them,
although input is required to be valid UTF-8 JSON.

Reproduce with before-file bytes `{"const":"`, then byte `0xff`, then `"}`;
the after file is valid UTF-8 JSON `{"const":"\uFFFD"}`. The CLI returns exit 0,
`status: "compatible"`, `complete: true`, and no changes. Corrupt input becomes a
different contract before comparison.

Suggested correction: use fatal UTF-8 decoding before JSON parsing. Include
invalid byte sequences inside otherwise valid JSON strings in regression checks.

### BUG-006 — P2 — Change Impact ignores tsconfig include/exclude/depth filtering

Location: [project.ts](../packages/change-impact/src/project.ts), lines 82–104,
121, and 204.

The virtual `readDirectory` filters only directory and extension. Its host
wrappers discard TypeScript's `excludes`, `includes`, and `depth` arguments during
`parseJsonConfigFileContent()`. Selected-project membership exceeds the config.

Reproduce with a snapshot containing `src/a.ts`, `tests/outside.ts`, and
`tsconfig.json` declaring `include: ["src/**/*.ts"]`, `exclude: ["tests"]`, with
no source import of the excluded file. `createProjectContext(snapshot).project.files`
contains both files. The excluded file becomes an independent project root,
affecting selected-project diagnostics and static impact evidence.

Suggested correction: apply TypeScript-compatible matching to the bounded virtual
inventory. Test include, exclude, depth, and explicitly imported excluded files
separately; an excluded file imported by an included file is a different case.

### BUG-007 — P2 — Test Scope targeted commands lose package ownership

Location: [planner.ts](../packages/test-scope/src/core/planner.ts), lines 21–34;
contract: [command interpretation](../packages/test-scope/SPEC.md).

`frameworkCommand()` emits root-level npm execution without the test's package.
Nested package scripts retain their prefix, but targeted Vitest/Jest commands
lose runner installation and configuration context.

Reproduce with a root package having only a verify script and a nested
`packages/widget` package declaring Vitest and a test importing its source.
The complete minimum plan confidently recommends:

```sh
npm exec --no -- vitest run -- 'packages/widget/src/a.test.ts'
```

With an inert executable installed only at the child's `node_modules/.bin/vitest`
and npm offline, that command exits 1 (`ENOTCACHED`) from the request root.
Running the fixture runner from `packages/widget` with `src/a.test.ts` exits 0.
The root command cannot use the installed runner; with a different root runner,
it can also select the wrong configuration.

Suggested correction: preserve the owning package's runner/configuration context
and adjust target paths consistently. Execute generated commands in a fixture
where root and child installations differ.

### BUG-008 — P2 — Test Scope removes root gates from nested-package release plans

Location: [planner.ts](../packages/test-scope/src/core/planner.ts), lines 64–71,
103, and 111.

All commands are filtered to changed package owners before `releaseCommands()`
selects repository checks. Child-only changes remove root verify/build/lint/
coverage/release scripts even when those scripts are discovered evidence.

Reproduce with BUG-007's fixture, root `scripts.verify: "echo verify"`, and only
`packages/widget/src/a.ts` changed. The complete release plan contains the child's
test script and targeted command but omits discovered root `npm run verify`.
A release-level consumer can miss the repository gate, independently of whether
the targeted command executes.

Suggested correction: retain applicable repository commands in the release level
while preserving package filtering for package-level checks. Verify a child-only
change with a root verification script.

### BUG-009 — P2 — CFML Check's ceiling does not bound serialized stdout

Location: [checker.ts](../packages/cfml-check/src/core/checker.ts), lines 18–24;
[limits.ts](../packages/cfml-check/src/core/limits.ts), lines 20–37;
[CLI](../packages/cfml-check/src/cli/index.ts), line 136.

The fitter measures compact JSON before rendering, omitting pretty indentation
and the final newline. If the fallback cannot fit, it still returns it. Any
positive integer is accepted as the ceiling.

Reproduce with `<cfset n = 1>`: `--max-output-bytes 1 --json` emits 427 UTF-8
stdout bytes. A fitting compact result with an 826-byte ceiling emits 1,051 bytes
with `--pretty`, retaining `status: "ok"`. Both exceed the requested budget.
BUG-002 separately covers exit semantics.

Suggested correction: enforce a documented feasible minimum and measure the
selected serialization, including its newline, before emitting it.

### BUG-010 — P2 — Legal in-root names beginning with two dots are rejected

Locations: [Code Slice file-loader.ts](../packages/code-slice/src/core/file-loader.ts),
lines 26–29; [CFML Check source-reader.ts](../packages/cfml-check/src/core/source-reader.ts),
lines 7–10.

Both guards reject every relative path starting with `..`, including ordinary
filenames rather than parent-directory segments.

Reproduce with `..config.js` and `..config.cfm` directly inside the explicit root.
Code Slice `loadFile()` rejects the first with `FILE_OUTSIDE_ROOT`; CFML Check
rejects the second with the same code and exit 4. Both valid files are inside the
root and cannot be inspected.

Suggested correction: distinguish exact `..` and `..` followed by a platform
separator from legal dot-prefixed names. Retain real traversal/symlink controls.

### BUG-011 — P2 — Project Tree accepts invalid and infinite scan limits

Location: [CLI](../packages/project-tree/src/cli.js), line 18;
[scanner.js](../packages/project-tree/src/scanner.js), lines 132–136.

Conversion is not followed by finite positive integer validation. `NaN` falls
back through `|| 1000`, negative values alter truncation, and `Infinity` disables
the file-count bound.

Reproduce `context --root <two-file-fixture> --max-files` with `-1`, `NaN`, and
`Infinity`. All exit 0. The negative value yields only the workspace node and
`truncated: true`; the other values return all three nodes. Invalid requests are
accepted, and infinity permits unbounded file traversal.

Suggested correction: validate CLI/library limits as finite positive safe
integers, with any hard ceilings defined by the package's own contract.

### BUG-012 — P2 — Project Tree treats comments and strings as static imports

Location: [scanner.js](../packages/project-tree/src/scanner.js), lines 60–68.

Import extraction uses unmasked regular expressions over raw source. Inert
comments/strings can become edges with `js-static-import` provenance.

Reproduce with `consumer.js` containing a commented `import "./target.js";`
and an exported string containing `require('./target.js')`; `target.js` exists.
`buildProjectGraph()` emits a consumer-to-target imports edge. Impact/test queries
can follow a dependency that no executable source statement creates.

Suggested correction: exclude comments/string contents while identifying module
syntax. Test inert examples beside real static/dynamic imports.

### BUG-013 — P2 — A truncated Git pack index aborts Project Tree's changed query

Location: [git.js](../packages/project-tree/src/git.js), lines 87–108 and 111–118;
contract: [Git adapter](../packages/project-tree/docs/SPEC.md).

The index parser checks only the eight-byte header before reading fanout and
derived object/offset tables. Out-of-range reads throw outside the adapter's
unavailable-result handling.

Reproduce with synthetic `.git/HEAD` containing a forty-character object ID and
an eight-byte `objects/pack/bad.idx` containing only valid v2 magic/version.
`aptree changed` exits 1 with generic `CLI_ERROR`. It loses the query envelope and
expected unavailable/note evidence for corrupt storage.

Suggested correction: validate table lengths/counts/offsets before reading and
propagate corrupt storage through the documented adapter result.

### BUG-014 — P2 — AIT doctor accepts malformed installation records as healthy

Location: [ait.js](../bin/ait.js), lines 340–349 and 545–559;
contract: [AIT state boundary](AIT_RUNTIME.md).

`loadState()` validates only the outer schema/array. `doctor()` checks a registered
ID and the existence of any `package.json` at `entry.root`, without validating
record fields or installed package identity.

Reproduce with an isolated home whose `installed.json` contains one record with
only `id: "agent-code-slice"` and a root pointing to a fixture manifest named
`unrelated-package`. Package identity, version, and executable fields are absent.
`ait doctor --home <fixture-home> --json` exits 0 with `ok: true`, `status: "ok"`,
and no issues. Malformed state is declared healthy despite its documented
fail-closed rule, making list/doctor evidence unreliable.

Suggested correction: validate record structure/identity and compare the
installation with its manifest and executable without executing it. Test missing
fields and mismatched manifests using isolated homes.

### BUG-015 — P2 — AIT suppresses JSON errors when argument parsing fails

Location: [ait.js](../bin/ait.js), lines 675 and 704–714.

`options` is assigned only after `parseArgs()` returns. On a parse exception, the
catch constructs an error envelope but cannot see the supplied `--json` and emits
only human-readable stderr.

Reproduce `node bin/ait.js list --json --unknown`: exit 2, empty stdout, and
`Unknown option: --unknown` on stderr. Automation requesting JSON gets no
structured error, unlike errors raised after successful parsing.

Suggested correction: retain output-mode intent during parsing, respecting the
dispatch `--` boundary, and serialize errors in the requested mode.

## Controls and limitations

Rules Resolve rejecting a nonexistent target parent directory was excluded: its
file-target exception requires existing parents. Context Pack's locator-based
deduplication and Test Evidence's permitted summarized case subsets were also
treated according to their native contracts.

An Environment Doctor probe demonstrated last-key-wins JSON parsing for duplicate
snapshot keys, but its current contract does not explicitly require duplicate-key
rejection. That observation is not counted as a confirmed defect here.

No finding changes a tool's release status, protocol-adoption status, published
version, or historical acceptance result. Repair acceptance uses focused native
regressions and package/Hub checks recorded in VALIDATION; the original passing
baseline alone did not resolve these findings.
