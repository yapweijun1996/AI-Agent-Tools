export type Status = 'pass' | 'fail' | 'unknown' | 'error';
export type CheckKind = 'overflow' | 'overlap' | 'focus' | 'back';
export interface Check { id: string; caseId: string; kind: CheckKind; status: Exclude<Status,'error'>; reason: string; evidence: string[]; measurements?: Record<string,number>; }
export interface UiData { profile: 'ui-regression-v1'; scope: 'supplied-declared-ui-evidence'; checks: Check[]; summary: Record<'pass'|'fail'|'unknown',number>; provenance: {inputSha256:string}; limitations:string[]; }
export interface Result { schemaVersion:'1.0'; tool:'agent-runtime-trace'; operation:'ui-regression-check'; status:Status; complete:boolean; data:UiData|null; diagnostics:{code:string;message:string}[]; }
export interface Capabilities { schemaVersion:'1.0'; tool:'agent-runtime-trace'; operation:'capabilities'; status:'pass'; complete:true; data:{operations:string[];profiles:string[];checks:string[];offline:true;network:false;executesScripts:false;generalBusinessTraceImplemented:false;limits:typeof LIMITS;exitCodes:Record<Status,number>}; diagnostics:[]; }
export const LIMITS: Readonly<{inputBytes:number;outputBytes:number;cases:number;rectangles:number;pairs:number;focusEntries:number}>;
export function checkUiRegression(input: unknown): Result;
export function validateBundle(input: unknown): unknown;
export function capabilities(): Capabilities;
export function digest(input: unknown): string;
export function readJson(file: string): unknown;
export function invalid(): Error & {code:string};
export function encodeResult(result: Result | Capabilities): string;
export function exitCode(result: {status:Status}): number;
export function parseJson(text: string): unknown;
