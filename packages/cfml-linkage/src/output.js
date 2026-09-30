const OUTPUT_LIMIT_CODE = "OUTPUT_LIMIT";

function normalizeMaxBytes(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("maxBytes must be a positive safe integer or null");
  return value;
}

function outputLimitDiagnostic(maxBytes) {
  return {
    code: OUTPUT_LIMIT_CODE,
    severity: "error",
    message: `JSON output exceeded configured maximum of ${maxBytes} bytes.`,
    details: { max_output_bytes: maxBytes },
  };
}

/**
 * Serialize one JSON value and optionally enforce a byte limit. The returned
 * byte count includes trailingText, which lets the CLI account for its line
 * terminator using the same UTF-8 measurement as the library boundary.
 */
export function serializeBoundedJson(value, { maxBytes = null, trailingText = "" } = {}) {
  const limit = normalizeMaxBytes(maxBytes);
  if (typeof trailingText !== "string") throw new TypeError("trailingText must be a string");
  const json = JSON.stringify(value);
  if (typeof json !== "string") throw new TypeError("value must be JSON-serializable");
  const output = `${json}${trailingText}`;
  const bytes = Buffer.byteLength(output, "utf8");
  if (limit !== null && bytes > limit) {
    return {
      complete: false,
      bytes,
      output: null,
      diagnostics: [outputLimitDiagnostic(limit)],
    };
  }
  return {
    complete: true,
    bytes,
    output,
    diagnostics: [],
  };
}

/**
 * Serialize a structured analysis result at the private library boundary.
 * The structured result is never truncated when its serialized form exceeds
 * the configured limit; callers receive explicit incomplete evidence instead.
 */
export function serializeAnalysis(analysis, { maxOutputBytes, config } = {}) {
  const configuredLimit = config?.limits?.max_output_bytes;
  const maxBytes = maxOutputBytes === undefined ? configuredLimit : maxOutputBytes;
  const serialized = serializeBoundedJson(analysis, { maxBytes });
  return {
    complete: serialized.complete,
    bytes: serialized.bytes,
    json: serialized.output,
    diagnostics: serialized.diagnostics,
  };
}
