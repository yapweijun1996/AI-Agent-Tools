import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const api = require(resolve("dist/index.js"));
const result = api.getCapabilities(process.cwd());
if (result.status !== "complete") throw new Error(`capabilities returned ${result.status}`);
const capabilities = result.data.capabilities;
if (!capabilities?.languages?.typescript) throw new Error("TypeScript capability output is missing");
const typescript = capabilities.languages.typescript.operations;
for (const operation of ["search", "symbols", "definition", "references"]) {
  if (typescript[operation] !== "full") throw new Error(`TypeScript ${operation} is not full`);
}
if (typescript.implementations !== "partial") throw new Error("TypeScript implementations must remain partial");
for (const language of ["javascript", "python", "cfml"]) {
  const operations = capabilities.languages[language]?.operations ?? {};
  if (Object.values(operations).some((value) => value === "full")) throw new Error(`${language} was incorrectly reported as full`);
}
const serialized = JSON.stringify(capabilities);
if (serialized.includes('"definitions"')) throw new Error("Capability output uses the non-canonical definitions key");
console.log(`capability: TypeScript V1 verified; future adapters remain proposed (${Object.keys(capabilities.languages).join(", ")})`);
