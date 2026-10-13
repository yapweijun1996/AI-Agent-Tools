import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compareContracts, LIMITS, readJson, selectPointer } from "../src/index.js";

function fixtures(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "contract-raw-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return (name, content) => {
    const file = path.join(directory, name + ".json");
    writeFileSync(file, content);
    return file;
  };
}

const ambiguous = [
  ["root", '{"type":"number","type":"string"}'],
  ["nested", '{"properties":{"field":{"type":"number","type":"string"}}}'],
  ["escaped equivalent", String.raw`{"type":"number","\u0074ype":"string"}`],
  ["escaped nested", String.raw`{"properties":{"field":{},"\u0066ield":{}}}`],
  ["array member", '[{"type":"number","type":"string"}]'],
  ["prototype key", '{"__proto__":{},"__proto__":{}}'],
  ["empty key", '{"":1,"":2}'],
  ["escaped quote key", String.raw`{"a\"b":1,"a\u0022b":2}`],
  ["escaped Unicode pair", String.raw`{"😀":1,"\ud83d\ude00":2}`],
];
for (const [name, raw] of ambiguous) {
  test(`readJson rejects ${name} duplicate keys`, (t) => {
    const file = fixtures(t)("input", raw);
    assert.throws(() => readJson(file), { code: "INVALID_INPUT" });
  });
}

for (const [name, bytes] of [
  ["invalid continuation", [0xc3, 0x28]],
  ["overlong encoding", [0xc0, 0xaf]],
  ["encoded surrogate", [0xed, 0xa0, 0x80]],
  ["out of range", [0xf4, 0x90, 0x80, 0x80]],
  ["truncated sequence", [0xe2, 0x82]],
]) {
  test(`readJson rejects UTF-8 ${name}`, (t) => {
    const raw = Buffer.concat([
      Buffer.from('{"description":"'),
      Buffer.from(bytes),
      Buffer.from('"}'),
    ]);
    assert.throws(() => readJson(fixtures(t)("input", raw)), {
      code: "INVALID_INPUT",
    });
  });
}

for (const [name, raw] of [
  ["BOM", '\ufeff{"type":"string"}'],
  ["trailing comma", '{"type":"string",}'],
  ["bad escape", String.raw`{"description":"\x20"}`],
  ["unterminated string", '{"description":"unfinished}'],
  ["trailing value", '{} []'],
  ["leading zero", '{"minimum":01}'],
  ["control character", '{"description":"\n"}'],
]) {
  test(`readJson retains rejection of ${name}`, (t) => {
    assert.throws(() => readJson(fixtures(t)("input", raw)), {
      code: "INVALID_INPUT",
    });
  });
}

test("readJson retains valid JSON values and keys scoped to their own objects", (t) => {
  const write = fixtures(t);
  const values = [
    null, true, false, 1.25e-12, "text with { braces } and : colon",
    {
      'a"b\\c/{}[]:': { type: "string", description: 'escaped \\ and " } {' },
      sibling: { type: "number", description: "Unicode 用户 😀 and replacement �" },
      values: [{ same: true }, { same: false }],
    },
  ];
  for (const [index, value] of values.entries()) {
    const raw = " \t\r\n" + JSON.stringify(value, null, 2) + "\r\n";
    assert.deepEqual(readJson(write("value-" + index, raw)), value);
  }
});

test("readJson supports raw escapes and pointer extraction", (t) => {
  const raw = String.raw`{"tools":[{"inputSchema":{"properties":{"a/b~c":{"type":"string"}}}},{"inputSchema":{"type":"number"}}],"text":"{\"type\":1,\"type\":2} \\ \u007d"}`;
  const value = readJson(fixtures(t)("input", raw));
  assert.deepEqual(selectPointer(value, "/tools/0/inputSchema/properties/a~1b~0c"), {
    type: "string",
  });
  assert.deepEqual(selectPointer(value, "/tools/1/inputSchema"), { type: "number" });
});

test("duplicates outside a selected schema are rejected before selection", (t) => {
  const raw = '{"schema":{"type":"string"},"metadata":{"value":1,"value":2}}';
  const file = fixtures(t)("input", raw);
  assert.throws(() => selectPointer(readJson(file), "/schema"), {
    code: "INVALID_INPUT",
  });
});

for (const kind of ["properties", "items"]) {
  test(`readJson retains the schema depth boundary through ${kind}`, (t) => {
    const write = fixtures(t);
    let schema = { type: "string" };
    for (let depth = 0; depth < LIMITS.depth; depth++) {
      schema = kind === "properties" ? { properties: { child: schema } } : { items: schema };
    }
    const admitted = readJson(write("boundary", JSON.stringify(schema)));
    assert.deepEqual(admitted, schema);
    const result = compareContracts(admitted, admitted);
    assert.equal(result.status, "compatible");
    assert.equal(result.complete, true);
    const over = kind === "properties" ? { properties: { child: schema } } : { items: schema };
    assert.throws(() => compareContracts(readJson(write("over", JSON.stringify(over))), {}), {
      code: "INVALID_INPUT",
    });
  });
}

test("pointer wrappers do not inherit a schema or recursive parser depth limit", (t) => {
  const depth = 4096;
  const raw = '{"wrapper":'.repeat(depth) + '{"type":"string"}' + "}".repeat(depth);
  const schema = selectPointer(readJson(fixtures(t)("input", raw)), "/wrapper".repeat(depth));
  assert.deepEqual(schema, { type: "string" });
  assert.equal(compareContracts(schema, schema).status, "compatible");
});

test("raw admission preserves the existing input byte boundary", (t) => {
  const write = fixtures(t);
  const raw = "{}" + " ".repeat(LIMITS.inputBytes - 2);
  assert.deepEqual(readJson(write("boundary", raw)), {});
  assert.throws(() => readJson(write("over", raw + " ")), { code: "INVALID_INPUT" });
});

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
for (const role of ["before", "after", "samples"]) {
  for (const [kind, raw] of [
    ["duplicate", '{"description":"private-source-marker","type":"number","type":"string"}'],
    ["escaped duplicate", String.raw`{"description":"private-source-marker","type":"number","\u0074ype":"string"}`],
    ["invalid UTF-8", Buffer.concat([
      Buffer.from(role === "samples" ? '["private-source-marker' : '{"description":"private-source-marker'),
      Buffer.from([0xff]),
      Buffer.from(role === "samples" ? '"]' : '","type":"string"}'),
    ])],
  ]) {
    test(`native CLI rejects ${kind} on the ${role} raw path without leaking content`, (t) => {
      const write = fixtures(t);
      const files = {
        before: write("before", '{"type":"string"}'),
        after: write("after", '{"type":"string"}'),
        samples: write("samples", '["valid"]'),
      };
      files[role] = write("invalid", raw);
      const run = spawnSync(process.execPath, [cli, "compare", "--before", files.before,
        "--after", files.after, "--samples", files.samples, "--json"], { encoding: "utf8" });
      assert.ifError(run.error);
      assert.equal(run.status, 2);
      assert.equal(run.stderr, "");
      const result = JSON.parse(run.stdout);
      assert.equal(result.status, "error");
      assert.equal(result.complete, false);
      assert.equal(result.data, null);
      assert.deepEqual(result.diagnostics.map((item) => item.code), ["INVALID_INPUT"]);
      assert.ok(!run.stdout.includes("private-source-marker"));
      assert.ok(!run.stdout.includes(files[role]));
    });
  }
}

test("native CLI retains compatible pointer and sample inputs", (t) => {
  const write = fixtures(t);
  const before = write("before", '{"tools":[{"inputSchema":{"type":"string","pattern":"^a"}}]}');
  const after = write("after", '{"schema":{"type":"string","pattern":"^a"}}');
  const samples = write("samples", JSON.stringify(["abc", "用户", 'a\\{"}']));
  const run = spawnSync(process.execPath, [cli, "compare", "--before", before,
    "--before-pointer", "/tools/0/inputSchema", "--after", after, "--after-pointer", "/schema",
    "--samples", samples, "--json"], { encoding: "utf8" });
  assert.ifError(run.error);
  assert.equal(run.status, 0);
  assert.equal(run.stderr, "");
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, "compatible");
  assert.equal(result.complete, true);
  assert.deepEqual(result.data.changes, []);
});
