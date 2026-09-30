import { checkUiRegression, capabilities, encodeResult, exitCode, type Result } from '../types/index.js';
const result: Result = checkUiRegression({});
const text: string = encodeResult(result);
const code: number = exitCode(capabilities());
void text; void code;
