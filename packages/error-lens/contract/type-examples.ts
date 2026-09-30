import type { CapabilitiesResult, ParseRequest, ParseResult } from "./agent-error-lens-v1.types.js";

export const validRequest = {
  schemaVersion: "1",
  artifacts: [
    {
      id: "stderr",
      stream: "stderr",
      content: "src/order.ts(41,18): error TS2339: Property 'total' does not exist on type 'Order'\n",
      encoding: "utf-8",
    },
  ],
  producerOutcome: {
    command: "npm run typecheck",
    exitCode: 2,
    signal: null,
  },
  options: {
    root: "/workspace/project",
  },
} satisfies ParseRequest;

export const validResult = {
  schemaVersion: "1",
  status: "complete",
  producerOutcome: {
    command: "npm run typecheck",
    exitCode: 2,
    signal: null,
  },
  data: {
    producers: [],
    diagnostics: [],
    summary: {
      diagnosticCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      unknownCount: 0,
      producerCount: 0,
    },
  },
  toolIssues: [],
  warnings: [],
  truncation: {
    truncated: false,
    reasons: [],
  },
  stats: {
    artifactsReceived: 1,
    artifactsProcessed: 1,
    bytesReceived: 83,
    bytesProcessed: 83,
    linesProcessed: 1,
    parserMatches: 0,
    terminalSequences: 0,
    producerCandidates: 0,
    evidenceBytes: 0,
    diagnosticsBeforeLimit: 0,
  },
} satisfies ParseResult;

export const validCapabilities = {
  schemaVersion: "1",
  operations: ["parse", "capabilities"],
  producers: [],
} satisfies CapabilitiesResult;
