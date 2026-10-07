import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "../dist/src/index.js";
import { redactText } from "../dist/src/core/redact.js";

const cli = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
const request = (message) => ({
  schemaVersion: "1",
  artifacts: [{ id: "stderr", stream: "stderr", content: JSON.stringify({ diagnostics: [{ message, severity: "error" }] }) }],
});

for (const newline of ["\n", "\r\n"]) {
  for (const quote of ["\"", "'"]) {
    test("quoted credentials redact every line (" + JSON.stringify(newline) + ", " + quote + ")", () => {
      const messages = ["A", "B"].map((variant) =>
        "private_key=" + quote + "SYNTHETIC_FIRST" + newline + "SYNTHETIC_" + variant + "_TAIL" + newline + "SYNTHETIC_LAST" + quote + " inputTokens=42");
      const diagnostics = messages.map((message) => parse(request(message)).data.diagnostics[0]);
      for (const diagnostic of diagnostics) {
        assert.equal(diagnostic?.message, "private_key=[REDACTED] inputTokens=42");
        assert.equal(redactText(diagnostic.message), diagnostic.message);
      }
      assert.equal(diagnostics[0].id, diagnostics[1].id);
    });
  }
}

test("escaped quotes stay inside the credential boundary and benign neighbors survive", () => {
  const message = "{\"OPENAI_API_KEY\":\"SYNTHETIC_FIRST\\\"SYNTHETIC_TAIL\nSYNTHETIC_LAST\"} outputTokens=17";
  const result = parse(request(message));
  assert.equal(result.status, "complete");
  assert.equal(result.data.diagnostics[0]?.message, "{\"OPENAI_API_KEY\":[REDACTED]} outputTokens=17");
});

test("unterminated multiline credentials withhold the rest of the value", () => {
  for (const quote of ["\"", "'"]) {
    const message = "client_secret=" + quote + "SYNTHETIC_FIRST\nSYNTHETIC_TAIL";
    const result = parse(request(message));
    assert.equal(result.data.diagnostics[0]?.message, "client_secret=[REDACTED]");
  }
});

test("an incomplete trailing escape cannot expose the remaining credential lines", () => {
  const result = parse(request("private_key=\"SYNTHETIC_FIRST\nSYNTHETIC_TAIL\\"));
  assert.equal(result.data.diagnostics[0]?.message, "private_key=[REDACTED]");
});

test("CLI output and producer outcome cannot expose a multiline credential tail", () => {
  const input = request("private_key=\"SYNTHETIC_FIRST\nSYNTHETIC_TAIL\nSYNTHETIC_LAST\"");
  input.producerOutcome = { command: "password=\"SYNTHETIC_FIRST\nSYNTHETIC_COMMAND_TAIL\"", exitCode: 1 };
  const child = spawnSync(process.execPath, [cli, "parse", "--stdin", "--format", "json"], {
    input: JSON.stringify(input), encoding: "utf8", timeout: 3000,
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.includes("SYNTHETIC_"), false);
  const result = JSON.parse(child.stdout);
  assert.equal(result.status, "complete");
  assert.equal(result.data.diagnostics[0]?.message, "private_key=[REDACTED]");
  assert.equal(result.producerOutcome.command, "password=[REDACTED]");
});
