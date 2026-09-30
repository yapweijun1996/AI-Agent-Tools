import { TextDecoder } from "node:util";

function assertInteger(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer >= ${minimum}`);
  }
}

function isCodePointBoundary(text, offset) {
  if (offset <= 0 || offset >= text.length) return true;
  const previous = text.charCodeAt(offset - 1);
  const current = text.charCodeAt(offset);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

function codePointAt(text, offset) {
  const codePoint = text.codePointAt(offset);
  const character = String.fromCodePoint(codePoint);
  return { character, textLength: character.length };
}

function buildLineStarts(text) {
  const lineStarts = [{ textOffset: 0, byteOffset: 0 }];
  let textOffset = 0;
  let byteOffset = 0;

  while (textOffset < text.length) {
    const { character, textLength } = codePointAt(text, textOffset);
    byteOffset += Buffer.byteLength(character, "utf8");
    textOffset += textLength;
    if (character === "\n") {
      lineStarts.push({ textOffset, byteOffset });
    }
  }

  return lineStarts;
}

function findLine(lineStarts, byteOffset) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle].byteOffset <= byteOffset) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}

/**
 * Maps offsets in decoded UTF-8 text back to original byte offsets and lines.
 * Columns are JavaScript UTF-16 code-unit offsets and are zero-based.
 */
export class SourceMap {
  #text;
  #byteLength;
  #lineStarts;

  constructor(text, byteLength) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    assertInteger(byteLength, "byteLength");
    const actualByteLength = Buffer.byteLength(text, "utf8");
    if (actualByteLength !== byteLength) {
      throw new RangeError(`byteLength must equal the UTF-8 byte length of text (${actualByteLength})`);
    }
    this.#text = text;
    this.#byteLength = byteLength;
    this.#lineStarts = buildLineStarts(text);
    Object.freeze(this.#lineStarts);
    Object.freeze(this);
  }

  get lineCount() {
    return this.#lineStarts.length;
  }

  textOffsetToByteOffset(textOffset) {
    assertInteger(textOffset, "textOffset");
    if (textOffset > this.#text.length) {
      throw new RangeError(`textOffset must be <= ${this.#text.length}`);
    }
    if (!isCodePointBoundary(this.#text, textOffset)) {
      throw new RangeError("textOffset must be on a UTF-16 code-point boundary");
    }
    return Buffer.byteLength(this.#text.slice(0, textOffset), "utf8");
  }

  spanFromTextOffsets(startTextOffset, endTextOffset) {
    assertInteger(startTextOffset, "startTextOffset");
    assertInteger(endTextOffset, "endTextOffset");
    if (endTextOffset < startTextOffset || endTextOffset > this.#text.length) {
      throw new RangeError("text span must be ordered and within the source");
    }
    return this.spanFromByteOffsets(
      this.textOffsetToByteOffset(startTextOffset),
      this.textOffsetToByteOffset(endTextOffset),
    );
  }

  byteOffsetToPosition(byteOffset) {
    assertInteger(byteOffset, "byteOffset");
    if (byteOffset > this.#byteLength) {
      throw new RangeError(`byteOffset must be <= ${this.#byteLength}`);
    }

    const lineIndex = findLine(this.#lineStarts, byteOffset);
    const lineStart = this.#lineStarts[lineIndex];
    let currentByteOffset = lineStart.byteOffset;
    let textOffset = lineStart.textOffset;
    let column = 0;

    while (textOffset < this.#text.length && currentByteOffset < byteOffset) {
      const { character, textLength } = codePointAt(this.#text, textOffset);
      const characterBytes = Buffer.byteLength(character, "utf8");
      if (currentByteOffset + characterBytes > byteOffset) {
        return {
          byteOffset,
          line: lineIndex + 1,
          column,
          exact: false,
        };
      }
      currentByteOffset += characterBytes;
      textOffset += textLength;
      column += textLength;
    }

    return {
      byteOffset,
      line: lineIndex + 1,
      column,
      exact: currentByteOffset === byteOffset,
    };
  }

  positionToByteOffset(line, column) {
    assertInteger(line, "line", 1);
    assertInteger(column, "column");
    if (line > this.#lineStarts.length) {
      throw new RangeError(`line must be <= ${this.#lineStarts.length}`);
    }

    const lineStart = this.#lineStarts[line - 1];
    const nextLineStart = this.#lineStarts[line] ?? { textOffset: this.#text.length };
    const lineLength = nextLineStart.textOffset - lineStart.textOffset;
    if (column > lineLength) {
      throw new RangeError(`column must be <= ${lineLength} for line ${line}`);
    }

    const textOffset = lineStart.textOffset + column;
    if (!isCodePointBoundary(this.#text, textOffset)) {
      throw new RangeError("column must be on a UTF-16 code-point boundary");
    }

    return lineStart.byteOffset + Buffer.byteLength(this.#text.slice(lineStart.textOffset, textOffset), "utf8");
  }

  spanFromByteOffsets(startByteOffset, endByteOffset) {
    assertInteger(startByteOffset, "startByteOffset");
    assertInteger(endByteOffset, "endByteOffset");
    if (endByteOffset < startByteOffset || endByteOffset > this.#byteLength) {
      throw new RangeError("byte span must be ordered and within the source");
    }

    const start = this.byteOffsetToPosition(startByteOffset);
    const end = this.byteOffsetToPosition(endByteOffset);
    return {
      start_line: start.line,
      start_col: start.column,
      end_line: end.line,
      end_col: end.column,
    };
  }
}

function toUint8Array(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return bytes;
  throw new TypeError("bytes must be a Buffer or Uint8Array");
}

/**
 * Decode a source buffer as strict UTF-8 without executing or repairing it.
 * A UTF-8 BOM is preserved so byte offsets remain exact.
 */
export function decodeUtf8(bytes, file = "<unknown>") {
  const input = toUint8Array(bytes);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

  try {
    const text = decoder.decode(input);
    return Object.freeze({
      file,
      encoding: "utf-8",
      valid: true,
      complete: true,
      text,
      sourceMap: new SourceMap(text, input.byteLength),
      diagnostics: Object.freeze([]),
    });
  } catch {
    return Object.freeze({
      file,
      encoding: "utf-8",
      valid: false,
      complete: false,
      text: null,
      sourceMap: null,
      diagnostics: Object.freeze([{
        code: "INVALID_ENCODING",
        severity: "error",
        file,
        message: "Source is not valid UTF-8; no fallback decoding was attempted.",
      }]),
    });
  }
}
