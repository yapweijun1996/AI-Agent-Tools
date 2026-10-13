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
  if (request.limits !== undefined) args.push("--limits", JSON.stringify(request.limits));
  const child = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 3000 });
  assert.ifError(child.error);
  assert.ok(child.stdout, child.stderr);
  return { result: JSON.parse(child.stdout), exitCode: child.status };
}

for (const operation of ["api", "cli"]) {
  test(operation + " fails closed for unknown output regardless of literal policy targets", () => {
    for (const [source, reason, column] of [
      ["<cfoutput>#fragment#</cfoutput>", "HASH_EXPRESSION", 11],
      ["<cfoutput>#encodeForHTML(fragment)#</cfoutput>", "HASH_EXPRESSION", 11],
      ['<cfinclude template="missing.cfm">', "UNSUPPORTED_CFML_TAG", 1],
      ["<cfset safe = 1>", "UNSUPPORTED_CFML_TAG", 1],
      ["<cfscript>writeOutput(fragment);</cfscript>", "UNSUPPORTED_CFML_TAG", 1],
      ["<script>#fragment#</script>", "HASH_EXPRESSION", 9],
      ["<script><cfif active></cfif></script>", "UNSUPPORTED_CFML_TAG", 9]
    ]) {
      for (const target of ["", "<table><colgroup><col></colgroup></table>"]) {
        withSource(source + target, request => {
          const response = run(request, operation);
          assert.equal(response.exitCode, 3);
          assert.equal(response.result.status, "incomplete");
          assert.equal(response.result.complete, false);
          assert.equal(response.result.data, null);
          assert.equal(response.result.errors.length, 1);
          assert.equal(response.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
          assert.deepEqual(response.result.errors[0].details, { reason, line: 1, column });
          assert.equal(response.result.meta.path, "input.cfm");
        });
      }
    }
  });

  test(operation + " supports static and comment-only sources with no literal target", () => {
    for (const source of [
      "", "<p>Static α🙂 text</p>", "<cfoutput>Static ## text</cfoutput>",
      "<!--- <cfinclude template='missing.cfm'>#fragment#<table> --->",
      "<!-- <cfset value=unknown>#fragment#<table> -->",
      "<script><!--- <cfif dynamic>#fragment# ---></script>",
      "##"
    ]) {
      withSource(source, request => {
        const response = run(request, operation);
        assert.equal(response.exitCode, 0);
        assert.equal(response.result.status, "ok");
        assert.equal(response.result.complete, true);
        assert.equal(response.result.data.verdict, "pass");
        assert.deepEqual(response.result.data.findings, []);
        assert.deepEqual(response.result.errors, []);
      });
    }
  });

  test(operation + " reports original CRLF and UTF-16 coordinates without source disclosure", () => {
    for (const [body, reason, column] of [
      ['Ω🙂<cfinclude template="PRIVATE_PATH_TOKEN">', "UNSUPPORTED_CFML_TAG", 4],
      ["Ω🙂<cfoutput>#PRIVATE_OUTPUT_TOKEN#</cfoutput>", "HASH_EXPRESSION", 14]
    ]) {
      withSource("α🙂\r\n<!--- #ignored# --->\r\n" + body, request => {
        fs.mkdirSync(path.join(request.root, "nested"));
        fs.renameSync(path.join(request.root, request.file), path.join(request.root, "nested", "source.cfm"));
        request.file = "nested/../nested/source.cfm";
        const response = run(request, operation);
        assert.equal(response.exitCode, 3);
        assert.equal(response.result.data, null);
        assert.deepEqual(response.result.errors[0].details, { reason, line: 3, column });
        assert.equal(response.result.meta.path, "nested/source.cfm");
        const serialized = JSON.stringify(response.result);
        assert.equal(serialized.includes("PRIVATE_PATH_TOKEN"), false);
        assert.equal(serialized.includes("PRIVATE_OUTPUT_TOKEN"), false);
        assert.equal(serialized.includes(request.root), false);
      });
    }
  });
}

test("structural diagnostics distinguish malformed closures and unsupported text causes", () => {
  for (const [source, reason, line, column] of [
    ["<div>\r\n</span>\r\n</div>", "MISMATCHED_CLOSING_TAG", 2, 1],
    ["<p>ok</p>\r\n<!--- #private", "UNCLOSED_COMMENT", 2, 1],
    ["<p>ok</p>\r\n<div title='private", "UNCLOSED_TAG", 2, 1],
    ["<p>ok</p>\r\n<script>text", "UNCLOSED_ELEMENT", 2, 1],
    ["<p>ok</p>\r\n<noscript>text</noscript>", "UNSUPPORTED_TEXT_CONTEXT", 2, 1],
    ["<script><!--<script>text</script>--></script>", "DOUBLE_ESCAPED_SCRIPT", 1, 13],
    ["<!--- #ignored# --->##\r\n#first#<cfinclude template='later.cfm'>", "HASH_EXPRESSION", 2, 1],
    ["<cfset first=1>\r\n#later#", "UNSUPPORTED_CFML_TAG", 1, 1],
    ["#first#<noscript>later</noscript>", "HASH_EXPRESSION", 1, 1]
  ]) {
    withSource(source, request => {
      const first = runRequest(request);
      const second = runRequest(request);
      assert.equal(first.exitCode, 3);
      assert.equal(first.result.complete, false);
      assert.equal(first.result.data, null);
      assert.equal(first.result.errors.length, 1);
      assert.equal(first.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
      assert.deepEqual(first.result.errors[0].details, { reason, line, column });
      assert.deepEqual(second.result, first.result);
    });
  }
});

test("many unsupported tags disclose one bounded cause, not attributes or repeated diagnostics", () => {
  withSource('<cfinclude template="PRIVATE_REPEAT_TOKEN">'.repeat(4000), request => {
    const response = runRequest(request);
    assert.equal(response.exitCode, 3);
    assert.equal(response.result.data, null);
    assert.equal(response.result.errors.length, 1);
    assert.deepEqual(response.result.errors[0].details, { reason: "UNSUPPORTED_CFML_TAG", line: 1, column: 1 });
    const text = JSON.stringify(response.result);
    assert.equal(text.includes("PRIVATE_REPEAT_TOKEN"), false);
    assert.ok(Buffer.byteLength(text) <= 1024);
  });
});

test("structural cause output still obeys the CLI serialization limit", () => {
  withSource('<cfinclude template="PRIVATE_OUTPUT_TOKEN">', request => {
    request.limits = { max_output_bytes: 300 };
    const response = run(request, "cli");
    assert.equal(response.exitCode, 3);
    assert.equal(response.result.status, "incomplete");
    assert.equal(response.result.complete, false);
    assert.equal(response.result.data, null);
    assert.equal(response.result.errors[0].code, "RESOURCE_LIMIT");
    assert.equal(response.result.errors[0].details, undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(response.result)) <= 300);
  });
});

test("a structural diagnostic cannot bypass an expired indexing deadline", () => {
  withSource("<!-- SYNTHETIC_DEADLINE_MARKER -->\r\n<cfoutput>#fragment#</cfoutput>", request => {
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href,
      cli, "check", "--root", request.root, "--file", request.file, "--profile", request.profile,
      "--limits", JSON.stringify({ max_processing_ms: 30 }), "--json"], {
      encoding: "utf8", timeout: 3000, env: { ...process.env, POLICY_TEST_DEADLINE: "index" }
    });
    assert.ifError(child.error);
    assert.equal(child.status, 3);
    const result = JSON.parse(child.stdout);
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
    assert.equal(result.errors[0].code, "RESOURCE_LIMIT");
    assert.equal(result.errors[0].details, undefined);
  });
});

test("AIT include-only checks preserve the Hub incomplete contract and causal location", () => {
  withSource('\r\n<cfinclude template="missing.cfm">', request => {
    const child = spawnSync(process.execPath, [cli, "ait"], {
      input: JSON.stringify(request), encoding: "utf8", timeout: 3000
    });
    assert.ifError(child.error);
    assert.equal(child.status, 3);
    const result = JSON.parse(child.stdout);
    assert.equal(result.schema_version, "1.0.0");
    assert.equal(result.tool, "agent-cfml-policy-check");
    assert.equal(result.status, "incomplete");
    assert.equal(result.complete, false);
    assert.equal(result.data, null);
    assert.equal(result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
    assert.deepEqual(result.errors[0].details, { reason: "UNSUPPORTED_CFML_TAG", line: 2, column: 1 });
    assert.equal(result.meta.path, "input.cfm");
  });
});

test("unknown-output diagnostics do not override token and nesting resource limits", () => {
  for (const [source, limits] of [
    ["<cfset first=1><cfset second=2>", { max_tokens: 1 }],
    ["#fragment#<div><span></span></div>", { max_depth: 1 }]
  ]) {
    withSource(source, request => {
      const response = runRequest({ ...request, limits });
      assert.equal(response.exitCode, 3);
      assert.equal(response.result.complete, false);
      assert.equal(response.result.data, null);
      assert.equal(response.result.errors[0].code, "RESOURCE_LIMIT");
      assert.equal(response.result.errors[0].details, undefined);
    });
  }
});

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
