import { FileAdapter, resolveConfig as loadConfig, StorageAdapter } from "./config";
export { projectName as reExportedProjectName } from "./config";

export function start(): string {
  const adapter: StorageAdapter = new FileAdapter();
  return loadConfig(adapter.get("mode"));
}

export const displayedText = "resolveConfig";
// resolveConfig should not be reported from this comment.
