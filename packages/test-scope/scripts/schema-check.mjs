import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const files = ["request.schema.json", "result.schema.json", "capabilities.schema.json"];
for (const file of files) {
  const value = JSON.parse(readFileSync(resolve(root, "schemas", file), "utf8"));
  if (value.$schema !== "https://json-schema.org/draft/2020-12/schema" || typeof value.$id !== "string") throw new Error(`${file} is not a versioned JSON schema`);
}
console.log(`Validated ${files.length} schemas`);
