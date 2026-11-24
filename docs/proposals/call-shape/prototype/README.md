# Call Shape prototype: inspect direct calls

The [source CLI](cli.cjs) inspects written argument fields on direct TypeScript calls. It delegates to the [restricted project loader](project.cjs) and [analysis core](core.cjs); it is not an installed command, npm package, or AIT tool.

## Run the CLI

From the trusted Hub checkout, using Node 24 and a separate fixture project (PowerShell example after normal Hub bootstrap):

```powershell
$env:CALL_SHAPE_TYPESCRIPT = (Resolve-Path packages/symbol-search/node_modules/typescript/lib/typescript.js).Path
$fixtures = (python -B docs/proposals/call-shape/fixtures/prepare.py).Trim()
node docs/proposals/call-shape/prototype/cli.cjs inspect --root "$fixtures/binding/root" --project tsconfig.json --declaration orders.ts:1:21 --argument 1 --field tenantId --json
```

The example returns exit 0, one `present`, one `missing`, and no `unknown` calls. Remove the generated fixture directory after use. On POSIX, export `CALL_SHAPE_TYPESCRIPT` with an absolute path to the same compiler entry. Use a trusted Node environment and point it at an **operator-trusted `typescript@5.8.2` installation outside the selected root**; never take this setting from the project. The CLI does not search `NODE_PATH`, the working directory, or a package store for a compiler. A version check establishes compatibility, not provenance.

`inspect` always emits one compact UTF-8 JSON document plus LF, with no stderr for handled outcomes; `--json` is optional. Use `data.counts` and `data.calls`, not exit 0, to decide which calls need attention. A nonzero exit withholds all data: 1 = runtime/I/O error, 2 = invalid input, 3 = incomplete analysis, 4 = path denied. Inspect `errors[0].code` for the reason. See the [request and result contract](../SPEC.md) for selectors, scope and error codes.

Standalone `--help` and `--version` need neither a project nor a compiler. `--version` prints `agent-call-shape unpackaged`: the envelope uses that same working ID and version marker, **not** a registered or released identity.

## Use the project API

Supply a **trusted** TypeScript `5.8.2` compiler from the caller's installation, never from the repository being inspected. For example, after preparing the [binding fixture](../fixtures/README.md), with `fixtureRoot` set to its `binding/root` directory:

```js
const { inspectProject } = require('./project.cjs');
const result = inspectProject(ts, {
  root: fixtureRoot, project: 'tsconfig.json',
  declaration: { path: 'orders.ts', line: 1, column: 21 },
  argument: 1, field: 'tenantId',
});
```

Relative roots resolve from the caller's working directory. Project and declaration paths are root-relative. A successful binding-fixture request returns `data.counts` of `{ present: 1, missing: 1, unknown: 0 }`. A refusal returns `{ data: null, errorCode }`, never the rows gathered before failure. An `unknown` row means the call **was** bound to the target but its argument did not establish field presence. Neither response is a CLI envelope.

## What may be read

- The selected `.json` config supports TypeScript's JSONC syntax, `files`, `include`/`exclude`, path aliases and explicitly relative config inheritance inside the root. `extends` via package name or absolute path, project references, `allowJs`, `noResolve`, and compiler plugins are unsupported. Nothing installs dependencies, emits JS, or executes a project script.
- Config parsing, directory matching, source loading and compiler resolution use the [same disk reader](project-io.cjs). Lookups do not search ancestor package stores on disk. In-root package metadata and `.d.ts`/`.d.mts`/`.d.cts` dependencies can inform binding; dependency implementation files are not loaded from `node_modules`. Outside the canonical root only the trusted compiler's standard `lib*.d.ts` files in its own library directory may supply bytes.
- Required missing inputs, unresolved module/type/file references and invalid metadata withhold data. This is a conservative physical-file resolver: ambient-only module declarations without a resolved module file can be refused. Ordinary type errors in arguments are not a reason to discard a bound call. The loader does not assert that a permissive host with other installed packages would resolve identically.
- Descriptor reads require regular files, strict UTF-8, stable identity, and bounded bytes. Descendant links are not followed; seeing a link during directory enumeration conservatively refuses the scan rather than potentially omitting callers. Use a narrower explicit `files` project if a broader glob cannot be admitted. Common credential/store paths are denied, not treated as a general secret detector.
- Per inspection: at most 50,000 enumerated entries, 10,000 distinct file reads, 2 MiB per file, 64 MiB of input, depth 128, and one cooperative 10-second deadline through loading, analysis and final checks. Additionally the prototype caps distinct observed lookup paths at 50,000 and inherited config files (including the entry config) at 128. Each admitted file's text is cached once; the loader rechecks observed filesystem metadata before returning data. The core caps matched calls at 5,000. The CLI measures the **whole envelope** in UTF-8 including the final LF: over 1 MiB it emits only a `RESOURCE_LIMIT` refusal. Its `meta.limits` reports the same [fixed numeric ceilings](limits.cjs) used by the reader, core and CLI; there are no limit overrides.

These checks are not an atomic filesystem snapshot, an OS sandbox, or a hard wall-clock bound on a synchronous filesystem/compiler operation. Use a stable local checkout; hostile concurrent directory replacement, mounted remote filesystems and platform-specific filesystem behavior are not certified. `inspectProgram(ts, program, request)` remains available for an already admitted trusted program with an absolute root; calling it directly **bypasses** project admission and final disk checks.

## Reproduce the tests

The [golden tests](core.test.cjs) use Python 3 to materialize the synthetic inputs and compare actual data/refusal codes through both APIs. The [loader tests](project.test.cjs) additionally exercise inheritance, discovery, dependency declarations, refusal boundaries and observed changes. The [CLI tests](cli.test.cjs) run all 12 prepared argument arrays in separate Node processes, assert stdout framing, stderr, exit codes and complete data/refusal projections, and exercise invalid input and the final envelope byte boundary. No suite executes fixture source. Temporary projects are removed after testing.

From the repository root, use Node 24 and an existing trusted `typescript@5.8.2`. For example, after normal repository bootstrap (POSIX shell):

```sh
NODE_PATH="$PWD/packages/symbol-search/node_modules" node --test docs/proposals/call-shape/prototype/core.test.cjs docs/proposals/call-shape/prototype/project.test.cjs docs/proposals/call-shape/prototype/cli.test.cjs
```

On Windows set `NODE_PATH` to a trusted module directory containing that version for the test process. No compiler is loaded from the inspected project; the prototype adds no dependencies to the Hub or other tools. A production package must own its compiler pin and lockfile.
