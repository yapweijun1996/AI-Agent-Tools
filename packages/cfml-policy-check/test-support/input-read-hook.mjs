import fs from "node:fs";

const fixture = JSON.parse(process.env.POLICY_TEST_READ_BOUNDARY);
const originalOpen = fs.openSync;
const originalRead = fs.readSync;
const originalReadFile = fs.readFileSync;
const originalClose = fs.closeSync;
let descriptor;
let readBytes = 0;
let fullReadBytes = 0;
let grew = false;
let closed = false;
fs.openSync = function (file, ...args) {
  const fd = originalOpen.call(this, file, ...args);
  const flags = args[0];
  const reading = flags === "r" || (typeof flags === "number" && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR)) === 0);
  if (String(file) === fixture.file && reading) descriptor = fd;
  return fd;
};
fs.readFileSync = function (file, ...args) {
  const bytes = originalReadFile.call(this, file, ...args);
  if (String(file) === fixture.file) fullReadBytes += Buffer.byteLength(bytes);
  return bytes;
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
process.on("exit", () => process.stderr.write("READ_OBSERVATION:" +
  JSON.stringify({ readBytes, fullReadBytes, grew, closed }) + "\n"));
