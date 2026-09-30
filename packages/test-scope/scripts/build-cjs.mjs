import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const output = dirname(fileURLToPath(import.meta.url));
const cjsDirectory = join(output, "..", "dist", "cjs");

mkdirSync(cjsDirectory, { recursive: true });
writeFileSync(join(cjsDirectory, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`, "utf8");
