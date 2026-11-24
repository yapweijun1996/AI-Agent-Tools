# Call Shape: direct-call field inspection

**Status: proposal with a source-only CLI prototype.** The [CLI and JavaScript APIs](prototype/README.md) inspect an explicit local TypeScript project or an already admitted program. Run the CLI with Node; `agent-call-shape` below is a working name, not a registered tool, installed binary, or package reservation. There is no packaged distribution or AIT integration.

## Question and scope

Before requiring `tenantId` on the `options` argument of `saveOrder(options)`, a maintainer needs three lists: direct calls that explicitly supply the key, direct calls that omit it, and direct calls that need inspection. The unit of evidence is **one source-level call site**, not a runtime invocation. A key can be present with the wrong type or with value `undefined`.

[Symbol Search](../../../packages/symbol-search/README.md) locates references, including references that are not calls. TypeScript diagnostics can check assignability against an edited signature. Neither is the output specified here: a field-presence inventory **before editing the signature**, with a reason for each classification. V1 does not edit code, simulate calls, check value validity, or claim to find every runtime caller.

## Request

```sh
agent-call-shape inspect --root . --project tsconfig.json \
  --declaration src/orders.ts:12:17 --argument 1 --field tenantId --json
```

- `inspect` requires all five named inputs. The root resolves from the caller's current directory; project and declaration paths are relative to that root. No automatic project selection, stdin, or glob arguments. Unknown, duplicate, or missing flags are invalid. Standalone `--help` and `--version` do not inspect a project. In the source prototype, JSON is the only inspection output, so `--json` is optional.
- `--declaration` is `path:line:column`, parsed at the last two colons. Select a position **on the identifier token** of one named, non-ambient function declaration with a body. Lines and columns start at 1; columns count UTF-16 code units, not display cells. Positions on whitespace, the `function` keyword, or a call are not fuzzy selectors.
- `--argument` is a positive, one-based safe integer selecting the written argument slot, not a parameter name. `--field` is a case-sensitive top-level key matching `[A-Za-z_$][A-Za-z0-9_$]*`, except `__proto__` (prototype-setter syntax is outside v1). No dotted paths or destructuring queries.

## Finding direct calls

1. Load one explicit TypeScript project with a tool-owned pinned compiler, without emitting or building. Search non-declaration `.ts`, `.tsx`, `.mts`, and `.cts` project sources in the selected program. Declaration files may inform binding but are not search targets. Project references and mixed JS projects are unsupported; do not silently omit a subproject or JS callers and report whole-project coverage.
2. Resolve the target declaration to its checker symbol. An overload set or merged declaration yields `AMBIGUOUS_TARGET`; a variable holding a function or a class method yields `UNSUPPORTED_SCOPE`. An anonymous default export has no selectable name. Require unique declaration identity; never pick the first same-named function.
3. Visit call expressions whose callee is an identifier after removing parentheses, including generic and optional direct calls. Compare checker symbols, following static import/export aliases to their originating declaration. `import { saveOrder as persist }` followed by `persist(...)` counts; a shadowing local `saveOrder` does not. Nested calls each have their own site. Count an optional call as written, not as proof it ran.
4. Do not follow value assignments (`const f = saveOrder`), callback dispatch, namespace/member calls (`orders.saveOrder()`), `.call`, `.apply`, `.bind`, constructors, JSX invocations, or reflective calls. These are **outside the population**, not rows classified `unknown`. For an eligible identifier call, failure to resolve its binding or alias chain is not evidence of a different target: withhold the entire inventory as `RESOLUTION_INCOMPLETE`.

## Classifying one matched site

Apply the following rules in order; emit the first applicable reason. Strip parentheses and type-only wrappers (`as`, `satisfies`, type assertions, non-null assertions) from the selected argument. Do not evaluate expressions or chase variables, even if a type annotation claims that the field exists.

| Condition | Classification | Stable reason |
| --- | --- | --- |
| A positional spread occurs at or before the requested written slot, so the slot cannot be selected syntactically (including tuple spreads in v1) | `unknown` | `argument_spread` |
| No argument occupies the slot and no earlier spread could supply it | `missing` | `argument_omitted` |
| The selected argument is not an object literal, including an identifier, `null`, or explicit `undefined` | `unknown` | `not_object_literal` |
| The literal explicitly defines the requested own key | `present` | `explicit_key` |
| No explicit match, and the literal contains an object spread | `unknown` | `object_spread` |
| No explicit match or spread, but at least one computed key is not statically named | `unknown` | `computed_key` |
| All keys are statically named and none matches (including `{}`) | `missing` | `literal_without_key` |

An identifier, shorthand, decoded string literal, or computed string literal such as `['tenantId']` names a key. Methods and accessors with those names also define keys. Numeric literal names are compared as property strings. Other computed expressions are deliberately not folded. An explicit matching key wins regardless of the order of properties or spreads: a later spread can replace its **value**, not remove its **presence**. `argument_omitted` describes the caller, even if the function supplies a default parameter.

## Result and failure contract

Target the [Hub JSON envelope](../../JSON_STANDARD.md) and [CLI stream/exit rules](../../CLI_STANDARD.md). In JSON mode emit one UTF-8 document followed by LF. The source prototype uses `tool.id: "agent-call-shape"` (working name) and `tool.version: "unpackaged"` (a marker, not a package version). It does not meet the Hub's registered release identity requirement. The following is an example of the **`data` member only**, not an invented tool identity or a runtime receipt:

```json
{
  "project": "tsconfig.json",
  "declaration": {"path": "src/orders.ts", "line": 12, "column": 17},
  "argument": 1,
  "field": "tenantId",
  "counts": {"present": 0, "missing": 1, "unknown": 0},
  "calls": [
    {"path": "src/cart.ts", "line": 8, "column": 3, "classification": "missing", "reason": "literal_without_key"}
  ]
}
```

Return the start of the declaration **name** and the start of each **callee identifier** in the same coordinate system as the request. Use root-relative `/` paths. Sort by path (ordinal UTF-16), then numeric line and column. Emit one row per matched site, no excerpts or argument values. Each count equals the number of rows of that class. With no matches, emit `calls: []` and three zero counts; this means no matching **in-scope direct calls**. `meta.scope` must identify that scope.

| Exit | Status | Meaning |
| ---: | --- | --- |
| 0 | `ok` | All in-scope sites examined, even if some are `missing` or `unknown`. Row-level `unknown` is an observed syntactic classification, not a passing check. |
| 1 | `error` | `INTERNAL_ERROR` or `INPUT_IO`: unexpected failure or unreadable input. |
| 2 | `error` | `INVALID_INPUT`: malformed invocation, config, path format, coordinate, or selector not on a declaration name. |
| 3 | `incomplete` | `UNSUPPORTED_SCOPE`, `AMBIGUOUS_TARGET`, `RESOLUTION_INCOMPLETE`, `INPUT_CHANGED`, or `RESOURCE_LIMIT`. No partial rows or counts. |
| 4 | `error` | `UNSAFE_PATH`: explicit request violates the read boundary. |

Malformed source that prevents reliable call enumeration or binding is incomplete; ordinary type errors such as a missing required property do not invalidate an otherwise bound call. For every nonzero handled outcome use `complete: false`, `data: null`, and a bounded diagnostic. Never convert a failed project load into a successful empty inventory.

## Read boundary and limits

Read configuration and source as data only. No project-provided compiler, plugins, executable config, Git commands, network, writes, cache, or test execution. Root the compiler host's directory enumeration, config inheritance, module resolution, and file reads, not just the CLI paths. Permit regular in-root source/config and needed dependency declarations/metadata; the only outside-root exception is the tool's own compiler standard library. Do not follow descendant symlinks. If a required dependency cannot be resolved within this boundary, report incomplete rather than broadening access. Detected changes to admitted inputs invalidate the result; this is not an atomic-filesystem-snapshot guarantee.

Proposed fixed v1 ceilings (defaults equal hard maxima; no limit flags): 50,000 directory entries examined, 10,000 files read, 2 MiB per file, 64 MiB total input bytes, traversal depth 128, 5,000 matching sites, 1 MiB serialized stdout including LF, and 10 seconds of cooperative processing time. Count compiler/config/dependency reads as well as project sources. Publish the effective numeric caps in `meta.limits`. Exhaustion replaces the whole result with a bounded `RESOURCE_LIMIT` envelope, never a clipped success. The time cap is not a guarantee against a stalled OS read.

## Acceptance cases for an implementation

The [acceptance fixtures](fixtures/README.md) supply isolated TypeScript inputs, request arguments, and expected JSON for the cases below. These are expected values, not execution receipts. The core and loader tests compare data and refusal codes. The [CLI process tests](prototype/cli.test.cjs) execute all 12 requests using their original argument arrays and check the envelope, streams and exit codes. Compare machine-readable fields and exit codes, not diagnostic prose.

| Fixture | Required observation |
| --- | --- |
| Direct call, renamed import through a re-export, and same-spelling shadow | Include the first two once each; exclude the shadow. A binding that cannot be resolved must not be silently skipped. |
| `saveOrder({ tenantId: undefined })`, `saveOrder({ tenantId, ...opts })`, `saveOrder({ ['tenantId']: id })` | Three `present/explicit_key` rows; no claim about values. |
| `saveOrder({ total: 100 })`, `saveOrder()` with a default in the declaration | Two `missing` rows, with distinct literal and omission reasons. |
| `saveOrder(opts)`, `saveOrder({ ...opts })`, `saveOrder({ [key]: id })` | Three `unknown` rows with their respective reasons. |
| Inspect slot 2 in `f(...xs, {})`, `f(1, {}, ...xs)`, and `f(1)` | `unknown/argument_spread`, `missing/literal_without_key`, and `missing/argument_omitted`, respectively. |
| Only callback references, assignment aliases, or member calls | Successful empty inventory for the stated direct-call scope, not a runtime no-call claim. |
| A non-BMP character before a callee on the same line; files enumerated in reverse order | Callee column counts two UTF-16 units for that character; ordering and counts remain identical. |
| Overloaded target, unresolved candidate binding, exceeded output budget, explicit path escape | Respectively exits 3, 3, 3, 4; all with null data and no source disclosure. |

Registration, packaging, a public release identity, and any later expansion to JavaScript or indirect calls require separate decisions. The proposal adds no dependency or behavior to existing tools.
