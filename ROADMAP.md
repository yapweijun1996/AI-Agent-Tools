# Roadmap

Last reconciled: 2026-09-07. The sequence below preserves the original ten-tool priority and appends three owner-requested designs. It is not a release calendar or a dependency graph. Tools remain independently useful and independently released. The [registry](TOOL_REGISTRY.json) owns lifecycle; [TASK.md](TASK.md) owns Hub task status. Outcome descriptions are intended scope, not universal verified capabilities.

The documentation foundation is complete. **Delivery progress: 1 of 13 registered tools completed.** The owner confirmed Code Slice complete on 2026-09-06, and npm metadata confirms the recorded `0.2.0` release. Project Profile has since received an implementation and release audit and is registered as `Experimental`, but it is not delivery `Done`: npm `latest` remains the defective `0.1.1`, while the corrected `0.1.2` source is not published. The other twelve tools await owner completion notices. Code Slice's separate Hub lifecycle remains Experimental pending protocol conformance; delivery completion does not close that integration work. No discovery CLI or compatibility layer exists. See [Validation](VALIDATION.md) for evidence scope.

## Delivery sequence

| Order | Registry ID | Tool | Intended outcome |
| --- | --- | --- | --- |
| 1 | `agent-code-slice` | Agent Code Slice | Return bounded code context for explicit symbols or locations. |
| 2 | `agent-change-impact` | Agent Change Impact | Report change relationships with supporting evidence and explicit coverage limits. |
| 3 | `agent-project-profile` | Agent Project Profile | Describe observed project structure, configuration, and available commands. |
| 4 | `agent-test-scope` | Agent Test Scope | Identify candidate tests from declared or observable relationships. |
| 5 | `agent-error-lens` | Agent Error Lens | Extract bounded structured diagnostics from supplied error output. |
| 6 | `agent-patch-guard` | Agent Patch Guard | Check proposed patches against explicit scope and safety constraints. |
| 7 | `agent-contract-diff` | Agent Contract Diff | Compare supported contract formats and report observable differences. |
| 8 | `agent-rules-resolve` | Agent Rules Resolve | Resolve explicitly supported rule sources using documented precedence. |
| 9 | `agent-release-guard` | Agent Release Guard | Check release prerequisites and evidence without publishing by default. |
| 10 | `agent-context-pack` | Task-scoped Agent Context Pack | Assemble bounded, provenance-bearing tool results for one explicit task. |
| 11 | `agent-cfml-check` | Agent CFML Check | Check a declared CFML structural subset with exact diagnostics and explicit unsupported coverage. |
| 12 | `agent-result-store` | Agent Result Store | Persist explicitly authorized sanitized results with bounded retrieval, provenance, and retention. |
| 13 | `agent-runtime-trace` | Agent Runtime Trace | Correlate supplied operation events and report transport outcomes, readback evidence, and unknown stages. |

The Company KB records Change Impact in progress and Project Profile next; this
update does not change that sequence. Among the three additions, CFML Check is
the recommended first feasibility spike because its structural defects can be
tested locally. Result Store and Runtime Trace need explicit producer integration.
The [expansion review](docs/TOOL_EXPANSION.md) explains their bounded contracts.

## Milestones

1. **Completed foundation (E-01):** documents, registry, lifecycle gates, local validation, function review, and reconciled execution ledger exist. Documentation completion does not certify external releases.
2. **Next compatibility and evidence work (E-02/E-03):** reconcile native JSON/exit/completeness semantics, preserve existing consumers, and audit publication/artifact evidence before promoting conformance claims.
3. **Independent tool delivery (E-05):** Code Slice delivery is complete; its Hub compatibility work is separate. Follow the sequence above for remaining independent tool work and record completion when the owner reports it. Later tools need bounded first-version contracts and test evidence.
4. **Future discovery (E-04):** consider an `agent-tools` CLI once real registry consumers and confirmed releases justify it. It discovers metadata; it does not become a runtime or automatically execute tools.
5. **Conditional infrastructure review (E-06):** only after roughly 3–5 mature tools (`Verified` or `Stable`, with maintained releases) expose real duplicated infrastructure, assess shared packages or monorepo migration. Neither is an assumed destination. See [Architecture](docs/ARCHITECTURE.md#shared-infrastructure-gate).

Work-package scope is in [EPIC.md](EPIC.md). Usage order may differ from delivery
order: rules may be inspected before edits, diagnostics only when present, and
release checks only for release tasks. No new feature is scheduled by a date here.

## Open decisions

- Confirm remaining independent repositories, published npm package identities, maintainers, and release history; the three inspected repository URLs are now registered. Project Profile's published 0.1.1 artifact remains a known release gap until 0.1.2 is published and verified.
- Resolve versioned protocol profiles versus explicit migration using real contract fixtures; no compatibility mechanism has been implemented.
- Define tool-specific language/format support, resource limits, and minimum Node.js versions in each tool repository.
- Select licenses before package publication; this Hub currently does not declare a license or grant package licensing rights.
- Decide discovery CLI ownership, package identity, caching, and distribution only when implementation is approved.

These decisions do not block the documentation foundation. They do block unsupported publication, compatibility, or readiness claims.
