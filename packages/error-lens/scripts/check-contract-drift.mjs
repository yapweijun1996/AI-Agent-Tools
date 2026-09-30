import { readFile } from "node:fs/promises";

const schema = JSON.parse(await readFile("contract/agent-error-lens-v1.schema.json", "utf8"));
const types = await readFile("contract/agent-error-lens-v1.types.ts", "utf8");
const requiredInterfaces = [
  "ParseRequest",
  "InputArtifact",
  "ProducerOutcome",
  "ParseOptions",
  "ParseResult",
  "CapabilitiesResult",
  "Diagnostic",
  "Location",
  "Evidence",
  "Producer",
  "ToolIssue",
  "Warning",
  "Truncation",
  "Summary",
  "ParseStats",
];

for (const name of requiredInterfaces) {
  if (!types.includes(`interface ${name}`)) throw new Error(`missing TypeScript projection: ${name}`);
}

const properties = new Set();
function collect(node) {
  if (!node || typeof node !== "object") return;
  if (node.properties && typeof node.properties === "object") {
    for (const name of Object.keys(node.properties)) properties.add(name);
  }
  for (const child of Object.values(node)) collect(child);
}
collect(schema.$defs);

for (const name of properties) {
  if (!types.includes(`${name}:`) && !types.includes(`${name}?:`)) {
    throw new Error(`missing TypeScript projection property: ${name}`);
  }
}

if (schema["x-agent-error-lens"]?.sourceOfTruth !== "json-schema") {
  throw new Error("schema authority marker is missing");
}

console.log(`contract/type drift check: passed (${requiredInterfaces.length} interfaces, ${properties.size} properties)`);
