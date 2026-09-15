# AI-Agent-Tools

Small, focused tools that help AI coding agents read less, guess less, execute more precisely, and verify more.

This repository is the ecosystem **Hub**: registry, standards, discovery, roadmap, governance, and the explicitly authorized dependency-free AIT install/dispatch runtime. Each tool remains in its own repository and npm package, with independent tests, versions, and releases. AIT manages packages but does not own tool implementations or agent reasoning.

## Current state

**1 of 14 registered tools completed: [Agent Code Slice](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice).** The owner confirmed completion on 2026-09-06. The published [agent-code-slice@0.2.0](https://www.npmjs.com/package/agent-code-slice/v/0.2.0) package identity was checked against npm. It provides code outlines and symbol/line/range slicing through the `code-slice` CLI and JavaScript API; implementation stays in its independent repository.

The Hub provides documentation, a machine-readable [tool registry](TOOL_REGISTRY.json), a local validator, and the local `ait` CLI. The remaining thirteen entries are not completed in the Hub. The original ten-tool order is preserved; CFML Check, Result Store, and Runtime Trace were appended on 2026-09-07 with [detailed specifications](docs/TOOL_EXPANSION.md). CFML Check, Change Impact, and Test Scope now have inspectable independent implementations and basic test evidence, so their Hub lifecycle is `Experimental`; their delivery completion and protocol conformance remain separate. Symbol Search was appended on 2026-09-08 after an implementation admission review and remains `Experimental`; its published `0.1.2` artifact is now audited, while delivery completion and protocol conformance remain separate. Result Store and Runtime Trace remain Planned.

Project Profile now has a confirmed repository, published npm identity, and
inspectable implementation, so its Hub lifecycle is `Experimental`; it is not
counted as delivery `Done` because the corrected source `0.1.2` is not published.
A prior audit recorded a `0.1.1` CLI distribution defect, while the current exact
artifact re-audit did not reproduce it on this host. The exact published artifact
omits its declared MIT `LICENSE` file, and the release/platform discrepancy remains
unresolved.

Delivery completion is separate from Hub standards conformance. Code Slice retains the registry lifecycle `Experimental` because native/Hub protocol compatibility has not been verified; this does **not** mean its delivered tool is unfinished. Its npm identity and recorded release are populated; its Hub verification snapshot remains `null`.

The native Code Slice, draft Change Impact, Project Profile, and Test Scope protocols differ from the Hub target JSON/exit/completeness contract. AIT applies only explicit exact-version consumer profiles and does not provide a universal compatibility layer. [TASK.md](TASK.md) tracks the remaining work; [VALIDATION.md](VALIDATION.md) separates source observations from release evidence.

The three-tool and status reconciliation was synchronized at User tier and read
back. Company-tier visibility remains blocked by the existing write-scope denial;
see the [KB receipt](docs/KB_SYNC.md).

The local `agent-tools` package provides the `ait` discovery, install, doctor, and
dispatch CLI. Its packed default-registry omission was corrected, but it remains
private/`UNLICENSED` and is not yet published. Installation and execution are
explicit, version-pinned, and fail closed when registry identity or approval is
missing; see [AIT runtime](docs/AIT_RUNTIME.md) and
[Architecture](docs/ARCHITECTURE.md#ait-discovery-installation-and-dispatch-runtime).

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

The validator checks registry structure, lifecycle gates, roadmap order, required documents, local Markdown links and anchors, and JSON examples. Remote evidence links must also be opened and reviewed when added or changed; HTTP success alone does not verify a capability. The AIT runtime has no third-party npm dependencies or framework; the validator
uses Python's standard library. See [Validation](VALIDATION.md) for additional
checks and limitations.
