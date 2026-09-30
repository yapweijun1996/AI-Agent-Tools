# Runtime Trace: UI Regression Check

Private source package `ai-agent-tool-runtime-trace@0.1.0`, implementing the
existing registry identity `agent-runtime-trace` through one bounded profile:
`ui-regression-v1`. The planned general business operation trace (`summarize`,
`verify`, backend/readback correlation) is **not implemented** by this profile.

This deterministic offline analyzer compares explicit sanitized evidence. It
neither launches a browser nor changes application state, collects credentials,
executes supplied scripts, retries navigation or calls a database/API.

```sh
node packages/runtime-trace/src/cli.js capabilities --json
node packages/runtime-trace/src/cli.js ui-regression-check \
  --input packages/runtime-trace/examples/mobile-pass.json --json
```

After local installation the executable is `agent-runtime-trace`. Node
`^22.13.0 || ^24.0.0` is supported. The runtime has no dependencies. This package
remains private; source/local installation is available, no public npm release is
claimed. Package name follows the owned monorepo's `ai-agent-tool-*` naming and
maps to the existing Runtime Trace responsibility rather than a second UI tool. The public registry name returned HTTP 404 on 2026-09-30; this verifies absence at that observation, not a reservation or release.

## Evidence and meaning

The strict [input schema](schema/input.schema.json) declares a cutoff `asOf`,
maximum evidence age (seconds), and explicit cases. Each case supplies a safe
opaque ID, declared producer, UTC observation time, viewport dimensions and the
required subset of `overflow`, `overlap`, `focus`, `back`. An empty scope or empty
case list is invalid. Tolerance defaults to zero and may be declared up to 10px.
Producer labels are provenance declarations, not authentication.

| Check | Supplied observation | Result boundary |
| --- | --- | --- |
| Overflow | Document `scrollWidth` and viewport width | Horizontal overflow beyond tolerance fails; missing scroll width is unknown. This does not assess each element's clipping or vertical scrolling. |
| Overlap | Visible axis-aligned rectangles plus explicit element pairs | Positive width **and** height intersection beyond tolerance fails a nonoverlap pair. `allowOverlap: true` explicitly allows intentional overlap. Missing/hidden elements or missing pairs are unknown. No undeclared pair is inferred. |
| Focus | Expected IDs, observed sequence, `complete: true` | Exact sequence comparison; missing/truncated interaction is unknown. No keyboard action is executed. |
| Back | Expected/observed route IDs, `outcome: settled`, `complete: true` | Exact route comparison; missing, timeout or unsettled evidence is unknown. A timeout is not proof of business-write failure. No Back action or retry is executed. |

Future or stale timestamps make all requested checks for that case unknown. A
known mismatch makes overall status fail even alongside unknown checks;
`complete` remains false when any requested check is unknown. A pass only covers
the declared checks, supplied viewport and declared pairs. It does not certify
all mobile behavior, accessibility, rendering or whole-workflow correctness.
Screenshots cannot establish a passing interaction result and are not accepted
as input. Stacking order, occlusion, CSS transforms beyond axis-aligned bounds,
clipping and effective hit targets are outside this MVP.

The [output schema](schema/result.schema.json) returns one JSON object with
`status`, `complete`, bounded checks, reasons, numeric measurements where useful,
JSON pointers into the input and a canonical input SHA256. No focus/route payload,
DOM text, selector, URL, cookie, local storage, header/body or credential value is
returned. Identifiers must be sanitized ASCII opaque IDs; Unicode file paths work.
Use aliases for private routes and controls, not customer data or access tokens.
Raw URLs, arbitrary properties, known credential prefixes and credential files
are rejected. Errors do not echo input contents or file paths. An opaque alias
cannot provide a general guarantee that arbitrary caller-selected content is
nonsecret; the producer owns sanitization.

## Optional Playwright geometry export

Playwright is an **external optional producer**, not a package dependency. The
fixed adapter takes an already authorized caller-owned `page`. It reads only
viewport/document dimensions and requested elements' rectangle/visibility
metrics, located by sanitized `data-testid` IDs. It does not launch a browser,
navigate, click, type, call Back, inspect application text/URLs/cookies/storage
or evaluate caller-supplied code. Geometry observation may still run application
JavaScript already present in the caller's browser; use an authorized environment.

```js
import { captureGeometry } from 'ai-agent-tool-runtime-trace/playwright-export';
import { checkUiRegression } from 'ai-agent-tool-runtime-trace';

const observedAt = new Date().toISOString(); // caller records capture time
const evidence = await captureGeometry(page, {
  id: 'mobile-390', producer: 'approved-playwright-runner', observedAt,
  elementIds: ['save', 'cancel'],
  pairs: [{ id: 'footer-buttons', first: 'save', second: 'cancel', allowOverlap: false }]
});
const result = checkUiRegression({
  schemaVersion: '1.0', profile: 'ui-regression-v1',
  asOf: new Date().toISOString(), maxEvidenceAgeSeconds: 60,
  cases: [evidence]
});
```

The adapter bounds its wait to five seconds without closing the caller's page or retrying. Configure the caller-owned page/context and runner's timeouts before export.
Capture failures must remain unavailable/unknown evidence, not fabricated metrics.
The caller can explicitly save the returned sanitized case into a bounded JSON
bundle for the CLI. Missing or ambiguous (duplicate `data-testid`) requested elements stay absent, causing relevant
pair checks to be unknown. Focus/Back evidence comes separately from an approved
runner's existing interaction trace; the adapter never manufactures it. Stub
producer tests exercise the fixed export contract; they do not claim a live
browser/application integration trial.

## Limits, installation and verification

Input is one explicit regular UTF-8 JSON file, at most 1MiB, with at most 32
cases, 128 rectangles/pairs/focus entries per case. Duplicate JSON keys, nesting
over 32, unknown fields, invalid times and nonfinite/out-of-range numbers fail.
No recursive file discovery. Output is limited to 64KiB; an oversized report
returns unknown with `OUTPUT_LIMIT` instead of clipping to a successful result.
Input symlinks are permitted for explicitly selected ordinary evidence files;
resolved credential basenames are denied. No filesystem root authority is
inferred from a supplied path.

Exit codes: **0 pass, 1 fail, 2 malformed/unsupported input or I/O error,
3 unknown/insufficient evidence**. Human output is default; `--json` emits stable
structured output. Identical snapshots give byte-identical reports; check IDs
sort deterministically, and evidence pointers preserve the actual input order.

```sh
npm --prefix packages/runtime-trace ci --ignore-scripts
npm --prefix packages/runtime-trace run build
npm --prefix packages/runtime-trace run typecheck
npm --prefix packages/runtime-trace test
npm --prefix packages/runtime-trace run smoke:pack
```

The synthetic examples provide all-four-check pass and mismatch cases. They are
fixtures, not evidence about a production application. Source distribution keeps
Apache-2.0 and `private: true`; installation does not publish or deploy a service.
