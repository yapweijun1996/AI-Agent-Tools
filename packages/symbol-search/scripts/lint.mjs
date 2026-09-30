import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function filesUnder(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.isFile() && (path.endsWith(".ts") || path.endsWith(".mjs"))) files.push(path);
  }
  return files;
}

const files = [...filesUnder("src"), ...filesUnder("test")].filter((path) => statSync(path).isFile());
const failures = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.endsWith("\n")) failures.push(`${file}: missing final newline`);
  if (/\r(?!\n)/.test(content)) failures.push(`${file}: contains a bare carriage return`);
  if (file.startsWith("src/") && /\beval\s*\(|\bnew Function\s*\(/.test(content)) failures.push(`${file}: executable evaluation is forbidden`);
  if (file.startsWith("src/") && content.includes("from \"node:child_process\"")) failures.push(`${file}: child-process execution is forbidden in the library`);
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`lint: ${files.length} source and test files checked`);
}
