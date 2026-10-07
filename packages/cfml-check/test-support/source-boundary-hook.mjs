import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

const fixture = JSON.parse(process.env.CFML_CHECK_TEST_BOUNDARY);
const originalOpen = fs.openSync;
const originalRead = fs.readSync;
const originalReadFile = fs.readFileSync;
const originalClose = fs.closeSync;
let descriptor;
let mutated = false;
let grew = false;
let readBytes = 0;
let closed = false;

function substitute() {
  if (mutated || !["leaf", "ancestor", "fifo"].includes(fixture.mode)) return;
  mutated = true;
  if (fixture.mode === "ancestor") {
    fs.renameSync(fixture.directory, fixture.held);
    fs.symlinkSync(fixture.outsideDirectory, fixture.directory, process.platform === "win32" ? "junction" : "dir");
  } else {
    fs.renameSync(fixture.file, fixture.held);
    if (fixture.mode === "leaf") fs.symlinkSync(fixture.outside, fixture.file);
    else if (spawnSync("mkfifo", [fixture.file]).status !== 0) throw new Error("FIFO fixture creation failed");
  }
}

fs.openSync = function (file, ...args) {
  const flags = args[0];
  const reading = flags === "r" || (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0);
  if (String(file) !== fixture.file || !reading) return originalOpen.call(this, file, ...args);
  substitute();
  descriptor = originalOpen.call(this, file, ...args);
  return descriptor;
};
fs.readFileSync = function (file, ...args) {
  if (String(file) !== fixture.file) return originalReadFile.call(this, file, ...args);
  substitute();
  if (fixture.mode === "growth" && !grew) {
    grew = true;
    fs.appendFileSync(fixture.file, " ".repeat(8192));
  }
  try {
    const bytes = originalReadFile.call(this, file, ...args);
    // Node may delegate the full read through the observed descriptor reader.
    readBytes = Math.max(readBytes, Buffer.byteLength(bytes));
    return bytes;
  } finally {
    if (fixture.mode === "leaf") {
      fs.unlinkSync(fixture.file);
      fs.renameSync(fixture.held, fixture.file);
    } else if (fixture.mode === "ancestor") {
      fs.unlinkSync(fixture.directory);
      fs.renameSync(fixture.held, fixture.directory);
    }
  }
};
fs.readSync = function (fd, ...args) {
  if (fd === descriptor && fixture.mode === "growth" && !grew) {
    grew = true;
    fs.appendFileSync(fixture.file, " ".repeat(8192));
  }
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
  JSON.stringify({ mutated, grew, readBytes, closed }) + "\n"));
