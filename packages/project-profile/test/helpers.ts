import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateProfileSemantics } from "../src/core/semantic.js";
import type { FixtureDefinition } from "./fixtures.js";
import type { Profile } from "../src/types.js";

const require = createRequire(import.meta.url);
type AjvValidator = { errors?: unknown[]; (value: unknown): boolean };
type AjvConstructor = new (options?: object) => { compile: (schema: object) => AjvValidator };
const Ajv = (require("ajv/dist/2020.js") as { default: AjvConstructor }).default;

export interface TemporaryFixture {
  root: string;
  dispose: () => void;
}

export function materializeFixture(fixture: FixtureDefinition): TemporaryFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-"));
  for (const [relativePath, contents] of Object.entries(fixture.files)) writeFile(root, relativePath, contents);
  fixture.populate?.(root);
  return { root, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function writeFile(root: string, relativePath: string, contents: string): void {
  const target = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

export function hashTree(root: string): string {
  const files: string[] = [];
  collectFiles(root, root, files);
  files.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const hash = crypto.createHash("sha256");
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, ...relativePath.split("/"))));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function validateWithSchema(profile: Profile): void {
  const schemaPath = path.resolve(process.cwd(), "schema/profile.schema.json");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  assert(validate(profile), `JSON Schema validation failed: ${JSON.stringify(validate.errors)}`);
  assert(validateProfileSemantics(profile).length === 0, `Semantic validation failed: ${validateProfileSemantics(profile).join(", ")}`);
}

export function runCli(root: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  const cli = path.resolve(process.cwd(), "dist/bin.js");
  const result = spawnSync(process.execPath, [cli, root, ...args], { encoding: "utf8" });
  return { status: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

export function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectFiles(root: string, current: string, files: string[]): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) collectFiles(root, absolute, files);
    else if (entry.isFile()) files.push(relative);
  }
}
