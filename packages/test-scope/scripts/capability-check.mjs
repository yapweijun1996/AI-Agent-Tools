import assert from "node:assert/strict";
import { getCapabilities } from "../dist/index.js";

const result = getCapabilities(process.cwd());
assert.equal(result.status, "complete");
const capabilities = result.data.capabilities;
assert.ok(capabilities);
assert.deepEqual(capabilities.operations, ["capabilities", "discover", "plan", "explain"]);
assert.deepEqual(capabilities.languages, ["javascript", "jsx", "typescript", "tsx"]);
assert.equal(capabilities.readOnly, true);
assert.equal(capabilities.network, "disabled");
assert.equal(capabilities.execution, "disabled");
console.log("Capability contract passed");
