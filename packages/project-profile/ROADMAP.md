# Delivery Roadmap

## Current state

The repository contains the owner-authorized V1 implementation, CLI, versioned JSON Schema, frozen synthetic fixture projections, build configuration, and a cross-platform CI definition. This corrective branch prepares release source `agent-project-profile@0.1.2` from upstream baseline `d5f5b0ce6b32ba24150a91a663d842e864ea1e6b`; npm `latest` was `0.1.1` at task start. GitHub Actions run `34096395160` already proves Windows, Linux, and macOS success on Node 18.18, 20, and 22. The corrective release adds the missing packaged-install executable gate before any `0.1.2` publication claim.

The current task authorized implementation and publication. The phases below remain delivery tracking, not a silent promotion of the canonical ecosystem roadmap state.

### Canonical KB snapshot: 2026-09-07

Source: `Tool Status — agent-project-profile`, item `9aa9a2f8-3453-476f-b8c9-b68791c4a775` in Company KB `ai-agent-tools`. This is a dated readback, not a second active status registry.

| Axis | Recorded value |
| --- | --- |
| `roadmap_order` | `3` |
| `roadmap_state` | `next` |
| `design_status` | `approved` |
| `development_status` | `in_progress` |
| `verification_status` | `partial` |
| `release_status` | `released` |
| `evidence_status` | `partial` |

The recorded prerequisite is completion of standalone `agent-change-impact`; older Codeloom work is prior art only. This is a delivery sequencing condition, not a runtime dependency on Change Impact. The owner explicitly authorized this implementation task, so development proceeds under that instruction without changing the canonical `roadmap_state: next` or claiming ecosystem activation.

The approved status applies to the product boundary. Local detailed implementation decisions and remaining evidence are tracked in [DECISIONS.md](DECISIONS.md) and [TEST_PLAN.md](TEST_PLAN.md).

## Phase 1: Freeze the executable contract

Deliver the actual JSON Schema, finite detector tables, package-manager declaration grammar, workspace pattern rules, and representative full profiles. Select implementation/runtime/distribution details based on the documented constraints.

Exit evidence: schema-valid reviewed examples for complete, partial, unsupported, and error states; all [DECISIONS.md](DECISIONS.md) implementation choices resolved and remaining lifecycle evidence explicitly assigned. This phase is delivered in the worktree.

## Phase 2: Read boundary and generic inventory

Implement the CLI envelope, scanner confinement, skip rules, deterministic enumeration, budgets, evidence locators, and generic instruction/CI/config/ecosystem inventory.

Exit evidence: no-write/no-execution/no-network boundary tests, secret/link protections, valid generic and fatal outputs, repeatable serialization. This phase is delivered in the worktree.

## Phase 3: Node facts and conflict handling

Implement Node manifests, package managers, runtime declarations, script purposes, declared entrypoints, and centralized status/diagnostic reduction.

Exit evidence: single-package fixtures, unknown/contradictory manager cases, missing/invalid metadata cases, and evidence reference checks pass. This phase is delivered in the worktree.

## Phase 4: Bounded workspaces

Implement workspace patterns, exclusions, member-scoped facts and manager inheritance, ancestor instruction inventory, limits, exact/unknown totals, and reference-preserving output truncation.

Exit evidence: workspace fixtures and large/adversarial trees stay within budgets with deterministic partial outputs. This phase is delivered in the worktree.

## Phase 5: Cross-platform release validation

Run the complete [TEST_PLAN.md](TEST_PLAN.md) on Windows, macOS, and Linux. Measure performance, review golden diffs, validate distribution behavior, and document remaining limitations.

Exit evidence: every release checklist item has observable supporting results. GitHub Actions run `34096395160` supplies Windows, Linux, and macOS evidence across all three supported Node lines, and the independent 100,000-file benchmark remains recorded. For `0.1.2`, distribution acceptance additionally requires the packaged-consumer E2E to pass in CI and the registry-installed binary to pass after publication. Development verification and release remain independent: CI success does not itself prove npm publication, and registry publication does not replace executable-path verification.

## Current evidence and KB maintenance

Use [IMPLEMENTATION_BRIEF.md](IMPLEMENTATION_BRIEF.md) for scope, [TEST_PLAN.md](TEST_PLAN.md) for verification, and the KB maintenance rules in [DECISIONS.md](DECISIONS.md) for lifecycle updates. The implementation report must give the tested commit/worktree identity, actual checks, limitations, and release/package state. Missing evidence remains unknown; writing this roadmap does not promote the ecosystem roadmap or replace evidence-based KB maintenance. The existing Company KB status record is updated in place for meaningful lifecycle evidence, while the ecosystem SSOT remains at `agent-project-profile: next`.

## Deferred work

Potential later work includes CI command cross-checking, additional language adapters, and stronger project-type classification. Each needs separate evidence and scope decisions. Deep source analysis, rule resolution, execution, and downstream context assembly retain their separate tool ownership even after V1.
