import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { extractFactBundle } from "../src/fact-extractor.js";
import { buildGraph, validateGraph } from "../src/graph.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { createRootGuard } from "../src/root-guard.js";
import { createMixedStructuralScannerBackend, createWebScannerBackend } from "../src/web-scanner.js";
import { createSnapshot } from "../src/snapshot.js";

const fixtureRoot = path.resolve("fixtures", "golden", "web-surface");

function parseSnapshot(snapshot, root = fixtureRoot) {
  const guard = createRootGuard(root);
  const adapter = createParserAdapter({
    parserVersion: "mixed-structural-scanner/v0.1",
    backend: createMixedStructuralScannerBackend(),
  });
  return snapshot.files.map((file) => adapter.parse(
    fs.readFileSync(guard.resolve(file.path, { mustExist: true })),
    file.path,
  ));
}

test("scans inert mixed-language web fixtures without executing source", () => {
  const guard = createRootGuard(fixtureRoot);
  const snapshot = createSnapshot(guard);
  const parsed = parseSnapshot(snapshot);
  assert.equal(parsed.every((item) => item.complete), false);
  assert.deepEqual(parsed.flatMap((item) => item.tree.nodes).filter((node) => node.kind !== "HTML_TAG").map((node) => node.kind), [
    "JS_FETCH",
    "JS_AJAX",
    "JS_FETCH",
    "CSS_REFERENCE",
    "JS_ASSET",
    "HTML_FORM",
    "SQL_QUERY",
    "CSS_REFERENCE",
    "CSS_REFERENCE",
  ]);

  const bundle = extractFactBundle({
    snapshot,
    parsedFiles: parsed,
    parserName: "mixed-structural-scanner",
  });
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "expected-web-facts-v0.1.json"), "utf8"));
  assert.equal(bundle.complete, false);
  for (const expectedCase of expected.cases) {
    const actualFacts = bundle.facts
      .filter((fact) => fact.file === expectedCase.input)
      .map((fact) => ({ kind: fact.kind, normalized_expression: fact.normalized_expression }))
      .sort((left, right) => {
        const leftKey = `${left.kind}\0${left.normalized_expression}`;
        const rightKey = `${right.kind}\0${right.normalized_expression}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    assert.deepEqual(actualFacts, expectedCase.expected_facts);
  }
  assert.equal(bundle.facts.some((fact) => fact.normalized_expression === "/ignored-comment"), false);
});

test("enforces the node limit across mixed scanner output", () => {
  const source = '<cfinclude template="x.cfm"><form action="x.cfm"></form>';
  const adapter = createParserAdapter({
    parserVersion: "mixed-structural-scanner/v0.1",
    backend: createMixedStructuralScannerBackend({ maxNodes: 1 }),
  });
  const parsed = adapter.parse(Buffer.from(source, "utf8"), "page.cfm");
  assert.equal(parsed.tree.nodes.length, 1);
  assert.equal(parsed.complete, false);
  assert.equal(parsed.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
});

test("extracts bounded CFML redirect and visible query facts", () => {
  const root = path.resolve("web-cfml-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = Buffer.from('<cflocation url="/orders"><cfquery datasource="main">select * from orders</cfquery>', "utf8");
  fs.writeFileSync(path.join(root, "page.cfm"), source);
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({
      parserVersion: "mixed-structural-scanner/v0.1",
      backend: createMixedStructuralScannerBackend(),
    });
    const parsed = [adapter.parse(source, "page.cfm")];
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserName: "mixed-structural-scanner" });
    assert.equal(bundle.complete, false);
    assert.equal(bundle.facts.some((fact) => fact.kind === "REDIRECT" && fact.normalized_expression === "/orders"), true);
    assert.equal(bundle.facts.some((fact) => fact.kind === "QUERY" && fact.normalized_expression === "orders"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracts bounded static CFScript linkage calls and SQL evidence", () => {
  const root = path.resolve("cfscript-sql-fixture");
  fs.mkdirSync(path.join(root, "handlers"), { recursive: true });
  fs.mkdirSync(path.join(root, "views"), { recursive: true });
  fs.mkdirSync(path.join(root, "custom"), { recursive: true });
  fs.mkdirSync(path.join(root, "orders"), { recursive: true });
  const source = Buffer.from([
    "<cfscript>",
    'include "views/home.cfm";',
    'location("/orders/done");',
    'location(url="/orders/named");',
    "location(dynamicUrl);",
    'cfinclude(template="views/secondary.cfm");',
    "cfinclude(template=templatePath);",
    'cfobject(component="handlers.OrderHandler");',
    "cfobject(component=componentName);",
    'cfmodule(template="custom/order.cfm");',
    "cfmodule(template=tagPath);",
    "new handlers.OrderHandler();",
    "handlers.OrderHandler.submit();",
    'invoke("handlers.OrderHandler", "submit");',
    'cfinvoke(component="handlers.OrderHandler", method="submit");',
    "cfinvoke(component=componentName, method=methodName);",
    'createObject("component", "handlers.OrderHandler");',
    "createObject(\"component\", componentName);",
    'createObject(type="component", class="handlers.OrderHandler");',
    'createObject(type="java", class="java.lang.String");',
    "include templatePath;",
    "new variables.Component();",
    "invoke(componentName, methodName);",
    'queryExecute("select * from orders", { datasource: "main" });',
    "queryExecute(sqlText, { datasource: variables.ds });",
    'queryExecute(sql="select * from named_orders", options={ datasource: "named" });',
    "queryExecute(sql=sqlText, options={ datasource: variables.ds });",
    "</cfscript>",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "page.cfm"), source);
  fs.writeFileSync(path.join(root, "handlers", "OrderHandler.cfc"), '<cfcomponent name="handlers.OrderHandler"><cffunction name="submit"></cffunction></cfcomponent>', "utf8");
  fs.writeFileSync(path.join(root, "views", "home.cfm"), "", "utf8");
  fs.writeFileSync(path.join(root, "views", "secondary.cfm"), "", "utf8");
  fs.writeFileSync(path.join(root, "custom", "order.cfm"), "", "utf8");
  fs.writeFileSync(path.join(root, "orders", "done.cfm"), "", "utf8");
  fs.writeFileSync(path.join(root, "orders", "named.cfm"), "", "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({
      parserVersion: "mixed-structural-scanner/v0.1",
      backend: createMixedStructuralScannerBackend(),
    });
    const parsed = snapshot.files.map((file) => adapter.parse(fs.readFileSync(guard.resolve(file.path, { mustExist: true })), file.path));
    const pageParsed = parsed.find((item) => item.file === "page.cfm");
    const repeated = adapter.parse(source, "page.cfm");
    assert.deepEqual(repeated.tree, pageParsed.tree);
    assert.deepEqual(repeated.diagnostics, pageParsed.diagnostics);
    const scriptNodes = pageParsed.tree.nodes.filter((node) => node.kind.startsWith("CFML_SCRIPT_"));
    assert.deepEqual(scriptNodes.map((node) => node.kind), [
      "CFML_SCRIPT_INCLUDE",
      "CFML_SCRIPT_REDIRECT",
      "CFML_SCRIPT_REDIRECT",
      "CFML_SCRIPT_REDIRECT",
      "CFML_SCRIPT_INCLUDE",
      "CFML_SCRIPT_INCLUDE",
      "CFML_SCRIPT_INSTANTIATE",
      "CFML_SCRIPT_INSTANTIATE",
      "CFML_SCRIPT_CUSTOM_TAG",
      "CFML_SCRIPT_CUSTOM_TAG",
      "CFML_SCRIPT_INSTANTIATE",
      "CFML_SCRIPT_INVOKE",
      "CFML_SCRIPT_INVOKE",
      "CFML_SCRIPT_INVOKE",
      "CFML_SCRIPT_INVOKE",
      "CFML_SCRIPT_INSTANTIATE",
      "CFML_SCRIPT_INSTANTIATE",
      "CFML_SCRIPT_INSTANTIATE",
    ]);
    assert.equal(pageParsed.tree.nodes.filter((node) => node.kind === "SQL_QUERY").length, 4);
    const sqlParsed = adapter.parse(Buffer.from("merge into orders using inventory on orders.id = inventory.id", "utf8"), "query.sql");
    assert.deepEqual(sqlParsed.tree.nodes[0].tables, ["inventory", "orders"]);
    const quotedSql = adapter.parse(Buffer.from("with recent as (select * from \"sales\".\"orders\"), other as (select * from [dbo].[inventory]) select * from recent join `dbo`.`customers` on recent.id = customers.id", "utf8"), "quoted.sql");
    assert.deepEqual(quotedSql.tree.nodes[0].tables, ["dbo.customers", "dbo.inventory", "sales.orders"]);
    const ddlSql = adapter.parse(Buffer.from("create table if not exists \"sales\".\"orders\" (id int); alter table only [dbo].[inventory] add flag int; create temporary table [temp].[stage] (id int)", "utf8"), "ddl.sql");
    assert.equal(ddlSql.tree.nodes.length, 3);
    assert.deepEqual(ddlSql.tree.nodes.flatMap((node) => node.tables), ["sales.orders", "dbo.inventory", "temp.stage"]);
    const dmlSql = adapter.parse(Buffer.from('insert into [audit].[events] select * from "sales"."orders"; update only "sales"."orders" set status = 1 from [staging].[orders]; delete from "sales"."orders" where id = 1', "utf8"), "dml.sql");
    assert.deepEqual(dmlSql.tree.nodes.map((node) => node.tables), [["audit.events", "sales.orders"], ["sales.orders", "staging.orders"], ["sales.orders"]]);
    const cappedSql = createParserAdapter({
      parserVersion: "mixed-structural-scanner/v0.1",
      backend: createMixedStructuralScannerBackend({ maxNodes: 1 }),
    }).parse(Buffer.from("select * from first_table; select * from second_table", "utf8"), "capped.sql");
    assert.equal(cappedSql.tree.nodes.length, 1);
    assert.equal(cappedSql.complete, false);
    assert.equal(cappedSql.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
    const modifierSql = adapter.parse(Buffer.from('select * from only "sales"."orders" left join lateral [dbo].[inventory] on 1=1', "utf8"), "modifier.sql");
    assert.deepEqual(modifierSql.tree.nodes[0].tables, ["dbo.inventory", "sales.orders"]);
    const dialectSql = adapter.parse(Buffer.from('lock table "sales"."orders"; comment on table [dbo].[inventory] is "tracked"; grant select on table "sales"."orders" to analyst; copy [audit].[events] from stdin; analyze "sales"."orders"; vacuum analyze [dbo].[inventory]; reindex table "sales"."orders"', "utf8"), "dialect.sql");
    assert.deepEqual(dialectSql.tree.nodes.map((node) => node.tables), [["sales.orders"], ["dbo.inventory"], ["sales.orders"], ["audit.events"], ["sales.orders"], ["dbo.inventory"], ["sales.orders"]]);
    const goSql = adapter.parse(Buffer.from("select * from first_table\nGO\nselect * from second_table\nGO 2 -- repeat batch\nselect * from third_table", "utf8"), "go.sql");
    assert.deepEqual(goSql.tree.nodes.map((node) => node.tables), [["first_table"], ["second_table"], ["third_table"]]);
    const proceduralSql = adapter.parse(Buffer.from("exec dbo.refresh_orders @table = @name; call refresh_orders(:id); select * from actual_table", "utf8"), "procedural.sql");
    assert.deepEqual(proceduralSql.tree.nodes.map((node) => node.tables), [[], [], ["actual_table"]]);
    const quotedDynamicSql = adapter.parse(Buffer.from('select * from "#tableName#"', "utf8"), "dynamic-quoted.sql");
    assert.deepEqual(quotedDynamicSql.tree.nodes[0].tables, []);
    assert.equal(quotedDynamicSql.tree.nodes[0].dynamic_tables.length, 1);

    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserName: "mixed-structural-scanner" });
    const facts = bundle.facts.filter((fact) => fact.file === "page.cfm");
    assert.equal(bundle.complete, false);
    assert.equal(facts.filter((fact) => fact.kind === "INCLUDE" && ["views/home.cfm", "views/secondary.cfm"].includes(fact.normalized_expression)).length, 2);
    assert.equal(facts.filter((fact) => fact.kind === "REDIRECT" && ["/orders/done", "/orders/named"].includes(fact.normalized_expression)).length, 2);
    assert.equal(facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "REDIRECT"), true);
    assert.equal(facts.filter((fact) => fact.kind === "INSTANTIATE" && fact.normalized_expression === "handlers.OrderHandler").length, 4);
    assert.equal(facts.some((fact) => fact.kind === "INSTANTIATE" && fact.attributes.creation_kind === "createObject"), true);
    assert.equal(facts.some((fact) => fact.kind === "INSTANTIATE" && fact.attributes.creation_kind === "cfobject"), true);
    assert.equal(facts.some((fact) => fact.kind === "CUSTOM_TAG" && fact.normalized_expression === "custom tag custom/order.cfm"), true);
    assert.equal(facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "CUSTOM_TAG"), true);
    assert.equal(facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "INSTANTIATE"), true);
    assert.equal(facts.filter((fact) => fact.kind === "INVOKE").length, 3);
    assert.equal(facts.some((fact) => fact.kind === "INVOKE" && fact.attributes.invoke_kind === "cfinvoke"), true);
    assert.equal(facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "INVOKE"), true);
    assert.deepEqual(facts.filter((fact) => fact.kind === "QUERY").map((fact) => ({ tables: fact.attributes.tables, datasource: fact.attributes.datasource, dynamic_sql: fact.attributes.dynamic_sql })).sort((left, right) => `${left.dynamic_sql}:${left.datasource ?? ""}`.localeCompare(`${right.dynamic_sql}:${right.datasource ?? ""}`)), [
      { tables: ["orders"], datasource: "main", dynamic_sql: false },
      { tables: ["named_orders"], datasource: "named", dynamic_sql: false },
      { tables: [], datasource: null, dynamic_sql: true },
      { tables: [], datasource: null, dynamic_sql: true },
    ]);

    const indexes = buildProjectIndexes({ factBundle: bundle });
    const cfcResolution = resolveCfcLinks({ factBundle: bundle, indexes });
    const createObjectFact = facts.find((fact) => fact.kind === "INSTANTIATE" && fact.attributes.creation_kind === "createObject");
    const cfinvokeFact = facts.find((fact) => fact.kind === "INVOKE" && fact.attributes.invoke_kind === "cfinvoke");
    assert.equal(cfcResolution.resolutions.some((item) => item.source_fact_id === createObjectFact.fact_id && item.relation_type === "INSTANTIATES"), true);
    assert.equal(cfcResolution.resolutions.some((item) => item.source_fact_id === cfinvokeFact.fact_id && item.relation_type === "CALLS_METHOD"), true);
    const pathResolution = resolveLiteralPaths({ factBundle: bundle, indexes, rootGuard: guard });
    for (const relationType of ["INCLUDES", "CUSTOM_TAG_CALL", "REDIRECTS_TO"]) assert.equal(pathResolution.resolutions.some((item) => item.relation_type === relationType), true);
    const resolutions = {
      complete: cfcResolution.complete && pathResolution.complete,
      resolutions: [...cfcResolution.resolutions, ...pathResolution.resolutions],
      unresolved: [...cfcResolution.unresolved, ...pathResolution.unresolved],
      diagnostics: [...cfcResolution.diagnostics, ...pathResolution.diagnostics],
    };
    const graph = buildGraph({ factBundle: bundle, resolutions, rootGuard: guard, snapshot, createdAt: "2026-09-15T00:00:00.000Z" });
    assert.equal(graph.edges.some((edge) => edge.type === "INSTANTIATES"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "CALLS_METHOD"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "INCLUDES"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "CUSTOM_TAG_CALL"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "REDIRECTS_TO"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "QUERY_READS_TABLE"), true);
    assert.equal(validateGraph(graph).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("retains dynamic web targets and bounds scanner output", () => {
  const root = path.resolve("web-scanner-limit-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = Buffer.from('fetch(dynamicUrl); fetch("/static");', "utf8");
  fs.writeFileSync(path.join(root, "client.js"), source);
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({
      parserVersion: "web-structural-scanner/v0.1",
      backend: createWebScannerBackend({ maxNodes: 1 }),
    });
    const parsed = [adapter.parse(source, "client.js")];
    assert.equal(parsed[0].complete, false);
    assert.equal(parsed[0].diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed });
    assert.equal(bundle.complete, false);
    assert.equal(bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
