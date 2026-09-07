# AI-Agent-Tools

Small, focused tools that help AI coding agents read less, guess less, execute more precisely, and verify more.

This repository is the ecosystem **Hub**: registry, standards, discovery documentation, roadmap, and governance. Each tool belongs in its own repository and npm package, with independent tests, versions, and releases. The Hub is not a monorepo or an Agent Runtime.

## Current state

**1 of 13 registered tools completed: [Agent Code Slice](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice).** The owner confirmed completion on 2026-09-06. The published [agent-code-slice@0.2.0](https://www.npmjs.com/package/agent-code-slice/v/0.2.0) package identity was checked against npm. It provides code outlines and symbol/line/range slicing through the `code-slice` CLI and JavaScript API; implementation stays in its independent repository.

The Hub provides documentation, a machine-readable [tool registry](TOOL_REGISTRY.json), and a local validator. The remaining twelve entries are not completed in the Hub. The original ten-tool order is preserved; CFML Check, Result Store, and Runtime Trace were appended on 2026-09-07 with [detailed specifications](docs/TOOL_EXPANSION.md). CFML Check now has a local feasibility implementation in the independent `AI-Agent-Tool-CFML-Check` repository, but its Hub lifecycle remains `Planned` until canonical repository identity, maintainer review, and admission evidence are confirmed. Change Impact's observed scaffold does not count as another completed tool.

Delivery completion is separate from Hub standards conformance. Code Slice retains the registry lifecycle `Experimental` because native/Hub protocol compatibility has not been verified; this does **not** mean its delivered tool is unfinished. Its npm identity and recorded release are populated; its Hub verification snapshot remains `null`.

The native Code Slice and draft Change Impact protocols differ from the Hub target JSON/exit/completeness contract. This foundation does not supply a compatibility layer. [TASK.md](TASK.md) tracks the remaining work; [VALIDATION.md](VALIDATION.md) separates source observations from release evidence.

The three-tool Company KB synchronization is currently blocked by a write-scope
denial. Local specifications and the [pending KB update](docs/KB_SYNC.md) are
available; the KB has not yet received these additions.

No `agent-tools` discovery CLI is implemented or published by this Hub. There is no Hub installation command. Future discovery is described in [Architecture](docs/ARCHITECTURE.md#future-discovery-cli).

## Principles

- Local-first; no LLM, API key, or backend required for core operation.
- Deterministic where possible, with bounded input and output.
- CLI-first; stable JSON on stdout, diagnostics on stderr.
- Read-only by default; fail closed when evidence is insufficient.
- Cross-platform support demonstrated by tests.
- Independent releases and evidence-backed capability claims.

## Find your starting point

| Need | Read |
| --- | --- |
| Understand the product and scope | [Product vision](docs/PRODUCT_VISION.md) |
| Navigate documentation and current work | [Documentation index](DOCUMENTATION_INDEX.md), [Task status](TASK.md) |
| Review requirements and delivery decisions | [Specification](SPEC.md), [Design](DESIGN.md), [Epic](EPIC.md) |
| Understand ownership and discovery | [Architecture](docs/ARCHITECTURE.md) |
| Find tools and delivery order | [Registry](TOOL_REGISTRY.json), [Roadmap](ROADMAP.md) |
| Review tool responsibilities and integration gaps | [Tool function review](docs/TOOL_FUNCTION_REVIEW.md) |
| Review the three new tools and acceptance cases | [Expansion review](docs/TOOL_EXPANSION.md), [CFML Check](docs/tools/AGENT_CFML_CHECK.md), [Result Store](docs/tools/AGENT_RESULT_STORE.md), [Runtime Trace](docs/tools/AGENT_RUNTIME_TRACE.md) |
| Reconcile repository documentation with Company KB | [KB synchronization](docs/KB_SYNC.md) |
| Propose or register a tool | [Adding a tool](docs/ADDING_A_TOOL.md) |
| Define capability and lifecycle | [Tool standard](docs/TOOL_STANDARD.md) |
| Design a CLI and its output | [CLI standard](docs/CLI_STANDARD.md), [JSON standard](docs/JSON_STANDARD.md) |
| Review security and release readiness | [Security standard](docs/SECURITY_STANDARD.md), [Release standard](docs/RELEASE_STANDARD.md) |
| Work in this repository as an agent | [AGENTS.md](AGENTS.md) |

## Maintain the Hub

The owner will notify this Hub when another tool is completed. On each notice,
verify the supplied repository and any claimed package/release identity, update
completion documentation and applicable registry fields, validate the changes,
and commit the Hub documentation. Do not infer completion from a scaffold or
start background monitoring. Remaining tools stay pending until notified.

Edit the smallest relevant document and update the registry when a tool's recorded facts change. Submit changes for repository maintainer review; status promotion requires evidence, not a roadmap date. The standards are adopted Hub policy, not a claim that any external tool already conforms.

Run the dependency-free validator with Python 3.9 or newer:

```sh
python3 scripts/validate_hub.py
git diff --check
```

The validator checks registry structure, lifecycle gates, roadmap order, required documents, local Markdown links and anchors, and JSON examples. Remote evidence links must also be opened and reviewed when added or changed; HTTP success alone does not verify a capability. The Hub needs no npm dependencies or runtime framework. See [Validation](VALIDATION.md) for additional checks and limitations.
