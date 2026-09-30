# ADR-030: Select Tree-sitter CFML as the explicit full-parser backend

> **Status: IMPLEMENTED / HOST-UNVERIFIED / PRIVATE.** The backend adapter and optional dependency declaration exist; native parser loading and fixture coverage remain unverified on the current host.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Explicit Tree-sitter CFML parser selection behind the parser adapter |
| Source of truth | `src/tree-sitter-backend.js`, `src/parser-adapter.js`, `package.json`, `test/tree-sitter-backend.test.js`, this ADR |
| Evidence | The npm cache contains the pinned `@cfmleditor/tree-sitter-cfml@0.26.2` and `tree-sitter@0.25.0` tarballs; cache-only `--ignore-scripts` preparation materialized the grammar package with `binding.gyp` but no native `.node` artifact; source and fake-parser contract tests are present |
| Verification | JavaScript syntax, the 92-test suite, and diff checks pass; Node `v25.2.1` on `win32`/`x64` is recorded, but `cl.exe`, `gcc.exe`, `clang.exe`, and `cc.exe` are unavailable, no native `.node` artifact is present, and native loading, parser grammar fixtures, project integration, and supported-host installation remain unverified; no CFML/application source was executed |
| Limitations | The backend is not selected by default, script/embedded-language Fact adapters remain opaque, `.cfs` is not currently discovered by the snapshot stage, and full grammar/resolver coverage is not claimed |

## Decision

Use `@cfmleditor/tree-sitter-cfml@0.26.2` with `tree-sitter@0.25.0` as the explicit full-parser candidate. Both are pinned as optional dependencies so the private package can retain its fail-closed behavior on hosts that cannot install or load the native addon. The backend is created only when a caller invokes `createTreeSitterCfmlBackend()` and passes it as `parserBackend`; the default parser remains unselected and does not silently change.

`src/tree-sitter-backend.js` selects `cfhtml` for `.cfm`/`.cfml`, `cfml` for `.cfc`, and `cfscript` for `.cfs`. It converts recognized Tree-sitter CFML tag nodes into the existing structural tree with source-map spans, bounded attributes, deterministic ordering, syntax diagnostics, and node limits. Script and embedded-language nodes are preserved as `OPAQUE_REGION` evidence with `UNSUPPORTED_SYNTAX`; their source is never evaluated. Non-CFML files fail closed with `UNSUPPORTED_LANGUAGE` so callers must compose a separate web backend when mixed-language analysis is required.

This backend does not claim synchronous preemptive wall-time cancellation. The analyzer's existing cooperative checkpoints remain the authority for wall-time budget semantics.

## Consequences

The parser choice is now concrete and reversible without coupling the core adapter to a parser-specific AST. On a compatible host, callers can select a real CFML grammar rather than the bounded scanner. On an incompatible or incomplete host, optional dependency failure remains explicit and the existing scanner/default-unselected behavior is preserved.

The native addon introduces installation, platform, ABI, compiler, and dependency supply-chain review requirements. No public release or compatibility claim is made from this selection. A future verification pass must install from an approved offline/registry source, load each grammar, parse inert CFML fixtures, validate Fact/Graph output, and record host-specific evidence before marking the backend verified.
