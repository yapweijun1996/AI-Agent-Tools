import { decodeUtf8 } from "./source-map.js";

const DEFAULT_PARSER_VERSION = "unselected";
const DEFAULT_MAX_DIAGNOSTICS = 256;
const MAX_DIAGNOSTIC_MESSAGE = 1024;
const ALLOWED_SEVERITIES = new Set(["error", "warning", "info"]);

function diagnostic(code, severity, message, file, details = {}) {
  return {
    code,
    severity,
    message: message.slice(0, MAX_DIAGNOSTIC_MESSAGE),
    file,
    ...details,
  };
}

function normalizeVersion(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError("parserVersion must be a non-empty string");
  }
  return value;
}

function normalizeMaxDiagnostics(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("maxDiagnostics must be a positive safe integer");
  }
  return value;
}

function normalizeSpan(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = ["start_line", "start_col", "end_line", "end_col"];
  const validEntries = keys.filter((key) => Number.isSafeInteger(value[key]) && value[key] >= 0);
  return validEntries.length === 0 ? null : Object.fromEntries(validEntries.map((key) => [key, value[key]]));
}

function normalizeBackendDiagnostics(values, file) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => {
    const code = typeof item?.code === "string" && item.code.trim() !== "" ? item.code : "PARSE_PARTIAL";
    const severity = ALLOWED_SEVERITIES.has(item?.severity) ? item.severity : "warning";
    const message = typeof item?.message === "string" && item.message.trim() !== "" ? item.message : "Parser reported an unspecified diagnostic.";
    const details = {};
    const span = normalizeSpan(item?.span);
    if (span) details.span = span;
    return diagnostic(code, severity, message, file, details);
  });
}

function limitDiagnostics(values, maxDiagnostics, file) {
  if (values.length <= maxDiagnostics) return { diagnostics: values, truncated: false };
  const diagnostics = values.slice(0, maxDiagnostics - 1);
  diagnostics.push(diagnostic("DIAGNOSTICS_TRUNCATED", "warning", `Parser diagnostics exceeded the limit of ${maxDiagnostics}.`, file));
  return { diagnostics, truncated: true };
}

function result(file, parserVersion, tree, complete, diagnostics, sourceMap = null) {
  return Object.freeze({
    file,
    parser_version: parserVersion,
    tree,
    complete,
    diagnostics: Object.freeze(diagnostics),
    sourceMap,
  });
}

/**
 * Create a parser-neutral adapter. The backend is injected so parser selection
 * remains explicit and no language parser is silently substituted.
 */
export function createParserAdapter({ backend = null, parserVersion = DEFAULT_PARSER_VERSION, maxDiagnostics = DEFAULT_MAX_DIAGNOSTICS } = {}) {
  const normalizedVersion = normalizeVersion(parserVersion);
  const normalizedMaxDiagnostics = normalizeMaxDiagnostics(maxDiagnostics);
  if (backend !== null && (!backend || typeof backend.parse !== "function")) {
    throw new TypeError("backend must expose a parse(text, context) function or be null");
  }

  return Object.freeze({
    parserVersion: normalizedVersion,
    parse(bytes, file = "<unknown>") {
      const decoded = decodeUtf8(bytes, file);
      if (!decoded.valid) {
        return result(file, normalizedVersion, null, false, decoded.diagnostics, null);
      }
      if (backend === null) {
        return result(file, normalizedVersion, null, false, [
          diagnostic("PARSER_UNAVAILABLE", "warning", "No parser backend is selected; source was not interpreted.", file),
        ], decoded.sourceMap);
      }

      let parsed;
      try {
        parsed = backend.parse(decoded.text, {
          file,
          sourceMap: decoded.sourceMap,
          parserVersion: normalizedVersion,
        });
      } catch (error) {
        return result(file, normalizedVersion, null, false, [
          diagnostic("PARSER_FAILURE", "error", `Parser backend failed: ${error?.code ?? "unknown"}.`, file),
        ], decoded.sourceMap);
      }

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return result(file, normalizedVersion, null, false, [
          diagnostic("PARSER_FAILURE", "error", "Parser backend returned an invalid result.", file),
        ], decoded.sourceMap);
      }

      const normalized = normalizeBackendDiagnostics(parsed.diagnostics, file);
      if (normalized.length === 0 && parsed.complete !== true) {
        normalized.push(diagnostic("PARSE_PARTIAL", "warning", "Parser did not establish complete coverage.", file));
      }
      if (parsed.tree === null || parsed.tree === undefined) {
        normalized.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", "Parser produced no syntax tree for this source.", file));
      }
      const limited = limitDiagnostics(normalized, normalizedMaxDiagnostics, file);
      const complete = parsed.complete === true && !limited.truncated && limited.diagnostics.every((item) => item.severity !== "error");
      return result(file, normalizedVersion, parsed.tree ?? null, complete && parsed.tree != null, limited.diagnostics, decoded.sourceMap);
    },
  });
}
