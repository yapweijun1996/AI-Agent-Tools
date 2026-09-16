# Roadmap

Last reconciled: 2026-09-16. The sequence below preserves the original ten-tool priority and appends three owner-requested designs, Symbol Search, and the CFML Policy Check design. It is not a release calendar or a dependency graph. Tools remain independently useful and independently released. The [registry](TOOL_REGISTRY.json) owns lifecycle; [TASK.md](TASK.md) owns Hub task status. Outcome descriptions are intended scope, not universal verified capabilities.

The documentation foundation is complete. **Delivery progress: 1 of 15 registered tools completed.** The owner confirmed Code Slice complete on 2026-09-06, and npm metadata confirms the recorded `0.2.0` release. Project Profile has received an implementation and release audit and is registered as `Experimental`, but it is not delivery `Done`: npm `latest` remains `0.1.1`, the corrected `0.1.2` source is not published, the exact artifact omits its declared MIT `LICENSE` file, and a prior `0.1.1` distribution defect was not reproduced by the current exact-artifact re-audit; the discrepancy remains unresolved. Symbol Search has also received an implementation admission review and is registered as `Experimental`; its published `0.1.2` artifact is audited, while current `main` CI fails its Documentation check. The other fourteen tools await owner completion notices. Code Slice's separate Hub lifecycle remains Experimental pending protocol conformance; delivery completion does not close that integration work. The AIT runtime is publicly published as `ai-agent-tools@0.1.1` under Apache-2.0; its registry read-back and clean consumer checks pass. AIT is not a universal compatibility layer. See [Validation](VALIDATION.md) for evidence scope.

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
| 14 | `agent-symbol-search` | Agent Symbol Search | Navigate bounded TypeScript symbol definitions, references, and relationships without returning full source bodies. |
| 15 | `agent-cfml-policy-check` | Agent CFML Policy Check | Check configurable CFML, HTML, and project policy rules with explicit diagnostics and coverage limits. |

The 2026-09-07 Company KB snapshot records Change Impact in progress and Project
Profile next; this update does not change the delivery sequence. Among the three
additions, CFML Check is
the recommended first feasibility spike because its structural defects can be
tested locally. Result Store and Runtime Trace need explicit producer integration.
The [expansion review](docs/TOOL_EXPANSION.md) explains their bounded contracts.
Symbol Search is a separate TypeScript-only implementation admission and remains
Experimental until its owner supplies completion and release evidence. CFML Policy
Check was appended on 2026-09-16 as a separate Planned design for configurable
CFML/HTML/project rules such as table `colgroup`/`col` requirements. Its repository
identity is confirmed, but its initial commit contains no implementation, tests,
package metadata, or release evidence. It does not change the CFML Check structural
scope or create a dependency between the two tools.

## Milestones

1. **Completed foundation (E-01):** documents, registry, lifecycle gates, local validation, function review, and reconciled execution ledger exist. Documentation completion does not certify external releases.
2. **Next compatibility and evidence work (E-02/E-03):** reconcile native JSON/exit/completeness semantics, preserve existing consumers, and audit publication/artifact evidence before promoting conformance claims.
3. **Independent tool delivery (E-05):** Code Slice delivery is complete; its Hub compatibility work is separate. Follow the sequence above for remaining independent tool work and record completion when the owner reports it. Later tools need bounded first-version contracts and test evidence.
4. **AIT runtime (E-04):** complete and review the local `agent-tools`/`ait` package for explicit registry discovery, pinned install, doctor, and approved dispatch. It is not an automatic installer, sandbox, or universal compatibility layer.
5. **Conditional infrastructure review (E-06):** only after roughly 3–5 mature tools (`Verified` or `Stable`, with maintained releases) expose real duplicated infrastructure, assess shared packages or monorepo migration. Neither is an assumed destination. See [Architecture](docs/ARCHITECTURE.md#shared-infrastructure-gate).

Work-package scope is in [EPIC.md](EPIC.md). Usage order may differ from delivery
order: rules may be inspected before edits, diagnostics only when present, and
release checks only for release tasks. No new feature is scheduled by a date here.

## Open decisions

- Confirm remaining independent repositories, published npm package identities, maintainers, and release history; the six currently inspected repository URLs are registered. Project Profile's published 0.1.1 artifact remains a release-evidence gap until its missing license file, prior distribution-defect observation, and unpublished 0.1.2 correction are reconciled. CFML Check and Symbol Search package identities are now recorded from exact artifact audits; Symbol Search current-main CI and Hub conformance remain pending.
- Resolve versioned protocol profiles versus explicit migration using real contract fixtures; no compatibility mechanism has been implemented.
- Define tool-specific language/format support, resource limits, and minimum Node.js versions in each tool repository.
- Maintain the published AIT package and complete remote-refresh, provenance, and sandbox policies. The local `ai-agent-tools@0.1.1` implementation now covers explicit registry discovery, pinned install, doctor, and approved dispatch; its public Apache-2.0 package metadata, registry read-back, and clean consumer checks are recorded, while the remaining runtime policies are not silently inferred from the earlier spike.

These decisions do not block the documentation foundation. They do block unsupported publication, compatibility, or readiness claims.
