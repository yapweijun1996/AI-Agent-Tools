import type { InputArtifact } from "../../contract/agent-error-lens-v1.types.js";
import { LIMITS, type BudgetState } from "./limits.js";

export interface NormalizedArtifact {
  artifact: InputArtifact;
  text: string;
  boundaryMap: number[];
  rawBytesProcessed: number;
  stopped: boolean;
}

interface TerminalSequence {
  end: number;
  complete: boolean;
}

function terminalSequenceEnd(raw: string, start: number): TerminalSequence {
  const next = raw.charCodeAt(start + 1);
  if (Number.isNaN(next)) return { end: raw.length, complete: false };
  if (next === 0x5b) {
    let index = start + 2;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      index += 1;
      if (code >= 0x40 && code <= 0x7e) return { end: index, complete: true };
    }
    return { end: raw.length, complete: false };
  }
  if (next === 0x5d) {
    let index = start + 2;
    while (index < raw.length) {
      const code = raw.charCodeAt(index);
      if (code === 0x07) return { end: index + 1, complete: true };
      if (code === 0x1b && raw.charCodeAt(index + 1) === 0x5c) return { end: index + 2, complete: true };
      index += 1;
    }
    return { end: raw.length, complete: false };
  }
  return { end: Math.min(raw.length, start + 2), complete: true };
}

function appendMapped(
  output: string[],
  boundaryMap: number[],
  value: string,
  rawStart: number,
  rawEnd: number,
): void {
  for (let offset = 0; offset < value.length; offset += 1) {
    output.push(value[offset] ?? "");
    boundaryMap.push(Math.min(rawEnd, rawStart + offset + 1));
  }
  boundaryMap[boundaryMap.length - 1] = rawEnd;
}

export function normalizeArtifact(artifact: InputArtifact, budget: BudgetState): NormalizedArtifact {
  const raw = artifact.content;
  const output: string[] = [];
  const boundaryMap = [0];
  let index = 0;
  let lineBytes = 0;
  let hasCurrentLineContent = false;
  let stopped = false;

  while (index < raw.length) {
    const rawStart = index;
    const code = raw.charCodeAt(index);
    if (code === 0x1b) {
      if (budget.terminalSequences >= LIMITS.maxTerminalSequences) {
        budget.reasons.add("terminal-sequences");
        stopped = true;
        break;
      }
      const sequence = terminalSequenceEnd(raw, index);
      budget.terminalSequences += 1;
      boundaryMap[boundaryMap.length - 1] = sequence.end;
      index = sequence.end;
      if (!sequence.complete) {
        budget.reasons.add("mapping-failure");
        stopped = true;
        break;
      }
      continue;
    }

    let rawEnd = index + 1;
    let value = raw[index] ?? "";
    if (code === 0x0d) {
      if (raw.charCodeAt(index + 1) === 0x0a) rawEnd = index + 2;
      value = "\n";
    } else if (code === 0x0a) {
      value = "\n";
    } else if (code >= 0xd800 && code <= 0xdbff && raw.charCodeAt(index + 1) >= 0xdc00 && raw.charCodeAt(index + 1) <= 0xdfff) {
      rawEnd = index + 2;
      value = raw.slice(index, rawEnd);
    }

    if (value === "\n") {
      if (budget.linesProcessed >= LIMITS.maxProcessedLines) {
        budget.reasons.add("processed-lines");
        stopped = true;
        break;
      }
      appendMapped(output, boundaryMap, value, rawStart, rawEnd);
      budget.linesProcessed += 1;
      lineBytes = 0;
      hasCurrentLineContent = false;
      index = rawEnd;
      continue;
    }

    const valueBytes = Buffer.byteLength(value, "utf8");
    if (lineBytes + valueBytes > LIMITS.maxLineBytes) {
      budget.reasons.add("line-length");
      stopped = true;
      break;
    }
    appendMapped(output, boundaryMap, value, rawStart, rawEnd);
    lineBytes += valueBytes;
    hasCurrentLineContent = true;
    index = rawEnd;
  }

  if (hasCurrentLineContent && !stopped) {
    if (budget.linesProcessed >= LIMITS.maxProcessedLines) {
      budget.reasons.add("processed-lines");
      stopped = true;
    } else {
      budget.linesProcessed += 1;
    }
  }

  const rawBytesProcessed = Buffer.byteLength(raw.slice(0, index), "utf8");
  return { artifact, text: output.join(""), boundaryMap, rawBytesProcessed, stopped };
}

export function rawBoundary(view: NormalizedArtifact, normalizedOffset: number): number {
  const bounded = Math.max(0, Math.min(normalizedOffset, view.text.length));
  return view.boundaryMap[bounded] ?? view.artifact.content.length;
}
