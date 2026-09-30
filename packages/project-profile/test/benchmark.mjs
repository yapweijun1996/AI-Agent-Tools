import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { profileRepository } from "../dist/index.js";

const fileCount = 100_000;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-benchmark-"));

try {
  const generated = path.join(root, "generated");
  fs.mkdirSync(generated);
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "benchmark", packageManager: "npm@10.0.0", workspaces: ["generated/*"] }),
  );
  for (let index = 0; index < fileCount; index += 1) {
    fs.writeFileSync(path.join(generated, `file-${String(index).padStart(6, "0")}.txt`), "x");
  }

  const started = Date.now();
  const profile = profileRepository(root);
  process.stdout.write(`${JSON.stringify({
    files: fileCount,
    status: profile.status,
    directoryEntries: profile.coverage.usage.directoryEntries,
    metadataFiles: profile.coverage.usage.metadataFiles,
    metadataBytes: profile.coverage.usage.metadataBytes,
    workspaceReturned: profile.workspace.returned,
    workspaceTotal: profile.workspace.total,
    workspaceTruncated: profile.workspace.truncated,
    profilingMs: Date.now() - started,
  })}\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
