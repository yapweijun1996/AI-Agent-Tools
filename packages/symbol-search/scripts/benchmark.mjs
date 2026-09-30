import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SymbolSearchEngine } = require(resolve("dist/index.js"));
const packageVersion = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version;
const reportPath = resolve("BENCHMARK.md");
const suites = [
  { name: "small", files: 5, symbolsPerFile: 10 },
  { name: "medium", files: 40, symbolsPerFile: 25 },
  { name: "large", files: 160, symbolsPerFile: 50 }
];

function createFixture(parent, suite) {
  const root = join(parent, suite.name);
  mkdirSync(root, { recursive: true });
  for (let fileIndex = 0; fileIndex < suite.files; fileIndex += 1) {
    const lines = [];
    for (let symbolIndex = 0; symbolIndex < suite.symbolsPerFile; symbolIndex += 1) {
      const id = fileIndex * suite.symbolsPerFile + symbolIndex;
      lines.push(`export function benchmarkSymbol${id}(value: string): string { return value + '${id}'; }`);
    }
    writeFileSync(join(root, `file-${String(fileIndex).padStart(4, "0")}.ts`), `${lines.join("\n")}\n`, "utf8");
  }
  return root;
}

function measure(root, engine) {
  const before = process.memoryUsage().rss;
  const start = performance.now();
  const result = engine.execute({ operation: "search", root, symbol: "benchmarkSymbol", match: "prefix", limit: 500 });
  const elapsed = performance.now() - start;
  const after = process.memoryUsage().rss;
  return {
    files: result.stats.filesScanned ?? 0,
    bytes: result.stats.bytesParsed ?? 0,
    timeMs: Number(elapsed.toFixed(3)),
    memoryBytes: Math.max(0, after - before),
    matches: result.data.matches.length,
    truncation: result.truncation.truncated ? result.truncation.reasons.join(",") : "none",
    status: result.status
  };
}

function formatMeasurement(measurement) {
  return `files=${measurement.files}; bytes=${measurement.bytes}; time_ms=${measurement.timeMs}; memory_bytes=${measurement.memoryBytes}; matches=${measurement.matches}; truncation=${measurement.truncation}; status=${measurement.status}`;
}

function parseMeasurement(line) {
  const fields = Object.fromEntries(line.split("; ").map((field) => field.split("=")));
  const numeric = (name) => Number(fields[name]);
  return {
    files: numeric("files"),
    bytes: numeric("bytes"),
    timeMs: numeric("time_ms"),
    memoryBytes: numeric("memory_bytes"),
    matches: numeric("matches"),
    truncation: fields.truncation,
    status: fields.status
  };
}

const temporary = mkdtempSync(join(tmpdir(), "agent-symbol-search-benchmark-"));
try {
  const results = [];
  for (const suite of suites) {
    const root = createFixture(temporary, suite);
    const engine = new SymbolSearchEngine();
    const cold = measure(root, engine);
    const warm = measure(root, engine);
    for (const [phase, measurement] of [["cold", cold], ["warm", warm]]) {
      if (measurement.truncation.includes("TIMEOUT") || measurement.status === "error") {
        throw new Error(`${suite.name} ${phase} benchmark did not finish within the product budget`);
      }
    }
    results.push({ suite, cold, warm });
  }
  const lines = [
    "# Benchmark baseline",
    "",
    "| Field | Value |",
    "|---|---|",
    "| Status | Active |",
    "| Owner | Project maintainers |",
    "| Last reviewed | 2026-09-08 |",
    "",
    "This report records reproducible local measurements from generated TypeScript fixtures. It is evidence, not a latency or memory guarantee, and v0.1.0 provides no public performance SLO. The release gate rejects TIMEOUT for every fixture and checks stable fixture file, byte, result, truncation, and status structure. Each warm run is a second in-memory operation in the same process; V1 has no persistent disk cache.",
    "",
    `- Package version: ${packageVersion}`,
    `- Node.js: ${process.version} (local baseline only; not release evidence)`,
    "- Supported release runtimes: Node.js 22, 24, and 26; hosted benchmark gate: Ubuntu / Node 24",
    "- Resolver: TypeScript compiler API",
    "- Fixture generation: deterministic file and symbol counts in `scripts/benchmark.mjs`",
    ""
  ];
  for (const { suite, cold, warm } of results) {
    lines.push(`## ${suite.name}`, "", `- Fixture: ${suite.files} files × ${suite.symbolsPerFile} symbols`, `- Cold: ${formatMeasurement(cold)}`, `- Warm: ${formatMeasurement(warm)}`, "");
  }
  const report = `${lines.join("\n").trimEnd()}\n`;
  if (process.argv.includes("--check")) {
    if (!existsSync(reportPath)) throw new Error("BENCHMARK.md is missing; run `node scripts/benchmark.mjs` to create it");
    const existing = readFileSync(reportPath, "utf8");
    for (const suite of suites) {
      if (!existing.includes(`## ${suite.name}`)) {
        throw new Error(`BENCHMARK.md is missing ${suite.name}`);
      }
    }
    for (const { suite, cold, warm } of results) {
      const start = existing.indexOf(`## ${suite.name}`);
      const end = existing.indexOf("\n## ", start + 1);
      const section = existing.slice(start, end < 0 ? existing.length : end);
      const fixture = section.match(/^- Fixture: (\d+) files × (\d+) symbols$/m);
      if (!fixture || Number(fixture[1]) !== suite.files || Number(fixture[2]) !== suite.symbolsPerFile) {
        throw new Error(`BENCHMARK.md fixture definition for ${suite.name} does not match scripts/benchmark.mjs`);
      }
      const storedCold = section.match(/^- Cold: (.+)$/m)?.[1];
      const storedWarm = section.match(/^- Warm: (.+)$/m)?.[1];
      if (!storedCold || !storedWarm) {
        throw new Error(`BENCHMARK.md is missing cold/warm evidence for ${suite.name}`);
      }
      for (const [phase, storedLine, measured] of [["cold", storedCold, cold], ["warm", storedWarm, warm]]) {
        const stored = parseMeasurement(storedLine);
        for (const key of ["files", "bytes", "matches", "truncation", "status"]) {
          if (stored[key] !== measured[key]) throw new Error(`BENCHMARK.md ${suite.name} ${phase} ${key} does not match a fresh measurement`);
        }
        for (const key of ["timeMs", "memoryBytes"]) {
          if (!Number.isFinite(stored[key]) || stored[key] < 0) throw new Error(`BENCHMARK.md ${suite.name} ${phase} ${key} is not a valid non-negative measurement`);
        }
      }
    }
    console.log(report);
  } else {
    writeFileSync(reportPath, report, "utf8");
    console.log(report);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
