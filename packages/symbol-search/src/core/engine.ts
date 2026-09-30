import * as ts from "typescript";
import { isTypeScriptFile } from "./extensions";
import type {
  Capabilities,
  Diagnostic,
  EngineOptions,
  FailureCode,
  Match,
  Request,
  Result,
  ResourceLimits,
  SearchRequest,
  SemanticRequest,
  SourcePosition,
  Stats,
  SymbolsRequest,
  Truncation
} from "../types";
import { DEFAULT_LIMITS } from "../types";
import { buildProject, type ProjectContext } from "./project";
import { canonicalizeRoot, isSecretLike, resolveExistingInsideRoot } from "./paths";
import {
  buildSymbolIndex,
  isDeclarationName,
  makeMatch,
  symbolAtNode,
  type DeclarationRecord,
  type SymbolIndex
} from "./symbols";
import { sortMatches } from "./ranking";
import { validateRequest, validateResult } from "./validation";

const CAPABILITIES: Capabilities = {
  schemaVersion: "1",
  languages: {
    typescript: {
      operations: {
        capabilities: "full",
        search: "full",
        symbols: "full",
        definition: "full",
        references: "full",
        implementations: "partial"
      },
      notes: [
        "Semantic evidence is provided by the TypeScript compiler API.",
        "Implementations cover explicit implements, extends, and supported abstract-method overrides only."
      ]
    },
    javascript: {
      operations: {
        capabilities: "proposed",
        search: "proposed",
        symbols: "proposed",
        definition: "proposed",
        references: "proposed",
        implementations: "proposed"
      },
      notes: ["JavaScript is a later adapter and is not shipped in V1."]
    },
    python: {
      operations: {
        capabilities: "proposed",
        search: "proposed",
        symbols: "proposed",
        definition: "proposed",
        references: "proposed",
        implementations: "proposed"
      },
      notes: ["Python is a later adapter and is not shipped in V1."]
    },
    cfml: {
      operations: {
        capabilities: "proposed",
        search: "proposed",
        symbols: "proposed",
        definition: "proposed",
        references: "proposed",
        implementations: "proposed"
      },
      notes: ["CFML is a later adapter and is not shipped in V1."]
    }
  }
};

function diagnostic(code: FailureCode, message: string, severity: Diagnostic["severity"], path?: string, details?: Record<string, unknown>): Diagnostic {
  return { code, message, severity, ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function emptyTruncation(): Truncation {
  return { truncated: false, reasons: [] };
}

function addReason(truncation: Truncation, reason: FailureCode): void {
  truncation.truncated = true;
  if (!truncation.reasons.includes(reason)) {
    truncation.reasons.push(reason);
  }
}

function dedupeDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const item of diagnostics) {
    const key = [item.code, item.path ?? "", item.message].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function errorResult(diagnostics: Diagnostic[], stats: Stats = {}): Result {
  return {
    schemaVersion: "1",
    status: "error",
    data: { matches: [] },
    diagnostics: dedupeDiagnostics(diagnostics),
    truncation: emptyTruncation(),
    stats: { ...stats, matches: 0 }
  };
}

function resultStatus(diagnostics: readonly Diagnostic[], truncation: Truncation): Result["status"] {
  if (diagnostics.some((item) => item.severity === "error")) {
    return "error";
  }
  if (truncation.truncated || diagnostics.some((item) => item.code === "PARSE_ERROR" || item.code === "PATH_OUTSIDE_ROOT" || item.code === "TIMEOUT" || item.code === "SEMANTIC_RESOLUTION_UNAVAILABLE")) {
    return "partial";
  }
  return "complete";
}

function finalize(
  context: ProjectContext,
  matches: Match[],
  extraDiagnostics: Diagnostic[],
  limit: number,
  query?: string,
  fromPath?: string,
  dataExtras?: Pick<Result["data"], "ambiguous" | "capabilities">
): Result {
  const diagnostics = dedupeDiagnostics([...context.diagnostics, ...extraDiagnostics]);
  const truncation: Truncation = {
    truncated: context.truncation.truncated,
    reasons: [...context.truncation.reasons]
  };
  const sorted = sortMatches(matches, query, fromPath);
  if (sorted.length > limit) {
    addReason(truncation, "MAX_RESULTS_REACHED");
    diagnostics.push(diagnostic("MAX_RESULTS_REACHED", `Result limit (${limit}) reached`, "warning"));
  }
  const boundedMatches = sorted.slice(0, limit);
  const stats: Stats = {
    ...context.stats,
    matches: boundedMatches.length
  };
  const result: Result = {
    schemaVersion: "1",
    status: resultStatus(diagnostics, truncation),
    data: {
      matches: boundedMatches,
      ...(dataExtras?.ambiguous !== undefined ? { ambiguous: dataExtras.ambiguous } : {}),
      ...(dataExtras?.capabilities ? { capabilities: dataExtras.capabilities } : {})
    },
    diagnostics: dedupeDiagnostics(diagnostics),
    truncation,
    stats
  };
  const validation = validateResult(result);
  if (!validation.valid) {
    return errorResult([
      diagnostic("INVALID_REQUEST", `Internal result failed schema validation: ${validation.errors.join("; ")}`, "error")
    ], stats);
  }
  return result;
}

function effectiveLimit(requestLimit: number | undefined, limits: ResourceLimits): number {
  return Math.min(requestLimit ?? limits.defaultResults, limits.maxResults);
}

function sourcePosition(context: ProjectContext, position: SourcePosition): { sourceFile?: ts.SourceFile; node?: ts.Node; constructorNode?: ts.ConstructorDeclaration; diagnostic?: Diagnostic } {
  const resolved = resolveExistingInsideRoot(context.root, position.path, "from.path");
  if ("diagnostic" in resolved) {
    return { diagnostic: resolved.diagnostic };
  }
  const sourceFile = context.sourceFilesByRelativePath.get(resolved.value.relative);
  if (!sourceFile) {
    return { diagnostic: diagnostic("UNSUPPORTED_LANGUAGE", "from.path is not a discovered TypeScript source file", "error", resolved.value.relative) };
  }
  const lineStarts = sourceFile.getLineStarts();
  if (position.line < 1 || position.line > lineStarts.length) {
    return { diagnostic: diagnostic("INVALID_REQUEST", "from.line is outside the source file", "error", resolved.value.relative) };
  }
  const lineStart = lineStarts[position.line - 1];
  const lineEnd = position.line < lineStarts.length ? lineStarts[position.line] : sourceFile.getFullText().length;
  const lineLength = Math.max(0, lineEnd - lineStart - (position.line < lineStarts.length ? 1 : 0));
  if (position.column > lineLength) {
    return { diagnostic: diagnostic("INVALID_REQUEST", "from.column is outside the source line", "error", resolved.value.relative) };
  }
  const absolutePosition = sourceFile.getPositionOfLineAndCharacter(position.line - 1, position.column);
  let node: ts.Node | undefined;
  const findInnermostNode = (candidate: ts.Node): void => {
    if (absolutePosition < candidate.getStart(sourceFile) || absolutePosition >= candidate.getEnd()) {
      return;
    }
    node = candidate;
    ts.forEachChild(candidate, findInnermostNode);
  };
  findInnermostNode(sourceFile);
  let constructor: ts.ConstructorDeclaration | undefined;
  if (node && ts.isConstructorDeclaration(node)) {
    const keyword = node.getChildren(sourceFile).find(child => child.kind === ts.SyntaxKind.ConstructorKeyword);
    if (keyword && absolutePosition >= keyword.getStart(sourceFile) && absolutePosition < keyword.getEnd()) {
      constructor = node;
    }
  }
  while (node && node !== sourceFile && !context.checker?.getSymbolAtLocation(node)) {
    node = node.parent;
  }
  if (!node) {
    return { sourceFile, constructorNode: constructor, diagnostic: diagnostic("SYMBOL_NOT_FOUND", "No resolvable symbol exists at from.path/from.line/from.column", "info", resolved.value.relative) };
  }
  return { sourceFile, node, constructorNode: constructor };
}

function recordsForQuery(index: SymbolIndex, query: string): { records: DeclarationRecord[]; symbols: Set<ts.Symbol> } {
  const candidateRecords = index.records.filter((record) => record.name === query || record.qualifiedName === query);
  const symbols = new Set<ts.Symbol>();
  for (const record of candidateRecords) {
    if (record.canonicalSymbol) {
      symbols.add(record.canonicalSymbol);
    }
  }
  const records = [...candidateRecords];
  if (symbols.size > 0) {
    for (const record of index.records) {
      if (record.canonicalSymbol && symbols.has(record.canonicalSymbol) && !records.includes(record)) {
        records.push(record);
      }
    }
  }
  return { records, symbols };
}

function targetsFromRequest(context: ProjectContext, index: SymbolIndex, request: SemanticRequest): { symbols: Set<ts.Symbol>; records: DeclarationRecord[]; fromPath?: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  if (!context.checker) {
    return { symbols: new Set(), records: [], diagnostics: [diagnostic("SEMANTIC_RESOLUTION_UNAVAILABLE", "The TypeScript type checker is unavailable", "warning")] };
  }
  if (request.from) {
    const position = sourcePosition(context, request.from);
    if (position.diagnostic && position.diagnostic.code !== "SYMBOL_NOT_FOUND") {
      return { symbols: new Set(), records: [], fromPath: request.from.path, diagnostics: [position.diagnostic] };
    }
    if (position.node) {
      const constructor = position.constructorNode
        ? index.recordByNode.get(position.constructorNode)
        : undefined;
      if (constructor?.kind === "constructor") {
        return { symbols: new Set(), records: [constructor], fromPath: request.from.path, diagnostics };
      }
      const symbol = symbolAtNode(context.checker, position.node);
      if (symbol) {
        return { symbols: new Set([symbol]), records: [], fromPath: request.from.path, diagnostics };
      }
    }
    diagnostics.push(diagnostic("SYMBOL_NOT_FOUND", `No symbol found for ${request.symbol}`, "info", request.from.path));
    return { symbols: new Set(), records: [], fromPath: request.from.path, diagnostics };
  }
  const resolved = recordsForQuery(index, request.symbol);
  if (resolved.symbols.size === 0 && resolved.records.length === 0) {
    diagnostics.push(diagnostic("SYMBOL_NOT_FOUND", `No symbol named ${request.symbol} was found`, "info"));
  }
  return { symbols: resolved.symbols, records: resolved.records, diagnostics };
}

function definitionRecords(index: SymbolIndex, symbols: Set<ts.Symbol>): DeclarationRecord[] {
  return index.records.filter((record) => Boolean(record.canonicalSymbol && symbols.has(record.canonicalSymbol) && !record.isAlias));
}

function primaryRecords(index: SymbolIndex, symbols: Set<ts.Symbol>): Map<ts.Symbol, DeclarationRecord> {
  const result = new Map<ts.Symbol, DeclarationRecord>();
  for (const record of index.records) {
    if (!record.canonicalSymbol || !symbols.has(record.canonicalSymbol) || record.isAlias || result.has(record.canonicalSymbol)) {
      continue;
    }
    result.set(record.canonicalSymbol, record);
  }
  return result;
}

function searchMatches(context: ProjectContext, index: SymbolIndex, request: SearchRequest): Match[] {
  const mode = request.match ?? "exact";
  const query = request.symbol;
  return index.records
    .filter((record) => {
      if (mode === "exact") return record.name === query || record.qualifiedName === query;
      if (query.includes(".")) return mode === "prefix" ? record.qualifiedName.startsWith(query) : record.qualifiedName.includes(query);
      return mode === "prefix" ? record.name.startsWith(query) : record.name.includes(query);
    })
    .map((record) => makeMatch(context, record, record.isAlias ? "import_alias" : "definition"));
}

function referenceMatches(
  context: ProjectContext,
  index: SymbolIndex,
  symbols: Set<ts.Symbol>,
  deadline: number
): { matches: Match[]; timedOut: boolean } {
  if (!context.checker) {
    return { matches: [], timedOut: false };
  }
  const primary = primaryRecords(index, symbols);
  const matches: Match[] = [];
  let timedOut = false;
  const visit = (node: ts.Node): void => {
    if (timedOut) return;
    if (Date.now() >= deadline) {
      timedOut = true;
      return;
    }
    const literalAccess = (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))
      && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node;
    if (ts.isIdentifier(node) || literalAccess) {
      const record = isDeclarationName(index, node);
      const symbol = symbolAtNode(context.checker!, node);
      if (symbol && symbols.has(symbol)) {
        const target = primary.get(symbol);
        const isShorthandPropertyReference = ts.isShorthandPropertyAssignment(node.parent) && node === node.parent.name;
        if (target && (!record || record.isAlias || isShorthandPropertyReference)) {
          matches.push(makeMatch(context, target, record?.isAlias ? "import_alias" : "reference", node, node, target));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const sourceFile of context.sourceFiles) {
    visit(sourceFile);
    if (timedOut) break;
  }
  return { matches, timedOut };
}

function classLikeRecord(index: SymbolIndex, node: ts.Node): DeclarationRecord | undefined {
  const record = index.recordByNode.get(node);
  return record && (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node)) ? record : undefined;
}

function parentClassLike(index: SymbolIndex, node: ts.Node): DeclarationRecord | undefined {
  let parent = node.parent;
  while (parent) {
    const record = classLikeRecord(index, parent);
    if (record) return record;
    parent = parent.parent;
  }
  return undefined;
}

type HeritageOwner = ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration;

function heritageSymbols(checker: ts.TypeChecker, node: HeritageOwner, keyword: ts.SyntaxKind): Array<{ type: ts.ExpressionWithTypeArguments; symbol?: ts.Symbol }> {
  const result: Array<{ type: ts.ExpressionWithTypeArguments; symbol?: ts.Symbol }> = [];
  for (const clause of node.heritageClauses ?? []) {
    if (clause.token !== keyword) continue;
    for (const type of clause.types) {
      result.push({ type, symbol: symbolAtNode(checker, type.expression) });
    }
  }
  return result;
}

function isClassNode(node: ts.Node): node is ts.ClassDeclaration | ts.ClassExpression {
  return ts.isClassDeclaration(node) || ts.isClassExpression(node);
}

function derivedFrom(
  context: ProjectContext,
  index: SymbolIndex,
  classNode: ts.ClassDeclaration | ts.ClassExpression,
  target: ts.Symbol,
  visiting = new Set<ts.Symbol>()
): boolean {
  if (!context.checker) return false;
  const classRecord = classLikeRecord(index, classNode);
  if (!classRecord?.canonicalSymbol || visiting.has(classRecord.canonicalSymbol)) return false;
  const nextVisiting = new Set(visiting).add(classRecord.canonicalSymbol);
  for (const heritage of heritageSymbols(context.checker, classNode, ts.SyntaxKind.ExtendsKeyword)) {
    if (heritage.symbol === target) return true;
    for (const candidateNode of index.classLikeNodes) {
      if (!isClassNode(candidateNode)) continue;
      const candidate = classLikeRecord(index, candidateNode);
      if (!candidate?.canonicalSymbol || candidate.canonicalSymbol !== heritage.symbol) continue;
      if (derivedFrom(context, index, candidateNode, target, nextVisiting)) return true;
    }
  }
  return false;
}

function isAmbientDeclaration(node: ts.Node): boolean {
  if (node.getSourceFile().isDeclarationFile) return true;
  for (let current: ts.Node | undefined = node; current && !ts.isSourceFile(current); current = current.parent) {
    if (Boolean(ts.getCombinedModifierFlags(current as ts.Declaration) & ts.ModifierFlags.Ambient)) return true;
  }
  return false;
}

function hasAbstractModifier(node: ts.Node): boolean {
  return Boolean(ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Abstract);
}

function isConcreteImplementationMember(node: ts.Node): boolean {
  if (isAmbientDeclaration(node) || hasAbstractModifier(node) || ts.isMethodSignature(node) || ts.isPropertySignature(node)) return false;
  if (ts.isMethodDeclaration(node)) return Boolean(node.body);
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return Boolean(node.body);
  if (ts.isPropertyDeclaration(node)) {
    return !Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient);
  }
  return false;
}

function isConcreteClass(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
  return !isAmbientDeclaration(node) && !hasAbstractModifier(node);
}

function memberType(checker: ts.TypeChecker, record: DeclarationRecord): ts.Type | undefined {
  try {
    return checker.getTypeAtLocation(record.nameNode ?? record.node);
  } catch {
    return undefined;
  }
}

function compatibleImplementationMember(checker: ts.TypeChecker, target: DeclarationRecord, member: DeclarationRecord): boolean {
  const targetType = memberType(checker, target);
  const memberValueType = memberType(checker, member);
  return Boolean(targetType && memberValueType && checker.isTypeAssignableTo(memberValueType, targetType));
}

function abstractMethodMatches(context: ProjectContext, index: SymbolIndex, symbols: Set<ts.Symbol>): Match[] {
  if (!context.checker) return [];
  const abstractTargets = definitionRecords(index, symbols).filter((record) => {
    const node = record.node;
    return !isAmbientDeclaration(node) && (ts.isMethodDeclaration(node) || ts.isMethodSignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && hasAbstractModifier(node);
  });
  const matches: Match[] = [];
  if (abstractTargets.length === 0) return matches;
  const classNodes = index.classLikeNodes.filter((node): node is ts.ClassDeclaration | ts.ClassExpression => isClassNode(node) && isConcreteClass(node));
  for (const target of abstractTargets) {
    const targetContainer = parentClassLike(index, target.node);
    if (!targetContainer?.canonicalSymbol) continue;
    for (const classNode of classNodes) {
      if (!derivedFrom(context, index, classNode, targetContainer.canonicalSymbol)) continue;
      const classMembers = index.records.filter((record) => record.sourceFile === classNode.getSourceFile() && parentClassLike(index, record.node)?.node === classNode && record.name === target.name && !record.isAlias);
      for (const member of classMembers) {
        if (member.node !== target.node && isConcreteImplementationMember(member.node) && compatibleImplementationMember(context.checker, target, member)) {
          matches.push(makeMatch(context, member, "implementation"));
        }
      }
    }
  }
  return matches;
}

function implementationMatches(context: ProjectContext, index: SymbolIndex, symbols: Set<ts.Symbol>): Match[] {
  if (!context.checker) return [];
  const matches: Match[] = [];
  for (const node of index.classLikeNodes) {
    if (!isClassNode(node) && !ts.isInterfaceDeclaration(node)) continue;
    const record = classLikeRecord(index, node);
    if (!record || record.isAlias || isAmbientDeclaration(node)) continue;
    for (const heritage of heritageSymbols(context.checker, node, ts.SyntaxKind.ImplementsKeyword)) {
      if (heritage.symbol && symbols.has(heritage.symbol)) {
        matches.push(makeMatch(context, record, "implementation", node, record.nameNode));
      }
    }
    for (const heritage of heritageSymbols(context.checker, node, ts.SyntaxKind.ExtendsKeyword)) {
      if (heritage.symbol && symbols.has(heritage.symbol)) {
        matches.push(makeMatch(context, record, "inheritance", node, record.nameNode));
      }
    }
  }
  matches.push(...abstractMethodMatches(context, index, symbols));
  return matches;
}

function symbolsForFile(context: ProjectContext, index: SymbolIndex, request: SymbolsRequest): { matches: Match[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const resolved = resolveExistingInsideRoot(context.root, request.path, "path");
  if ("diagnostic" in resolved) {
    return { matches: [], diagnostics: [resolved.diagnostic] };
  }
  if (isSecretLike(resolved.value.relative)) {
    return { matches: [], diagnostics: [diagnostic("INVALID_REQUEST", "Secret-like files cannot be inspected", "error", resolved.value.relative)] };
  }
  const sourceFile = context.sourceFilesByRelativePath.get(resolved.value.relative);
  if (!sourceFile) {
    const extension = resolved.value.relative.toLowerCase();
    return {
      matches: [],
      diagnostics: [diagnostic(isTypeScriptFile(extension) ? "SYMBOL_NOT_FOUND" : "UNSUPPORTED_LANGUAGE", `No TypeScript source file is available for ${request.path}`, isTypeScriptFile(extension) ? "info" : "error", resolved.value.relative)]
    };
  }
  return {
    matches: index.records.filter((record) => record.sourceFile === sourceFile).map((record) => makeMatch(context, record, record.isAlias ? "import_alias" : "definition")),
    diagnostics
  };
}

export class SymbolSearchEngine {
  private readonly limits: ResourceLimits;

  public constructor(options: EngineOptions = {}) {
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(options.limits ?? {})
    };
  }

  public execute(input: unknown): Result {
    const validation = validateRequest(input);
    if (!validation.valid || !validation.value) {
      return errorResult([
        diagnostic("INVALID_REQUEST", validation.errors.join("; ") || "Request does not match the public schema", "error")
      ]);
    }
    const request = validation.value as Request;
    if (request.operation === "capabilities") {
      const root = canonicalizeRoot(request.root);
      if ("diagnostic" in root) return errorResult([root.diagnostic]);
      return finalize({
        root: root.value,
        sourceFiles: [],
        sourceFilesByRelativePath: new Map(),
        discoveredFiles: [],
        diagnostics: [],
        truncation: emptyTruncation(),
        stats: { project: "none" },
        fatal: false
      }, [], [], this.limits.maxResults, undefined, undefined, { capabilities: CAPABILITIES });
    }

    const deadline = Date.now() + this.limits.timeoutMs;
    const context = buildProject(request.root, {
      project: "project" in request ? request.project : undefined,
      include: "include" in request ? request.include : undefined,
      exclude: "exclude" in request ? request.exclude : undefined,
      limits: this.limits,
      deadline
    });
    if (context.fatal || !context.program || !context.checker) {
      return errorResult(context.diagnostics, context.stats);
    }
    const index = buildSymbolIndex(context, deadline);
    if (index.timedOut || Date.now() >= deadline) {
      addReason(context.truncation, "TIMEOUT");
      context.diagnostics.push(diagnostic("TIMEOUT", "The cooperative search deadline was reached", "warning"));
    }

    if (request.operation === "search") {
      const matches = searchMatches(context, index, request);
      const extra = matches.length === 0 ? [diagnostic("SYMBOL_NOT_FOUND", `No declaration named ${request.symbol} was found`, "info")] : [];
      return finalize(context, matches, extra, effectiveLimit(request.limit, this.limits), request.symbol);
    }
    if (request.operation === "symbols") {
      const result = symbolsForFile(context, index, request);
      return finalize(context, result.matches, result.diagnostics, effectiveLimit(request.limit, this.limits), undefined);
    }

    const semanticRequest = request as SemanticRequest;
    const target = targetsFromRequest(context, index, semanticRequest);
    if (semanticRequest.operation === "definition") {
      const definitions = target.symbols.size > 0
        ? definitionRecords(index, target.symbols)
        : target.records.filter((record) => !record.isAlias);
      const diagnostics = [...target.diagnostics];
      const ambiguous = definitions.length > 1;
      if (ambiguous) {
        diagnostics.push(diagnostic("AMBIGUOUS_SYMBOL", `Multiple definitions matched ${semanticRequest.symbol}; all bounded definitions are returned`, "warning"));
      }
      if (definitions.length === 0 && target.symbols.size > 0) {
        diagnostics.push(diagnostic("SEMANTIC_RESOLUTION_UNAVAILABLE", `No in-repository definition is available for ${semanticRequest.symbol}`, "warning"));
      }
      if (definitions.length === 0 && target.symbols.size === 0 && !diagnostics.some((item) => item.code === "SYMBOL_NOT_FOUND")) {
        diagnostics.push(diagnostic("SYMBOL_NOT_FOUND", `No definition matched ${semanticRequest.symbol}`, "info"));
      }
      return finalize(context, definitions.map((record) => makeMatch(context, record, "definition")), diagnostics, effectiveLimit(semanticRequest.limit, this.limits), semanticRequest.symbol, target.fromPath, { ambiguous: ambiguous || undefined });
    }
    if (semanticRequest.operation === "references") {
      const references = referenceMatches(context, index, target.symbols, deadline);
      const diagnostics = [...target.diagnostics];
      if (references.timedOut) {
        addReason(context.truncation, "TIMEOUT");
        diagnostics.push(diagnostic("TIMEOUT", "The cooperative search deadline was reached", "warning"));
      }
      if (references.matches.length === 0 && target.symbols.size > 0) {
        diagnostics.push(diagnostic("SYMBOL_NOT_FOUND", `No references were found for ${semanticRequest.symbol}`, "info"));
      }
      return finalize(context, references.matches, diagnostics, effectiveLimit(semanticRequest.limit, this.limits), semanticRequest.symbol, target.fromPath);
    }

    const implementations = implementationMatches(context, index, target.symbols);
    const diagnostics = [...target.diagnostics];
    if (implementations.length === 0 && target.symbols.size > 0) {
      diagnostics.push(diagnostic("SEMANTIC_RESOLUTION_UNAVAILABLE", "No explicit implementation or inheritance relationship was found; structural and dynamic relationships are outside V1", "warning"));
    }
    return finalize(context, implementations, diagnostics, effectiveLimit(semanticRequest.limit, this.limits), semanticRequest.symbol, target.fromPath);
  }

  public getCapabilities(root: string): Result {
    return this.execute({ operation: "capabilities", root });
  }

  public getLimits(): ResourceLimits {
    return { ...this.limits };
  }
}

export function getCapabilitiesData(): Capabilities {
  return JSON.parse(JSON.stringify(CAPABILITIES)) as Capabilities;
}
