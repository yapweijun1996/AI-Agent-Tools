import { realpathSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import * as ts from "typescript";
import { TYPESCRIPT_EXTENSIONS } from "./extensions";
import { CompilerFiles } from "./compiler-files";
import type { Diagnostic, DiscoveryPatterns, ResourceLimits, Stats, Truncation } from "../types";
import { discoverFiles, type DiscoveredFile } from "./discovery";
import { canonicalizeRoot, isInsideRoot, repositoryRelative, resolveExistingInsideRoot, type RootInfo } from "./paths";

export interface ProjectBuildOptions extends DiscoveryPatterns {
  project?: string;
  limits: ResourceLimits;
  deadline?: number;
}

export interface ProjectContext {
  root: RootInfo;
  program?: ts.Program;
  checker?: ts.TypeChecker;
  sourceFiles: ts.SourceFile[];
  sourceFilesByRelativePath: Map<string, ts.SourceFile>;
  discoveredFiles: DiscoveredFile[];
  diagnostics: Diagnostic[];
  truncation: Truncation;
  stats: Stats;
  fatal: boolean;
}

function diagnostic(code: Diagnostic["code"], message: string, severity: Diagnostic["severity"], path?: string, details?: Record<string, unknown>): Diagnostic {
  return { code, message, severity, ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function addReason(truncation: Truncation, reason: Diagnostic["code"]): void {
  truncation.truncated = true;
  if (!truncation.reasons.includes(reason)) {
    truncation.reasons.push(reason);
  }
}

function mergeTruncation(target: Truncation, source: Truncation): void {
  if (source.truncated) {
    target.truncated = true;
    for (const reason of source.reasons) {
      addReason(target, reason);
    }
  }
}

function formatTypeScriptDiagnostic(item: ts.Diagnostic): string {
  if (item.code === 5083) return "Cannot read a referenced configuration within the permitted boundaries and budgets (TS5083)";
  return ts.flattenDiagnosticMessageText(item.messageText, " ");
}

function canonicalFilePath(fileName: string): string {
  try {
    return realpathSync.native(fileName);
  } catch {
    return resolvePath(fileName);
  }
}

function safeConfigReferencePath(root: RootInfo, configDirectory: string, referencePath: string): string {
  const absolute = canonicalFilePath(resolvePath(configDirectory, referencePath));
  return isInsideRoot(root.absolute, absolute) ? repositoryRelative(root.absolute, absolute) : "<outside-root>";
}

function fallbackCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: false,
    checkJs: false,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    jsx: ts.JsxEmit.Preserve,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022
  };
}

function sourceFilesForConfig(
  root: RootInfo,
  parsedFileNames: readonly string[],
  discovered: readonly DiscoveredFile[],
  diagnostics: Diagnostic[],
  projectPath: string
): string[] {
  const discoveredByRelative = new Map(discovered.map((file) => [file.relativePath, file.absolutePath]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (const fileName of parsedFileNames) {
    const absolute = canonicalFilePath(fileName);
    if (!isInsideRoot(root.absolute, absolute)) {
      diagnostics.push(diagnostic("PATH_OUTSIDE_ROOT", "The TypeScript project references a file outside the repository root; it was excluded", "warning", projectPath, { excluded: true, reason: "outside-root-project-file" }));
      continue;
    }
    const relative = repositoryRelative(root.absolute, absolute);
    const discoveredPath = discoveredByRelative.get(relative);
    if (discoveredPath && !seen.has(discoveredPath)) {
      names.push(discoveredPath);
      seen.add(discoveredPath);
    }
  }
  return names.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function createEmptyContext(root: RootInfo, discoveredFiles: DiscoveredFile[], diagnostics: Diagnostic[], truncation: Truncation, stats: Stats, fatal: boolean): ProjectContext {
  return {
    root,
    sourceFiles: [],
    sourceFilesByRelativePath: new Map(),
    discoveredFiles,
    diagnostics,
    truncation,
    stats,
    fatal
  };
}

export function buildProject(inputRoot: string, options: ProjectBuildOptions): ProjectContext {
  const rootResult = canonicalizeRoot(inputRoot);
  if ("diagnostic" in rootResult) {
    const fallbackRoot: RootInfo = { input: inputRoot, absolute: resolvePath(inputRoot) };
    return createEmptyContext(fallbackRoot, [], [rootResult.diagnostic], { truncated: false, reasons: [] }, {}, true);
  }
  const root = rootResult.value;
  const diagnostics: Diagnostic[] = [];
  const truncation: Truncation = { truncated: false, reasons: [] };
  const baseStats: Stats = { compilerVersion: ts.version };

  let selectedProject: string | undefined;
  let explicitProjectPath: string | undefined;
  if (options.project !== undefined) {
    const projectResult = resolveExistingInsideRoot(root, options.project, "project");
    if ("diagnostic" in projectResult) {
      return createEmptyContext(root, [], [projectResult.diagnostic], truncation, baseStats, true);
    }
    if (projectResult.value.isSymlink) {
      return createEmptyContext(root, [], [diagnostic("INVALID_REQUEST", "project must identify a regular in-root tsconfig*.json file; symbolic links are not allowed", "error", options.project)], truncation, baseStats, true);
    }
    const projectName = projectResult.value.relative.split("/").at(-1)?.toLowerCase() ?? "";
    if (!projectName.startsWith("tsconfig") || !projectName.endsWith(".json")) {
      return createEmptyContext(root, [], [diagnostic("INVALID_REQUEST", "project must identify a tsconfig*.json file", "error", options.project)], truncation, baseStats, true);
    }
    selectedProject = projectResult.value.relative;
    explicitProjectPath = projectResult.value.absolute;
  }

  const configDiscovery = options.project === undefined
    ? discoverFiles(root, {
        extensions: [".json"],
        limits: options.limits,
        deadline: options.deadline
      })
    : undefined;
  if (configDiscovery) {
    diagnostics.push(...configDiscovery.diagnostics);
    mergeTruncation(truncation, configDiscovery.truncation);
    const configFiles = configDiscovery.files.filter((file) => {
      const name = file.relativePath.split("/").at(-1)?.toLowerCase() ?? "";
      return name.startsWith("tsconfig") && name.endsWith(".json");
    });
    if (configFiles.length > 1) {
      diagnostics.push(diagnostic(
        "INVALID_REQUEST",
        `Multiple TypeScript project configurations were found; pass project explicitly: ${configFiles.map((file) => file.relativePath).join(", ")}`,
        "error",
        undefined,
        { reason: "multiple-project-configs", projects: configFiles.map((file) => file.relativePath) }
      ));
      return createEmptyContext(root, [], diagnostics, truncation, baseStats, true);
    }
    if (configFiles.length === 1) {
      selectedProject = configFiles[0].relativePath;
      explicitProjectPath = configFiles[0].absolutePath;
    }
  }

  const sourceDiscovery = discoverFiles(root, {
    include: options.include,
    exclude: options.exclude,
    extensions: TYPESCRIPT_EXTENSIONS,
    limits: options.limits,
    deadline: options.deadline
  });
  diagnostics.push(...sourceDiscovery.diagnostics);
  mergeTruncation(truncation, sourceDiscovery.truncation);
  const discoveredFiles = sourceDiscovery.files;
  const discoveredPaths = discoveredFiles.map((file) => file.absolutePath);
  if (options.deadline !== undefined && Date.now() >= options.deadline) {
    addReason(truncation, "TIMEOUT");
  }

  let rootNames = discoveredPaths;
  let compilerOptions = fallbackCompilerOptions();
  const compilerFiles = new CompilerFiles(root, new Set(discoveredPaths), options.limits, diagnostics, truncation, selectedProject, options.deadline);
  if (explicitProjectPath) {
    const configResult = ts.readConfigFile(explicitProjectPath, path => compilerFiles.readFile(path, true));
    if (configResult.error) {
      diagnostics.push(diagnostic("PARSE_ERROR", `Unable to parse TypeScript project configuration: ${formatTypeScriptDiagnostic(configResult.error)}`, "warning", selectedProject));
    } else {
      const parsed = ts.parseJsonConfigFileContent(configResult.config, {
        ...ts.sys,
        readFile: path => compilerFiles.readFile(path, true),
        fileExists: path => compilerFiles.readFile(path, true) !== undefined
      }, dirname(explicitProjectPath), undefined, explicitProjectPath);
      for (const error of parsed.errors) {
        diagnostics.push(diagnostic("PARSE_ERROR", formatTypeScriptDiagnostic(error), "warning", selectedProject));
      }
      compilerOptions = {
        ...parsed.options,
        allowJs: false,
        checkJs: false,
        noEmit: true,
        skipLibCheck: parsed.options.skipLibCheck ?? true
      };
      if (parsed.projectReferences && parsed.projectReferences.length > 0) {
        diagnostics.push(diagnostic(
          "SEMANTIC_RESOLUTION_UNAVAILABLE",
          "Project references are recorded but are not recursively built in V1; only the selected tsconfig file set is analyzed",
          "warning",
          selectedProject,
          { references: parsed.projectReferences.map((reference) => safeConfigReferencePath(root, dirname(explicitProjectPath), reference.path)) }
        ));
      }
      rootNames = sourceFilesForConfig(root, parsed.fileNames, discoveredFiles, diagnostics, selectedProject!);
    }
  }

  const host = compilerFiles.createHost(compilerOptions);
  const program = ts.createProgram(rootNames, compilerOptions, host);
  const checker = program.getTypeChecker();
  const knownByAbsolute = new Map(discoveredFiles.map((file) => [canonicalFilePath(file.absolutePath), file.relativePath]));
  const sourceFilesByRelativePath = new Map<string, ts.SourceFile>();
  const sourceFiles: ts.SourceFile[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    const absolute = canonicalFilePath(sourceFile.fileName);
    const relative = knownByAbsolute.get(absolute);
    if (relative && !sourceFilesByRelativePath.has(relative)) {
      sourceFilesByRelativePath.set(relative, sourceFile);
      sourceFiles.push(sourceFile);
    }
  }
  sourceFiles.sort((left, right) => {
    const leftPath = repositoryRelative(root.absolute, canonicalFilePath(left.fileName));
    const rightPath = repositoryRelative(root.absolute, canonicalFilePath(right.fileName));
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });

  const seenParseDiagnostics = new Set<string>();
  for (const sourceFile of sourceFiles) {
    for (const item of program.getSyntacticDiagnostics(sourceFile)) {
      const key = `${sourceFile.fileName}:${item.start ?? -1}:${formatTypeScriptDiagnostic(item)}`;
      if (seenParseDiagnostics.has(key)) {
        continue;
      }
      seenParseDiagnostics.add(key);
      diagnostics.push(diagnostic("PARSE_ERROR", formatTypeScriptDiagnostic(item), "warning", repositoryRelative(root.absolute, canonicalFilePath(sourceFile.fileName))));
    }
  }

  const stats: Stats = {
    ...baseStats,
    filesScanned: sourceDiscovery.filesScanned,
    bytesParsed: sourceDiscovery.bytesParsed,
    compilerFilesRead: compilerFiles.filesRead,
    compilerBytesRead: compilerFiles.bytesRead,
    ...(selectedProject ? { project: selectedProject } : { project: "fallback" })
  };
  return {
    root,
    program,
    checker,
    sourceFiles,
    sourceFilesByRelativePath,
    discoveredFiles,
    diagnostics,
    truncation,
    stats,
    fatal: false
  };
}
