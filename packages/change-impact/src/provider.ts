import * as ts from "typescript";
import { resolve, sep } from "node:path";
import { ImpactError } from "./errors";
import type { ProjectContext } from "./project";
import type {
  DeclarationInfo,
  Evidence,
  GraphEdge,
  GraphNode,
  Limits,
  Relation,
  TextRange,
  UnresolvedObservation,
} from "./types";
import { DEFAULT_LIMITS } from "./types";
import { compareText, toRange } from "./util";

export interface ProviderQueryResult {
  edges: GraphEdge[];
  unresolved: UnresolvedObservation[];
}

export interface ResolvedTarget extends DeclarationInfo {
  nodeId: string;
  symbol: ts.Symbol;
  snapshot: ProjectContext["snapshot"]["ref"];
}

interface ModuleResolution {
  internal?: string;
  external?: string;
  outOfScope?: string;
}

export class TypeScriptProvider {
  public readonly name = "typescript-language-service";
  public readonly version = ts.version;
  private readonly checker: ts.TypeChecker;
  private readonly fileEdgesCache = new Map<string, GraphEdge[]>();
  private readonly unresolvedCache = new Map<string, UnresolvedObservation[]>();
  private readonly nodes = new Map<string, GraphNode>();
  private dynamicCache: UnresolvedObservation[] | undefined;

  public constructor(public readonly context: ProjectContext, private readonly limits: Limits = DEFAULT_LIMITS) {
    this.checker = context.program.getTypeChecker();
  }

  public nodeForFile(file: string): GraphNode {
    const repoFile = this.context.snapshot.toRepoPath(file);
    const node: GraphNode = {
      id: fileNodeId(this.context.snapshot.ref.id, repoFile),
      kind: "file",
      snapshot: this.context.snapshot.ref,
      file: repoFile,
    };
    this.nodes.set(node.id, node);
    return node;
  }

  public nodeForId(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public declarationsInRanges(file: string, ranges: readonly TextRange[]): DeclarationInfo[] {
    const repoFile = this.context.snapshot.toRepoPath(file);
    const sourceFile = this.context.sourceFile(repoFile);
    if (!sourceFile) {
      return [];
    }
    const declarations = collectDeclarations(sourceFile, repoFile, this.checker);
    const meaningful = declarations.filter((declaration) => !["parameter", "bindingelement"].includes(declaration.kind));
    if (ranges.length === 0) {
      return meaningful;
    }
    return meaningful.filter((declaration) => ranges.some((range) => declaration.range.start.line <= range.end.line && declaration.range.end.line >= range.start.line));
  }

  public targetFromDeclaration(declaration: DeclarationInfo): ResolvedTarget | undefined {
    const nameNode = declarationNameNode(declaration.node);
    const symbol = resolveAliasedSymbol(nameNode ? this.checker.getSymbolAtLocation(nameNode) : undefined, this.checker);
    if (!symbol) {
      return undefined;
    }
    const target: ResolvedTarget = {
      ...declaration,
      nodeId: symbolNodeId(this.context.snapshot.ref.id, declaration.file, declaration.key),
      symbol,
      snapshot: this.context.snapshot.ref,
    };
    this.nodes.set(target.nodeId, {
      id: target.nodeId,
      kind: "symbol",
      snapshot: this.context.snapshot.ref,
      file: target.file,
      symbol: target.name,
      declaration: target.range,
    });
    return target;
  }

  public resolveTarget(file: string, name: string, line?: number, column?: number): ResolvedTarget {
    const repoFile = this.context.snapshot.toRepoPath(file);
    if (!this.context.isProjectFile(repoFile)) {
      throw new ImpactError("FILE_NOT_FOUND", `File is not part of the selected project: ${repoFile}`);
    }
    const sourceFile = this.context.sourceFile(repoFile);
    if (!sourceFile) {
      throw new ImpactError("FILE_NOT_FOUND", `Source file is unavailable: ${repoFile}`);
    }
    const declarations = collectDeclarations(sourceFile, repoFile, this.checker);
    const candidates = declarations.filter((declaration) => declaration.name === name);
    let selected: DeclarationInfo | undefined;
    if (line !== undefined || column !== undefined) {
      if (line === undefined || column === undefined || line < 1 || column < 1) {
        throw new ImpactError("INVALID_ARGUMENT", "Both line and column must be positive when --at is supplied");
      }
      const endLineAndCharacter = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd());
      const lineCount = endLineAndCharacter.line + 1;
      if (line > lineCount) {
        throw new ImpactError("TARGET_NOT_FOUND", `No declaration matched ${repoFile}:${line}:${column}`);
      }
      const lineStart = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
      const lineEnd = sourceFile.getLineEndOfPosition(lineStart);
      const maxColumn = lineEnd - lineStart + 1;
      if (column > maxColumn) {
        throw new ImpactError("TARGET_NOT_FOUND", `No declaration matched ${repoFile}:${line}:${column}`);
      }
      const position = lineStart + column - 1;
      const token = findTokenAtPosition(sourceFile, position);
      const symbol = token ? resolveAliasedSymbol(this.checker.getSymbolAtLocation(token), this.checker) : undefined;
      const declaration = symbol ? declarationForSymbol(symbol, repoFile) : undefined;
      if (!declaration || (name && declaration.name !== name)) {
        throw new ImpactError("TARGET_NOT_FOUND", `No declaration matched ${repoFile}:${line}:${column}`);
      }
      selected = declaration;
    } else {
      const unique = dedupeDeclarations(candidates);
      if (unique.length === 0) {
        throw new ImpactError("TARGET_NOT_FOUND", `No declaration named ${name} was found in ${repoFile}`);
      }
      if (unique.length > 1) {
        throw new ImpactError("TARGET_AMBIGUOUS", `Multiple declarations named ${name} were found in ${repoFile}`, {
          candidates: unique.map((candidate) => ({ name: candidate.name, kind: candidate.kind, range: candidate.range })),
        });
      }
      selected = unique[0];
    }
    const selectedName = declarationNameNode(selected.node);
    const symbol = resolveAliasedSymbol(this.checker.getSymbolAtLocation(selectedName ?? selected.node), this.checker);
    if (!symbol) {
      throw new ImpactError("TARGET_NOT_FOUND", `Declaration has no resolvable symbol: ${repoFile}:${selected.name}`);
    }
    const resolved: ResolvedTarget = {
      ...selected,
      nodeId: symbolNodeId(this.context.snapshot.ref.id, repoFile, selected.key),
      symbol,
      snapshot: this.context.snapshot.ref,
    };
    this.nodes.set(resolved.nodeId, {
      id: resolved.nodeId,
      kind: "symbol",
      snapshot: this.context.snapshot.ref,
      file: resolved.file,
      symbol: resolved.name,
      declaration: resolved.range,
    });
    return resolved;
  }

  public resolveNode(node: GraphNode): ResolvedTarget | undefined {
    if (node.kind !== "symbol" || !node.symbol || !node.declaration) {
      return undefined;
    }
    const sourceFile = this.context.sourceFile(node.file);
    if (!sourceFile) {
      return undefined;
    }
    const declarations = collectDeclarations(sourceFile, node.file, this.checker);
    const declaration = declarations.find((candidate) => candidate.name === node.symbol && candidate.range.start.line === node.declaration?.start.line && candidate.range.start.column === node.declaration?.start.column);
    return declaration ? this.targetFromDeclaration(declaration) : undefined;
  }

  public fileEdges(): ProviderQueryResult {
    const edges: GraphEdge[] = [];
    const unresolved: UnresolvedObservation[] = [];
    const observationLimit = Math.max(1, this.limits.maxEdges);
    let observationTruncated = false;
    let lastFile: string | undefined;
    for (const file of this.context.project.files) {
      lastFile = file;
      const result = this.fileEdgesForFile(file);
      if (edges.length < this.limits.maxEdges) {
        edges.push(...result.edges.slice(0, this.limits.maxEdges - edges.length));
      }
      const remaining = Math.max(0, observationLimit - unresolved.length);
      unresolved.push(...result.unresolved.slice(0, remaining));
      if (result.unresolved.length > remaining) {
        observationTruncated = true;
      }
      if (edges.length >= this.limits.maxEdges) {
        unresolved.push({
          code: "PROVIDER_EDGE_LIMIT",
          snapshot: this.context.snapshot.ref,
          file,
          detail: `File dependency collection stopped after ${this.limits.maxEdges} edges`,
        });
        break;
      }
    }
    const markerFile = lastFile ?? this.context.project.files[0] ?? "unknown";
    return {
      edges: dedupeEdges(edges),
      unresolved: capUnresolved(unresolved, observationLimit, {
        code: "PROVIDER_OBSERVATION_LIMIT",
        snapshot: this.context.snapshot.ref,
        file: markerFile,
        detail: `Provider unresolved observations were capped at ${observationLimit}`,
      }, observationTruncated),
    };
  }

  public references(target: ResolvedTarget): ProviderQueryResult {
    const sourceFile = this.context.sourceFile(target.file);
    if (!sourceFile) {
      return { edges: [], unresolved: [] };
    }
    const references = this.context.languageService.getReferencesAtPosition(this.context.absolutePath(target.file), target.position) ?? [];
    const edges: GraphEdge[] = [];
    const unresolved: UnresolvedObservation[] = [];
    const referenceLimit = Math.max(1, this.limits.maxEdges);
    for (const reference of references.slice(0, referenceLimit)) {
      let repoFile: string;
      try {
        repoFile = this.context.repoPath(reference.fileName);
      } catch {
        continue;
      }
      if (!this.context.isProjectFile(repoFile)) {
        continue;
      }
      const referenceFile = this.context.sourceFile(repoFile);
      if (!referenceFile) {
        continue;
      }
      const referenceNode = findTokenAtPosition(referenceFile, reference.textSpan.start);
      if (!referenceNode || isDeclarationName(referenceNode)) {
        continue;
      }
      const relation = classifyReference(referenceNode, referenceFile, reference.textSpan.start);
      const from = enclosingNode(referenceNode, referenceFile, this.context);
      this.nodes.set(from.id, from);
      const to: GraphNode = {
        id: target.nodeId,
        kind: "symbol",
        snapshot: this.context.snapshot.ref,
        file: target.file,
        symbol: target.name,
        declaration: target.range,
      };
      this.nodes.set(to.id, to);
      if (from.id === to.id) {
        continue;
      }
      edges.push(makeEdge(from, to, relation, {
        provider: this.name,
        level: "resolved",
        location: {
          snapshot: this.context.snapshot.ref,
          file: repoFile,
          range: toRange(referenceFile.getFullText(), reference.textSpan.start, reference.textSpan.length),
        },
      }));
    }
    if (references.length > referenceLimit) {
      unresolved.push({
        code: "REFERENCE_LIMIT_EXCEEDED",
        snapshot: this.context.snapshot.ref,
        file: target.file,
        range: target.range,
        detail: `Reference collection stopped after ${referenceLimit} references for ${target.name}`,
      });
    }
    unresolved.push(...this.dynamicObservations());
    return {
      edges: dedupeEdges(edges),
      unresolved: capUnresolved(unresolved, Math.max(1, this.limits.maxEdges), {
        code: "PROVIDER_OBSERVATION_LIMIT",
        snapshot: this.context.snapshot.ref,
        file: target.file,
        range: target.range,
        detail: `Provider unresolved observations were capped at ${Math.max(1, this.limits.maxEdges)}`,
      }),
    };
  }

  public referencesForNode(node: GraphNode): ProviderQueryResult {
    const target = this.resolveNode(node);
    return target ? this.references(target) : { edges: [], unresolved: [] };
  }

  public dynamicObservations(): UnresolvedObservation[] {
    if (this.dynamicCache) {
      return this.dynamicCache;
    }
    const result: UnresolvedObservation[] = [];
    const observationLimit = Math.max(0, this.limits.maxEdges - 1);
    let truncated = false;
    let truncatedFile: string | undefined;
    for (const file of this.context.project.files) {
      const sourceFile = this.context.sourceFile(file);
      if (!sourceFile) {
        continue;
      }
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
          const argument = node.arguments[0];
          if (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)) {
            if (result.length >= observationLimit) {
              truncated = true;
              truncatedFile = file;
              return;
            }
            result.push({
              code: "DYNAMIC_DEPENDENCY_UNRESOLVED",
              snapshot: this.context.snapshot.ref,
              file,
              range: toRange(sourceFile.getFullText(), node.getStart(sourceFile), node.getWidth(sourceFile)),
              detail: "Dynamic import target is not a string literal",
            });
          }
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length > 0) {
          const argument = node.arguments[0];
          if (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument)) {
            if (result.length >= observationLimit) {
              truncated = true;
              truncatedFile = file;
              return;
            }
            result.push({
              code: "DYNAMIC_DEPENDENCY_UNRESOLVED",
              snapshot: this.context.snapshot.ref,
              file,
              range: toRange(sourceFile.getFullText(), node.getStart(sourceFile), node.getWidth(sourceFile)),
              detail: "require target is not a string literal",
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      sourceFile.forEachChild((node) => {
        visit(node);
      });
    }
    if (truncated) {
      const file = truncatedFile ?? this.context.project.files[0];
      if (file) {
        result.push({
          code: "DYNAMIC_OBSERVATION_LIMIT",
          snapshot: this.context.snapshot.ref,
          file,
          detail: `Dynamic dependency observations were capped at ${this.limits.maxEdges}`,
        });
      }
    }
    this.dynamicCache = dedupeUnresolved(result);
    return this.dynamicCache;
  }

  private fileEdgesForFile(file: string): ProviderQueryResult {
    const cached = this.fileEdgesCache.get(file);
    const cachedUnresolved = this.unresolvedCache.get(file);
    if (cached && cachedUnresolved) {
      return { edges: cached, unresolved: cachedUnresolved };
    }
    const sourceFile = this.context.sourceFile(file);
    if (!sourceFile) {
      return { edges: [], unresolved: [] };
    }
    const edges: GraphEdge[] = [];
    const unresolved: UnresolvedObservation[] = [];
    const rawObservationLimit = Math.max(0, this.limits.maxEdges - 2);
    let observationTruncated = false;
    const recordUnresolved = (observation: UnresolvedObservation): void => {
      if (unresolved.length < rawObservationLimit) {
        unresolved.push(observation);
      } else {
        observationTruncated = true;
      }
    };
    let edgeTruncated = false;
    const from = this.nodeForFile(file);
    const visit = (node: ts.Node): void => {
      if (edges.length >= this.limits.maxEdges) {
        edgeTruncated = true;
        return;
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolution = this.resolveModule(file, node.moduleSpecifier.text);
        if (resolution.internal) {
          const to = this.nodeForFile(resolution.internal);
          edges.push(makeEdge(from, to, "imports", this.moduleEvidence(sourceFile, node.moduleSpecifier)));
        } else if (resolution.outOfScope) {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${node.moduleSpecifier.text} is outside the selected project`));
        } else {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text));
        }
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolution = this.resolveModule(file, node.moduleSpecifier.text);
        if (resolution.internal) {
          const to = this.nodeForFile(resolution.internal);
          edges.push(makeEdge(from, to, "reexports", this.moduleEvidence(sourceFile, node.moduleSpecifier)));
        } else if (resolution.outOfScope) {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${node.moduleSpecifier.text} is outside the selected project`));
        } else {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleSpecifier, node.moduleSpecifier.text));
        }
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteral(node.moduleReference.expression)) {
        const resolution = this.resolveModule(file, node.moduleReference.expression.text);
        if (resolution.internal) {
          edges.push(makeEdge(from, this.nodeForFile(resolution.internal), "imports", this.moduleEvidence(sourceFile, node.moduleReference.expression)));
        } else if (resolution.outOfScope) {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleReference.expression, node.moduleReference.expression.text, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${node.moduleReference.expression.text} is outside the selected project`));
        } else {
          recordUnresolved(this.moduleObservation(file, sourceFile, node.moduleReference.expression, node.moduleReference.expression.text));
        }
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require" && node.arguments.length > 0) {
        const argument = node.arguments[0];
        if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
          const resolution = this.resolveModule(file, argument.text);
          if (resolution.internal) {
            edges.push(makeEdge(from, this.nodeForFile(resolution.internal), "imports", this.moduleEvidence(sourceFile, argument)));
          } else if (resolution.outOfScope) {
            recordUnresolved(this.moduleObservation(file, sourceFile, argument, argument.text, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${argument.text} is outside the selected project`));
          } else {
            recordUnresolved(this.moduleObservation(file, sourceFile, argument, argument.text));
          }
        }
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length > 0) {
        const argument = node.arguments[0];
        if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
          const resolution = this.resolveModule(file, argument.text);
          if (resolution.internal) {
            edges.push(makeEdge(from, this.nodeForFile(resolution.internal), "imports", this.moduleEvidence(sourceFile, argument)));
          } else if (resolution.outOfScope) {
            recordUnresolved(this.moduleObservation(file, sourceFile, argument, argument.text, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${argument.text} is outside the selected project`));
          } else {
            recordUnresolved(this.moduleObservation(file, sourceFile, argument, argument.text));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const reference of ts.preProcessFile(sourceFile.getFullText(), true, true).referencedFiles) {
      if (edges.length >= this.limits.maxEdges) {
        edgeTruncated = true;
        break;
      }
      const resolution = this.resolveModule(file, reference.fileName);
      if (resolution.internal) {
        const to = this.nodeForFile(resolution.internal);
        edges.push(makeEdge(from, to, "imports", {
          provider: this.name,
          level: "resolved",
          location: {
            snapshot: this.context.snapshot.ref,
            file,
            range: toRange(sourceFile.getFullText(), sourceFile.getFullText().indexOf(reference.fileName), reference.fileName.length),
          },
          detail: "triple-slash reference",
        }));
      } else if (resolution.outOfScope) {
        const offset = Math.max(0, sourceFile.getFullText().indexOf(reference.fileName));
        recordUnresolved(this.moduleObservationAt(file, sourceFile, offset, reference.fileName.length, reference.fileName, "PROJECT_BOUNDARY_OUT_OF_SCOPE", `Resolved module ${reference.fileName} is outside the selected project`));
      } else {
        const offset = Math.max(0, sourceFile.getFullText().indexOf(reference.fileName));
        recordUnresolved(this.moduleObservationAt(file, sourceFile, offset, reference.fileName.length, reference.fileName));
      }
    }
    const allDynamic = this.dynamicObservations().filter((observation) => observation.file === file);
    for (const observation of allDynamic) {
      recordUnresolved(observation);
    }
    const markers: UnresolvedObservation[] = [];
    if (edgeTruncated) {
      markers.push({
        code: "PROVIDER_EDGE_LIMIT",
        snapshot: this.context.snapshot.ref,
        file,
        detail: `File dependency collection stopped after ${this.limits.maxEdges} edges`,
      });
    }
    if (observationTruncated) {
      markers.push({
        code: "PROVIDER_OBSERVATION_LIMIT",
        snapshot: this.context.snapshot.ref,
        file,
        detail: `Provider unresolved observations were capped at ${this.limits.maxEdges}`,
      });
    }
    unresolved.push(...markers.slice(0, Math.max(0, this.limits.maxEdges - unresolved.length)));
    const resultEdges = dedupeEdges(edges);
    const resultUnresolved = dedupeUnresolved(unresolved);
    this.fileEdgesCache.set(file, resultEdges);
    this.unresolvedCache.set(file, resultUnresolved);
    return { edges: resultEdges, unresolved: resultUnresolved };
  }

  private resolveModule(fromFile: string, moduleName: string): ModuleResolution {
    const resolved = ts.resolveModuleName(
      moduleName,
      this.context.absolutePath(fromFile),
      this.context.compilerOptions,
      {
        fileExists: (fileName) => this.resolutionFileExists(fileName),
        readFile: (fileName) => this.resolutionReadFile(fileName),
      },
    ).resolvedModule;
    if (!resolved) {
      return {};
    }
    const repoFile = safeRepoPath(this.context, resolved.resolvedFileName);
    if (repoFile && this.context.isProjectFile(repoFile)) {
      return { internal: repoFile };
    }
    if (repoFile) {
      return { outOfScope: repoFile };
    }
    return { external: resolved.resolvedFileName };
  }

  private resolutionFileExists(fileName: string): boolean {
    if (this.context.snapshot.fileExists(fileName)) {
      return true;
    }
    const absolute = resolve(fileName);
    const root = resolve(this.context.snapshot.root);
    const localModules = resolve(root, "node_modules");
    const typescriptLib = resolve(ts.getDefaultLibFilePath(this.context.compilerOptions), "..");
    const permitted = [localModules, typescriptLib];
    return permitted.some((directory) => absolute === directory || absolute.startsWith(`${directory}${sep}`)) && ts.sys.fileExists(absolute);
  }

  private resolutionReadFile(fileName: string): string | undefined {
    if (this.context.snapshot.fileExists(fileName)) {
      return this.context.snapshot.readFile(fileName);
    }
    return this.resolutionFileExists(fileName) ? this.context.readResolvedFile(resolve(fileName)) : undefined;
  }

  private moduleObservation(file: string, sourceFile: ts.SourceFile, node: ts.Node, moduleName: string, code = "MODULE_RESOLUTION_UNRESOLVED", detail = `Could not resolve module ${moduleName}`): UnresolvedObservation {
    return this.moduleObservationAt(file, sourceFile, node.getStart(sourceFile), node.getWidth(sourceFile), moduleName, code, detail);
  }

  private moduleObservationAt(file: string, sourceFile: ts.SourceFile, offset: number, length: number, moduleName: string, code = "MODULE_RESOLUTION_UNRESOLVED", detail = `Could not resolve module ${moduleName}`): UnresolvedObservation {
    return {
      code,
      snapshot: this.context.snapshot.ref,
      file,
      range: toRange(sourceFile.getFullText(), offset, length),
      detail,
    };
  }

  private moduleEvidence(sourceFile: ts.SourceFile, node: ts.Node): Evidence {
    return {
      provider: this.name,
      level: "resolved",
      location: {
        snapshot: this.context.snapshot.ref,
        file: this.context.repoPath(sourceFile.fileName),
        range: toRange(sourceFile.getFullText(), node.getStart(sourceFile), node.getWidth(sourceFile)),
      },
    };
  }
}

function fileNodeId(snapshot: string, file: string): string {
  return `file:${snapshot}:${file}`;
}

function symbolNodeId(snapshot: string, file: string, key: string): string {
  return `symbol:${snapshot}:${file}:${key}`;
}

function makeEdge(from: GraphNode, to: GraphNode, relation: Relation, evidence: Evidence): GraphEdge {
  const location = evidence.location;
  const locationKey = location ? `${location.file}:${location.range.start.line}:${location.range.start.column}` : "none";
  return {
    id: `${from.id}->${relation}->${to.id}@${locationKey}`,
    from: from.id,
    to: to.id,
    relation,
    evidence,
  };
}

function safeRepoPath(context: ProjectContext, fileName: string): string | undefined {
  try {
    return context.repoPath(fileName);
  } catch {
    return undefined;
  }
}

function collectDeclarations(sourceFile: ts.SourceFile, file: string, checker: ts.TypeChecker): DeclarationInfo[] {
  const result: DeclarationInfo[] = [];
  const visit = (node: ts.Node): void => {
    const named = declarationNameNode(node);
    if (named && ts.isIdentifier(named)) {
      const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(named), checker);
      if (symbol) {
        const declaration = declarationForNode(node, named, file);
        if (declaration) {
          result.push(declaration);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return dedupeDeclarations(result);
}

function declarationNameNode(node: ts.Node): ts.Node | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.name;
  }
  if (ts.isVariableDeclaration(node) || ts.isBindingElement(node) || ts.isParameter(node)) {
    return node.name;
  }
  return undefined;
}

function declarationForNode(node: ts.Node, nameNode: ts.Node, file: string): DeclarationInfo {
  const sourceFile = node.getSourceFile();
  const name = nameNode.getText(sourceFile);
  const range = toRange(sourceFile.getFullText(), node.getStart(sourceFile), node.getWidth(sourceFile));
  const symbolKey = `${node.getStart(sourceFile)}:${node.getWidth(sourceFile)}:${name}`;
  return {
    file,
    name,
    kind: declarationKind(node),
    range,
    position: nameNode.getStart(sourceFile),
    key: symbolKey,
    node,
  };
}

function declarationForSymbol(symbol: ts.Symbol, file: string): DeclarationInfo | undefined {
  const declarations = symbol.declarations ?? [];
  const matching = declarations.find((declaration) => {
    const sourceFile = declaration.getSourceFile();
    return safeRelative(sourceFile.fileName, file) && declarationNameNode(declaration) !== undefined;
  });
  if (!matching) {
    return undefined;
  }
  const nameNode = declarationNameNode(matching);
  if (!nameNode) {
    return undefined;
  }
  return declarationForNode(matching, nameNode, file);
}

function safeRelative(sourceFileName: string, requestedFile: string): boolean {
  const normalizedSource = sourceFileName.replaceAll("\\", "/");
  const normalizedRequested = requestedFile.replaceAll("\\", "/");
  return normalizedSource.endsWith(`/${normalizedRequested}`) || normalizedSource === normalizedRequested;
}

function declarationKind(node: ts.Node): string {
  const raw = ts.SyntaxKind[node.kind] ?? "unknown";
  return raw.replace(/Declaration$|Signature$|Clause$/g, "").toLowerCase();
}

function dedupeDeclarations(values: readonly DeclarationInfo[]): DeclarationInfo[] {
  const seen = new Map<string, DeclarationInfo>();
  for (const value of values) {
    seen.set(`${value.file}:${value.key}`, value);
  }
  return [...seen.values()].sort((a, b) => a.range.start.line - b.range.start.line || a.range.start.column - b.range.start.column || compareText(a.name, b.name));
}

function resolveAliasedSymbol(symbol: ts.Symbol | undefined, checker: ts.TypeChecker): ts.Symbol | undefined {
  if (!symbol) {
    return undefined;
  }
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }
  return symbol;
}

function findTokenAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  let result: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) {
      return;
    }
    result = node;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function isDeclarationName(node: ts.Node): boolean {
  const parent = node.parent;
  return Boolean(parent && declarationNameNode(parent) === node);
}

function classifyReference(node: ts.Node, sourceFile: ts.SourceFile, position: number): Relation {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isImportDeclaration(current) || ts.isImportEqualsDeclaration(current) || ts.isImportClause(current) || ts.isImportSpecifier(current) || ts.isNamespaceImport(current) || ts.isNamedImports(current)) {
      return "imports";
    }
    if (ts.isExportDeclaration(current) || ts.isExportSpecifier(current) || ts.isNamedExports(current)) {
      return "reexports";
    }
    if (ts.isHeritageClause(current)) {
      const token = current.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
      return token;
    }
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const expression = current.expression;
      if (position >= expression.getStart(sourceFile) && position < expression.getEnd()) {
        return "calls";
      }
    }
    current = current.parent;
  }
  return "references";
}

function enclosingNode(node: ts.Node, sourceFile: ts.SourceFile, context: ProjectContext): GraphNode {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    const named = declarationNameNode(current);
    if (named && ts.isIdentifier(named)) {
      const repoFile = context.repoPath(sourceFile.fileName);
      const range: TextRange = toRange(sourceFile.getFullText(), current.getStart(sourceFile), current.getWidth(sourceFile));
      const key = `${current.getStart(sourceFile)}:${current.getWidth(sourceFile)}:${named.text}`;
      return {
        id: symbolNodeId(context.snapshot.ref.id, repoFile, key),
        kind: "symbol",
        snapshot: context.snapshot.ref,
        file: repoFile,
        symbol: named.text,
        declaration: range,
      };
    }
    current = current.parent;
  }
  return {
    id: fileNodeId(context.snapshot.ref.id, context.repoPath(sourceFile.fileName)),
    kind: "file",
    snapshot: context.snapshot.ref,
    file: context.repoPath(sourceFile.fileName),
  };
}

function dedupeEdges(values: readonly GraphEdge[]): GraphEdge[] {
  const seen = new Map<string, GraphEdge>();
  for (const value of values) {
    seen.set(value.id, value);
  }
  return [...seen.values()].sort((a, b) => compareText(a.id, b.id));
}

function dedupeUnresolved(values: readonly UnresolvedObservation[]): UnresolvedObservation[] {
  const seen = new Map<string, UnresolvedObservation>();
  for (const value of values) {
    const range = value.range ? `${value.range.start.line}:${value.range.start.column}` : "none";
    seen.set(`${value.code}:${value.snapshot.id}:${value.file}:${range}`, value);
  }
  return [...seen.values()].sort((a, b) => compareText(`${a.file}:${a.code}`, `${b.file}:${b.code}`));
}

function capUnresolved(
  values: readonly UnresolvedObservation[],
  limit: number,
  marker: UnresolvedObservation,
  forceMarker = false,
): UnresolvedObservation[] {
  const deduped = dedupeUnresolved(values);
  if (!forceMarker && deduped.length <= limit) {
    return deduped;
  }
  const retained = deduped.slice(0, Math.max(0, limit - 1));
  return dedupeUnresolved([...retained, marker]);
}
