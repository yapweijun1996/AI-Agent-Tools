import type {
  CapabilitiesResult,
  Diagnostic,
  Evidence,
  Location,
  ParseResult,
  ParseStats,
  Producer,
  ProducerName,
  ProducerOutcome,
  ResultData,
  Summary,
  ToolIssue,
  Truncation,
  Warning,
} from "../../contract/agent-error-lens-v1.types.js";

function text(value: string): string {
  return value.normalize("NFC");
}

function evidence(value: Evidence): Evidence {
  return {
    artifactId: text(value.artifactId),
    kind: value.kind,
    start: value.start,
    end: value.end,
    offsetUnit: value.offsetUnit,
  };
}

function location(value: Location | null): Location | null {
  if (value === null) return null;
  return { file: text(value.file), line: value.line, column: value.column };
}

function producerOutcome(value: ProducerOutcome): ProducerOutcome {
  const ordered: ProducerOutcome = {};
  if (value.command !== undefined) ordered.command = text(value.command);
  if (value.exitCode !== undefined) ordered.exitCode = value.exitCode;
  if (value.signal !== undefined) ordered.signal = value.signal === null ? null : text(value.signal);
  return ordered;
}

function diagnostic(value: Diagnostic): Diagnostic {
  return {
    id: text(value.id) as Diagnostic["id"],
    severity: value.severity,
    phase: value.phase,
    message: text(value.message),
    code: value.code === null ? null : text(value.code),
    location: location(value.location),
    producerId: value.producerId === null ? null : text(value.producerId),
    confidence: value.confidence,
    evidence: value.evidence.map(evidence),
  };
}

function producer(value: Producer): Producer {
  return {
    id: text(value.id),
    name: value.name,
    version: value.version === null ? null : text(value.version),
    evidence: value.evidence.map(evidence),
  };
}

function issue(value: ToolIssue): ToolIssue {
  return {
    code: text(value.code),
    stage: value.stage,
    message: text(value.message),
    artifactId: value.artifactId === null ? null : text(value.artifactId),
    evidence: value.evidence.map(evidence),
  };
}

function warning(value: Warning): Warning {
  return {
    code: text(value.code),
    stage: value.stage,
    message: text(value.message),
    diagnosticId: value.diagnosticId === null ? null : text(value.diagnosticId),
    artifactId: value.artifactId === null ? null : text(value.artifactId),
    evidence: value.evidence.map(evidence),
  };
}

function summary(value: Summary): Summary {
  return {
    diagnosticCount: value.diagnosticCount,
    errorCount: value.errorCount,
    warningCount: value.warningCount,
    infoCount: value.infoCount,
    unknownCount: value.unknownCount,
    producerCount: value.producerCount,
  };
}

function stats(value: ParseStats): ParseStats {
  return {
    artifactsReceived: value.artifactsReceived,
    artifactsProcessed: value.artifactsProcessed,
    bytesReceived: value.bytesReceived,
    bytesProcessed: value.bytesProcessed,
    linesProcessed: value.linesProcessed,
    parserMatches: value.parserMatches,
    terminalSequences: value.terminalSequences,
    producerCandidates: value.producerCandidates,
    evidenceBytes: value.evidenceBytes,
    diagnosticsBeforeLimit: value.diagnosticsBeforeLimit,
  };
}

function truncation(value: Truncation): Truncation {
  return { truncated: value.truncated, reasons: [...value.reasons] };
}

function resultData(value: ResultData): ResultData {
  return {
    producers: value.producers.map(producer),
    diagnostics: value.diagnostics.map(diagnostic),
    summary: summary(value.summary),
  };
}

function orderedResult(value: ParseResult): ParseResult {
  const result: ParseResult = {
    schemaVersion: value.schemaVersion,
    status: value.status,
    data: resultData(value.data),
    toolIssues: value.toolIssues.map(issue),
    warnings: value.warnings.map(warning),
    truncation: truncation(value.truncation),
    stats: stats(value.stats),
  };
  if (value.producerOutcome !== undefined) {
    result.producerOutcome = producerOutcome(value.producerOutcome);
    const { schemaVersion, status, data, toolIssues, warnings, truncation: resultTruncation, stats: resultStats } = result;
    return {
      schemaVersion,
      status,
      producerOutcome: result.producerOutcome,
      data,
      toolIssues,
      warnings,
      truncation: resultTruncation,
      stats: resultStats,
    };
  }
  return result;
}

export function serializeResult(value: ParseResult): string {
  return `${JSON.stringify(orderedResult(value))}\n`;
}

export function serializeCapabilities(value: CapabilitiesResult): string {
  const ordered: CapabilitiesResult = {
    schemaVersion: value.schemaVersion,
    operations: [...value.operations] as CapabilitiesResult["operations"],
    producers: value.producers.map((producerName) => text(producerName) as ProducerName),
  };
  return `${JSON.stringify(ordered)}\n`;
}
