# Agent Guide

This repository's source of truth is code plus the structured docs in `docs/`. Do not create competing state systems.

Rules:

- Keep the package local-first, deterministic, serverless, and read-only by default.
- Do not add telemetry, required network calls, project command execution, secrets, or generated large files.
- Preserve stable JSON contracts or document breaking changes before release.
- Run `npm test` and an `aptree` smoke check before claiming completion.
