import { createHash } from "node:crypto";
import * as ts from "typescript";
import type { Match, Relation, SourceRange, SymbolKind } from "../types";
import type { ProjectContext } from "./project";
import { repositoryRelative } from "./paths";

export interface DeclarationRecord {
  node: ts.Node;
  nameNode?: ts.Node;
  sourceFile: ts.SourceFile;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  container?: string;
  signature: string;
  symbol?: ts.Symbol;
  canonicalSymbol?: ts.Symbol;
  isAlias: boolean;
  exported?: boolean;
  symbolId: string;
}

export interface SymbolIndex {
  records: DeclarationRecord[];
  recordByNode: Map<ts.Node, DeclarationRecord>;
  recordByNameNode: Map<ts.Node, DeclarationRecord>;
  recordsBySymbol: Map<ts.Symbol, DeclarationRecord[]>;
  classLikeNodes: Array<ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration>;
  timedOut: boolean;
}

function declarationKind(node: ts.Node): { kind: SymbolKind; isAlias: boolean } | undefined {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) return { kind: "class", isAlias: false };
  if (ts.isInterfaceDeclaration(node)) return { kind: "interface", isAlias: false };
  if (ts.isTypeAliasDeclaration(node)) return { kind: "type", isAlias: false };
  if (ts.isEnumDeclaration(node)) return { kind: "enum", isAlias: false };
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) return { kind: "function", isAlias: false };
  if (ts.isModuleDeclaration(node)) return { kind: "namespace", isAlias: false };
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return { kind: "method", isAlias: false };
  if (ts.isConstructorDeclaration(node)) return { kind: "constructor", isAlias: false };
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return { kind: "method", isAlias: false };
  if (ts.isPropertyDeclaration(node)) return { kind: "field", isAlias: false };
  if (ts.isPropertySignature(node)) return { kind: "property", isAlias: false };
  if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) return { kind: "property", isAlias: false };
  if (ts.isVariableDeclaration(node)) {
    const statement = node.parent.parent;
    const isConst = ts.isVariableStatement(statement) && Boolean(statement.declarationList.flags & ts.NodeFlags.Const);
    return { kind: isConst ? "constant" : "variable", isAlias: false };
  }
  if (ts.isBindingElement(node)) return { kind: "variable", isAlias: false };
  if (ts.isParameter(node)) return { kind: "parameter", isAlias: false };
  if (ts.isEnumMember(node)) return { kind: "constant", isAlias: false };
  if (ts.isImportClause(node) && node.name) return { kind: "variable", isAlias: true };
  if (ts.isNamespaceImport(node)) return { kind: "variable", isAlias: true };
  if (ts.isImportSpecifier(node)) return { kind: "variable", isAlias: true };
  if (ts.isImportEqualsDeclaration(node)) return { kind: "variable", isAlias: true };
  if (ts.isExportSpecifier(node)) return { kind: "variable", isAlias: true };
  return undefined;
}

function nodeNameNode(node: ts.Node): ts.Node | undefined {
  if (ts.isConstructorDeclaration(node)) {
    return node.getChildren(node.getSourceFile()).find((child) => child.kind === ts.SyntaxKind.ConstructorKeyword);
  }
  if (ts.isImportClause(node)) return node.name ?? undefined;
  if (ts.isNamespaceImport(node) || ts.isImportSpecifier(node) || ts.isImportEqualsDeclaration(node) || ts.isExportSpecifier(node)) return node.name;
  if ("name" in node) {
    const name = (node as ts.NamedDeclaration).name;
    if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) {
      return name;
    }
  }
  return undefined;
}

function nodeName(node: ts.Node, nameNode: ts.Node | undefined): string | undefined {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (nameNode && (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode))) {
    return nameNode.text;
  }
  if (isDefaultExport(node)) {
    return "default";
  }
  return undefined;
}

function isDefaultExport(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword));
}

function parentDeclarationName(node: ts.Node, recordByNode: Map<ts.Node, DeclarationRecord>): string | undefined {
  let parent = node.parent;
  while (parent) {
    const record = recordByNode.get(parent);
    if (record && !record.isAlias) {
      return record.name;
    }
    parent = parent.parent;
  }
  return undefined;
}

function qualifiedName(node: ts.Node, name: string, recordByNode: Map<ts.Node, DeclarationRecord>): string {
  const parents: string[] = [];
  let parent = node.parent;
  while (parent) {
    const record = recordByNode.get(parent);
    if (record && !record.isAlias) {
      parents.push(record.name);
    }
    parent = parent.parent;
  }
  return [...parents.reverse(), name].join(".");
}

function stripComments(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

function declarationBodyStart(node: ts.Node): number | undefined {
  if ("body" in node) {
    const body = (node as { body?: ts.Node }).body;
    if (body) return body.getStart(node.getSourceFile());
  }
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) {
    const openBrace = node.getChildren(node.getSourceFile()).find((child) => child.kind === ts.SyntaxKind.OpenBraceToken);
    if (openBrace) return openBrace.getStart(node.getSourceFile());
  }
  return undefined;
}

function normalizedSignature(node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  const nodeStart = node.getStart(sourceFile);
  const bodyStart = declarationBodyStart(node);
  const rawText = bodyStart === undefined ? node.getText(sourceFile) : sourceFile.text.slice(nodeStart, bodyStart);
  let text = stripComments(rawText).replace(/\s+/g, " ").trim();
  if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
    const initializerStart = text.indexOf("=");
    if (initializerStart >= 0) {
      text = text.slice(0, initializerStart).trim();
    }
  }
  return text.replace(/;$/, "").trim() || node.kind.toString();
}

function exportedState(node: ts.Node): boolean | undefined {
  let current: ts.Node | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (ts.canHaveModifiers(current)) {
      const modifiers = ts.getModifiers(current);
      if (modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        return true;
      }
    }
    if (ts.isVariableDeclaration(current) || ts.isVariableDeclarationList(current) || ts.isBindingElement(current) || ts.isObjectBindingPattern(current) || ts.isArrayBindingPattern(current)) {
      current = current.parent;
      continue;
    }
    break;
  }
  return false;
}

function classExpressionVariableOwner(node: ts.ClassExpression): ts.VariableDeclaration | undefined {
  let parent: ts.Node | undefined = node.parent;
  while (parent && !ts.isSourceFile(parent)) {
    if (ts.isVariableDeclaration(parent) && parent.initializer && parent.initializer.getStart() <= node.getStart() && parent.initializer.getEnd() >= node.getEnd()) {
      return parent;
    }
    parent = parent.parent;
  }
  return undefined;
}

function positionFor(sourceFile: ts.SourceFile, position: number): { line: number; column: number } {
  const result = sourceFile.getLineAndCharacterOfPosition(Math.max(0, Math.min(position, sourceFile.getFullText().length)));
  return { line: result.line + 1, column: result.character };
}

export function rangeForNode(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  return {
    start: positionFor(sourceFile, node.getStart(sourceFile)),
    end: positionFor(sourceFile, node.getEnd())
  };
}

function identityFor(root: ProjectContext["root"], record: Pick<DeclarationRecord, "qualifiedName" | "kind" | "signature" | "sourceFile" | "symbolId">): string {
  if (record.symbolId) {
    return record.symbolId;
  }
  const relative = repositoryRelative(root.absolute, record.sourceFile.fileName);
  return `sha256-v1:${createHash("sha256").update(["symbol-id-v1", "typescript", relative, record.qualifiedName, record.kind, record.signature].join("\n"), "utf8").digest("hex")}`;
}

export function makeMatch(
  context: ProjectContext,
  record: DeclarationRecord,
  relation: Relation,
  rangeNode: ts.Node = record.node,
  nameRangeNode?: ts.Node,
  identityRecord: DeclarationRecord = record
): Match {
  const locationSourceFile = rangeNode.getSourceFile();
  const path = repositoryRelative(context.root.absolute, locationSourceFile.fileName);
  const match: Match = {
    symbolId: identityFor(context.root, identityRecord),
    name: record.name,
    qualifiedName: record.qualifiedName,
    kind: record.kind,
    relation,
    language: "typescript",
    path,
    range: rangeForNode(locationSourceFile, rangeNode),
    resolver: "typescript-semantic",
    confidence: "confirmed"
  };
  const nameNode = nameRangeNode ?? (rangeNode === record.node ? record.nameNode : undefined);
  if (nameNode) {
    match.nameRange = rangeForNode(locationSourceFile, nameNode);
  }
  if (record.container) {
    match.container = record.container;
  }
  if (record.exported !== undefined) {
    match.exported = record.exported;
  }
  return match;
}

export function canonicalSymbol(checker: ts.TypeChecker, symbol: ts.Symbol | undefined): ts.Symbol | undefined {
  if (!symbol) {
    return undefined;
  }
  try {
    let current: ts.Symbol = symbol;
    const seen = new Set<ts.Symbol>();
    while (!seen.has(current)) {
      seen.add(current);
      const resolved: ts.Symbol = current.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(current) : current;
      const roots = checker.getRootSymbols(resolved);
      // A union member can have multiple roots; never choose an arbitrary declaration.
      const next: ts.Symbol = roots.length === 1 ? roots[0] : resolved;
      if (next === current) break;
      current = next;
    }
    return current;
  } catch {
    return symbol;
  }
}

export function symbolAtNode(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
  const shorthand = ts.isShorthandPropertyAssignment(node)
    ? node
    : ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? node.parent
      : undefined;
  const symbol = shorthand
    ? checker.getShorthandAssignmentValueSymbol(shorthand) ?? checker.getSymbolAtLocation(node)
    : checker.getSymbolAtLocation(node);
  return canonicalSymbol(checker, symbol);
}

function effectivelyExported(checker: ts.TypeChecker, record: DeclarationRecord): boolean {
  const target = record.canonicalSymbol;
  if (!target) return false;
  const moduleSymbol = checker.getSymbolAtLocation(record.sourceFile);
  if (!moduleSymbol) return false;
  try {
    return checker.getExportsOfModule(moduleSymbol).some((exported) => canonicalSymbol(checker, exported) === target);
  } catch {
    return false;
  }
}

export function buildSymbolIndex(context: ProjectContext, deadline = Number.POSITIVE_INFINITY): SymbolIndex {
  const records: DeclarationRecord[] = [];
  const recordByNode = new Map<ts.Node, DeclarationRecord>();
  const recordByNameNode = new Map<ts.Node, DeclarationRecord>();
  const classLikeNodes: Array<ts.ClassDeclaration | ts.ClassExpression | ts.InterfaceDeclaration> = [];
  let timedOut = false;

  const visit = (node: ts.Node): void => {
    if (Date.now() >= deadline) {
      timedOut = true;
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node)) {
      classLikeNodes.push(node);
    }
    const kind = declarationKind(node);
    const nameNode = nodeNameNode(node);
    const name = kind ? nodeName(node, nameNode) : undefined;
    if (kind && name) {
      const sourceFile = node.getSourceFile();
      const record: DeclarationRecord = {
        node,
        nameNode,
        sourceFile,
        name,
        qualifiedName: "",
        kind: kind.kind,
        signature: normalizedSignature(node),
        isAlias: kind.isAlias,
        exported: exportedState(node),
        symbolId: ""
      };
      recordByNode.set(node, record);
      if (nameNode) {
        recordByNameNode.set(nameNode, record);
      }
      records.push(record);
    }
    ts.forEachChild(node, visit);
  };

  for (const sourceFile of context.sourceFiles) {
    visit(sourceFile);
  }

  const syntheticClassRecords: Array<{ record: DeclarationRecord; owner: DeclarationRecord }> = [];
  for (const classNode of classLikeNodes) {
    if (!ts.isClassExpression(classNode) || recordByNode.has(classNode)) continue;
    const ownerNode = classExpressionVariableOwner(classNode);
    const owner = ownerNode ? recordByNode.get(ownerNode) : undefined;
    if (!owner) continue;
    const synthetic: DeclarationRecord = {
      ...owner,
      node: classNode,
      sourceFile: classNode.getSourceFile(),
      kind: "class",
      container: parentDeclarationName(owner.node, recordByNode),
      qualifiedName: qualifiedName(owner.node, owner.name, recordByNode),
      signature: normalizedSignature(classNode)
    };
    recordByNode.set(classNode, synthetic);
    syntheticClassRecords.push({ record: synthetic, owner });
  }

  for (const record of records) {
    record.container = parentDeclarationName(record.node, recordByNode);
    record.qualifiedName = qualifiedName(record.node, record.name, recordByNode);
    if (context.checker && !ts.isConstructorDeclaration(record.node)) {
      const location = record.nameNode ?? record.node;
      record.symbol = context.checker.getSymbolAtLocation(location) ?? undefined;
      record.canonicalSymbol = canonicalSymbol(context.checker, record.symbol);
      record.exported = record.exported || effectivelyExported(context.checker, record);
    }
    record.symbolId = `sha256-v1:${createHash("sha256").update([
      "symbol-id-v1",
      "typescript",
      repositoryRelative(context.root.absolute, sourceFilePath(record.sourceFile)),
      record.qualifiedName,
      record.kind,
      record.signature
    ].join("\n"), "utf8").digest("hex")}`;
  }

  for (const { record, owner } of syntheticClassRecords) {
    record.symbol = owner.symbol;
    record.canonicalSymbol = owner.canonicalSymbol;
    record.symbolId = owner.symbolId;
  }

  for (const classNode of classLikeNodes) {
    if (!ts.isClassDeclaration(classNode) && !ts.isClassExpression(classNode)) continue;
    const classRecord = recordByNode.get(classNode);
    if (!classRecord || classRecord.kind !== "class") continue;
    const hasExplicitConstructor = records.some((record) => ts.isConstructorDeclaration(record.node) && parentClassLikeNode(record.node) === classNode);
    if (hasExplicitConstructor) continue;
    records.push({
      node: classNode,
      sourceFile: classNode.getSourceFile(),
      name: "constructor",
      qualifiedName: `${classRecord.qualifiedName}.constructor`,
      kind: "constructor",
      container: classRecord.name,
      signature: "constructor()",
      isAlias: false,
      exported: false,
      symbolId: `sha256-v1:${createHash("sha256").update([
        "symbol-id-v1",
        "typescript",
        repositoryRelative(context.root.absolute, sourceFilePath(classNode.getSourceFile())),
        `${classRecord.qualifiedName}.constructor`,
        "constructor",
        "constructor()"
      ].join("\n"), "utf8").digest("hex")}`
    });
  }

  records.sort((left, right) => {
    const leftPath = repositoryRelative(context.root.absolute, sourceFilePath(left.sourceFile));
    const rightPath = repositoryRelative(context.root.absolute, sourceFilePath(right.sourceFile));
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : left.node.getStart() - right.node.getStart();
  });
  const recordsBySymbol = new Map<ts.Symbol, DeclarationRecord[]>();
  for (const record of records) {
    if (!record.canonicalSymbol) {
      continue;
    }
    const existing = recordsBySymbol.get(record.canonicalSymbol) ?? [];
    existing.push(record);
    recordsBySymbol.set(record.canonicalSymbol, existing);
  }
  return { records, recordByNode, recordByNameNode, recordsBySymbol, classLikeNodes, timedOut };
}

function parentClassLikeNode(node: ts.Node): ts.ClassDeclaration | ts.ClassExpression | undefined {
  let parent = node.parent;
  while (parent) {
    if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) return parent;
    parent = parent.parent;
  }
  return undefined;
}

function sourceFilePath(sourceFile: ts.SourceFile): string {
  return sourceFile.fileName;
}

export function declarationRecordsForSymbol(index: SymbolIndex, symbol: ts.Symbol | undefined): DeclarationRecord[] {
  return symbol ? (index.recordsBySymbol.get(symbol) ?? []) : [];
}

export function isDeclarationName(index: SymbolIndex, node: ts.Node): DeclarationRecord | undefined {
  return index.recordByNameNode.get(node);
}
