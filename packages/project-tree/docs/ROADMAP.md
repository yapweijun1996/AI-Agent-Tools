# Roadmap

1. MVP filesystem graph and CLI contracts. ✅
2. JS/TS import/export edge extraction. ✅
3. Git change-plane adapter for `changed` without mutating repositories, including packed-object (`git gc`/fresh-clone) support. ✅
4. Package manager/test framework evidence adapters. ✅
5. JSON schema publication and compatibility tests. ✅
6. Production infrastructure: CI (GitHub Actions, Node 18.17/20/22 × Ubuntu/macOS/Windows matrix), ESLint + Prettier, hand-written `.d.ts` type declarations, and test coverage reporting. ✅
7. Real Goal/Task/Progress state model: parsed task status (not just filename discovery), blockers/decisions, and a computed `path-to-done` critical path. ⏳ not started.
8. Managed, approval-gated writes (`propose → validate → preview → apply → readback`) for project-owned state, per the architecture draft. ⏳ not started.
