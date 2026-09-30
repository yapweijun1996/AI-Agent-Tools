# Environment Doctor

Read-only requirements-versus-evidence checking for Node, npm, Python and Codex CLI. Package `ai-agent-tool-environment-doctor`, executable `agent-env-doctor`. The shorter npm name `agent-environment-doctor` belongs to another author; this name avoids that collision. Private source MVP, Apache-2.0; no npm release.

From the repository root, run `npm run bootstrap`, then:

```sh
node packages/environment-doctor/src/cli.js capabilities --json
node packages/environment-doctor/src/cli.js check --requirements packages/environment-doctor/examples/requirements.json --snapshot packages/environment-doctor/examples/snapshot.json --json
node packages/environment-doctor/src/cli.js check --requirements packages/environment-doctor/examples/requirements.json --live --manifest package.json --json
```

Node 22.13+ in the 22 line or Node 24 is supported. `npm install -g ./packages/environment-doctor` exposes the executable; this explicit local install is separate from AIT npm dispatch, which has no published identity for this tool.

Requirements use `schemaVersion: "1.0"`, optional `runtimes` mapping `node`, `npm`, `python`, `codex` to npm semver ranges or null for presence only; `configuration` is an array of environment variable **names**; `paths` is an array of `{id,path,permissions:["read","write","execute"]}` with only requested permissions. Snapshot uses the same schemaVersion, `runtimes` mapping names to `{available:boolean|null,version?:string|null,path?:string|null}`, `configuration` mapping names to boolean/null presence, and `paths` mapping IDs to permission boolean/null evidence. Other fields and configuration values are rejected. Example inputs are sanitized, synthetic snapshots, not live verification.

Missing evidence is unknown. Empty requirements are unknown. Every check contains expected/observed evidence, input source and JSON pointers. Optional `--manifest` also evaluates actual package.json `engines.node` and `engines.npm`. Result schema is [schema/result.schema.json](schema/result.schema.json). Exit 0 pass, 1 fail, 2 invalid input, 3 unknown. Fail takes precedence over unknown, while `complete` remains false when any evidence is unknown. JSON is deterministic, no timestamps, max 64 KiB; inputs max 1 MiB and 128 requirements.

`--live` explicitly executes fixed `--version` probes on trusted host executables found through absolute PATH directories. It cannot establish that a hostile executable is safe; use offline snapshots on untrusted hosts. Node evidence uses the running process version and executable, never a directory label. Child environments contain only path/platform variables, not API keys. No shell execution; Windows cmd/bat launchers report presence with unknown version. `--probe-paths` additionally uses nonmutating access checks relative to the requirements file; it does not create files and cannot prove a future write succeeds. Configuration only checks own-property presence, including an empty value, without reading or exporting values. No database probes, installation, PATH changes, restart or auto-fix. Credential file basenames are rejected; inputs must be sanitized JSON. Version stderr and invalid input text are never echoed.

ESM API: `checkEnvironment(requirements,snapshot,options?)`, `collectSnapshot(requirements,options?)`, `capabilities()`, `encodeResult(result)`, `exitCode(result)`. Input validation is authoritative in source; result declarations are in `types/index.d.ts`. Run package `npm test`, `npm run build`, `npm run typecheck`, `npm run smoke:pack`.
