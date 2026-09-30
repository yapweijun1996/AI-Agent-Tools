# Agent Error Lens

Agent Error Lens is a deterministic, local-first diagnostic parser for AI coding agents. It converts bounded compiler, test, linter, build, and CLI output into small, structured diagnostics with evidence spans.

> Error Lens owns parsing and evidence normalization. The consuming agent owns investigation, reasoning, code changes, and verification.

## Status

The current package is `0.1.0`, ESM-only, MIT-licensed, and private while release ownership and registry evidence are being prepared. It is not published to npm yet. Do not treat a successful parse as a successful project command: `producerOutcome` records the command outcome separately from the parser `status`.

## Supported producers

- TypeScript compiler diagnostics;
- Vitest failures and assertion locations;
- ESLint file, location, and rule diagnostics;
- generic structured diagnostics supplied as JSON;
- conservative generic text candidates.

Generic text never receives `confirmed` confidence without producer-specific evidence.

## Requirements

- Node.js `>=20.11.0 <25`;
- ESM import or the packaged CLI;
- zero runtime dependencies.

CommonJS support is not implied.

## Global installation for Codex CLI

Install the published CLI from any directory:

```sh
npm install --global agent-error-lens@latest
agent-error-lens capabilities --format json
```

The package exposes the `agent-error-lens` command globally. For a repository
checkout, run `npm ci`, `npm run build`, and invoke `node dist/src/cli.js`.

## Library usage

```ts
import { parse } from "agent-error-lens";

const result = parse({
  schemaVersion: "1",
  artifacts: [
    {
      id: "stderr",
      stream: "stderr",
      content: "src/order.ts(41,18): error TS2339: Property total does not exist\n",
    },
  ],
  producerOutcome: { command: "npm run typecheck", exitCode: 2 },
});

for (const diagnostic of result.data.diagnostics) {
  console.log(diagnostic.location, diagnostic.message);
}
```

The library is stateless and read-only. It does not execute commands, inspect the repository, access the network, call an LLM, or modify files.

## CLI usage

The CLI accepts one JSON request on stdin and emits canonical JSON on stdout:

```bash
printf '%s' '{"schemaVersion":"1","artifacts":[{"id":"stderr","stream":"stderr","content":"src/order.ts(41,18): error TS2339: Property total does not exist\n"}]}' \
  | agent-error-lens parse --stdin --format json
```

For a source checkout before npm publication, build first and run `node dist/src/cli.js` with the same arguments. `--root <path>` enables lexical path containment; it does not read the filesystem.

CLI exit semantics:

| Exit | Meaning |
| ---: | --- |
| `0` | Parsing completed, including a bounded `partial` result |
| `1` | The request could not be processed as a valid parser request |
| `2` | CLI usage, JSON transport, stdin size, or UTF-8 error |

The producer command's exit code remains in `producerOutcome.exitCode` and is independent of these parser exits.

## Contract and limits

The JSON Schema is the public contract and is available at [`contract/agent-error-lens-v1.schema.json`](contract/agent-error-lens-v1.schema.json). The TypeScript declarations are a checked projection.

V0.1 bounds include 2 MiB per artifact, 20 MiB per request, 200 diagnostics, 64 KiB per evidence span, 16 KiB per line, and deterministic secondary work budgets. Inputs are untrusted data: logs cannot execute instructions, commands, URLs, or code. Sensitive values are redacted from exported fields and stable identities.

## Development

```bash
npm ci
npm test
npm run pack:check
```

`npm test` runs contract and fixture checks, typecheck, lint, build, package/consumer smoke, and Node tests. The release workflow uses the same suite with an explicit release-mode package boundary after a maintainer has prepared an authorized release commit.

## Release status

The repository contains a release runbook at [`docs/release.md`](docs/release.md) and a manual, tag-bound GitHub Actions workflow at [`.github/workflows/release.yml`](.github/workflows/release.yml). The workflow is dormant until npm ownership, trusted publishing, `private: false`, an authorized SemVer tag, and release approval are all in place. No release or publish is performed by normal tests.

## License

MIT. See [`LICENSE`](LICENSE).
