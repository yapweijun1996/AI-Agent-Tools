import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const fixture = JSON.parse(process.env.CODE_SLICE_TEST_BOUNDARY);
const originalOpen = fs.openSync;
const originalRead = fs.readSync;
const originalClose = fs.closeSync;
let descriptor;
let mutated = false;
let grew = false;
let readBytes = 0;
let closed = false;

fs.openSync = function (file, ...args) {
  const flags = args[0];
  const reading = flags === "r" || (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0);
  if (String(file) !== fixture.file || !reading) return originalOpen.call(this, file, ...args);
  if (!mutated && fixture.mode !== "growth") {
    mutated = true;
    if (fixture.mode === "leaf") {
      fs.renameSync(fixture.file, fixture.held);
      fs.symlinkSync(fixture.outside, fixture.file);
    } else {
      fs.renameSync(fixture.directory, fixture.held);
      fs.symlinkSync(fixture.outsideDirectory, fixture.directory,
        process.platform === "win32" ? "junction" : "dir");
    }
  }
  descriptor = originalOpen.call(this, file, ...args);
  return descriptor;
};
fs.readSync = function (fd, ...args) {
  if (fd === descriptor && fixture.mode === "growth" && !grew) {
    grew = true;
    fs.appendFileSync(fixture.file, "//" + "x".repeat(8192));
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
