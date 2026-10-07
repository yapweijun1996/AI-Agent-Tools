import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runRequest } from "../src/cli.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(packageRoot, "src/cli.js");
const hook = path.join(packageRoot, "test-support/deadline-hook.mjs");
const profile = fs.readFileSync(path.join(packageRoot, "profiles/example.json"));

function withSource(source, visit) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfml-policy-text-")));
  try {
    fs.writeFileSync(path.join(root, "input.cfm"), source);
    fs.writeFileSync(path.join(root, "profile.json"), profile);
    return visit({ operation: "check", root, file: "input.cfm", profile: "profile.json" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function run(request, operation) {
  if (operation === "api") return runRequest(request);
  const args = [cli, "check", "--root", request.root, "--file", request.file,
    "--profile", request.profile, "--json"];
  const child = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 3000 });
  assert.ifError(child.error);
  assert.ok(child.stdout, child.stderr);
  return { result: JSON.parse(child.stdout), exitCode: child.status };
}

for (const element of ["script", "style", "textarea", "title"]) {
  for (const operation of ["api", "cli"]) {
    test(operation + " ignores table-shaped text inside " + element, () => {
      withSource("<" + element + ">const template = '<table></table><colgroup></colgroup>';</" + element + ">", request => {
        const response = run(request, operation);
        assert.equal(response.exitCode, 0);
        assert.equal(response.result.complete, true);
        assert.equal(response.result.data.verdict, "pass");
        assert.deepEqual(response.result.data.findings, []);
      });
    });
  }
}
test("text contexts preserve actual table findings and source coordinates", () => {
  withSource("<SCRIPT>const template = '<table></table>';</sCrIpT>\n<textarea><colgroup></colgroup></textarea>\n<table></table>", request => {
    const response = runRequest(request);
    assert.equal(response.exitCode, 0);
    assert.equal(response.result.data.finding_count, 1);
    assert.deepEqual(response.result.data.findings.map(({ rule_id, line, column }) => ({ rule_id, line, column })),
      [{ rule_id: "html.table.requires-colgroup", line: 3, column: 1 }]);
  });
});
test("other supported raw-text elements suppress tag-shaped contents", () => {
  for (const element of ["xmp", "iframe", "noembed", "noframes"]) {
    withSource("<" + element + "><table></table><colgroup></colgroup></" + element + ">", request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, 0);
      assert.equal(response.result.data.verdict, "pass");
      assert.deepEqual(response.result.data.findings, []);
    });
  }
});
test("a slash on an opening text element does not end its text context", () => {
  withSource("<script/><table></table></script><table><colgroup><col></colgroup></table>", request => {
    const response = runRequest(request);
    assert.equal(response.exitCode, 0);
    assert.equal(response.result.data.verdict, "pass");
  });
  withSource("<script/><table></table>", request => {
    const response = runRequest(request);
    assert.equal(response.exitCode, 3);
    assert.equal(response.result.complete, false);
  });
});
test("unsupported plaintext and scripting-mode contexts are incomplete", () => {
  for (const element of ["plaintext", "noscript"]) {
    withSource("<" + element + "><table></table></" + element + ">", request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, 3);
      assert.equal(response.result.complete, false);
      assert.equal(response.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
      assert.equal(response.result.data, null);
    });
  }
});
test("visible-span hash checks preserve escaped hashes and comment suppression", () => {
  const table = "<table><colgroup><col></colgroup></table>";
  for (const [prefix, expectedExit] of [
    ["##", 0],
    ["###", 3],
    ["<!-- #comment# --><!--- #comment# --->", 0],
    ["#<!-- comment -->#", 3],
    ["<script><!--- #comment# ---></script>", 0],
  ]) {
    withSource(prefix + table, request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, expectedExit, prefix);
      assert.equal(response.result.complete, expectedExit === 0, prefix);
      if (expectedExit === 0) assert.equal(response.result.data.verdict, "pass");
      else assert.equal(response.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
    });
  }
});
test("unclosed text elements fail closed", () => {
  for (const element of ["script", "style", "textarea", "title"]) {
    withSource("<" + element + "><table></table>", request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, 3);
      assert.equal(response.result.complete, false);
      assert.equal(response.result.data, null);
    });
  }
});
test("lookalike end tags do not close text elements", () => {
  for (const element of ["script", "style", "textarea", "title"]) {
    withSource("<" + element + "></" + element + "x><table></table></" + element + " ><table><colgroup><col></colgroup></table>", request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, 0);
      assert.equal(response.result.data.verdict, "pass");
    });
  }
});
test("dynamic CFML within text cannot silently validate an actual table", () => {
  for (const text of ["<cfif dynamic></cfif>", "#dynamic#"]) {
    withSource("<script>" + text + "</script><table><colgroup><col></colgroup></table>", request => {
      const response = runRequest(request);
      assert.equal(response.exitCode, 3);
      assert.equal(response.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
    });
  }
});
test("double-escaped script contexts are explicitly incomplete", () => {
  withSource("<script><!--<script><table></table></script>--></script>", request => {
    const response = runRequest(request);
    assert.equal(response.exitCode, 3);
    assert.equal(response.result.complete, false);
    assert.equal(response.result.data, null);
  });
});
test("comment-heavy input respects its cooperative processing budget", () => {
  withSource("<!-- x -->".repeat(24000), request => {
    request.limits = { max_processing_ms: 30 };
    const child = spawnSync(process.execPath, ["--input-type=module", "--eval",
      "const { runRequest } = await import(" + JSON.stringify(pathToFileURL(cli).href) +
      "); const began = performance.now(); const response = runRequest(" + JSON.stringify(request) +
      "); console.log(JSON.stringify({ elapsedMs: performance.now() - began, ...response }));"], {
      encoding: "utf8", timeout: 3000, killSignal: "SIGKILL",
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    const response = JSON.parse(child.stdout);
    if (response.result.complete) {
      assert.equal(response.exitCode, 0);
      assert.equal(response.result.data.verdict, "pass");
      assert.ok(response.elapsedMs <= 130, "A completed result substantially exceeded the 30 ms budget");
    } else {
      assert.equal(response.exitCode, 3);
      assert.equal(response.result.errors[0].code, "RESOURCE_LIMIT");
      assert.equal(response.result.data, null);
    }
  });
});
for (const phase of ["index", "sort"]) {
  test("deadline expiration during " + phase + " cannot return a complete result", () => {
    withSource("<!-- SYNTHETIC_DEADLINE_MARKER -->\n<table></table>\n<table></table>", request => {
      const child = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href,
        cli, "check", "--root", request.root, "--file", request.file, "--profile", request.profile,
        "--limits", JSON.stringify({ max_processing_ms: 30 }), "--json"], {
        encoding: "utf8", timeout: 3000, env: { ...process.env, POLICY_TEST_DEADLINE: phase },
      });
      assert.ifError(child.error);
      assert.equal(child.status, 3, child.stderr || child.stdout);
      const result = JSON.parse(child.stdout);
      assert.equal(result.complete, false);
      assert.equal(result.data, null);
      assert.equal(result.errors[0].code, "RESOURCE_LIMIT");
      const observation = child.stderr.split("\n").find(line => line.startsWith("DEADLINE_OBSERVATION:"));
      assert.ok(observation, child.stderr);
      assert.equal(JSON.parse(observation.slice("DEADLINE_OBSERVATION:".length)).expired, true);
    });
  });
}
