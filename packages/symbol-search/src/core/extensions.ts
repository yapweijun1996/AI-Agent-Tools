export const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"] as const;

export function isTypeScriptFile(path: string): boolean {
  return TYPESCRIPT_EXTENSIONS.some(extension => path.toLowerCase().endsWith(extension));
}
