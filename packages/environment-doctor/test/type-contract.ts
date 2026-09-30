import { capabilities, encodeResult, exitCode } from "../types/index.js";
const result = capabilities();
encodeResult(result);
exitCode(result);
