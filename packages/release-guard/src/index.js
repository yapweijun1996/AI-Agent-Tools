import {
  openSync,
  closeSync,
  fstatSync,
  readSync,
  realpathSync,
  statSync,
  constants,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
export const LIMITS = Object.freeze({
  inputBytes: 1048576,
  outputBytes: 65536,
  assets: 128,
  observations: 512,
  redirects: 5,
});
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const own = (o, k) => Object.hasOwn(o, k);
const canonical = (x) =>
  JSON.stringify(x, (_k, v) =>
    object(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
export const digest = (x) =>
  createHash("sha256").update(canonical(x)).digest("hex");
export function invalid(message = "Invalid bounded deployment evidence") {
  const e = new Error(message);
  e.code = "INVALID_INPUT";
  return e;
}
const keys = (x, list) => {
  if (!object(x) || Object.keys(x).some((k) => !list.includes(k)))
    throw invalid();
};
const id = (x) =>
  typeof x === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x) &&
  !/(?:sk-proj-|ghp_|github_pat_|xox[baprs]-)/i.test(x);
const sha = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const commit = (x) => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const time = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x) &&
  Number.isFinite(Date.parse(x)) &&
  new Date(x).toISOString() ===
    x.replace(/Z$/, x.includes(".") ? "Z" : ".000Z");
function url(value) {
  if (typeof value !== "string" || value.length > 2048)
    throw invalid("Invalid sanitized URL");
  let u;
  try {
    u = new URL(value);
  } catch {
    throw invalid("Invalid sanitized URL");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    /[\u0000-\u0020\u007f]/.test(value) ||
    /(?:sk-proj-|ghp_|github_pat_|xox[baprs]-)/i.test(value)
  )
    throw invalid(
      "URLs must be sanitized absolute HTTPS without credentials, queries or fragments",
    );
  return u;
}
function assetPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 512 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\?#\u0000-\u0020\u007f]/.test(value) ||
    /%(?:2e|2f|5c|00)/i.test(value) ||
    value.split("/").some((x) => x === "." || x === "..")
  )
    throw invalid("Invalid asset path");
  const u = url("https://evidence.invalid" + value);
  if (u.pathname !== value)
    throw invalid("Use canonical percent-encoded asset paths");
  return value;
}
export function readJson(file) {
  let fd;
  try {
    if (
      [
        ".env",
        ".npmrc",
        "auth.json",
        "credentials",
        "credentials.json",
        "tokens.json",
        "id_rsa",
      ].includes(path.basename(realpathSync(file)).toLowerCase())
    )
      throw invalid();
    const initial = statSync(file);
    if (!initial.isFile() || initial.size > LIMITS.inputBytes) throw invalid();
    fd = openSync(
      file,
      process.platform === "win32"
        ? constants.O_RDONLY
        : constants.O_RDONLY | constants.O_NONBLOCK,
    );
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > LIMITS.inputBytes) throw invalid();
    const buffer = Buffer.alloc(LIMITS.inputBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null);
      if (!n) break;
      size += n;
    }
    if (size > LIMITS.inputBytes) throw invalid();
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        buffer.subarray(0, size),
      ),
    );
  } catch {
    throw invalid("Unable to read sanitized bounded JSON evidence");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function validateBundle(input) {
  keys(input, ["schemaVersion", "expected", "policy", "ci", "http", "browser"]);
  if (input.schemaVersion !== "1.0") throw invalid();
  keys(input.expected, ["commit", "buildId", "origin", "assets"]);
  const e = input.expected;
  if (
    !commit(e.commit) ||
    !id(e.buildId) ||
    url(e.origin).origin !== e.origin ||
    !Array.isArray(e.assets) ||
    !e.assets.length ||
    e.assets.length > LIMITS.assets
  )
    throw invalid();
  const assets = new Set();
  for (const a of e.assets) {
    keys(a, ["path", "sha256"]);
    assetPath(a.path);
    if (!sha(a.sha256) || assets.has(a.path)) throw invalid();
    assets.add(a.path);
  }
  keys(input.policy, [
    "asOf",
    "maxEvidenceAgeSeconds",
    "requiredChecks",
    "requireBrowser",
    "requireServiceWorker",
  ]);
  const p = input.policy;
  if (
    !time(p.asOf) ||
    !Number.isInteger(p.maxEvidenceAgeSeconds) ||
    p.maxEvidenceAgeSeconds < 0 ||
    p.maxEvidenceAgeSeconds > 604800 ||
    !Array.isArray(p.requiredChecks) ||
    !p.requiredChecks.length ||
    p.requiredChecks.length > 32 ||
    p.requiredChecks.some((x) => !id(x)) ||
    new Set(p.requiredChecks).size !== p.requiredChecks.length ||
    (p.requireBrowser !== undefined && typeof p.requireBrowser !== "boolean") ||
    (p.requireServiceWorker !== undefined &&
      typeof p.requireServiceWorker !== "boolean")
  )
    throw invalid();
  const seen = new Map();
  const record = (row) => {
    if (!id(row.id) || !time(row.observedAt)) throw invalid();
    if (seen.has(row.id) && seen.get(row.id) !== digest(row))
      throw invalid("Conflicting duplicate observation id");
    seen.set(row.id, digest(row));
  };
  for (const name of ["ci", "http"]) {
    if (
      input[name] !== undefined &&
      (!Array.isArray(input[name]) || input[name].length > LIMITS.observations)
    )
      throw invalid();
  }
  for (const r of input.ci ?? []) {
    keys(r, ["id", "observedAt", "check", "commit", "buildId", "conclusion"]);
    record(r);
    if (
      !id(r.check) ||
      !commit(r.commit) ||
      !id(r.buildId) ||
      !["pass", "fail", "pending", "cancelled", "unknown"].includes(
        r.conclusion,
      )
    )
      throw invalid();
  }
  for (const r of input.http ?? []) {
    keys(r, [
      "id",
      "observedAt",
      "assetPath",
      "finalUrl",
      "status",
      "commit",
      "buildId",
      "sha256",
      "cache",
      "redirects",
    ]);
    record(r);
    assetPath(r.assetPath);
    url(r.finalUrl);
    if (!Number.isInteger(r.status) || r.status < 100 || r.status > 599)
      throw invalid();
    for (const [key, test] of [
      ["commit", commit],
      ["buildId", id],
      ["sha256", sha],
    ])
      if (r[key] !== undefined && r[key] !== null && !test(r[key]))
        throw invalid();
    if (r.cache !== undefined) {
      keys(r.cache, ["source", "ageSeconds", "buildId"]);
      if (
        !["network", "browser-cache", "service-worker", "unknown"].includes(
          r.cache.source,
        ) ||
        (r.cache.ageSeconds !== undefined &&
          (!Number.isInteger(r.cache.ageSeconds) || r.cache.ageSeconds < 0)) ||
        (r.cache.buildId !== undefined &&
          r.cache.buildId !== null &&
          !id(r.cache.buildId))
      )
        throw invalid();
    }
    if (r.redirects !== undefined) {
      if (!Array.isArray(r.redirects) || r.redirects.length > LIMITS.redirects)
        throw invalid();
      for (const d of r.redirects) {
        keys(d, ["status", "url"]);
        if (![301, 302, 303, 307, 308].includes(d.status)) throw invalid();
        url(d.url);
      }
    }
  }
  if (input.browser !== undefined) {
    const b = input.browser;
    keys(b, [
      "id",
      "observedAt",
      "origin",
      "commit",
      "buildId",
      "controlled",
      "serviceWorkerBuildId",
      "assets",
    ]);
    record(b);
    url(b.origin);
    for (const [key, test] of [
      ["commit", commit],
      ["buildId", id],
      ["serviceWorkerBuildId", id],
    ])
      if (b[key] !== undefined && b[key] !== null && !test(b[key]))
        throw invalid();
    if (
      b.controlled !== undefined &&
      b.controlled !== null &&
      typeof b.controlled !== "boolean"
    )
      throw invalid();
    if (b.assets !== undefined) {
      if (!Array.isArray(b.assets) || b.assets.length > LIMITS.assets)
        throw invalid();
      const paths = new Set();
      for (const a of b.assets) {
        keys(a, ["path", "sha256"]);
        assetPath(a.path);
        if (!sha(a.sha256) || paths.has(a.path)) throw invalid();
        paths.add(a.path);
      }
    }
  }
  return input;
}
export function capabilities() {
  return {
    schemaVersion: "1.0",
    tool: "agent-release-guard",
    operation: "capabilities",
    status: "pass",
    complete: true,
    data: {
      operations: ["deploy-verify", "capabilities"],
      network: false,
      limits: LIMITS,
    },
    diagnostics: [],
  };
}
export function verifyDeployment(input) {
  validateBundle(input);
  const { expected: e, policy: p } = input,
    checks = [],
    artifactSha256 = digest(input);
  const add = (id, status, reason, expected, observed, pointers = []) =>
    checks.push({
      id,
      status,
      reason,
      expected,
      observed,
      evidence: { artifactSha256, pointers },
    });
  const fresh = (row, pointer) => {
    const age = (Date.parse(p.asOf) - Date.parse(row.observedAt)) / 1000;
    return age < 0
      ? "FUTURE_EVIDENCE"
      : age > p.maxEvidenceAgeSeconds
        ? "STALE_EVIDENCE"
        : null;
  };
  const pick = (rows, label) => {
    const unique = [...new Map(rows.map((x) => [x.row.id, x])).values()];
    if (!unique.length) {
      add(label, "unknown", "EVIDENCE_MISSING", null, null);
      return null;
    }
    unique.sort(
      (a, b) =>
        Date.parse(b.row.observedAt) - Date.parse(a.row.observedAt) ||
        a.row.id.localeCompare(b.row.id, "en"),
    );
    const latest = unique.filter(
      (x) =>
        Date.parse(x.row.observedAt) === Date.parse(unique[0].row.observedAt),
    );
    const signature = (x) =>
      digest(
        Object.fromEntries(
          Object.entries(x.row).filter(
            ([k]) => !["id", "observedAt"].includes(k),
          ),
        ),
      );
    if (new Set(latest.map(signature)).size > 1) {
      add(
        label,
        "unknown",
        "INCONSISTENT_LATEST_EVIDENCE",
        null,
        null,
        latest.map((x) => x.pointer).sort(),
      );
      return null;
    }
    const selected = latest[0],
      reason = fresh(selected.row);
    if (reason) {
      add(
        label,
        "unknown",
        reason,
        { maxEvidenceAgeSeconds: p.maxEvidenceAgeSeconds },
        { observedAt: selected.row.observedAt },
        [selected.pointer],
      );
      return null;
    }
    return selected;
  };
  const match = (label, want, got, pointer) =>
    add(
      label,
      got === undefined || got === null
        ? "unknown"
        : want === got
          ? "pass"
          : "fail",
      got === undefined || got === null
        ? "EVIDENCE_MISSING"
        : want === got
          ? "MATCH"
          : "MISMATCH",
      want,
      got ?? null,
      [pointer],
    );
  for (const name of [...p.requiredChecks].sort()) {
    const selected = pick(
      (input.ci ?? [])
        .map((row, i) => ({ row, pointer: "/ci/" + i }))
        .filter((x) => x.row.check === name),
      "ci:" + name,
    );
    if (!selected) continue;
    const { row: r, pointer: q } = selected;
    match("ci:" + name + ":commit", e.commit, r.commit, q + "/commit");
    match("ci:" + name + ":build", e.buildId, r.buildId, q + "/buildId");
    add(
      "ci:" + name + ":result",
      r.conclusion === "pass"
        ? "pass"
        : r.conclusion === "fail"
          ? "fail"
          : "unknown",
      "CI_" + r.conclusion.toUpperCase(),
      "pass",
      r.conclusion,
      [q],
    );
  }
  for (const a of [...e.assets].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    const selected = pick(
      (input.http ?? [])
        .map((row, i) => ({ row, pointer: "/http/" + i }))
        .filter((x) => x.row.assetPath === a.path),
      "http:" + a.path,
    );
    if (!selected) continue;
    const { row: r, pointer: q } = selected;
    const final = url(r.finalUrl);
    const scoped =
      final.origin === e.origin &&
      final.pathname === a.path &&
      (r.redirects ?? []).every((d) => url(d.url).origin === e.origin);
    add(
      "http:" + a.path + ":scope",
      scoped ? "pass" : "fail",
      scoped ? "TARGET_MATCH" : "REDIRECT_OR_TARGET_MISMATCH",
      e.origin + a.path,
      final.origin + final.pathname,
      [q + "/finalUrl", q + "/redirects"],
    );
    if (!scoped) continue;
    if (r.status >= 400) {
      add(
        "http:" + a.path + ":status",
        "fail",
        "HTTP_FAILURE",
        "2xx or evidenced 304",
        r.status,
        [q + "/status"],
      );
      continue;
    }
    if (
      (r.status === 304 &&
        (!r.sha256 ||
          !r.cache ||
          !["browser-cache", "service-worker"].includes(r.cache.source))) ||
      r.status < 200 ||
      (r.status >= 300 && r.status !== 304)
    ) {
      add(
        "http:" + a.path + ":status",
        "unknown",
        "FINAL_BODY_EVIDENCE_MISSING",
        "2xx or evidenced 304",
        r.status,
        [q],
      );
      continue;
    }
    match("http:" + a.path + ":hash", a.sha256, r.sha256, q + "/sha256");
    match("http:" + a.path + ":commit", e.commit, r.commit, q + "/commit");
    match("http:" + a.path + ":build", e.buildId, r.buildId, q + "/buildId");
    if (!r.cache)
      add(
        "http:" + a.path + ":cache",
        "unknown",
        "CACHE_EVIDENCE_MISSING",
        null,
        null,
        [q + "/cache"],
      );
    if (r.cache) {
      if (r.cache.source === "unknown")
        add(
          "http:" + a.path + ":cache",
          "unknown",
          "CACHE_SOURCE_UNKNOWN",
          null,
          null,
          [q + "/cache"],
        );
      if (
        r.cache.ageSeconds !== undefined &&
        r.cache.ageSeconds > p.maxEvidenceAgeSeconds
      )
        add(
          "http:" + a.path + ":cache-age",
          "unknown",
          "CACHED_ENTITY_STALE",
          { maxAgeSeconds: p.maxEvidenceAgeSeconds },
          { ageSeconds: r.cache.ageSeconds },
          [q + "/cache"],
        );
      if (["browser-cache", "service-worker"].includes(r.cache.source))
        match(
          "http:" + a.path + ":cached-build",
          e.buildId,
          r.cache.buildId,
          q + "/cache/buildId",
        );
    }
  }
  if (input.browser) {
    const b = input.browser,
      q = "/browser",
      reason = fresh(b);
    if (reason)
      add(
        "browser:freshness",
        "unknown",
        reason,
        null,
        { observedAt: b.observedAt },
        [q],
      );
    else {
      match("browser:origin", e.origin, b.origin, q + "/origin");
      match("browser:commit", e.commit, b.commit, q + "/commit");
      match("browser:build", e.buildId, b.buildId, q + "/buildId");
      if (
        p.requireServiceWorker ||
        b.controlled === true ||
        (b.serviceWorkerBuildId !== undefined &&
          b.serviceWorkerBuildId !== null)
      ) {
        match("browser:controlled", true, b.controlled, q + "/controlled");
        match(
          "browser:worker-build",
          e.buildId,
          b.serviceWorkerBuildId,
          q + "/serviceWorkerBuildId",
        );
      }
      for (const a of e.assets) {
        const index = (b.assets ?? []).findIndex((x) => x.path === a.path);
        match(
          "browser:hash:" + a.path,
          a.sha256,
          index < 0 ? null : b.assets[index].sha256,
          q + "/assets" + (index < 0 ? "" : "/" + index + "/sha256"),
        );
      }
    }
  } else if (p.requireBrowser || p.requireServiceWorker)
    add("browser:snapshot", "unknown", "BROWSER_EVIDENCE_MISSING", true, null);
  checks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const status = checks.some((x) => x.status === "fail")
    ? "fail"
    : checks.some((x) => x.status === "unknown")
      ? "unknown"
      : "pass";
  return {
    schemaVersion: "1.0",
    tool: "agent-release-guard",
    operation: "deploy-verify",
    status,
    complete: !checks.some((x) => x.status === "unknown"),
    data: {
      checks,
      scope: input.browser
        ? "supplied-server-and-browser-snapshot"
        : "supplied-server-evidence",
      installedDeviceUpdate: "unknown",
      summary: Object.fromEntries(
        ["pass", "fail", "unknown"].map((k) => [
          k,
          checks.filter((x) => x.status === k).length,
        ]),
      ),
    },
    diagnostics: [],
  };
}
export function encodeResult(result) {
  const text = JSON.stringify(result);
  return Buffer.byteLength(text) <= LIMITS.outputBytes
    ? text
    : JSON.stringify({
        schemaVersion: "1.0",
        tool: "agent-release-guard",
        operation: "deploy-verify",
        status: "unknown",
        complete: false,
        data: null,
        diagnostics: [
          { code: "OUTPUT_LIMIT", message: "Result exceeds output budget" },
        ],
      });
}
export const exitCode = (result) =>
  ({ pass: 0, fail: 1, error: 2, unknown: 3 })[result.status] ?? 2;
