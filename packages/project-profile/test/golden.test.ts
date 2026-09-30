import { test } from "node:test";
import { profileRepository } from "../src/index.js";
import { FIXTURES } from "./fixtures.js";
import { assert, hashTree, materializeFixture, uniqueSorted, validateWithSchema } from "./helpers.js";

for (const fixture of FIXTURES) {
  test(`golden: ${fixture.id}`, () => {
    const temporary = materializeFixture(fixture);
    try {
      const before = hashTree(temporary.root);
      const readBodies: string[] = [];
      const profile = profileRepository(temporary.root, {
        accessObserver: (event) => {
          if (event.operation === "read-body") readBodies.push(event.path);
        },
      });
      const after = hashTree(temporary.root);
      assert(before === after, `${fixture.id} changed the target tree`);
      validateWithSchema(profile);
      assert(profile.status === fixture.expected.status, `${fixture.id} status mismatch: ${profile.status}`);
      assert(profile.project.kind === fixture.expected.projectKind, `${fixture.id} project kind mismatch`);
      assert(profile.packageManager.name === fixture.expected.packageManager.name, `${fixture.id} manager mismatch`);
      assert(profile.packageManager.version === fixture.expected.packageManager.version, `${fixture.id} manager version mismatch`);
      assert(profile.packageManager.invocationAvailable === fixture.expected.packageManager.invocationAvailable, `${fixture.id} invocation mismatch`);
      assert(profile.ecosystems.map((ecosystem) => ecosystem.name).join("\0") === fixture.expected.ecosystems.join("\0"), `${fixture.id} ecosystem mismatch`);
      assert(uniqueSorted(profile.warnings.map((warning) => warning.code)).join("\0") === uniqueSorted(fixture.expected.warningCodes).join("\0"), `${fixture.id} warning mismatch: ${profile.warnings.map((warning) => warning.code).join(",")}`);
      if (fixture.expected.workspace !== undefined) {
        assert(profile.workspace.returned === fixture.expected.workspace.returned, `${fixture.id} workspace returned mismatch`);
        assert(profile.workspace.total === fixture.expected.workspace.total, `${fixture.id} workspace total mismatch`);
        assert(profile.workspace.truncated === fixture.expected.workspace.truncated, `${fixture.id} workspace truncation mismatch`);
        assert(profile.workspace.packages.map((item) => item.path).join("\0") === fixture.expected.workspace.paths.join("\0"), `${fixture.id} workspace paths mismatch`);
      }
      const serialized = JSON.stringify(profile);
      assert(!serialized.includes("CANARY_"), `${fixture.id} leaked a canary value`);
      assert(!serialized.includes("node scripts/"), `${fixture.id} leaked a script body`);
      assert(readBodies.every((file) => allowedMetadataPath(file)), `${fixture.id} read a non-allowlisted metadata body: ${readBodies.join(",")}`);
      assert(profile.commands.test.every((command) => command.execution === "not_run"), `${fixture.id} reported executed test command`);
      assert(profile.evidence.every((record) => !record.path.includes("\\") && !/^[A-Za-z]:/u.test(record.path)), `${fixture.id} emitted a host path`);
    } finally {
      temporary.dispose();
    }
  });
}

test("golden: representative command and evidence details", () => {
  const fixture = FIXTURES[0];
  assert(fixture !== undefined, "fixture missing");
  const temporary = materializeFixture(fixture);
  try {
    const profile = profileRepository(temporary.root);
    for (const purpose of ["build", "test", "lint", "typecheck", "dev", "start", "format"] as const) {
      const command = profile.commands[purpose][0];
      assert(command !== undefined, `${purpose} command missing`);
      assert(command.argv?.join(" ") === `npm run ${purpose}`, `${purpose} argv was not normalized`);
      assert(command.declaredByProject === true && command.execution === "not_run", `${purpose} safety fields changed`);
    }
    assert(profile.entrypoints.some((entrypoint) => entrypoint.pointer === "/exports/./import" && entrypoint.existence === "present"), "conditional export was not retained");
    assert(profile.entrypoints.some((entrypoint) => entrypoint.pointer === "/exports/./require" && entrypoint.existence === "missing"), "missing conditional export was not retained");
    assert(profile.instructions.length === 2, "instruction inventory should not resolve precedence");
    assert(profile.ci.length === 1 && profile.ci[0]?.provider === "github-actions", "CI inventory missing");
  } finally {
    temporary.dispose();
  }
});

function allowedMetadataPath(file: string): boolean {
  return file === "package.json" || file === ".nvmrc" || file === ".node-version" || file === "pnpm-workspace.yaml" || file.endsWith("/package.json") || file.endsWith("/.nvmrc") || file.endsWith("/.node-version");
}
