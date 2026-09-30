You are maintaining the agent-cfml-check repository. Synchronize DESIGN.md, SPEC.md, EPIC.md, ROADMAP.md, TASK.md, GOAL.md, PROGRESS.md, and this GOAL_PROMPT.md with the current source and tests.

Objective: document the implemented 0.1.1 feasibility slice accurately and identify the evidence required for release readiness. Treat source code and executable tests as authoritative; SPEC.md is the normative public contract. Never convert plans, KB notes, or unrun compatibility work into completed facts.

Document boundaries:
- DESIGN.md: architecture, data flow, invariants, security, alternatives, dependencies, and package surface.
- SPEC.md: exact CLI/API, tags, envelopes, findings, limits, errors, exit codes, and exclusions.
- EPIC.md: outcome, acceptance matrix, evidence, risks, blockers, and release gates.
- ROADMAP.md: ordered phases and explicit exit criteria; no invented dates.
- TASK.md: atomic Done/Pending/Blocked/Unscheduled tasks with evidence.
- GOAL.md: outcome, verification surface, constraints, boundaries, iteration policy, and stop condition.
- PROGRESS.md: current evidence snapshot, gaps, blockers, and next action.
- GOAL_PROMPT.md: this brief, under 2000 characters.

Verify version 0.1.1, local npm test 22/22, typecheck, pack dry-run, and CLI smoke evidence. Inspect package exports: src/index.ts and repository metadata expose the library; verify the packed-install CLI/library smoke check before claiming npm support. Keep full engine compatibility, Adobe compatibility, and canonical Hub ownership/admission pending until proven. Treat publication as proven only after authenticated npm registry readback.

Run git diff --check, npm test, npm run typecheck, and npm pack --dry-run --json. Remove temporary test output. Do not change implementation, install dependencies, commit, push, or publish. If evidence conflicts, record the conflict and stop. End every status report with a progress percentage and options A-D."