import {
  verifyDeployment,
  capabilities,
  encodeResult,
  exitCode,
} from "../types/index.js";
const result = verifyDeployment({});
encodeResult(result);
exitCode(capabilities());
