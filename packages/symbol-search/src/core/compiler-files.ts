import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import * as ts from "typescript";
import type { Diagnostic, ResourceLimits, Truncation } from "../types";
import { readBoundedText } from "./bounded-reader";
import { isTypeScriptFile } from "./extensions";
import { isInsideRoot, isSecretLike, repositoryRelative, type RootInfo } from "./paths";

/** One read authority for configuration, package metadata, and compiler source files. */
export class CompilerFiles {
  public bytesRead = 0;
  public filesRead = 0;
  private readonly contents = new Map<string, string | undefined>();
  private readonly reported = new Set<string>();
  private readonly packageRoots: string[] = [];
  private readonly linkChecks = new Map<string, boolean>();
  private readonly libraryRoot = realpathSync.native(dirname(ts.getDefaultLibFilePath({})));

  public constructor(
    private readonly root: RootInfo,
    private readonly sources: ReadonlySet<string>,
    private readonly limits: ResourceLimits,
    private readonly diagnostics: Diagnostic[],
    private readonly truncation: Truncation,
    private readonly project?: string,
    private readonly deadline = Number.POSITIVE_INFINITY
  ) {
    let directory = root.absolute;
    while (true) {
      this.packageRoots.push(join(directory, "node_modules"));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }

  private report(path: string, code: Diagnostic["code"], message: string): void {
    const key = `${path}:${code}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.diagnostics.push({ code, message, severity: "warning", ...(this.project ? { path: this.project } : {}) });
    if (code === "MAX_BYTES_REACHED" || code === "MAX_FILES_REACHED" || code === "TIMEOUT") {
      this.truncation.truncated = true;
      if (!this.truncation.reasons.includes(code)) this.truncation.reasons.push(code);
    }
  }

  private hasSymlink(path: string, anchor: string): boolean {
    if (path === anchor) return false;
    const cached = this.linkChecks.get(path);
    if (cached !== undefined) return cached;
    const linked = lstatSync(path).isSymbolicLink() || this.hasSymlink(dirname(path), anchor);
    this.linkChecks.set(path, linked);
    return linked;
  }

  private allowed(fileName: string, configuration: boolean): string | undefined {
    const path = resolve(fileName);
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() && !stat.isSymbolicLink()) return undefined;
      const canonical = realpathSync.native(path);
      const packageRoot = this.packageRoots.find(directory => isInsideRoot(directory, path));
      const standardLibrary = dirname(path) === this.libraryRoot && /^lib(?:\..+)?\.d\.ts$/.test(basename(path));
      const libraryMetadata = path === join(dirname(this.libraryRoot), "package.json");
      const anchor = standardLibrary || libraryMetadata ? dirname(this.libraryRoot) : packageRoot ? dirname(packageRoot) : this.root.absolute;
      const inside = isInsideRoot(this.root.absolute, path) && isInsideRoot(this.root.absolute, canonical);
      const dependency = standardLibrary || libraryMetadata || Boolean(packageRoot && isInsideRoot(packageRoot, canonical));
      const supported = isTypeScriptFile(path) || basename(path) === "package.json" || (configuration && path.endsWith(".json"));
      const admitted = dependency || (inside && (this.sources.has(path) || basename(path) === "package.json" || (configuration && path.endsWith(".json"))));
      if ((!inside && !dependency) || !isInsideRoot(anchor, canonical)) {
        this.report(path, "PATH_OUTSIDE_ROOT", "A compiler dependency outside the permitted root/package boundaries was excluded");
        return undefined;
      }
      const relative = repositoryRelative(anchor, path);
      if (!supported || !admitted || relative.split("/").includes(".git") || isSecretLike(relative) || isSecretLike(repositoryRelative(anchor, canonical)) || this.hasSymlink(path, anchor)) {
        this.report(path, "SEMANTIC_RESOLUTION_UNAVAILABLE", "A compiler dependency excluded by source, secret, or symlink policy was not read");
        return undefined;
      }
      return canonical;
    } catch {
      return undefined;
    }
  }

  public fileExists(fileName: string): boolean {
    return this.allowed(fileName, false) !== undefined;
  }

  public readFile(fileName: string, configuration = false): string | undefined {
    const path = this.allowed(fileName, configuration);
    if (!path) return undefined;
    if (this.contents.has(path)) return this.contents.get(path);
    this.contents.set(path, undefined);
    if (Date.now() >= this.deadline) {
      this.report(path, "TIMEOUT", "The cooperative compiler read deadline was reached");
      return undefined;
    }
    if (this.filesRead >= this.limits.maxFiles) {
      this.report(path, "MAX_FILES_REACHED", "The compiler file-read budget was reached");
      return undefined;
    }
    this.filesRead += 1;
    const result = readBoundedText(path, Math.min(this.limits.maxSingleFileBytes, this.limits.maxParsedBytes - this.bytesRead));
    this.bytesRead += result.bytes;
    if ("reason" in result) {
      this.report(path, result.reason === "size" ? "MAX_BYTES_REACHED" : "PARSE_ERROR", "A compiler file could not be read within the configured byte budget");
      return undefined;
    }
    this.contents.set(path, result.text);
    return result.text;
  }

  public createHost(options: ts.CompilerOptions): ts.CompilerHost {
    const host = ts.createCompilerHost(options, true);
    host.getCurrentDirectory = () => this.root.absolute;
    // Node can load TypeScript through a Windows short path; use one canonical library identity.
    host.getDefaultLibLocation = () => this.libraryRoot;
    host.getDefaultLibFileName = compilerOptions => join(this.libraryRoot, ts.getDefaultLibFileName(compilerOptions));
    host.fileExists = path => this.fileExists(path);
    host.readFile = path => this.readFile(path);
    // The default getSourceFile closes over an unguarded reader, so replace it too.
    host.getSourceFile = (path, languageVersion) => {
      const text = this.readFile(path);
      return text === undefined ? undefined : ts.createSourceFile(path, text, languageVersion, true);
    };
    return host;
  }
}
