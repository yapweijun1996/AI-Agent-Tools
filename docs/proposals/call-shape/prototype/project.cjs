'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { ProjectIO, canonicalRoot, within } = require('./project-io.cjs');
const limits = require('./limits.cjs');
const { Refusal, refuse, validateRequest } = require('./request.cjs');
const { inspectProgram } = require('./core.cjs');

// Check resolved inputs, not all type diagnostics: an ill-typed call is still a call.
function checkResolution(program, io) {
  const requireFile = name => {
    io.tick();
    if (!name || !program.getSourceFile(name)) refuse('RESOLUTION_INCOMPLETE');
  };
  for (const file of program.getRootFileNames()) requireFile(file);
  program.forEachResolvedModule(r => requireFile(r.resolvedModule?.resolvedFileName));
  program.forEachResolvedTypeReferenceDirective(r => requireFile(r.resolvedTypeReferenceDirective?.resolvedFileName));
  program.getAutomaticTypeDirectiveResolutions().forEach(r => requireFile(r.resolvedTypeReferenceDirective?.resolvedFileName));
  for (const file of program.getSourceFiles()) {
    io.tick();
    if (program.getSyntacticDiagnostics(file).length) refuse('RESOLUTION_INCOMPLETE');
    for (const ref of file.referencedFiles) requireFile(program.getSourceFileFromReference(file, ref)?.fileName);
    for (const ref of file.libReferenceDirectives) requireFile(program.getLibFileFromReference(ref)?.fileName);
  }
  if (program.getOptionsDiagnostics().length) refuse('INVALID_INPUT');
}

function inspectProject(ts, request, outerDeadline = Infinity) {
  const deadline = Math.min(Number.isFinite(outerDeadline) ? outerDeadline : Infinity, performance.now() + limits.max_processing_ms);
  // TypeScript converts some reader exceptions into ordinary config diagnostics.
  // Preserve the original refusal rather than letting a fallback look successful.
  let failure;
  const guard = fn => (...args) => {
    if (failure) throw failure;
    try { return fn(...args); }
    catch (err) { failure = err instanceof Refusal ? err : new Refusal(err?.syscall ? 'INPUT_IO' : 'INTERNAL_ERROR'); throw failure; }
  };
  try {
    if (ts.version !== '5.8.2') refuse('UNSUPPORTED_SCOPE');
    validateRequest(request);
    const root = canonicalRoot(request.root);
    const libDir = fs.realpathSync.native(path.dirname(ts.getDefaultLibFilePath({})));
    const libraryNames = new Set(ts.libMap.values());
    for (const target of Object.values(ts.ScriptTarget).filter(v => typeof v === 'number')) {
      libraryNames.add(ts.getDefaultLibFileName({ target }));
    }
    const io = new ProjectIO(root, libDir, libraryNames, deadline);
    for (const p of [request.project, request.declaration.path]) {
      const addr = io.address(p);
      if (!addr) refuse('UNSAFE_PATH');
      const st = io.stat(addr);
      if (!st) refuse('INVALID_INPUT');
      if (!st.isFile()) refuse('UNSAFE_PATH');
    }
    if (!request.project.endsWith('.json')) refuse('INVALID_INPUT');
    const sensitive = ts.sys.useCaseSensitiveFileNames;
    const normalize = p => path.resolve(root, p).split(path.sep).join('/');
    const common = {
      getCurrentDirectory: () => root,
      readDirectory: guard((dir, ext, exclude, include, depth) => ts.matchFiles(
        dir, ext, exclude, include, sensitive, root, depth, p => io.list(p), normalize)),
      // Identity mapping is valid only for admitted nonsymlink paths; no OS realpath fallback.
      realpath: normalize,
    };
    const configPath = normalize(request.project);
    const configFiles = new Set();
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
      ...common, useCaseSensitiveFileNames: sensitive,
      fileExists: guard(p => Boolean(io.stat(io.address(p))?.isFile())),
      readFile: guard(p => {
        const text = io.read(p, 'config');
        if (text === undefined) refuse('RESOLUTION_INCOMPLETE');
        configFiles.add(p);
        if (configFiles.size > limits.max_config_files) refuse('RESOURCE_LIMIT');
        const { config, error } = ts.parseConfigFileTextToJson(p, text);
        if (error || !config || typeof config !== 'object' || Array.isArray(config)) refuse('INVALID_INPUT');
        const bases = config.extends === undefined ? [] : [].concat(config.extends);
        for (const base of bases) {
          if (typeof base !== 'string') refuse('INVALID_INPUT');
          if (!/^\.\.?\//.test(base)) refuse('UNSUPPORTED_SCOPE');
          if (!io.address(path.resolve(path.dirname(p), base))) refuse('RESOLUTION_INCOMPLETE');
        }
        return text;
      }),
      onUnRecoverableConfigFileDiagnostic: () => refuse('INVALID_INPUT'),
    }, new Map());
    if (failure) throw failure;
    if (!parsed || parsed.errors.length) {
      if (parsed?.errors.some(d => d.code === 6053)) refuse('RESOLUTION_INCOMPLETE');
      refuse('INVALID_INPUT');
    }
    const options = parsed.options;
    if (parsed.projectReferences?.length || options.allowJs || options.noResolve || options.plugins?.length) refuse('UNSUPPORTED_SCOPE');
    for (const p of [...parsed.fileNames, ...(options.rootDirs ?? []), ...(options.typeRoots ?? []), options.baseUrl].filter(Boolean)) {
      if (!within(root, path.resolve(root, p))) refuse('RESOLUTION_INCOMPLETE');
    }
    for (const targets of Object.values(options.paths ?? {})) for (const p of targets) {
      if (!within(root, path.resolve(options.baseUrl ?? options.pathsBasePath ?? root, p))) refuse('RESOLUTION_INCOMPLETE');
    }
    // Build a host explicitly. createCompilerHost has closures over ts.sys that
    // do not become guarded merely by replacing the returned host's readFile.
    const readFile = guard(p => io.read(p, 'compiler'));
    const host = {
      ...common, readFile, useCaseSensitiveFileNames: () => sensitive,
      getCanonicalFileName: ts.createGetCanonicalFileName(sensitive), getNewLine: () => '\n',
      fileExists: guard(p => Boolean(io.stat(io.address(p, true))?.isFile())),
      directoryExists: guard(p => Boolean(io.stat(io.address(p, true))?.isDirectory())),
      getDirectories: guard(p => io.address(p) ? io.list(p).directories.sort() : []),
      getDefaultLibLocation: () => libDir,
      getDefaultLibFileName: opts => path.join(libDir, ts.getDefaultLibFileName(opts)),
      getSourceFile: (p, languageVersion) => {
        const text = readFile(p);
        return text === undefined ? undefined : ts.createSourceFile(p, text, languageVersion, true);
      },
      getEnvironmentVariable: () => '', trace: () => {}, writeFile: () => refuse('UNSUPPORTED_SCOPE'),
    };
    const program = ts.createProgram({ rootNames: parsed.fileNames, host,
      options: { ...options, noEmit: true, libReplacement: false } });
    if (failure) throw failure;
    checkResolution(program, io);
    const result = inspectProgram(ts, program, { ...request, root }, deadline);
    if (failure) throw failure;
    if (result.data !== null) io.verify();
    return result;
  } catch (err) {
    const reason = failure ?? err;
    return { data: null, errorCode: reason instanceof Refusal ? reason.message :
      reason?.syscall ? 'INPUT_IO' : 'INTERNAL_ERROR' };
  }
}

module.exports = { inspectProject };
