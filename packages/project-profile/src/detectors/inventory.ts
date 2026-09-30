import { CI_ROOT_FILES, CONFIG_DETECTORS, ECOSYSTEM_SENTINELS } from "../constants.js";
import { DiagnosticCollector } from "../core/diagnostics.js";
import { compareCodePoint, EvidenceStore } from "../core/evidence.js";
import { Scanner } from "../core/scanner.js";
import type { ConfigRecord, CiRecord, Ecosystem, InstructionRecord } from "../types.js";
import type { PackageManifest } from "./manifest.js";

export interface InventoryFacts {
  ecosystems: Ecosystem[];
  configs: ConfigRecord[];
  instructions: InstructionRecord[];
  ci: CiRecord[];
  configsComplete: boolean;
  instructionsComplete: boolean;
  ciComplete: boolean;
}

export function collectInventory(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  scopePaths: readonly string[],
  nodeManifests: readonly PackageManifest[],
): InventoryFacts {
  const sortedScopes = Array.from(new Set(scopePaths)).sort(compareCodePoint);
  const configs: ConfigRecord[] = [];
  const instructions: InstructionRecord[] = [];
  const ci: CiRecord[] = [];
  const ecosystemEvidence = new Map<string, string[]>();
  let configsComplete = true;
  let instructionsComplete = true;
  let ciComplete = true;

  for (const manifest of nodeManifests) {
    if (!manifest.valid) continue;
    addEcosystemEvidence(ecosystemEvidence, "node", manifest.evidence);
  }
  for (const scope of sortedScopes) {
    for (const sentinel of ECOSYSTEM_SENTINELS) {
      for (const file of sentinel.files) {
        const relativePath = scope === "." ? file : `${scope}/${file}`;
        const probe = scanner.probe(relativePath);
        if (probe.kind === "file") addEcosystemEvidence(ecosystemEvidence, sentinel.name, [scanner.fileEvidence(relativePath)]);
      }
    }
    const configListing = scanner.listDirectory(scope);
    if (!configListing.complete) {
      configsComplete = false;
    } else {
      for (const entry of configListing.entries) {
        const detector = CONFIG_DETECTORS.find((candidate) => candidate.test(entry.name));
        if (detector === undefined) continue;
        const relativePath = scope === "." ? entry.name : `${scope}/${entry.name}`;
        if (scanner.probe(relativePath).kind === "file") {
          configs.push({ type: detector.type, path: relativePath, evidence: [scanner.fileEvidence(relativePath)] });
        }
      }
    }
    const instructionResult = collectInstructionsForScope(scanner, scope, evidence, diagnostics);
    instructions.push(...instructionResult.records);
    instructionsComplete = instructionsComplete && instructionResult.complete;

    for (const rootFile of CI_ROOT_FILES) {
      const relativePath = scope === "." ? rootFile.path : `${scope}/${rootFile.path}`;
      if (scanner.probe(relativePath).kind === "file") {
        ci.push({ provider: rootFile.provider, path: relativePath, evidence: [scanner.fileEvidence(relativePath)] });
      }
    }
    const workflowDirectory = scope === "." ? ".github/workflows" : `${scope}/.github/workflows`;
    const workflowListing = scanner.listDirectory(workflowDirectory);
    if (!workflowListing.complete && workflowListing.exists) ciComplete = false;
    for (const entry of workflowListing.entries) {
      if (!/\.(?:yml|yaml)$/iu.test(entry.name)) continue;
      const relativePath = `${workflowDirectory}/${entry.name}`;
      if (scanner.probe(relativePath).kind === "file") {
        ci.push({ provider: "github-actions", path: relativePath, evidence: [scanner.fileEvidence(relativePath)] });
      }
    }
  }

  for (const [name, sources] of ecosystemEvidence) {
    const support = name === "node" ? "first-class" : "detected_only";
    const ecosystem: Ecosystem = { name, support, evidence: Array.from(new Set(sources)) };
    if (support === "detected_only") {
      for (const source of sources) {
        const path = evidence.sourcePath(source);
        diagnostics.add("UNSUPPORTED_ECOSYSTEM", "warning", "This ecosystem is detected by a sentinel file only; commands and runtime details are not inferred.", path, [source]);
      }
    }
    // The map is sorted below, so declaration order never becomes output order.
    ecosystemEvidence.set(name, ecosystem.evidence);
  }

  configs.sort((left, right) => compareCodePoint(left.path, right.path));
  const uniqueInstructions = Array.from(new Map(instructions.map((record) => [`${record.type}\u0000${record.path}\u0000${record.scope}`, record])).values());
  uniqueInstructions.sort((left, right) => {
    const pathOrder = compareCodePoint(left.path, right.path);
    if (pathOrder !== 0) return pathOrder;
    return compareCodePoint(left.type, right.type);
  });
  ci.sort((left, right) => {
    const pathOrder = compareCodePoint(left.path, right.path);
    if (pathOrder !== 0) return pathOrder;
    return compareCodePoint(left.provider, right.provider);
  });
  const ecosystems = Array.from(ecosystemEvidence.keys()).sort(compareCodePoint).map((name) => ({
    name,
    support: name === "node" ? "first-class" as const : "detected_only" as const,
    evidence: ecosystemEvidence.get(name) ?? [],
  }));
  return { ecosystems, configs, instructions: uniqueInstructions, ci, configsComplete, instructionsComplete, ciComplete };
}

function collectInstructionsForScope(
  scanner: Scanner,
  scope: string,
  _evidence: EvidenceStore,
  _diagnostics: DiagnosticCollector,
): { records: InstructionRecord[]; complete: boolean } {
  const records: InstructionRecord[] = [];
  const ancestorScopes = ancestors(scope);
  for (const ancestor of ancestorScopes) {
    for (const type of ["AGENTS.md", "CLAUDE.md"] as const) {
      const relativePath = ancestor === "." ? type : `${ancestor}/${type}`;
      if (scanner.probe(relativePath).kind === "file") {
        records.push({ type, path: relativePath, scope: ancestor, evidence: [scanner.fileEvidence(relativePath)] });
      }
    }
    const copilotPath = ancestor === "." ? ".github/copilot-instructions.md" : `${ancestor}/.github/copilot-instructions.md`;
    if (scanner.probe(copilotPath).kind === "file") {
      records.push({ type: "copilot-instructions.md", path: copilotPath, scope: ancestor, evidence: [scanner.fileEvidence(copilotPath)] });
    }
  }
  return { records, complete: true };
}

function ancestors(scope: string): string[] {
  if (scope === ".") return ["."];
  const segments = scope.split("/");
  const result = ["."];
  for (let index = 1; index <= segments.length; index += 1) result.push(segments.slice(0, index).join("/"));
  return result;
}

function addEcosystemEvidence(target: Map<string, string[]>, name: string, sources: readonly string[]): void {
  const current = target.get(name) ?? [];
  target.set(name, Array.from(new Set([...current, ...sources])));
}
