import path from "node:path";
import { BUDGETS, PURPOSES } from "../constants.js";
import { compareCodePoint } from "./evidence.js";
import type { Profile } from "../types.js";

export function validateProfileSemantics(profile: Profile): string[] {
  const errors: string[] = [];
  if (profile.schemaVersion !== "1.0") errors.push("schemaVersion");
  if (!/^\d+\.\d+\.\d+$/u.test(profile.toolVersion)) errors.push("toolVersion");
  const evidenceIds = new Set<string>();
  for (const record of profile.evidence) {
    if (evidenceIds.has(record.id)) errors.push("duplicate evidence id");
    evidenceIds.add(record.id);
    if (!/^ev-\d{6}$/u.test(record.id)) errors.push("evidence id");
    if (record.path !== normalizeProfilePath(record.path)) errors.push("evidence path");
    if (isAbsoluteLike(record.path)) errors.push("absolute evidence path");
  }
  walkEvidence(profile, evidenceIds, errors);
  for (const purpose of PURPOSES) {
    const commands = profile.commands[purpose];
    if (!Array.isArray(commands)) errors.push(`commands.${purpose}`);
    for (const command of commands) {
      if (command.declaredByProject !== true || command.execution !== "not_run") errors.push("command execution");
      if (!command.evidence.length) errors.push("command evidence");
      if (command.argv !== null && (command.argv.length !== 3 || command.argv[1] !== "run")) errors.push("command argv");
      if (command.argv !== null && command.argv[0] !== "npm" && command.argv[0] !== "pnpm" && command.argv[0] !== "yarn") errors.push("command manager");
    }
  }
  if (profile.workspace.returned !== profile.workspace.packages.length) errors.push("workspace returned");
  if (profile.workspace.total !== null && profile.workspace.total < profile.workspace.returned) errors.push("workspace total");
  if (profile.workspace.truncated && profile.workspace.total === null && profile.workspace.returned > BUDGETS.workspacePackages) errors.push("workspace truncation");
  if (profile.coverage.usage.directoryEntries > profile.coverage.budgets.directoryEntries) errors.push("directory budget");
  if (profile.coverage.usage.metadataFiles > profile.coverage.budgets.metadataFiles) errors.push("metadata file budget");
  if (profile.coverage.usage.metadataBytes > profile.coverage.budgets.metadataTotalBytes) errors.push("metadata byte budget");
  if (profile.coverage.budgets.outputBytes !== BUDGETS.outputBytes) errors.push("output budget");
  return Array.from(new Set(errors)).sort(compareCodePoint);
}

function walkEvidence(value: unknown, evidenceIds: ReadonlySet<string>, errors: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walkEvidence(item, evidenceIds, errors);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence" && Array.isArray(child)) {
      if (child.every((reference) => typeof reference === "string")) {
        for (const reference of child) {
          if (typeof reference !== "string" || !evidenceIds.has(reference)) errors.push("dangling evidence");
        }
      }
    }
    if ((key === "path" || key === "cwd" || key === "scope") && typeof child === "string" && isAbsoluteLike(child)) errors.push("absolute profile path");
    walkEvidence(child, evidenceIds, errors);
  }
}

function isAbsoluteLike(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/u.test(value) || value.includes("\\");
}

function normalizeProfilePath(value: string): string {
  return value.replaceAll("\\", "/");
}
