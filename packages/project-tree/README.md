# AI Agent Tool Project Tree

[![CI](https://github.com/yapweijun1996/AI-Agent-Tools/actions/workflows/ci.yml/badge.svg)](https://github.com/yapweijun1996/AI-Agent-Tools/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/ai-agent-tool-project-tree.svg)](https://www.npmjs.com/package/ai-agent-tool-project-tree)

`aptree` is a standalone, local-first, serverless NPM CLI/library that gives humans and AI coding agents a deterministic evidence-backed project graph.

It is read-only by default and requires no server, cloud, database, API key, LLM, telemetry, or project-command execution.

## MVP install/use

```bash
npm install -g ai-agent-tool-project-tree
aptree context --root . --pretty
aptree evidence --root .
aptree tests-for --root . --path src/index.js
aptree changed --root .
aptree goals --root .
```

## CLI

Commands: `context`, `impact`, `changed`, `tests-for`, `evidence`, `goals`, `progress`, `path-to-done`.

All commands emit bounded JSON envelopes with stable node IDs, provenance, freshness metadata, and safe root-relative paths. The MVP scanner is Node/JS/TS first-class with generic text fallback, local JS/TS import edges, static package/test evidence, and a read-only Git HEAD change adapter for `changed`.

Package/test evidence is derived only from files such as `package.json`, lock/workspace/config files, dependency/script declarations, test filenames, static imports, and test config filenames. Scripts and test runners are never executed.

## JSON schema

The public JSON compatibility schema is packaged at `schemas/aptree.schema.v1.json` and exported as `ai-agent-tool-project-tree/schema`. It describes the stable graph/query envelopes, graph nodes/edges, provenance/freshness, metadata, change adapter shape, and command-specific optional result arrays.

## Library

```js
import { buildProjectGraph, queryGraph } from 'ai-agent-tool-project-tree';

const graph = await buildProjectGraph({ root: process.cwd(), maxFiles: 1000 });
const evidence = queryGraph(graph, 'evidence');
```

## Safety boundaries

- No command execution in target projects.
- No network, API keys, database, telemetry, or LLM dependency.
- Refuses query paths outside the chosen root.
- Checks parent traversal by path segment; legal in-root names such as `..config.js` and `..cache/` remain usable.
- Ignores common generated/heavy directories such as `.git`, `node_modules`, `dist`, `build`, and `coverage`.

## Development

```bash
npm install
npm test              # unit tests
npm run test:coverage # unit tests with a coverage report
npm run lint           # ESLint
npm run format          # Prettier, writes changes
npm run format:check    # Prettier, check only
npm run typecheck       # validates types/index.d.ts against tsconfig.json
npm run smoke            # builds a real graph over this repo and sanity-checks the envelope
```

CI (`.github/workflows/ci.yml`) runs all of the above across Node 18.17/20/22 on Ubuntu, macOS, and Windows on every push and pull request to `main`.

## Status

MVP: complete deterministic filesystem graph, CLI query contracts, static evidence adapters, packaged JSON schema, safety boundaries, and tests. See `docs/ROADMAP.md` for status.
