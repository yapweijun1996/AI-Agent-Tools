import semver from "semver";
import {
  accessSync,
  constants,
  existsSync,
  fstatSync,
  openSync,
  closeSync,
  readSync,
  statSync,
  realpathSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
export const LIMITS = Object.freeze({
  inputBytes: 1048576,
  outputBytes: 65536,
  requirements: 128,
});
const RUNTIMES = ["node", "npm", "python", "codex"];
const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const own = (o, k) => Object.hasOwn(o, k);
export function invalid(
  message = "Input does not match the documented contract",
) {
  const e = new Error(message);
  e.code = "INVALID_INPUT";
  return e;
}
function keys(o, allowed) {
  if (!record(o) || Object.keys(o).some((k) => !allowed.includes(k)))
    throw invalid();
}
export function safeText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "?")
    .replace(
      /\b(?:sk-(?:proj-|live-|test-)?|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{8,}/g,
      "[REDACTED]",
    )
    .replace(/([A-Za-z][\w+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[REDACTED]@")
    .slice(0, 1024);
}
export function readJson(file) {
  let fd;
  try {
    const resolved = realpathSync(file);
    if (
      [
        ".env",
        ".npmrc",
        "auth.json",
        "credentials",
        "credentials.json",
        "tokens.json",
        "id_rsa",
      ].includes(path.basename(resolved).toLowerCase())
    )
      throw invalid("Credential files are not supported inputs");
    const initial = statSync(resolved);
    if (!initial.isFile() || initial.size > LIMITS.inputBytes)
      throw invalid("Input file limit exceeded or not a regular file");
    // A file-type substitution must not block open before descriptor validation.
    fd = openSync(
      resolved,
      constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NONBLOCK),
    );
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > LIMITS.inputBytes)
      throw invalid("Input file limit exceeded or not a regular file");
    const buffer = Buffer.alloc(LIMITS.inputBytes + 1);
    let bytes = 0;
    while (bytes < buffer.length) {
      const n = readSync(fd, buffer, bytes, buffer.length - bytes, null);
      if (!n) break;
      bytes += n;
    }
    if (bytes > LIMITS.inputBytes) throw invalid("Input file limit exceeded");
    return JSON.parse(buffer.subarray(0, bytes).toString("utf8"));
  } catch (e) {
    if (e.code === "INVALID_INPUT") throw e;
    throw invalid("Unable to read a valid bounded JSON input");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
export function validateRequirements(input) {
  keys(input, ["schemaVersion", "runtimes", "configuration", "paths"]);
  if (input.schemaVersion !== "1.0")
    throw invalid("Unsupported requirements schemaVersion");
  const out = {
    schemaVersion: "1.0",
    runtimes: {},
    configuration: [],
    paths: [],
  };
  if (input.runtimes !== undefined) {
    keys(input.runtimes, RUNTIMES);
    for (const name of Object.keys(input.runtimes).sort()) {
      const range = input.runtimes[name];
      if (
        range !== null &&
        (typeof range !== "string" ||
          range.length > 256 ||
          semver.validRange(range) === null)
      )
        throw invalid("Invalid runtime range");
      out.runtimes[name] = range;
    }
  }
  if (input.configuration !== undefined) {
    if (
      !Array.isArray(input.configuration) ||
      input.configuration.some(
        (x) =>
          typeof x !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(x),
      ) ||
      new Set(input.configuration).size !== input.configuration.length
    )
      throw invalid("Configuration contains invalid or duplicate names");
    out.configuration = [...input.configuration].sort();
  }
  if (input.paths !== undefined) {
    if (!Array.isArray(input.paths)) throw invalid();
    const ids = new Set();
    for (const p of input.paths) {
      keys(p, ["id", "path", "permissions"]);
      if (
        typeof p.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(p.id) ||
        ids.has(p.id) ||
        typeof p.path !== "string" ||
        !p.path ||
        p.path.length > 1024 ||
        /[\u0000-\u001f]/.test(p.path) ||
        !Array.isArray(p.permissions) ||
        !p.permissions.length ||
        p.permissions.some((x) => !["read", "write", "execute"].includes(x)) ||
        new Set(p.permissions).size !== p.permissions.length
      )
        throw invalid("Invalid path requirement");
      ids.add(p.id);
      out.paths.push({ ...p, permissions: [...p.permissions].sort() });
    }
    out.paths.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  if (
    Object.keys(out.runtimes).length +
      out.configuration.length +
      out.paths.length >
    LIMITS.requirements
  )
    throw invalid("Too many requirements");
  return out;
}
export function validateSnapshot(input) {
  keys(input, ["schemaVersion", "runtimes", "configuration", "paths"]);
  if (input.schemaVersion !== "1.0")
    throw invalid("Unsupported snapshot schemaVersion");
  if (input.runtimes !== undefined) {
    keys(input.runtimes, RUNTIMES);
    for (const row of Object.values(input.runtimes)) {
      keys(row, ["available", "version", "path"]);
      if (row.available !== null && typeof row.available !== "boolean")
        throw invalid();
      for (const key of ["version", "path"])
        if (
          row[key] !== undefined &&
          row[key] !== null &&
          (typeof row[key] !== "string" || row[key].length > 1024)
        )
          throw invalid();
    }
  }
  if (input.configuration !== undefined) {
    if (
      !record(input.configuration) ||
      Object.keys(input.configuration).length > LIMITS.requirements ||
      Object.entries(input.configuration).some(
        ([k, v]) =>
          !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(k) ||
          (v !== null && typeof v !== "boolean"),
      )
    )
      throw invalid(
        "Configuration evidence must contain names and booleans only",
      );
  }
  if (input.paths !== undefined) {
    if (
      !record(input.paths) ||
      Object.keys(input.paths).length > LIMITS.requirements
    )
      throw invalid();
    for (const [id, row] of Object.entries(input.paths)) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw invalid();
      keys(row, ["read", "write", "execute"]);
      if (Object.values(row).some((v) => v !== null && typeof v !== "boolean"))
        throw invalid();
    }
  }
  return input;
}
export function capabilities() {
  return {
    schemaVersion: "1.0",
    tool: "agent-env-doctor",
    operation: "capabilities",
    status: "pass",
    complete: true,
    data: {
      operations: ["check", "capabilities"],
      runtimes: RUNTIMES,
      liveProbes:
        "Explicit fixed version commands; configuration names; optional access checks",
      limits: LIMITS,
    },
    diagnostics: [],
  };
}
export function checkEnvironment(requirements, snapshot, options = {}) {
  const req = validateRequirements(requirements);
  const obs = validateSnapshot(snapshot);
  const checks = [];
  const source = safeText(options.requirementsSource ?? "requirements");
  const observationSource = safeText(options.snapshotSource ?? "snapshot");
  const add = (
    id,
    status,
    expected,
    observed,
    pointer,
    observedPointer,
    reason,
  ) =>
    checks.push({
      id,
      status,
      expected,
      observed,
      evidence: {
        source,
        pointer,
        observedSource: observationSource,
        observedPointer,
      },
      reason,
    });
  const runtime = (name, range, pointer, inputSource = source) => {
    const row = obs.runtimes?.[name];
    let status = "unknown",
      reason = "EVIDENCE_MISSING";
    let version = null;
    if (row?.available === false) {
      status = "fail";
      reason = "TOOL_MISSING";
    } else if (row?.available === true) {
      if (range === null) {
        status = "pass";
        reason = "TOOL_PRESENT";
      } else if (typeof row.version === "string" && semver.valid(row.version)) {
        version = semver.valid(row.version);
        status = semver.satisfies(version, range) ? "pass" : "fail";
        reason = status === "pass" ? "VERSION_MATCH" : "VERSION_MISMATCH";
      } else reason = "VERSION_UNVERIFIED";
    }
    add(
      `runtime:${name}:${pointer}`,
      status,
      { available: true, range },
      row
        ? {
            available: row.available,
            version,
            path: typeof row.path === "string" ? safeText(row.path) : null,
          }
        : null,
      pointer,
      `/runtimes/${name}`,
      reason,
    );
    checks.at(-1).evidence.source = inputSource;
  };
  for (const [name, range] of Object.entries(req.runtimes))
    runtime(name, range, `/runtimes/${name}`);
  if (options.manifest !== undefined) {
    if (
      !record(options.manifest) ||
      (options.manifest.engines !== undefined &&
        !record(options.manifest.engines))
    )
      throw invalid("Invalid project manifest");
    for (const name of ["node", "npm"])
      if (own(options.manifest.engines ?? {}, name)) {
        const range = options.manifest.engines[name];
        if (
          typeof range !== "string" ||
          range.length > 256 ||
          semver.validRange(range) === null
        )
          throw invalid("Invalid manifest engine range");
        runtime(
          name,
          range,
          `/engines/${name}`,
          safeText(options.manifestSource ?? "package.json"),
        );
      }
  }
  for (const name of req.configuration) {
    const observed = obs.configuration?.[name];
    add(
      `configuration:${name}`,
      observed === true ? "pass" : observed === false ? "fail" : "unknown",
      true,
      typeof observed === "boolean" ? observed : null,
      `/configuration/${requirements.configuration.indexOf(name)}`,
      `/configuration/${name}`,
      observed === true
        ? "NAME_PRESENT"
        : observed === false
          ? "NAME_MISSING"
          : "EVIDENCE_MISSING",
    );
  }
  for (const p of req.paths)
    for (const permission of p.permissions) {
      const observed = obs.paths?.[p.id]?.[permission];
      add(
        `path:${p.id}:${permission}`,
        observed === true ? "pass" : observed === false ? "fail" : "unknown",
        { path: safeText(p.path), permission },
        typeof observed === "boolean" ? observed : null,
        `/paths/${requirements.paths.findIndex((x) => x.id === p.id)}`,
        `/paths/${p.id}/${permission}`,
        typeof observed === "boolean" ? "ACCESS_EVIDENCE" : "EVIDENCE_MISSING",
      );
    }
  checks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const status = checks.some((x) => x.status === "fail")
    ? "fail"
    : checks.length === 0 || checks.some((x) => x.status === "unknown")
      ? "unknown"
      : "pass";
  return {
    schemaVersion: "1.0",
    tool: "agent-env-doctor",
    operation: "check",
    status,
    complete: !checks.some((x) => x.status === "unknown") && checks.length > 0,
    data: {
      checks,
      summary: {
        pass: checks.filter((x) => x.status === "pass").length,
        fail: checks.filter((x) => x.status === "fail").length,
        unknown: checks.filter((x) => x.status === "unknown").length,
      },
    },
    diagnostics: checks.length
      ? []
      : [{ code: "NO_REQUIREMENTS", message: "No requirements were supplied" }],
  };
}
function findExecutable(name, env) {
  const dirs = (env.PATH ?? env.Path ?? "")
    .split(path.delimiter)
    .filter((x) => path.isAbsolute(x));
  const suffixes =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of dirs)
    for (const suffix of suffixes) {
      const candidate = path.join(dir, name + suffix);
      try {
        if (statSync(candidate).isFile()) {
          accessSync(
            candidate,
            process.platform === "win32" ? constants.F_OK : constants.X_OK,
          );
          return candidate;
        }
      } catch {}
    }
  return null;
}
export function collectSnapshot(requirements, options = {}) {
  const req = validateRequirements(requirements);
  const env = options.env ?? process.env;
  const probe = options.spawn ?? spawnSync;
  const snapshot = {
    schemaVersion: "1.0",
    runtimes: {},
    configuration: {},
    paths: {},
  };
  const reduced = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"])
    if (typeof env[key] === "string") reduced[key] = env[key];
  for (const name of Object.keys(req.runtimes)) {
    if (name === "node") {
      snapshot.runtimes.node = {
        available: true,
        version: process.versions.node,
        path: safeText(process.execPath),
      };
      continue;
    }
    let executable = null,
      args = ["--version"];
    if (
      name === "npm" &&
      env.npm_execpath &&
      path.basename(env.npm_execpath) === "npm-cli.js" &&
      existsSync(env.npm_execpath)
    ) {
      executable = process.execPath;
      args = [env.npm_execpath, "--version"];
    } else
      executable =
        findExecutable(name === "python" ? "python3" : name, env) ??
        (name === "python" ? findExecutable("python", env) : null);
    if (!executable) {
      snapshot.runtimes[name] = { available: false, version: null, path: null };
      continue;
    }
    if (/\.(?:cmd|bat)$/i.test(executable)) {
      snapshot.runtimes[name] = {
        available: true,
        version: null,
        path: safeText(executable),
      };
      continue;
    }
    const result = probe(executable, args, {
      encoding: "utf8",
      timeout: 1500,
      maxBuffer: 16384,
      shell: false,
      env: reduced,
      windowsHide: true,
    });
    const raw = String(result.stdout ?? "") + " " + String(result.stderr ?? "");
    const match = raw.match(
      /(?:^|\s)v?(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)(?=\s|$)/,
    );
    snapshot.runtimes[name] = {
      available: true,
      version:
        result.status === 0 && match && semver.valid(match[1])
          ? match[1]
          : null,
      path: safeText(executable),
    };
  }
  for (const name of req.configuration)
    snapshot.configuration[name] = own(env, name);
  if (options.probePaths === true)
    for (const p of req.paths) {
      snapshot.paths[p.id] = {};
      for (const permission of p.permissions)
        try {
          accessSync(
            path.resolve(options.baseDirectory ?? process.cwd(), p.path),
            {
              read: constants.R_OK,
              write: constants.W_OK,
              execute: constants.X_OK,
            }[permission],
          );
          snapshot.paths[p.id][permission] = true;
        } catch (e) {
          snapshot.paths[p.id][permission] = [
            "EACCES",
            "EPERM",
            "ENOENT",
            "ENOTDIR",
          ].includes(e.code)
            ? false
            : null;
        }
    }
  return snapshot;
}
export function encodeResult(result) {
  const text = JSON.stringify(result);
  return Buffer.byteLength(text) <= LIMITS.outputBytes
    ? text
    : JSON.stringify({
        schemaVersion: "1.0",
        tool: "agent-env-doctor",
        operation: "check",
        status: "unknown",
        complete: false,
        data: null,
        diagnostics: [
          { code: "OUTPUT_LIMIT", message: "Result exceeds output budget" },
        ],
      });
}
export function exitCode(result) {
  return { pass: 0, fail: 1, unknown: 3, error: 2 }[result.status] ?? 2;
}
