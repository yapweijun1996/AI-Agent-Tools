import assert from "node:assert/strict";
import test from "node:test";

import { SourceMap, decodeUtf8 } from "../src/source-map.js";

test("decodes strict UTF-8 and maps ASCII line positions", () => {
  const bytes = Buffer.from("alpha\nbeta\n", "utf8");
  const result = decodeUtf8(bytes, "fixture.cfm");
  assert.equal(result.valid, true);
  assert.equal(result.complete, true);
  assert.equal(result.text, "alpha\nbeta\n");
  assert.equal(result.sourceMap.lineCount, 3);
  assert.deepEqual(result.sourceMap.byteOffsetToPosition(6), {
    byteOffset: 6,
    line: 2,
    column: 0,
    exact: true,
  });
  assert.equal(result.sourceMap.positionToByteOffset(2, 2), 8);
  assert.equal(result.sourceMap.textOffsetToByteOffset(6), 6);
  assert.deepEqual(result.sourceMap.spanFromTextOffsets(0, 10), {
    start_line: 1,
    start_col: 0,
    end_line: 2,
    end_col: 4,
  });
  assert.deepEqual(result.sourceMap.spanFromByteOffsets(0, 10), {
    start_line: 1,
    start_col: 0,
    end_line: 2,
    end_col: 4,
  });
});

test("maps UTF-8 byte offsets while columns count UTF-16 code units", () => {
  const text = "α😀\néx";
  const bytes = Buffer.from(text, "utf8");
  const map = new SourceMap(text, bytes.byteLength);
  const emojiByteOffset = Buffer.byteLength("α", "utf8");
  assert.deepEqual(map.byteOffsetToPosition(emojiByteOffset), {
    byteOffset: emojiByteOffset,
    line: 1,
    column: 1,
    exact: true,
  });
  const secondLineByteOffset = Buffer.byteLength("α😀\n", "utf8");
  assert.deepEqual(map.byteOffsetToPosition(secondLineByteOffset), {
    byteOffset: secondLineByteOffset,
    line: 2,
    column: 0,
    exact: true,
  });
  assert.equal(map.positionToByteOffset(1, 3), Buffer.byteLength("α😀", "utf8"));
  assert.throws(() => map.positionToByteOffset(1, 2), /code-point boundary/u);
});

test("preserves a UTF-8 BOM in the decoded text and byte map", () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("x\n")]);
  const result = decodeUtf8(bytes, "bom.cfm");
  assert.equal(result.valid, true);
  assert.equal(result.text, "\ufeffx\n");
  assert.equal(result.sourceMap.positionToByteOffset(1, 1), 3);
  assert.deepEqual(result.sourceMap.byteOffsetToPosition(3), {
    byteOffset: 3,
    line: 1,
    column: 1,
    exact: true,
  });
});

test("rejects invalid UTF-8 without fallback repair", () => {
  const result = decodeUtf8(Buffer.from([0xc3, 0x28]), "invalid.cfm");
  assert.equal(result.valid, false);
  assert.equal(result.complete, false);
  assert.equal(result.text, null);
  assert.equal(result.sourceMap, null);
  assert.deepEqual(result.diagnostics, [{
    code: "INVALID_ENCODING",
    severity: "error",
    file: "invalid.cfm",
    message: "Source is not valid UTF-8; no fallback decoding was attempted.",
  }]);
});

test("rejects inconsistent byte lengths, invalid positions, and unordered byte spans", () => {
  assert.throws(() => new SourceMap("one\n", 3), /byteLength must equal/u);
  const map = new SourceMap("one\n", 4);
  assert.throws(() => map.byteOffsetToPosition(5), /must be <= 4/u);
  assert.throws(() => map.positionToByteOffset(3, 0), /line must be <= 2/u);
  assert.throws(() => map.spanFromByteOffsets(3, 2), /ordered/u);
});
