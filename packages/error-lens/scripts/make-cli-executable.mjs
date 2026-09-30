import { chmod } from "node:fs/promises";

if (process.platform === "win32") {
  console.log("CLI executable bit: not applicable on Windows");
} else {
  await chmod("dist/src/cli.js", 0o755);
  console.log("CLI executable bit: set");
}
