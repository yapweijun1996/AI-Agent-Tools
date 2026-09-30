import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
for (const file of readdirSync("src").filter((x) => x.endsWith(".js"))) {
  const r = spawnSync(process.execPath, ["--check", "src/" + file], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(1);
}
for (const file of readdirSync("schema"))
  JSON.parse(readFileSync("schema/" + file, "utf8"));
console.log(
  "JavaScript syntax and schema JSON passed; source distribution requires no compilation",
);
