# Local performance findings

Date: 2026-09-07
Benchmark implementation revision: `7cf02d0`; latest Windows short-path boundary
fix: `0b72a83`; latest package verification revision: `7cf02d0`; latest provider
observation bounding: `32fd01a`; latest diagnostic collection bounding: `a0f148b`;
latest bounded source reads: `149e0fa`; latest validated real-path reads: `dd212e4`;
latest bounded revision blob reads: `2f3c482`; latest snapshot diagnostic identity:
`0c8a130`; latest provider resolution read boundary: `ba0538a`; latest CLI
formatted-output bound: `c6296e4`; latest installed artifact output-limit smoke:
`3472b13`; latest Windows path handling: `0b72a83`; latest platform-aware capture
harness: `261c47a`; latest Git clean-filter isolation: `c32634e`; latest hosted
matrix: `34123415471`

This note records bounded local resource experiments on macOS and Linux
containers. It is evidence that the configured limits stop work predictably;
it is not a latency, throughput, or memory guarantee.

## Reproduction

Run from the repository after `npm run build`:

```sh
node spike/performance-benchmark.cjs
```

The script creates and removes a temporary Git repository containing one
`base.ts`, direct consumers, and second-level consumers. By default it uses 120
of each; `AGENT_IMPACT_BENCH_DIRECT` and `AGENT_IMPACT_BENCH_TRANSITIVE` can
select bounded values from 1 through 250. It runs the API and CLI in separate
Node child processes with package defaults and the declared hard limits. No
repository files or Git state are changed.

## Observed run

Environment: Node.js `v23.10.0`, macOS `Darwin 25.6.0 arm64`; 241 project files
for the default run; provider TypeScript `5.9.3`.

| Mode | Process | Wall time | API work time | RSS delta | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Defaults | API child | 386.2 ms | 276.8 ms | 78.3 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Hard caps | API child | 384.1 ms | 280.4 ms | 83.1 MiB | `complete`, 241 nodes/240 edges |
| Defaults | CLI child | 393.9 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Hard caps | CLI child | 385.3 ms | — | — | `complete`, 241 nodes/240 edges |

The same run shape was repeated with bounded sizes. Returned counts are stable
even though timing and RSS vary by process state.

| Source files | Default result | Hard-cap result |
| ---: | --- | --- |
| 21 (10 + 10 + base) | `complete`, 21 nodes/20 edges | `complete`, 21 nodes/20 edges |
| 121 (60 + 60 + base) | `partial`, 100 nodes/99 edges, `NODE_LIMIT` | `complete`, 121 nodes/120 edges |
| 241 (120 + 120 + base) | `partial`, 100 nodes/99 edges, `NODE_LIMIT` | `complete`, 241 nodes/240 edges |
| 501 (250 + 250 + base) | `partial`, 100 nodes/99 edges, `NODE_LIMIT` plus unresolved-observation diagnostic | `complete`, 501 nodes/500 edges |

The result confirms bounded fan-out behavior across four fixture sizes and
separate CLI cold-start measurement for this machine and fixture. These runs are
insufficient to establish release thresholds, sustained-memory behavior,
cancellation latency, or a release performance SLA; those remain deferred beyond
the declared v0.1 scope.

## Post-cap benchmark rerun

After the provider observation cap was added in `32fd01a`, the default 241-file
fixture was rerun on the same Node.js `v23.10.0` / macOS host. Semantic results
were unchanged: API and CLI defaults returned `partial` with 100 nodes/99 edges
and `NODE_LIMIT`, while hard caps returned `complete` with 241 nodes/240 edges.
Timing and RSS varied with process state:

| Mode | Wall time | API work time | RSS delta | Result |
| --- | ---: | ---: | ---: | --- |
| API default | 578.6 ms | 437.9 ms | 80.9 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| API hard caps | 607.4 ms | 450.2 ms | 86.0 MiB | `complete`, 241 nodes/240 edges |
| CLI default | 610.2 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| CLI hard caps | 754.6 ms | — | — | `complete`, 241 nodes/240 edges |

This rerun is additional local evidence, not a release performance threshold.

At revision `a0f148b`, the same 241-file fixture was rerun after diagnostic
collection was bounded. Semantic results again matched the earlier runs:
defaults stopped at 100 nodes/99 edges with `NODE_LIMIT`, and hard caps
returned 241 nodes/240 edges.

| Mode | Wall time | API work time | RSS delta | Result |
| --- | ---: | ---: | ---: | --- |
| API default | 433.0 ms | 326.4 ms | 87.4 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| API hard caps | 409.5 ms | 303.4 ms | 85.6 MiB | `complete`, 241 nodes/240 edges |
| CLI default | 408.1 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| CLI hard caps | 400.7 ms | — | — | `complete`, 241 nodes/240 edges |

This is a single post-change observation and does not establish a release
performance threshold or sustained-memory guarantee.

## Repeated cold-start observation

On 2026-09-07, the default 241-file fixture was run three consecutive times on
the same Node.js `v23.10.0` / macOS environment. Every run returned the same
semantic counts and stop reasons: API default `partial` with 100 nodes/99 edges
and `NODE_LIMIT`, API hard caps `complete` with 241 nodes/240 edges, and the
same corresponding CLI results. Across the three runs, API-default wall time
was 381.9–401.3 ms with 81.9–83.3 MiB RSS delta; API-hard wall time was
384.3–390.7 ms with 82.6–87.2 MiB RSS delta. CLI wall time was 384.2–386.3 ms
for defaults and 385.6–391.0 ms for hard caps. This is repeatability evidence,
not a release threshold or sustained-memory guarantee.

## Current post-read-hardening observation

At revision `2f3c482`, the default 241-file fixture was run three consecutive
times on the same Node.js `v23.10.0` / macOS environment after the descriptor,
real-path, and revision-blob read changes. Semantic results were stable across
all runs: API and CLI defaults returned `partial` with 100 nodes/99 edges and
`NODE_LIMIT`, while hard caps returned `complete` with 241 nodes/240 edges.
Observed ranges were:

| Mode | Wall time range | API work time range | RSS delta range | Result |
| --- | ---: | ---: | ---: | --- |
| API default | 522.3–682.9 ms | 396.5–505.4 ms | 87.9–93.8 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| API hard caps | 661.0–691.2 ms | 483.9–513.2 ms | 90.7–93.6 MiB | `complete`, 241 nodes/240 edges |
| CLI default | 690.5–776.0 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| CLI hard caps | 674.2–750.8 ms | — | — | `complete`, 241 nodes/240 edges |

These current post-hardening timings are observations for this fixture and
machine. They do not establish a latency, throughput, memory, cancellation, or
release-performance threshold; those remain deferred product work.

## Linux container observations

The same default 241-file fixture was run in clean Git archive checkouts using
Node.js `v22.23.2` and `v24.20.0` Alpine runtime binaries inside a Git-capable
Linux container. Earlier benchmark checkouts used `npm ci --offline` from the
locked npm cache; the latest package-smoke validation uses a fresh lockfile
`npm ci` followed by cache-preferred artifact installation. Every benchmark
uses `NODE_OPTIONS=--max-old-space-size=1024` and `npm run build` before the
measurement. This validates the Linux runtimes and locked dependency graph; it
does not claim stock-image setup, hosted CI behavior, or registry availability.

| Runtime | Mode | Wall time | API work time | RSS delta | Result |
| --- | --- | ---: | ---: | ---: | --- |
| Node 22 / Linux | API default | 585.5 ms | 436.6 ms | 81.5 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Node 22 / Linux | API hard caps | 607.4 ms | 461.2 ms | 79.0 MiB | `complete`, 241 nodes/240 edges |
| Node 22 / Linux | CLI default | 544.7 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Node 22 / Linux | CLI hard caps | 570.7 ms | — | — | `complete`, 241 nodes/240 edges |
| Node 24 / Linux | API default | 901.6 ms | 606.4 ms | 102.9 MiB | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Node 24 / Linux | API hard caps | 692.1 ms | 494.5 ms | 100.9 MiB | `complete`, 241 nodes/240 edges |
| Node 24 / Linux | CLI default | 709.7 ms | — | — | `partial`, 100 nodes/99 edges, `NODE_LIMIT` |
| Node 24 / Linux | CLI hard caps | 697.2 ms | — | — | `complete`, 241 nodes/240 edges |

Returned counts and stop reasons match the macOS fixture behavior. These Linux
observations improve cross-runtime evidence but do not establish sustained-memory
limits, cancellation latency, or release performance thresholds. Hosted run
34123415471 passes the tested Node 22/24 Ubuntu/macOS/Windows matrix after the
Windows path and Git clean-filter fixes; it is workflow evidence rather than a
performance SLA.

## High-fan-out unresolved observations

At revision `32fd01a`, a temporary Git repository containing one TypeScript
file with 12,000 missing imports was analyzed with the default limits. The API
returned a usable `partial` result with 299 retained unresolved observations,
including `PROVIDER_OBSERVATION_LIMIT`, and a 163,378-byte JSON envelope. The
effective 300-edge budget therefore bounds retained provider observations before
the result is serialized. This is a bounded-work regression check, not a
throughput or memory guarantee; resolver calls, cancellation, and isolation
remain separate release measurements.

## High-fan-out diagnostic collection

At revision `a0f148b`, `node spike/diagnostic-limit.cjs` created a temporary
repository with 20,000 untracked 300-byte files that exceeded the 256-byte file
budget. With the default `maxDiagnostics: 1000` and a 16 MiB output allowance,
the API returned a usable `partial` result with exactly 1,000 warnings,
`DIAGNOSTIC_LIMIT`, and a 154,605-byte JSON envelope. The collector retained
diagnostics during snapshot discovery instead of accumulating all 20,000
entries; this is a bounded-work regression check, not a throughput or memory
guarantee. The script accepts `AGENT_IMPACT_DIAGNOSTIC_FILES` and
`AGENT_IMPACT_DIAGNOSTIC_FILE_BYTES` for smaller repeatable runs.

At revision `149e0fa`, the same test also exercises the bounded descriptor reader
directly: a 4 KiB file read with a 512-byte budget stops after 513 bytes and
returns no decoded content. Working-tree and permitted external declaration
reads use this descriptor bound and re-open validated real paths. At
`ba0538a`, provider module-resolution reads were routed through the same bound;
the oversized package-metadata regression confirms the resolver receives no
decoded over-budget content. Git revision blobs
use their bounded binary buffer and reject oversized output before decoding.
This is a memory-bound and path-isolation regression check, not a sustained-memory
or cancellation guarantee.

At revision `c6296e4`, the CLI regression confirms that pretty-print expansion is
checked after serialization. This closes an output-accounting gap without
changing the provider or graph work measured above; no new performance threshold
is inferred.
At revision `3472b13`, the same compact-versus-pretty assertion runs against the
installed tarball CLI. It verifies packaging parity for the output boundary; it
does not establish a performance threshold.
