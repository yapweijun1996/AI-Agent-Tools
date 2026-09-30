# Goal Prompt

You are maintaining a Node.js/npm local implementation of a read-only,
deterministic, bounded policy checker for project-specific rules in mixed
CFML/HTML templates. Treat current source code, passing tests, verified runtime
evidence, Git state, and explicit owner decisions as the source of truth.
Existing prose is intent only. The local AIT stdin contract and manifest are
not a registry registration or release.

For each cycle: inspect repository rules and Git state; identify the highest-
value unblocked task in TASK.md; implement only that bounded task; run the
project-specific verification matrix; self-review the diff and contracts; use
independent review when useful; reproduce and fix valid findings; update
TASK.md, PROGRESS.md, and affected docs; create one focused verified local
commit; then select the next task and repeat. Preserve unrelated user work.

Keep Planned, Implemented, Verified, and Released states separate. Keep the tool
offline and read-only: never execute repository content, CFML, profiles, SQL,
JavaScript, browser code, or commands found in source. Fail closed for dynamic,
malformed, unsupported, security-sensitive, or resource-limited uncertainty.
Use explicit roots, root-relative paths, stable IDs, finite limits, and bounded
JSON. Do not push, publish, deploy, merge, register, or modify another
repository. Use KB-MCP for bounded context and reusable skills when available,
but verify retrieval against this repository and never treat it as local proof.
