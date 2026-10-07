import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const fixture = JSON.parse(process.env.PROFILE_TEST_BOUNDARY);
const originalOpen = fs.openSync;
const originalRead = fs.readSync;
const originalClose = fs.closeSync;
let descriptor;
let mutated = false;
let readBytes = 0;
let closed = false;
fs.openSync = function (file, ...args) {
  const flags = args[0];
  const reading = flags === "r" || (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0);
  if (String(file) !== fixture.file || !reading) return originalOpen.call(this, file, ...args);
  if (!mutated && fixture.mode !== "initial") {
    mutated = true;
    fs.renameSync(fixture.file, fixture.held);
    if (fixture.mode === "fifo") {
      const created = spawnSync("mkfifo", [fixture.file]);
      if (created.status !== 0) throw new Error("FIFO fixture creation failed");
    } else {
      fs.writeFileSync(fixture.file, JSON.stringify({ name: "replaced", packageManager: "npm@10.0.0" }));
    }
    process.stderr.write("BOUNDARY_SUBSTITUTED\n");
  }
  descriptor = originalOpen.call(this, file, ...args);
  return descriptor;
};
fs.readSync = function (fd, ...args) {
  const count = originalRead.call(this, fd, ...args);
  if (fd === descriptor) readBytes += count;
  return count;
};
fs.closeSync = function (fd) {
  if (fd === descriptor) closed = true;
  return originalClose.call(this, fd);
};
syncBuiltinESMExports();
process.on("exit", () => process.stderr.write("BOUNDARY_OBSERVATION:" +
  JSON.stringify({ mutated, readBytes, closed }) + "\n"));
