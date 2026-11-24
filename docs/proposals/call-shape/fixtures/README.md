# Call Shape acceptance fixtures

These are input projects and **expected** outcomes for the [proposed inspection contract](../SPEC.md#acceptance-cases-for-an-implementation), not captured CLI output. The TypeScript files are source data: do not execute them. No dependency installation or compiler is needed to prepare the inputs.

## Use the fixtures

From the repository root, run:

```sh
python3 -B docs/proposals/call-shape/fixtures/prepare.py
```

On Windows, `python -B` works as well. The helper prints the path of a **new temporary directory**. Each `<case-id>/root` is a separate project with an explicit `tsconfig.json`; its sibling `argv.json` is the complete argument array (excluding the executable). The helper writes no expected results. Remove the printed temporary directory when finished. Do not run the cases against `src/` as one combined project: a deliberately unresolved call would invalidate unrelated requests.

The [prototype tests](../prototype/README.md) compare both JavaScript APIs against the data and refusal expectations. The [CLI tests](../prototype/cli.test.cjs) also start a Node process from each case's `root` using that case's `argv.json`, without a shell. For example, the `binding` request selects a character **inside** the declaration name; the result locator must point to its start. [cases.json](cases.json) maps each case to a key in [expected.json](expected.json). Both enumeration orders intentionally use the same expectation.

The expected JSON is a comparison projection, not a substitute for the Hub envelope:

- Compare the process exit with `exitCode`. Require a single UTF-8 JSON envelope followed by LF, then validate the [Hub envelope structure](../../../JSON_STANDARD.md) before comparing fields. The source prototype uses a documented `unpackaged` identity marker in place of a release version. Malformed, oversized, or absent output fails the case.
- Compare `status`, `complete`, and the **entire** `data` value (including call order, counts, and coordinates) by JSON value. Do not compare object key order or diagnostic prose. Successful cases require empty `errors`. For failure cases, each listed `errorCodes` value must occur in `errors[].code`; do not accept failure for an unrelated reason.
- Failure cases must emit null data, no partial rows, source snippets, argument values, or absolute paths. In particular, the positive call in `unresolved.ts` cannot be returned as a one-row success. No synthetic package version or registry identity is frozen here.

## Coverage

| Spec group | Case ID(s) | What distinguishes the expected result |
| --- | --- | --- |
| 1. Binding | `binding` | Include a direct import and an aliased re-export. Exclude the same-spelling call bound to a local function. |
| 2. Proven key | `present` | Explicit `undefined`, shorthand before spread, and a computed string literal all prove presence, not value validity. |
| 3. Proven absence | `missing` | Distinguish a nonmatching literal from an omitted argument even though the declaration has a default. |
| 4. Unknown key | `unknown` | Variable, object spread, and nonliteral computed key each produce a different reason. |
| 5. Positional spread | `slot-two` | Spread before slot 2 obscures it; spread after slot 2 does not; omitted slot 2 is missing. |
| 6. Indirect calls | `indirect` | Local assignment alias, callback reference, and namespace call produce **zero** in-scope rows. |
| 7. Locations and order | `order-forward`, `order-reverse` | Source creation and config file-list orders are reversed. Both must return `a.ts` before `z.ts`; after an astral character the two callee columns in `z.ts` are 10 and 22 (one-based UTF-16). |
| 8. Withheld results | `overload`, `unresolved`, `output-limit`, `path-escape` | Isolate overload selection, unresolved binding, stdout exhaustion, and an explicit root-boundary denial. No case may expose a partial inventory. |

Two setups are generated rather than committed as bulky or host-specific inputs. `output-limit` uses **4,096** identical calls in one file (below the 5,000-site ceiling). Its basename is 48 U+1F680 characters plus `.ts`: the required path alone costs 195 UTF-8 bytes per row. With the required locator/classification/reason fields the compact `calls` array already exceeds 1 MiB, before envelope overhead. `path-escape` places an actual declaration in a controlled sibling file under the temporary directory but **outside** that case's root. This distinguishes a policy denial from a missing file without referencing a real user file.
