import { performance } from "node:perf_hooks";

const phase = process.env.POLICY_TEST_DEADLINE;
let elapsed = 0;
let active = false;
let expired = false;
Date.now = () => elapsed;
Object.defineProperty(performance, "now", { value: () => elapsed });
const originalDecode = TextDecoder.prototype.decode;
TextDecoder.prototype.decode = function (...args) {
  const value = originalDecode.apply(this, args);
  if (value.includes("SYNTHETIC_DEADLINE_MARKER")) active = true;
  return value;
};
const originalPush = Array.prototype.push;
Array.prototype.push = function (...items) {
  const result = originalPush.apply(this, items);
  if (active && phase === "index" && items.length === 1 && typeof items[0] === "number" && !expired) {
    expired = true;
    elapsed = 31;
  }
  return result;
};
const originalSort = Array.prototype.sort;
Array.prototype.sort = function (...args) {
  const result = originalSort.apply(this, args);
  if (active && phase === "sort" && this[0]?.rule_id && !expired) {
    expired = true;
    elapsed = 31;
  }
  return result;
};
process.on("exit", () => process.stderr.write("DEADLINE_OBSERVATION:" + JSON.stringify({ expired, elapsed }) + "\n"));
