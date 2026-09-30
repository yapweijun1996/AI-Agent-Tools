# Release Guard: Deploy Verify

The `deploy-verify` profile implements the existing `agent-release-guard` registry responsibility. Package `ai-agent-tool-release-guard@0.1.0`, executable `agent-release-guard`, private Apache-2.0 source MVP. npm name lookup returned 404 on 2026-09-30; it is not an ownership reservation. No npm release, deployment service or universal Release Guard implementation is claimed. General publication preparation remains future scope.

## Install and run

Use Node 22.13+ in the 22 line or Node 24. From a fresh repository clone:

```sh
npm run bootstrap
node packages/release-guard/src/cli.js capabilities --json
node packages/release-guard/src/cli.js deploy-verify --input packages/release-guard/examples/server-pass.json --json
node packages/release-guard/src/cli.js deploy-verify --input packages/release-guard/examples/browser-pass.json --json
npm install -g ./packages/release-guard
agent-release-guard --help
agent-release-guard deploy-verify --input ./my-sanitized-evidence.json --json
```

The examples are synthetic fixtures, not live deployment proof. Source/local installation exposes the global CLI; AIT npm dispatch has no published identity for this private package. Root bootstrap/build/typecheck/test/pack includes this independent package. No server deployment is needed. Root AIT version and published npm distributions are unchanged.

## Prepare evidence

Input is one explicit UTF-8 JSON file matching [input schema](schema/input.schema.json); runtime validation adds stricter URL, calendar, uniqueness and budget checks. Supply normalized evidence from your existing CI, HTTP and browser tools. This CLI does not collect it, run Git/CI commands, open a browser, read credentials or execute build manifests.

- `schemaVersion`: `"1.0"`.
- `expected`: exact lower-case 40-hex commit, safe `buildId`, HTTPS `origin` without trailing slash, nonempty `assets` of `{path,sha256}`. SHA-256 means the lowercase hash of the captured decoded asset bytes, not an ETag, gzip transport bytes, or a source-file hash unless those are the deployed bytes. Paths must be canonical percent-encoded absolute URL paths, no query/fragment/traversal. Expected data must come from the intended build, not be copied from the live observations being checked.
- `policy`: explicit UTC `asOf`, `maxEvidenceAgeSeconds` (0–604800), nonempty `requiredChecks` of caller-normalized safe identifiers. Optional `requireBrowser` and `requireServiceWorker` default false. There is no ambient clock; freshness is only relative to this declared cutoff, not a claim that a historical file is current now.
- `ci`: observation rows `{id,observedAt,check,commit,buildId,conclusion}`. Normalize CI success to `pass`, failure to `fail`; other supported outcomes are `pending`, `cancelled`, `unknown`. Bind the build ID to the artifact actually built by that exact commit. No missing check is inferred from an unrelated green run.
- `http`: rows `{id,observedAt,assetPath,finalUrl,status,commit?,buildId?,sha256?,cache?,redirects?}`. `commit`/`buildId` require actual version evidence from the responding deployment; do not infer them merely from its URL. Missing versions/hashes remain unknown. `cache` is `{source:"network"|"browser-cache"|"service-worker"|"unknown",ageSeconds?,buildId?}`. Cache source needs capture evidence, not a guess. Missing cache evidence is unknown; cached entities require a matching cached build ID. `redirects` lists observed `{status,url}` hops, at most five. All hops/final responses must stay on the expected origin and the final path must match. Empty redirect list means no redirect was reported; evidence completeness remains the producer's responsibility.
- Optional `browser`: one captured snapshot `{id,observedAt,origin,commit?,buildId?,controlled?,serviceWorkerBuildId?,assets?}`. Browser identity and every expected asset hash are checked. `requireServiceWorker` demands controller and worker build evidence; a supplied active worker is also checked. Ordinary browser snapshots need no service worker. These fields describe the supplied browser capture only, not all users or installed devices.

Do not pass raw HAR files, authorization/cookie headers, request bodies, private payloads or credentials. Unsupported keys are rejected rather than echoed. URLs must be absolute HTTPS with no userinfo/query/fragment. Credential file basenames and token-like identifiers/URLs are rejected; supply deliberately sanitized files. The tool cannot establish that a producer's assertions are true or detect every secret disguised as a valid build ID. No automatic directory discovery, external references or network collectors are provided.

## Interpretation

Exit 0 `pass`, 1 `fail`, 2 invalid input (`error`), 3 `unknown`. Fresh exact mismatches fail; missing, stale or future evidence is unknown. Failure takes precedence but `complete` is false if any unknown remains. A pass means all requested comparisons of the supplied snapshot passed, not authentication of producers, security certification or deployment authorization.

Latest observation time wins separately for each required CI check and expected asset; a later fresh retry can supersede earlier failure. Future/latest stale evidence never falls back to an older success. Same-time contradictory observations are unknown. Identical duplicate IDs are deduplicated; conflicting duplicate IDs are invalid. IDs must be unique across producers. The snapshot cannot prove no omitted retry occurred. No automatic retry, polling, cache clearing, worker activation, install, restart, publish or fix.

A fresh 4xx/5xx response fails; unresolved redirects and other nonfinal statuses remain unknown. A 304 only supports hash comparison when the cached entity hash and browser/service-worker source are supplied. Cache age over the freshness budget is unknown. Cache/source metadata and content identity remain separate observations.

Result [schema](schema/result.schema.json) includes sorted checks, pass/fail/unknown counts and provenance: canonical input SHA-256 plus JSON pointers into the exact bundle. This digest is an integrity reference, not a producer signature. No source file path, header/body values or command text is printed. Input 1 MiB; 128 assets; 512 CI and 512 HTTP rows; 32 required checks; 5 redirect hops per observation; output 64 KiB. Overflow becomes explicit unknown without silently clipped findings.

`data.installedDeviceUpdate` is **always `unknown`**, including when server and supplied browser hashes match. HTTP cannot prove installed-device PWA update, activation, offline behavior or correct UX. More device-level evidence and separately approved adapters would be needed; they are outside this MVP. Runtime Trace remains responsible for broader operation/business-event correlation.

ESM API: `verifyDeployment(bundle)`, `capabilities()`, `encodeResult(result)`, `exitCode(result)`. Declarations: `types/index.d.ts`. File CLI reads and stdout serialization enforce byte budgets; direct API callers must use bounded JSON input and `encodeResult` when serializing. Tests: `npm test`; build checks JS syntax/schema JSON; `npm run typecheck` checks declaration consumers, not every JS statement; `npm run smoke:pack` installs a private temporary packed consumer with lifecycle scripts disabled and executes its CLI/examples. This native envelope does not assert universal Hub protocol conformance.
