import { createHash } from "node:crypto";
import type { CommandRecommendation, DiscoveredCommand, Evidence, Framework, NormalizedChange, ResourceLimits, TestRecommendation, VerificationLevel, VerificationPlan } from "../types.js";
import type { DiscoveryResult } from "./discovery.js";
import { detectFrameworks, packageRootFor, scriptPurpose } from "./frameworks.js";
import { mapTests } from "./mapping.js";
import { buildImportGraph, type ImportGraph } from "./imports.js";
import { classifyRisk } from "./risk.js";

function evidence(type: Evidence["type"], confidence: Evidence["confidence"], source: string, target?: string, details?: Record<string, unknown>): Evidence {
  return { type, confidence, source, ...(target ? { target } : {}), ...(details ? { details } : {}) };
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandId(command: string, scope: CommandRecommendation["scope"], source: string): string {
  return `sha256-v1:${createHash("sha256").update(["command-recommendation-v1", command, scope, source].join("\n"), "utf8").digest("hex")}`;
}

function makeCommand(command: string, purpose: CommandRecommendation["purpose"], scope: CommandRecommendation["scope"], source: string, evidenceItems: Evidence[]): CommandRecommendation {
  return { id: commandId(command, scope, source), command, purpose, scope, confidence: evidenceItems.map(item => item.confidence).includes("confirmed") ? "confirmed" : evidenceItems.map(item => item.confidence).includes("strong") ? "strong" : "candidate", source, evidence: evidenceItems, executed: false };
}

function frameworkCommand(framework: Framework, path: string): string {
  const target = shellQuote(path);
  if (framework === "vitest") return `npm exec --no -- vitest run -- ${target}`;
  if (framework === "jest") return `npm exec --no -- jest --runInBand -- ${target}`;
  return `node --test ${target}`;
}

function targetedCommands(tests: readonly TestRecommendation[]): CommandRecommendation[] {
  const knownFrameworkTests = tests.filter((test): test is TestRecommendation & { framework: Framework } => test.framework !== "unknown");
  return knownFrameworkTests.map(test => {
    const source = `framework:${test.framework}`;
    const framework = test.framework;
    return makeCommand(frameworkCommand(framework, test.path), "test", "targeted", source, test.evidence);
  });
}

function commandForPurpose(commands: readonly DiscoveredCommand[], purpose: DiscoveredCommand["purpose"], scope: VerificationLevel["commands"][number]["scope"]): CommandRecommendation[] {
  return commands.filter(command => command.purpose === purpose).map(command => makeCommand(command.command, command.purpose, scope, command.source, command.evidence));
}

function uniqueCommands(commands: readonly CommandRecommendation[]): CommandRecommendation[] {
  const seen = new Set<string>();
  return commands.filter(command => {
    const key = `${command.command}|${command.scope}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.purpose < right.purpose ? -1 : left.purpose > right.purpose ? 1 : compare(left.command, right.command));
}

function level(tests: readonly TestRecommendation[], commands: readonly CommandRecommendation[]): VerificationLevel {
  return { tests: tests.slice(), commands: uniqueCommands(commands) };
}

function packageTestCommands(commands: readonly DiscoveredCommand[]): CommandRecommendation[] {
  return commands.filter(command => command.purpose === "test").map(command => makeCommand(command.command, "test", "package", command.source, command.evidence));
}

function releaseCommands(commands: readonly DiscoveredCommand[]): CommandRecommendation[] {
  const purposes: DiscoveredCommand["purpose"][] = ["verify", "release", "coverage", "build", "lint"];
  return purposes.flatMap(purpose => commandForPurpose(commands, purpose, "repository"));
}

function relevantCommands(commands: readonly DiscoveredCommand[], changes: readonly NormalizedChange[], discovery: DiscoveryResult): DiscoveredCommand[] {
  const packageRoots = new Set(changes.map(change => packageRootFor(discovery, change.path)));
  return commands.filter(command => {
    if (!command.packagePath) return packageRoots.has(".");
    const packageRoot = command.packagePath === "package.json" ? "." : command.packagePath.replace(/\/package\.json$/i, "");
    return packageRoots.has(packageRoot);
  });
}

function escalationFor(level: VerificationPlan["risk"]["level"], testCount: number): string[] {
  if (level === "critical") return ["Run release-level checks before merge or release; package, lockfile, CI, release, and security changes have broad blast radius.", "If external impact evidence is unavailable, obtain review from the owning project or release boundary."];
  if (level === "high") return ["Escalate from targeted tests to package typecheck/build and the repository verification command before merge.", "Re-plan if static consumers or external impact evidence change."];
  if (level === "medium") return ["Start with the recommended targeted tests and static checks; escalate to package verification if any check fails or evidence is incomplete."];
  if (level === "low") return [testCount > 0 ? "Targeted verification is sufficient for the current bounded evidence; escalate if the patch expands beyond the mapped files." : "No directly mapped test was found; add or identify a test before treating targeted verification as sufficient."];
  return ["Risk could not be classified from bounded evidence; require human review before relying on the minimum scope."];
}

export interface PlannerInput {
  changes: readonly NormalizedChange[];
  discovery: DiscoveryResult;
  graph?: ImportGraph;
  limits: ResourceLimits;
  deadline?: number;
  symbolEvidence?: import("../types.js").VersionedExternalEvidence;
  impactEvidence?: import("../types.js").VersionedExternalEvidence;
}

export function buildPlan(input: PlannerInput): { plan: VerificationPlan; graph: ImportGraph; timedOut: boolean; truncated: boolean } {
  const deadline = input.deadline ?? Number.POSITIVE_INFINITY;
  const graph = input.graph ?? buildImportGraph(input.discovery, input.limits, deadline);
  const frameworks = detectFrameworks(input.discovery).observations.map(item => item.framework);
  const mapped = mapTests(input.changes, input.discovery, graph, frameworks, input.limits.maxTestCandidates, deadline);
  const risk = classifyRisk(input.changes, input.discovery, graph, mapped.directCounts, { symbolEvidence: input.symbolEvidence, impactEvidence: input.impactEvidence });
  const candidates = mapped.recommendations;
  const strongestConfidence = candidates[0]?.confidence ?? "unknown";
  const equallyStrong = candidates.filter(test => test.confidence === strongestConfidence);
  const minimumTests = (strongestConfidence === "candidate" || strongestConfidence === "unknown" ? equallyStrong.slice(0, 1) : equallyStrong).slice(0, input.limits.maxReturnedTests);
  const recommendedTests = candidates.slice(0, input.limits.maxReturnedTests);
  const releaseTests = candidates.slice(0, input.limits.maxReturnedTests);
  const commands = input.discovery.projectFiles.length > 0 ? relevantCommands(awaitlessCommands(input.discovery), input.changes, input.discovery) : [];
  const minimumCommands = targetedCommands(minimumTests);
  const recommendedCommands = [...targetedCommands(recommendedTests), ...packageTestCommands(commands)];
  const hasTypeScript = input.changes.some(change => change.language === "typescript" || change.language === "tsx");
  const typecheck = commandForPurpose(commands, "typecheck", "package");
  const build = commandForPurpose(commands, "build", "package");
  if (hasTypeScript && typecheck.length > 0) recommendedCommands.push(...typecheck);
  if (risk.level === "high" || risk.level === "critical") recommendedCommands.push(...build);
  const releaseCommandList = [...recommendedCommands, ...releaseCommands(commands)];
  const plan: VerificationPlan = {
    changes: input.changes.slice(),
    risk,
    minimum: level(minimumTests, minimumCommands),
    recommended: level(recommendedTests, recommendedCommands),
    release: level(releaseTests, releaseCommandList),
    escalation: escalationFor(risk.level, minimumTests.length)
  };
  return { plan, graph, timedOut: mapped.timedOut || graph.timedOut || Date.now() >= deadline, truncated: mapped.truncated || candidates.length > input.limits.maxReturnedTests };
}

function awaitlessCommands(discovery: DiscoveryResult): DiscoveredCommand[] {
  const commands: DiscoveredCommand[] = [];
  for (const path of discovery.projectFiles.filter(path => path.endsWith("package.json")).sort()) {
    const text = discovery.readFile(path);
    if (!text) continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      const scripts = (parsed as { scripts?: unknown }).scripts;
      if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) continue;
      for (const [name, value] of Object.entries(scripts as Record<string, unknown>).sort(([left], [right]) => compare(left, right))) {
        if (typeof value !== "string") continue;
        const purpose = scriptPurpose(name, value);
        commands.push({ name, command: `npm run ${name}`, source: `${path}#scripts.${name}`, packagePath: path, purpose, evidence: [evidence("project-command-evidence", "confirmed", `${path}#scripts.${name}`, path, { declaredCommand: value, purpose })] });
      }
    } catch {
      // Framework discovery reports malformed package metadata separately.
    }
  }
  return commands.sort((left, right) => compare(left.source, right.source));
}
