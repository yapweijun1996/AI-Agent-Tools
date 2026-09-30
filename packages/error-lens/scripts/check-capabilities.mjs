import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)), "src");
const forbiddenModulePattern = /(?:from\s*["']|import\s*\(\s*["'])node:(?:child_process|cluster|dgram|dns|http|https|net|tls|worker_threads)["']/u;
const forbiddenCallPattern = /(?:^|[^\w.])(?:fetch|WebSocket|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|eval|Function)\s*\(/u;

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && path.endsWith(".ts")) files.push(path);
  }
  return files.sort();
}

const files = [resolve(sourceRoot, "index.ts"), ...(await sourceFiles(resolve(sourceRoot, "core")))];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (forbiddenModulePattern.test(source) || forbiddenCallPattern.test(source)) {
    console.error(`forbidden runtime capability found in ${file}`);
    process.exit(1);
  }
}

console.log(`core capability audit: passed (${files.length} source files)`);
