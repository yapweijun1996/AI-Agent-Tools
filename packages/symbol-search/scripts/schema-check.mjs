import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020");
const api = require(resolve("dist/index.js"));
const schemaDirectory = resolve("schemas");
const schemaNames = ["request.schema.json", "result.schema.json", "capabilities.schema.json"];
const ajv = new Ajv2020({ allErrors: true, strict: false });

for (const name of schemaNames) {
  const schema = JSON.parse(readFileSync(resolve(schemaDirectory, name), "utf8"));
  ajv.compile(schema);
}

const root = resolve("test/fixtures/typescript");
const valid = api.validateRequest({
  operation: "search",
  root,
  symbol: "FileAdapter",
  project: "tsconfig.json"
});
if (!valid.valid) throw new Error(`search.project request was rejected: ${valid.errors.join("; ")}`);

const unknown = api.validateRequest({
  operation: "search",
  root,
  symbol: "FileAdapter",
  project: "tsconfig.json",
  unexpected: true
});
if (unknown.valid) throw new Error("request schema accepted an unknown property");

const result = api.searchSymbols({ root, symbol: "FileAdapter", project: "tsconfig.json" });
if (result.status !== "complete") throw new Error(`project-scoped search returned ${result.status}`);
if (!api.validateResult(result).valid) throw new Error("project-scoped search result failed result schema validation");

console.log("schema: request/result/capability schemas and search.project contract verified");
