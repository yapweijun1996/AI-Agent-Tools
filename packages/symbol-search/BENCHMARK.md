# Benchmark baseline

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |

This report records reproducible local measurements from generated TypeScript fixtures. It is evidence, not a latency or memory guarantee, and v0.1.0 provides no public performance SLO. The release gate rejects TIMEOUT for every fixture and checks stable fixture file, byte, result, truncation, and status structure. Each warm run is a second in-memory operation in the same process; V1 has no persistent disk cache.

- Published package version: 0.1.1
- Published patch version: 0.1.2 (agent integration documentation-only; benchmark baseline unchanged)
- Node.js: v23.10.0 (local baseline only; not release evidence)
- Supported release runtimes: Node.js 22, 24, and 26; hosted benchmark gate: Ubuntu / Node 24
- Resolver: TypeScript compiler API
- Fixture generation: deterministic file and symbol counts in `scripts/benchmark.mjs`

## small

- Fixture: 5 files × 10 symbols
- Cold: files=5; bytes=4080; time_ms=250.604; memory_bytes=110854144; matches=50; truncation=none; status=complete
- Warm: files=5; bytes=4080; time_ms=185.304; memory_bytes=68108288; matches=50; truncation=none; status=complete

## medium

- Fixture: 40 files × 25 symbols
- Cold: files=40; bytes=83780; time_ms=201.267; memory_bytes=27983872; matches=500; truncation=MAX_RESULTS_REACHED; status=partial
- Warm: files=40; bytes=83780; time_ms=185.989; memory_bytes=88244224; matches=500; truncation=MAX_RESULTS_REACHED; status=partial

## large

- Fixture: 160 files × 50 symbols
- Cold: files=160; bytes=685780; time_ms=403.745; memory_bytes=127647744; matches=500; truncation=MAX_RESULTS_REACHED; status=partial
- Warm: files=160; bytes=685780; time_ms=386.188; memory_bytes=5193728; matches=500; truncation=MAX_RESULTS_REACHED; status=partial
