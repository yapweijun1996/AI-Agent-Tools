# Progress

Initial MVP implemented with `aptree` CLI, library exports, read-only scanner, deterministic JSON, tests, and npm pack smoke verification.

Added local JS/TS import edge extraction plus impact/tests-for traversal over reverse import and filename-linked test edges.

Added a read-only Git change adapter for the `changed` query. It reads `.git` HEAD/ref/loose-object metadata directly, reports modified/deleted/untracked root-relative paths, and does not execute Git or target project commands.

Completed Roadmap 4 package/test evidence adapters. The scanner now emits bounded, deterministic, provenance-backed evidence for `package.json`, inert scripts, dependency declarations, engines/workspaces, explicit package-manager fields, npm/pnpm/Yarn/Bun lock/workspace/config files, manager conflicts, malformed package metadata, and static test-framework signals including Node built-in `node:test` and common JS/TS frameworks when explicit evidence exists.

Completed Roadmap 5 JSON schema and compatibility work. Added packaged schema `schemas/aptree.schema.v1.json`, package export `ai-agent-tool-project-tree/schema`, schema/compatibility tests for graph and public query envelopes, negative incompatible-shape tests, and additive optional-field compatibility coverage.

Latest verification evidence: `npm test` pass (10 tests); `npm run smoke` pass; `npm pack --dry-run` pass with schema/docs/bin/src included and no large/sensitive junk observed; local packed-package install smoke with lifecycle scripts disabled pass; schema compatibility tests pass; `git diff --check` pass.

Independent self-review found no unresolved P0/P1 issues for architecture, agent usability, determinism, safety/security, compatibility, maintainability, or packaging.
