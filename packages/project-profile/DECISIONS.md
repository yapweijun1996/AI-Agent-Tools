# V1 Contract Decisions

Status: approved product boundary with an owner-authorized V1 implementation. This document records provenance, implementation decisions, verification boundaries, and lifecycle evidence. It does not change the Company KB roadmap order; publication is recorded separately when explicitly authorized.

## Source and authority

The Company KB `AI Agent Tools`, KBID `ai-agent-tools`, UUID `3e631a61-d63d-4c25-aaac-cd1557b063f2`, is the project knowledge SSOT. The following records were read through KB-MCP on 2026-09-07. Use their IDs for future retrieval; this table is a source index, not a copied status registry.

| Record | Item ID |
| --- | --- |
| AI-Agent-Tools Canonical Ecosystem SSOT - 2026-09-07 | `5e5c8c5e-c3e9-460d-a985-3165e0b83031` |
| agent-project-profile V1 - Approved Product Boundary | `e493bb6d-c8b4-478a-ba18-1e938f7e8915` |
| Tool Status - agent-project-profile | `9aa9a2f8-3453-476f-b8c9-b68791c4a775` |
| AI-Agent-Tools Tool Status Record Schema v1 | `6c736cc3-756b-435c-9ae0-2f911143f4ad` |
| AI-Agent-Tools KB Maintenance Rule v1 | `83d272d8-2965-4dee-9f93-b10fe760c6e9` |
| ai-agent-tools:kb-maintenance | `0fb4d79d-c9fa-4787-9e61-1ad037394875` |

The owner-provided 28-section V1 brief and subsequent implementation text are task inputs. They support the Repo Intelligence Foundation positioning and detail the intended work. The latest owner instruction explicitly authorizes implementation in this task, while also requiring that the recorded roadmap prerequisite and ecosystem status not be silently changed. Explicit current owner requirements can change a prior decision, but differences must be recorded rather than silently attributed to the KB. This implementation therefore proceeds under owner authorization while the canonical `roadmap_state` remains `next`.

The brief includes a statement about KB-MCP QA prior art. That statement is retained as owner-supplied context; this session did not independently retrieve or verify the cited prior art. Frozen fixtures and unknown-evidence handling are explicit requirements regardless of that attribution.

Repository documents divide responsibility: README is orientation, SPEC defines the local external contract, DESIGN describes internal boundaries, TEST_PLAN defines validation, ROADMAP holds delivery planning and a dated KB snapshot, and IMPLEMENTATION_BRIEF records the execution scope. KB owns canonical project decisions/status; the separate ecosystem hub owns shared registry/standards/compatibility/roadmap artifacts. Agent Brain remains a pointer/cache. Where current evidence disagrees with a document or KB claim, investigate and update the authoritative record with evidence instead of maintaining competing truths.

## Local detailed contract proposals

The choices below resolve gaps in the local draft. They are not all independently approved by the KB; the KB remains authoritative for product scope and lifecycle. This implementation freezes the field shapes/nullability, `coverage`, exact script-name mapping, Git marker semantics, workspace grammar/inheritance, skip/link policy, diagnostic severities, error envelopes, exit/strict-mode rules, evidence ID formatting, and numeric budgets in the executable contract. Read these as one coherent implementation decision set, with remaining lifecycle evidence tracked separately.

| Topic | Selected V1 decision | Reason |
| --- | --- | --- |
| Singular/plural names | `runtimes` and `workspace` only | The brief used multiple variants; consumers need one contract |
| Scope of scripts | Group script names by `cwd` | Root and member scripts can share names |
| Command purposes | Include all seven named purposes; exact-name matching | Avoid guessing semantic intent from arbitrary script names |
| Unknown invocation | Keep script declaration with `argv: null` | Discovery remains useful without inventing a package manager |
| Declaration vs lockfiles | Declaration remains the selected fact; contradictions suppress invocation and make status partial | Priority must not conceal conflicting operational evidence |
| Two npm lockfiles | Multiple files, one manager family | File count alone is not manager disagreement |
| Workspace inheritance | Inherit root manager only without contradictory member evidence | Prevent silently applying a root command strategy to another manager's package |
| Scan boundary | Caller-selected directory, no parent traversal | Predictable access boundary; package-level profiling stays possible |
| Git detection | Metadata-only `.git` marker; no Git command or internal reads | Respect the no-execution/no-`.git`-traversal boundary |
| Instruction scope | Root, member roots, and intermediate ancestors; no rule interpretation | Useful bounded inventory without duplicating Rules Resolve |
| Instruction conflict | Reserve the code; never emit it from V1 inventory | Coexistence does not prove contradictory rules |
| Runtime declarations | Keep support constraints and development pins as distinct roles | Different purposes must not become false conflicts |
| Missing entrypoint target | Informational, preserve declaration | Built output may not exist before a build |
| Missing canonical scripts | Informational only after complete valid manifest inspection | Absence is not a broken project; unreadable is not absent |
| Exact workspace total | `null` if enumeration did not finish | A capped sample cannot prove a total |
| Coverage | Add explicit category completeness and budgets | Empty arrays otherwise hide scan failures or truncation |
| Strict mode | Same profile/status; warning/error diagnostics cause exit `2` | Useful extra enforcement without changing discovered facts |
| Unsupported exit | Emit generic inventory, status unsupported, exit `2` | Preserve information while signaling first-class coverage is unavailable |
| Generic empty repo | Complete inventory with unknown kind is allowed | Unknown identity is an honest fact, not a fatal error |
| Error output | Same required envelope fields with unknown/empty defaults | Machine consumers receive one predictable top-level format |
| Serialization | Stable evidence IDs, sort order, no volatile profile fields | Frozen fixtures should capture true differences, not machine noise |
| Report files | Only caller shell redirection creates files | Preserve zero profiler writes |

## Implementation decisions and remaining release evidence

The following implementation decisions are now resolved in the worktree:

- Implementation language/runtime: TypeScript compiled to ESM JavaScript, Node.js `>=18.18.0`.
- Distribution/dependencies: standalone package `agent-project-profile`, zero runtime dependencies, development-only TypeScript/Node types/Ajv dependencies. Release source is currently `0.1.2`.
- Budgets: fixed values in `src/constants.ts` and the JSON Schema; workspace and oversized-tree fixtures exercise deterministic overflow behavior.
- Parsing and detection tables: bounded inert JSON parsing, a restricted YAML subset for `pnpm-workspace.yaml`, finite config/CI/instruction tables, and explicit unsupported syntax diagnostics.
- Contract: executable JSON Schema `schema/profile.schema.json` with semantic validation and golden/edge coverage.
- Package-manager grammar: npm/pnpm/Yarn declarations, lockfiles, integrity suffix handling, conflicts, malformed declarations, and unsupported names are covered by implementation tests.

The following remain lifecycle or release evidence, not unresolved product design:

- Cross-platform implementation evidence exists in GitHub Actions run `34096395160`: Windows, Linux, and macOS passed on Node 18.18, 20, and 22. The historical run did not validate the npm-installed binary path.
- The tracked 100,000-file benchmark records bounded profiling behavior on Windows; a release latency target is intentionally not generalized from one machine.
- Registry availability and publication of `agent-project-profile@0.1.0` were verified after explicit owner authorization. The release commit is `4e892862d20711e6e5837c10a29edf312c8100a0`; no release tag was created.

Changes to these decisions must update the relevant normative specification and test expectations together. Do not expand V1 into AST analysis, deep CI parsing, language-wide support, or execution to solve an unrelated convenience issue.

## SCMC baseline review of the supplied implementation brief

### Scope

- Artifact: the owner-provided implementation text beginning "You are implementing the next standalone tool" and the local documentation baseline.
- Goal: produce an unambiguous implementation handoff with explicit activation, safety, and evidence boundaries.
- Evidence: the supplied text, six existing repository documents, and the six KB records indexed above.
- Constraints: retain the approved product scope, no target execution/writes/network/secrets, bounded evidence-backed output, independent tool ownership, and honest lifecycle evidence.

### Result

- Simple: PASS.
- Clear: WARN.
- Modular: PASS.
- Consistent: WARN.

### Findings and corrections

1. **[Medium] [Clear] Activation and roadmap timing were implicit at the documentation baseline.**
   Consequence: an implementation-style opening could be mistaken for authorization, or start development before the recorded prerequisite.
   Recommendation: make the handoff conditional on explicit implementation authorization and a fresh roadmap readback.
   Preserve: the approved V1 scope and current ability to review documentation.
   Verify: IMPLEMENTATION_BRIEF and ROADMAP explicitly distinguish documentation work, delivery sequencing, and runtime dependencies.

2. **[Medium] [Clear] Verification commands did not name their execution boundary.**
   Consequence: "run build/tests" could be confused with executing commands found inside target repositories.
   Recommendation: identify the profiler project's own tests and separately instrument target profiling.
   Preserve: golden fixtures and all no-execution/no-network/no-write guarantees for the profiler.
   Verify: TEST_PLAN separates fixture preparation, the harness, and the profiler under test.

3. **[Medium] [Consistent] "JSON Schema or equivalent" weakened an approved deliverable.**
   Consequence: internal types alone could be presented as the external machine-verifiable contract, despite the KB specifying JSON Schema.
   Recommendation: deliver JSON Schema plus semantic checks; keep exact local schema details visibly provisional before freeze.
   Preserve: schema versioning and validation requirements.
   Verify: SPEC, TEST_PLAN, and IMPLEMENTATION_BRIEF require an actual JSON Schema and do not present proposals as approved releases.

4. **[Medium] [Clear] Platform and final-report wording could overstate completion or expand scope.**
   Consequence: missing CI coverage could be hidden behind "where supported"; "CLI/API examples" could imply an unrequested API; an exact-SHA demand could misidentify an uncommitted tested tree.
   Recommendation: report unavailable platforms as unverified, include API examples only when delivered, and identify the tested commit plus worktree changes without requiring an automatic commit.
   Preserve: independent verification, cross-platform goals, and truthful release reporting.
   Verify: TEST_PLAN defines these evidence requirements explicitly.

5. **[Medium] [Consistent] KB maintenance was described only after successful verification.**
   Consequence: meaningful failure, blocker, design, or release changes could leave canonical records stale until success.
   Recommendation: apply maintenance to all meaningful lifecycle changes; reserve completion promotion for sufficient evidence and passed verification.
   Preserve: one active record per tool, separate status axes, and verified readback.
   Verify: the workflow below covers design/detail updates and non-success states without promoting this documentation task.

### Baseline overall

- Decision on supplied text: PASS WITH WARNINGS.
- Main reason: the product boundary is coherent; execution timing, evidence scope, and lifecycle wording need clarification.
- Highest-value next action at the baseline: use the corrected IMPLEMENTATION_BRIEF for an explicitly authorized implementation task after reviewing the remaining contract proposals.
- Baseline documentation correction result: Simple PASS, Clear PASS, Modular PASS, Consistent PASS; overall PASS for the reviewed wording. Runtime safety, performance, schema validity, and platform compatibility were intentionally unverified at that point.

## V1 implementation decision record — 2026-09-07

- The owner explicitly authorized implementation and required reconciliation with, rather than silent mutation of, the recorded `agent-change-impact` prerequisite.
- The selected design is a standalone local package. Responsibilities stay bounded: `Scanner` owns the read boundary and budgets, detectors own narrow declarations, normalization owns stable evidence IDs, and semantic validation owns envelope invariants.
- The profiler only reads allowlisted metadata and sentinel names. It does not execute target commands, install dependencies, access network/LLMs/secrets, or write to the selected repository. Discovered commands remain project declarations with `execution: "not_run"`.
- The worktree contains the implementation, schema, CI definition, frozen fixture projections, and tests. The implementation is committed at `4e892862d20711e6e5837c10a29edf312c8100a0` and published as `agent-project-profile@0.1.0`; no release tag was created.
- Final SCMC review against the actual implementation and documentation is recorded below; the baseline brief review is retained as historical provenance, not as runtime verification.

## KB maintenance readback — 2026-09-07

- Updated the existing Company KB status item `9aa9a2f8-3453-476f-b8c9-b68791c4a775` in place; no duplicate status record was created.
- Persisted axes: `roadmap_state=next`, `design_status=approved`, `development_status=in_progress`, `verification_status=partial`, `release_status=released`, and `evidence_status=partial`.
- Persisted package/repository state: `agent-project-profile@0.1.0`, commit `4e892862d20711e6e5837c10a29edf312c8100a0`, clean worktree, npm registry publication verified, and no release tag. The record names macOS verification as the remaining blocker and records Windows/Linux evidence.
- Readback of the ecosystem SSOT `5e5c8c5e-c3e9-460d-a985-3165e0b83031` confirmed that its roadmap ordering and `agent-project-profile NEXT` status are unchanged.

## Final SCMC review — 2026-09-07

### Scope

- Artifact: `src/`, `schema/profile.schema.json`, `examples/`, `test/`, package metadata, CI, and the updated repository documentation.
- Goal: deliver the smallest complete deterministic V1 profiler within the approved local-first read-only boundary.
- Evidence: source inspection, the 31-test Windows/Linux runs, schema/example validation, the 100,000-file benchmark, package dry-run, npm registry readback, and KB readback.
- Invariants: no target execution/install/network/LLM/secret-body access/writes; unknown and partial evidence remain explicit; package-manager conflicts suppress invocation.

### Result

- Simple: PASS — one standalone package, no framework or premature shared core, and fixed bounded policies.
- Clear: PASS — CLI, schema, diagnostics, ownership, failure behavior, and lifecycle state are documented.
- Modular: PASS — scanner, detectors, normalization, semantic validation, CLI, and schema have distinct change ownership.
- Consistent: PASS — the implementation follows the inspected ESM/CLI/JSON/error/path/test conventions without importing unrelated AST architecture.

### Overall

- Decision: PASS.
- Main reason: no material SCMC complexity, ownership ambiguity, or pattern drift remains in the reviewed implementation; the only open item is external macOS verification evidence, not a design defect.
- Highest-value next action: run the existing CI matrix or an equivalent macOS verifier, then reassess the lifecycle axes without changing roadmap order implicitly.

## KB maintenance workflow for future material changes

Use `ai-agent-tools:kb-maintenance` and refresh the records in the source index. Each tool has exactly one active canonical `tool_status_record` using `ai-agent-tools/tool-status/v1`; update the existing Project Profile record, never create a parallel current-status record.

1. Classify the actual change: product/design detail, development, verification, release, limitation, prior art, or roadmap.
2. Update existing design/detail knowledge only when its durable facts change. Keep proposed details distinguishable from approved decisions.
3. For status changes, preserve the six independent axes: `roadmap_state`, `design_status`, `development_status`, `verification_status`, `release_status`, and `evidence_status`. Record failures, blockers, or stale evidence when observed; do not wait only for success.
4. Development `completed` requires `evidence_status: sufficient` and `verification_status: passed`. Release remains independent. Prior-art success is not current-tool proof.
5. Synchronize the Canonical Ecosystem SSOT only when roadmap order/state changes. Do not activate Project Profile merely because its documentation changed.
6. Use company share tier and stable idempotency keys for exact retries. Attach verifiable source/evidence references without inventing commits or test results.
7. Read back the affected record and ecosystem state after writes before reporting a successful KB update.

This record aligns local prose with the approved KB boundary and the owner-authorized implementation. Company KB status maintenance is performed separately through the existing Project Profile status record; ecosystem roadmap state remains unchanged unless an explicit roadmap decision is made.

## Corrective npm executable decision — 2026-09-07

- `0.1.1` demonstrated a distribution-only failure: direct `node dist/cli.js` execution worked, while the npm-created binary could exit successfully with empty stdout because `cli.ts` compared `process.argv[1]` against `import.meta.url` and the npm bin path could be a symlink/shim path.
- The corrective architecture separates concerns: `src/cli.ts` owns exported `main()` and CLI behavior; `src/bin.ts` is the dedicated shebang entrypoint and unconditionally assigns `process.exitCode = main()`. Package `bin` maps to `dist/bin.js`.
- Permanent release rule: any package exposing `bin` must run a packaged-consumer E2E that packs the source, installs the tarball into a clean project, and executes the installed npm binary. Direct `dist` execution is not distribution evidence.
- Corrective release version is `0.1.2`. Registry publication remains blocked until the exact release source reaches the intended upstream branch and the required CI passes.
