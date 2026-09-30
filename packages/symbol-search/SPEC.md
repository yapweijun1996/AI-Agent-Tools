# agent-symbol-search Specification

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Runtime status | V1 TypeScript operations and v0.1.1/v0.1.2 release gates are implemented and verified; v0.1.2 is published |
| Compatibility | Schema version 1; TypeScript-only V1 contract |

This is the normative V1 contract. The maintained JSON schemas under `schemas/`, runtime validation, and contract tests are the executable form of its machine-readable portions.

## 1. Product boundary

The tool is a deterministic, local-first, read-only symbol navigator. It returns bounded symbol evidence and source locations. It does not return full source bodies, execute project code, modify repositories, install dependencies during search, use a network, use an LLM, calculate change impact, or select tests.

## 2. Operations

V1 defines six operation names:

| Operation | Purpose | TypeScript support |
|---|---|---|
| `capabilities` | Report actual adapter and operation support | Full |
| `search` | Find declarations by exact, prefix, or substring name | Full |
| `definition` | Resolve a declaration, optionally from a source position | Full |
| `references` | Find compiler-resolved references and import aliases | Full |
| `implementations` | Find explicit inheritance/implementation relationships | Partial |
| `symbols` | List declarations in one file | Full |

`search` searches parsed declaration names, not comments or string literals. Exact matching is the default. Fuzzy matching and user-supplied regular expressions are not part of V1.

## 3. Requests

Every request requires an explicit `root`. The root is resolved and canonicalized before discovery. Operation-specific inputs are:

| Operation | Required | Optional |
|---|---|---|
| `capabilities` | `root` | none |
| `search` | `root`, `symbol` | `match` (`exact`/`prefix`/`substring`), `project`, `limit`, `include`, `exclude` |
| `definition` | `root`, `symbol` | `from`, `project`, `limit`, `include`, `exclude` |
| `references` | `root`, `symbol` | `from`, `project`, `limit`, `include`, `exclude` |
| `implementations` | `root`, `symbol` | `from`, `project`, `limit`, `include`, `exclude` |
| `symbols` | `root`, `path` | `project`, `limit`, `include`, `exclude` |

The JSON library request is canonical. The search request has this public TypeScript shape; `project` is optional and schema version remains `"1"`:

```ts
export interface SearchRequest extends RequestOptions {
  operation: "search";
  symbol: string;
  match?: MatchMode;
  project?: string;
}
```

A source position uses separate fields so Windows drive letters are not ambiguous:

```json
{
  "path": "src/cli.ts",
  "line": 82,
  "column": 4
}
```

`line` is 1-based. `column` is 0-based UTF-16. `from.path` and `symbols.path` must resolve to an existing in-root file; an explicit symlink is allowed only when its canonical target remains inside `root` and is not secret-like.

The CLI syntax exposes `--from-path`, `--line`, and `--column` separately, and exposes project selection as `--project <tsconfig*.json>` for every TypeScript operation that accepts `project`. It accepts `--include` and `--exclude` repeatedly. Colon-delimited positions such as `path:line` are not canonical.

### TypeScript project selection

For TypeScript operations, `project` must name an existing repository-relative regular (non-symlink) `tsconfig*.json` file. If it is omitted, the implementation discovers configs under the root after normal ignore/security filtering:

- exactly one config is selected;
- multiple configs return `status: "error"`, `INVALID_REQUEST`, all candidate paths, and an instruction to pass `project`;
- an explicit non-tsconfig, missing, symlink, or root-outside project returns a bounded error;
- no config uses fixed fallback options: ES2022 target, CommonJS/Node resolution, strict checking, no emit, `allowJs: false`, `checkJs: false`, and preserved JSX.

A selected config's `include`/`files` set controls the Program, but only discovered in-root TypeScript files are admitted. `baseUrl`, `paths`, and module resolution are honored. Project references are reported but not recursively built in V1. JavaScript files are excluded even if a config enables them. Compiler version and selected project (`tsconfig*.json` or `fallback`) are included in `stats`.

Supported TypeScript extensions are `.ts`, `.tsx`, `.mts`, and `.cts`, including `.d.ts`, `.d.mts`, and `.d.cts`. Operation-specific library helpers accept only their corresponding optional `operation` literal and reject conflicting values with `INVALID_REQUEST` before accessing the root; use `execute` for a dynamically selected operation.

## 4. Normalized symbol kinds

Adapters use only this public taxonomy:

```text
module, namespace, class, interface, type, enum, function, method,
constructor, variable, constant, property, field, component, parameter, unknown
```

The TypeScript adapter maps class fields to `field`, interface members and object members to `property`, constants to `constant`, and import aliases to a variable kind with an `import_alias` relation.

## 5. Relations and confidence

Allowed relations are:

```text
definition, declaration, reference, import_alias, implementation, inheritance
```

Allowed confidence values are:

```text
confirmed, strong, candidate, unknown
```

Compiler/checker evidence may be `confirmed`. AST/import evidence without complete semantic resolution is at most `strong`; lexical or heuristic evidence is `candidate`; unsupported or insufficient evidence is `unknown`. The V1 TypeScript adapter emits confirmed compiler/checker evidence and does not label structural guesses as confirmed.

Definition/reference lookup normalizes aliases and single-root instantiated member symbols. Compiler-resolved literal element accesses such as `store["save"]()` are references; unrelated string values are not. A position on the `constructor` keyword targets that constructor, while positions in its parameters or body target the actual symbol at the requested location.

Implementation results are limited to explicit `implements` and `extends` on class declarations or variable-bound class expressions, plus supported abstract-method overrides. Abstract overrides require a concrete derived class and a concrete, type-compatible member; abstract redeclarations, overload-only declarations, incompatible members, ambient classes or members nested under ambient namespace/module declarations, and `.d.ts` members are excluded. Structural assignability, dynamic dispatch, mixins, and runtime monkey-patching are not confirmed implementations. When an implementation query has no explicit relationship but semantic coverage is insufficient to make a stronger claim, the result is partial with `SEMANTIC_RESOLUTION_UNAVAILABLE`.

## 6. Result envelope

The maintained result schema requires this shape:

```json
{
  "schemaVersion": "1",
  "status": "complete",
  "data": { "matches": [] },
  "diagnostics": [],
  "truncation": { "truncated": false, "reasons": [] },
  "stats": { "matches": 0 }
}
```

Allowed statuses:

- `complete`: the bounded operation finished; an empty match set is valid;
- `partial`: evidence is available but parsing, semantic coverage, timeout, or a resource limit prevents a complete claim;
- `error`: the request or root/path boundary prevents a valid operation result.

`diagnostics` contains a structured code, message, severity, and optional repository-relative path/details. A syntax failure in one file normally produces a partial result when other evidence remains. Invalid requests, invalid roots, and path/security failures produce error results.

CLI JSON is emitted only on stdout. Human-readable copies of diagnostics are emitted on stderr. Complete and partial results exit `0`; operation errors exit `1`; CLI argument parse errors exit `2`.

## 7. Match shape

A match has this shape; explicit and implicit class constructors use the stable public name `constructor`. Explicit constructors have a name range covering the constructor keyword; implicit records use the containing class range because no constructor token exists:

```json
{
  "symbolId": "sha256-v1:...",
  "name": "resolveConfig",
  "qualifiedName": "config.resolveConfig",
  "kind": "function",
  "relation": "definition",
  "language": "typescript",
  "path": "src/config.ts",
  "range": {
    "start": { "line": 42, "column": 0 },
    "end": { "line": 58, "column": 1 }
  },
  "nameRange": {
    "start": { "line": 42, "column": 16 },
    "end": { "line": 42, "column": 29 }
  },
  "container": "config",
  "resolver": "typescript-semantic",
  "confidence": "confirmed",
  "exported": true
}
```

The example is illustrative but schema-shaped. `range` is the declaration or reference range and its end is exclusive. `nameRange` and `container` are omitted when unavailable. `exported` is emitted only when the adapter can determine it. Results contain locators, not source content; extraction belongs to `agent-code-slice`.

## 8. Symbol identity

The V1 identity is:

```text
SHA256(
  "symbol-id-v1" + "\n" +
  language + "\n" +
  normalized_repository_relative_path + "\n" +
  qualified_name + "\n" +
  kind + "\n" +
  normalized_signature
)
```

The public value is `sha256-v1:<64 lowercase hex characters>`. Paths use `/`, are repository-relative, and are normalized independently of host separators. Line numbers are never part of identity.

For TypeScript, comments are removed and signature whitespace is collapsed. Function/method overload signatures retain parameter and type differences. Declaration-merged interfaces share an identity when their normalized name/kind/header are the same. Anonymous default declarations use the stable name `default`. Qualified names include discovered declaration containers and local symbols. These rules cover overloads, default/anonymous exports, declaration merging, namespaces, generics as written in the signature, and host path behavior without using source line numbers.

## 9. Ranking and ordering

Matches are ordered deterministically by:

```text
confidence rank
→ relation quality
→ exact qualified-name match
→ exact simple-name match
→ same source context
→ normalized path
→ start line
→ start column
→ symbolId
```

Numeric ranks are fixed implementation details. Comparisons are locale-independent. A source-position request supplies the source-context tie-breaker; compiler resolution chooses its target before ranking. No result ordering depends on filesystem enumeration order, clock time, or memory address.

## 10. Ambiguity

Without enough context, multiple valid definitions are evidence of ambiguity, not permission to choose the first. A definition request with multiple bounded definitions returns `status: "complete"`, `data.ambiguous: true`, an `AMBIGUOUS_SYMBOL` warning, and all bounded definitions. A source position may resolve an alias or one semantic symbol; overload declarations may still produce multiple valid declaration ranges.

A complete scan with no matches returns `complete` plus `SYMBOL_NOT_FOUND` at informational severity. A limit, timeout, parse error, or unavailable semantic coverage is represented as partial rather than silently reported as complete.

## 11. Capabilities

The capability shape is operation-level. The following example is illustrative:

```json
{
  "schemaVersion": "1",
  "languages": {
    "typescript": {
      "operations": {
        "capabilities": "full",
        "search": "full",
        "symbols": "full",
        "definition": "full",
        "references": "full",
        "implementations": "partial"
      },
      "notes": []
    },
    "python": {
      "operations": {
        "symbols": "proposed",
        "definition": "proposed",
        "references": "proposed",
        "implementations": "proposed"
      },
      "notes": []
    }
  }
}
```

Capability values are `full`, `partial`, `candidate`, `unsupported`, or `proposed`. The executable output includes the `capabilities` operation and marks JavaScript, Python, and CFML proposed; it does not claim them as shipped languages.

## 12. Discovery and security

Default discovery:

- stays inside the explicit canonical root;
- rejects explicit paths whose canonical target is outside the root;
- does not follow directory or file symlinks during traversal;
- honors `.gitignore` with deterministic POSIX-relative paths;
- skips `.git`, `node_modules`, `dist`, `build`, `coverage`, `.cache`, `vendor`, and `generated` by default;
- skips `.env`, `.env.*`, `*.pem`, `*.key`, `credentials.*`, and `secrets.*` by default;
- treats project files as data and never imports or executes them.

Precedence is deterministic: root/canonical containment, symlink/secret boundaries, and `node_modules` exclusion cannot be overridden; `--exclude` wins over ordinary matching; `--include` is an allow-list that can override `.gitignore` and ordinary generated-directory filters. Explicit file requests still undergo root, symlink, secret, extension, and project-file checks. A configured project file outside the root is excluded, its diagnostic points to the in-root project configuration without exposing the outside path, and the result is `partial`.

Nested `.gitignore` files are evaluated relative to their own directories, including negation. Symlinked ignore-rule files are not read. Compiler content reads enforce discovery admission for repository sources, including transitive imports. Configuration inheritance must remain in-root or within permitted package directories. External type resolution admits regular TypeScript files and needed JSON metadata in root/ancestor `node_modules`, plus the installed TypeScript standard libraries and package metadata; it never admits arbitrary outside-root source paths or symlinked workspace packages. Denied imports/configuration reads yield sanitized warnings and partial evidence. Package dependencies remain excluded from result matches.

## 13. Resource limits

Initial defaults are:

```text
maximum files: 10,000
maximum single file: 2 MiB
maximum parsed bytes: 100 MiB
default result limit: 50
maximum result limit: 500
cooperative timeout budget: 5 seconds
```

These are engineering budgets, not benchmark guarantees. Hitting a file, byte, result, or timeout budget sets `truncation.truncated: true`, includes the corresponding reason (`MAX_FILES_REACHED`, `MAX_BYTES_REACHED`, `MAX_RESULTS_REACHED`, or `TIMEOUT`), and normally returns `partial`. A not-found result after complete scanning is `complete`. Timeout checks are cooperative in discovery, indexing, and reference traversal; no hard process-isolation guarantee is claimed.

The compiler reader independently applies the file, single-file byte, and total-byte budgets to configuration, sources, package metadata, and type dependencies. Read attempts and actual bytes are reported as `stats.compilerFilesRead` and `stats.compilerBytesRead`; repeated reads of cached content are not charged twice. `filesScanned` and `bytesParsed` retain the discovered-source measurements for compatibility. Ignore-rule content has a separate aggregate discovery budget using the same limits. Content reads are bounded before allocation and compiler reads also check the shared cooperative deadline.

## 14. Failure codes

The public codes are:

```text
SYMBOL_NOT_FOUND
AMBIGUOUS_SYMBOL
UNSUPPORTED_LANGUAGE
UNSUPPORTED_OPERATION
SEMANTIC_RESOLUTION_UNAVAILABLE
PARSE_ERROR
INVALID_ROOT
PATH_OUTSIDE_ROOT
MAX_FILES_REACHED
MAX_BYTES_REACHED
MAX_RESULTS_REACHED
TIMEOUT
INVALID_REQUEST
```

`SYMBOL_NOT_FOUND` and context-free `AMBIGUOUS_SYMBOL` are diagnostics in complete results, not process failures. Root, path, and invalid-request failures use `error`. Unsupported or incomplete adapter coverage may use `partial` with a diagnostic when useful evidence remains.

## 15. Read-only guarantee

During a search, the package does not write source, cache, lock, or result files; it does not invoke child processes or network APIs; and it does not import project modules. The read-only invariant is tested by filesystem snapshots and source fixtures that would visibly mutate state if executed.

## 16. Compatibility and evidence

The public schema is versioned through `schemaVersion`. Breaking field, enum, range, identity, or ordering changes require a new schema version or an explicitly documented migration. The package version, compiler version, adapter, and effective project configuration are reported when they affect resolution.

The published packages are the `0.1.1` and `0.1.2` releases; `0.1.2` is a documentation-only patch and does not change this contract. npm publication, the annotated tag, and GitHub Release for both releases are recorded by the completed checklist in `RELEASE.md`. Reproducible verification is provided by:

```bash
npm ci
npm run release:check
npm audit --audit-level=high
npm pack --dry-run --json
git diff --check
git status --short
```

The package artifact smoke test runs outside the source checkout. Native coverage measures product sources only and enforces lines ≥85%, functions ≥80%, and branches ≥75%. `BENCHMARK.md` records cold and warm in-memory measurements for small, medium, and large generated fixtures; release checks require no fixture `TIMEOUT`, without setting a public latency SLO. CI verifies Node 22, 24, and 26 on Ubuntu plus Node 24 package smoke on Ubuntu, macOS, and Windows.
