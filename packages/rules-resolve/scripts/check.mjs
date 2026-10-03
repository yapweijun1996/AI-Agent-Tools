import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) checkDirectory(path);
    else if (/\.(?:js|mjs)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (result.error || result.status !== 0) process.exit(1);
    }
  }
}
checkDirectory(join(root, "src"));
checkDirectory(join(root, "scripts"));
for (const name of readdirSync(join(root, "schema"))) {
  if (name.endsWith(".json"))
    JSON.parse(readFileSync(join(root, "schema", name), "utf8"));
}
console.log("JavaScript syntax and schema JSON passed; no compilation required");
