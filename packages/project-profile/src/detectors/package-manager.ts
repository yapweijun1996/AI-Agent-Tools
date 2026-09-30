import { LOCKFILE_FAMILIES } from "../constants.js";
import { DiagnosticCollector } from "../core/diagnostics.js";
import { EvidenceStore } from "../core/evidence.js";
import { Scanner } from "../core/scanner.js";
import type { PackageManager } from "../types.js";
import type { PackageManifest } from "./manifest.js";
import { hasOwn, manifestEvidence } from "./manifest.js";

export interface ManagerDetection {
  manager: PackageManager;
  hasLocalSignal: boolean;
  declarationValid: boolean;
  declarationPresent: boolean;
  lockFamilies: Set<"npm" | "pnpm" | "yarn">;
}

const SUPPORTED_MANAGERS = new Set(["npm", "pnpm", "yarn"]);

export function resolvePackageManager(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
  inheritedRoot?: PackageManager,
): ManagerDetection {
  const local = detectLocalPackageManager(
    scanner,
    evidence,
    diagnostics,
    manifest,
    inheritedRoot !== undefined && manifest.cwd !== "." && inheritedRoot.name !== null,
  );
  if (inheritedRoot !== undefined && manifest.cwd !== "." && !local.hasLocalSignal && inheritedRoot.name !== null) {
    return {
      ...local,
      manager: { ...inheritedRoot, inherited: true },
    };
  }
  if (
    inheritedRoot !== undefined &&
    manifest.cwd !== "." &&
    local.hasLocalSignal &&
    local.manager.name !== null &&
    inheritedRoot.name !== null &&
    local.manager.name !== inheritedRoot.name
  ) {
    const rootEvidence = inheritedRoot.evidence;
    diagnostics.add(
      "PACKAGE_MANAGER_CONFLICT",
      "warning",
      "A workspace package manager contradicts the root package-manager evidence; invocation is unavailable for this scope.",
      manifest.cwd === "." ? "package.json" : `${manifest.cwd}/package.json`,
      [...rootEvidence, ...local.manager.evidence],
    );
    return { ...local, manager: { ...local.manager, invocationAvailable: false } };
  }
  return local;
}

function detectLocalPackageManager(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
  suppressMissingDeclaration: boolean,
): ManagerDetection {
  const lockfiles: { name: keyof typeof LOCKFILE_FAMILIES; family: "npm" | "pnpm" | "yarn"; evidence: string }[] = [];
  const blockedLockfiles: { family: "npm" | "pnpm" | "yarn"; evidence: string }[] = [];
  for (const [name, family] of Object.entries(LOCKFILE_FAMILIES) as [keyof typeof LOCKFILE_FAMILIES, "npm" | "pnpm" | "yarn"][]) {
    const relativePath = manifest.cwd === "." ? name : `${manifest.cwd}/${name}`;
    const probe = scanner.probe(relativePath);
    if (probe.kind === "file") lockfiles.push({ name, family, evidence: scanner.fileEvidence(relativePath) });
    else if (probe.kind !== "missing") blockedLockfiles.push({ family, evidence: scanner.fileEvidence(relativePath) });
  }
  const lockFamilies = new Set(lockfiles.map((lockfile) => lockfile.family));
  const lockEvidence = lockfiles.map((lockfile) => lockfile.evidence);
  const blockedEvidence = blockedLockfiles.map((lockfile) => lockfile.evidence);
  if (lockfiles.length > 1) {
    diagnostics.add(
      "MULTIPLE_LOCKFILES",
      "warning",
      "Multiple recognized lockfiles were found in one package scope.",
      manifest.cwd === "." ? null : manifest.cwd,
      lockEvidence,
    );
  }

  let declarationPresent = false;
  let declarationValid = false;
  let declarationName: "npm" | "pnpm" | "yarn" | null = null;
  let declarationVersion: string | null = null;
  let declarationEvidence: string[] = [];
  if (manifest.valid && manifest.data !== null && hasOwn(manifest.data, "packageManager")) {
    declarationPresent = true;
    const pointer = manifestEvidence(evidence, manifest, "/packageManager");
    declarationEvidence = [pointer];
    const value = manifest.data.packageManager;
    if (typeof value !== "string" || value.trim().length === 0) {
      diagnostics.add("PACKAGE_MANAGER_INVALID", "warning", "The package-manager declaration is malformed.", manifest.path, declarationEvidence);
    } else {
      const match = /^([^@\s]+)@([^+\s]+)(?:\+[^\s]+)?$/u.exec(value.trim());
      if (!match || match[1] === undefined || match[2] === undefined) {
        diagnostics.add("PACKAGE_MANAGER_INVALID", "warning", "The package-manager declaration is malformed.", manifest.path, declarationEvidence);
      } else if (!SUPPORTED_MANAGERS.has(match[1])) {
        diagnostics.add("PACKAGE_MANAGER_UNSUPPORTED", "warning", "The package-manager declaration names an unsupported manager.", manifest.path, declarationEvidence);
      } else if (!/^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/u.test(match[2])) {
        diagnostics.add("PACKAGE_MANAGER_INVALID", "warning", "The package-manager declaration has an invalid version.", manifest.path, declarationEvidence);
      } else {
        declarationValid = true;
        declarationName = match[1] as "npm" | "pnpm" | "yarn";
        declarationVersion = match[2];
      }
    }
  }

  const localEvidence = [...declarationEvidence, ...lockEvidence, ...blockedEvidence];
  if (declarationPresent && !declarationValid) {
    return {
      manager: unknownManager(localEvidence),
      hasLocalSignal: true,
      declarationValid: false,
      declarationPresent,
      lockFamilies,
    };
  }
  if (declarationValid && declarationName !== null) {
    const contradictory = Array.from(lockFamilies).some((family) => family !== declarationName) || blockedLockfiles.some((lockfile) => lockfile.family !== declarationName);
    if (contradictory) {
      diagnostics.add(
        "PACKAGE_MANAGER_CONFLICT",
        "warning",
        "The declared package manager conflicts with a recognized lockfile family; invocation is unavailable.",
        manifest.path,
        localEvidence,
      );
    }
    return {
      manager: {
        name: declarationName,
        version: declarationVersion,
        confidence: "confirmed",
        invocationAvailable: !contradictory,
        evidence: localEvidence,
      },
      hasLocalSignal: true,
      declarationValid: true,
      declarationPresent,
      lockFamilies,
    };
  }
  if (lockFamilies.size === 1) {
    if (blockedLockfiles.length > 0) {
      return {
        manager: unknownManager(localEvidence),
        hasLocalSignal: true,
        declarationValid: false,
        declarationPresent,
        lockFamilies,
      };
    }
    const name = Array.from(lockFamilies)[0] ?? null;
    return {
      manager: {
        name,
        version: null,
        confidence: "strong",
        invocationAvailable: name !== null,
        evidence: lockEvidence,
      },
      hasLocalSignal: lockfiles.length > 0,
      declarationValid: false,
      declarationPresent,
      lockFamilies,
    };
  }
  if (lockFamilies.size > 1) {
    diagnostics.add(
      "PACKAGE_MANAGER_CONFLICT",
      "warning",
      "Recognized lockfiles belong to multiple package-manager families; invocation is unavailable.",
      manifest.cwd === "." ? null : manifest.cwd,
      lockEvidence,
    );
    return {
      manager: unknownManager(lockEvidence),
      hasLocalSignal: true,
      declarationValid: false,
      declarationPresent,
      lockFamilies,
    };
  }
  if (!suppressMissingDeclaration && blockedLockfiles.length === 0) {
    diagnostics.add(
      "NO_PACKAGE_MANAGER",
      "warning",
      "No supported package-manager declaration or lockfile was found for this Node package.",
      manifest.path,
    );
  }
  return {
    manager: unknownManager(localEvidence),
    hasLocalSignal: blockedLockfiles.length > 0,
    declarationValid: false,
    declarationPresent,
    lockFamilies,
  };
}

function unknownManager(evidence: readonly string[] = []): PackageManager {
  return { name: null, version: null, confidence: "unknown", invocationAvailable: false, evidence: [...evidence] };
}
