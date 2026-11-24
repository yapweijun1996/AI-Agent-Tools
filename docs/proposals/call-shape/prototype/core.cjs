'use strict';

// Prototype over an already admitted Program. Project loading is not part of this API.
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { Refusal, refuse, validateRequest } = require('./request.cjs');
const limits = require('./limits.cjs');

function locate(file, node, relativePath) {
  const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
  return { path: relativePath, line: line + 1, column: character + 1 };
}

function targetName(ts, file, { line, column }) {
  const starts = file.getLineStarts();
  if (line > starts.length) refuse('INVALID_INPUT');
  const offset = starts[line - 1] + column - 1;
  if (offset >= (starts[line] ?? file.end)) refuse('INVALID_INPUT');
  const name = ts.getTokenAtPosition(file, offset);
  if (!ts.isIdentifier(name) || offset < name.getStart(file) || offset >= name.end ||
      !ts.isDeclaration(name.parent) || name.parent.name !== name) refuse('INVALID_INPUT');
  if (!ts.isFunctionDeclaration(name.parent)) refuse('UNSUPPORTED_SCOPE');
  return name;
}

function classify(ts, args, slot, field) {
  for (let i = 0; i < Math.min(slot, args.length); i++) {
    if (ts.isSpreadElement(args[i])) return ['unknown', 'argument_spread'];
  }
  let arg = args[slot - 1];
  if (!arg) return ['missing', 'argument_omitted'];
  while (ts.isParenthesizedExpression(arg) || ts.isAsExpression(arg) || ts.isSatisfiesExpression(arg) ||
         ts.isTypeAssertionExpression(arg) || ts.isNonNullExpression(arg)) arg = arg.expression;
  if (!ts.isObjectLiteralExpression(arg)) return ['unknown', 'not_object_literal'];

  let spread = false, computed = false;
  for (const member of arg.properties) {
    if (ts.isSpreadAssignment(member)) { spread = true; continue; }
    let key = member.name;
    if (ts.isComputedPropertyName(key)) {
      key = key.expression;
      if (!ts.isStringLiteral(key)) { computed = true; continue; }
    }
    if (key.text === field) return ['present', 'explicit_key'];
  }
  if (spread) return ['unknown', 'object_spread'];
  if (computed) return ['unknown', 'computed_key'];
  return ['missing', 'literal_without_key'];
}

function inspect(ts, program, request, deadline) {
  if (ts.version !== '5.8.2') refuse('UNSUPPORTED_SCOPE');
  validateRequest(request);
  const { root, project, declaration, argument, field } = request;
  if (!path.isAbsolute(root)) refuse('INVALID_INPUT');
  const targetPath = path.resolve(root, declaration.path);
  const configPath = path.resolve(root, project);
  const configured = program.getCompilerOptions().configFilePath;
  if (!configured || path.relative(configPath, path.resolve(program.getCurrentDirectory(), configured)) !== '') refuse('INVALID_INPUT');
  if (program.getProjectReferences()?.length) refuse('UNSUPPORTED_SCOPE');

  const checkTime = () => { if (performance.now() >= deadline) refuse('RESOURCE_LIMIT'); };
  const sources = new Map();
  for (const file of program.getSourceFiles()) {
    checkTime();
    if (file.isDeclarationFile) continue;
    const rel = path.relative(root, path.resolve(program.getCurrentDirectory(), file.fileName)).split(path.sep).join('/');
    if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel) || !/\.(?:ts|tsx|cts|mts)$/.test(rel)) refuse('UNSUPPORTED_SCOPE');
    if (program.getSyntacticDiagnostics(file).length) refuse('RESOLUTION_INCOMPLETE');
    sources.set(file, rel);
  }
  const file = program.getSourceFile(targetPath);
  if (!file) refuse('INVALID_INPUT');
  if (!sources.has(file)) refuse('UNSUPPORTED_SCOPE');
  const checker = program.getTypeChecker();
  const name = targetName(ts, file, declaration);
  const target = checker.getSymbolAtLocation(name);
  if (!target?.declarations?.length) refuse('RESOLUTION_INCOMPLETE');
  if (target.declarations.length !== 1) refuse('AMBIGUOUS_TARGET');
  if (!name.parent.body || name.parent.flags & ts.NodeFlags.Ambient) refuse('UNSUPPORTED_SCOPE');

  const calls = [], counts = { present: 0, missing: 0, unknown: 0 };
  let rowBytes = 0;
  for (const [source, rel] of sources) {
    function visit(node, depth) {
      checkTime();
      if (depth > limits.max_depth) refuse('RESOURCE_LIMIT');
      if (ts.isCallExpression(node)) {
        let callee = node.expression;
        while (ts.isParenthesizedExpression(callee)) callee = callee.expression;
        if (ts.isIdentifier(callee)) {
          let symbol = checker.getSymbolAtLocation(callee);
          if (symbol && (symbol.flags & ts.SymbolFlags.Alias)) symbol = checker.getAliasedSymbol(symbol);
          if (!symbol?.declarations?.length) refuse('RESOLUTION_INCOMPLETE');
          if (symbol === target) {
            if (calls.length >= limits.max_matching_calls) refuse('RESOURCE_LIMIT');
            const [classification, reason] = classify(ts, node.arguments, argument, field);
            const row = { ...locate(source, callee, rel), classification, reason };
            rowBytes += Buffer.byteLength(JSON.stringify(row));
            if (rowBytes > limits.max_output_bytes) refuse('RESOURCE_LIMIT');
            calls.push(row);
            counts[classification]++;
          }
        }
      }
      ts.forEachChild(node, child => visit(child, depth + 1));
    }
    visit(source, 0);
  }
  calls.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0) || a.line - b.line || a.column - b.column);
  const data = { project, declaration: locate(file, name, sources.get(file)), argument, field, counts, calls };
  // The CLI also checks the entire serialized envelope including LF.
  if (Buffer.byteLength(JSON.stringify(data)) + 1 > limits.max_output_bytes) refuse('RESOURCE_LIMIT');
  checkTime();
  return data;
}

function inspectProgram(ts, program, request, deadline = Infinity) {
  try { return { data: inspect(ts, program, request, Math.min(deadline, performance.now() + limits.max_processing_ms)), errorCode: null }; }
  catch (err) { return { data: null, errorCode: err instanceof Refusal ? err.message : 'INTERNAL_ERROR' }; }
}

module.exports = { inspectProgram };
