import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

export type BoundedRead = { text: string; bytes: number } | { reason: "size" | "unavailable"; bytes: number };

export function readBoundedText(path: string, maxBytes: number): BoundedRead {
  let descriptor: number | undefined;
  let bytes = 0;
  try {
    if (lstatSync(path).isSymbolicLink()) return { reason: "unavailable", bytes };
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) return { reason: "unavailable", bytes };
    if (stat.size > maxBytes) return { reason: "size", bytes };
    const buffer = Buffer.alloc(stat.size);
    while (bytes < buffer.length) {
      const count = readSync(descriptor, buffer, bytes, buffer.length - bytes, null);
      if (count === 0) break;
      bytes += count;
    }
    // Do not parse a silently truncated snapshot if a file grows while being read.
    if (fstatSync(descriptor).size > buffer.length) return { reason: "size", bytes };
    return { text: buffer.subarray(0, bytes).toString("utf8"), bytes };
  } catch {
    return { reason: "unavailable", bytes };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
