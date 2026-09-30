export interface NormalizedPath {
  file: string | null;
  outsideRoot: boolean;
}

interface ParsedPath {
  kind: "unix" | "windows" | "relative";
  prefix: string;
  segments: string[];
  escaped: boolean;
}

function parsePath(value: string): ParsedPath {
  const normalized = value.replaceAll("\\", "/");
  const windowsMatch = /^([A-Za-z]):(?:\/|$)/u.exec(normalized);
  const kind = windowsMatch ? "windows" : normalized.startsWith("/") ? "unix" : "relative";
  const prefix = windowsMatch ? `${windowsMatch[1] ?? ""}:/` : kind === "unix" ? "/" : "";
  const body = windowsMatch ? normalized.slice(3) : kind === "unix" ? normalized.slice(1) : normalized;
  const segments: string[] = [];
  let escaped = false;
  for (const segment of body.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
      else if (kind === "relative") segments.push("..");
      else escaped = true;
      continue;
    }
    segments.push(segment);
  }
  return { kind, prefix, segments, escaped };
}

function sameRoot(left: ParsedPath, right: ParsedPath): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind !== "windows") return true;
  return left.prefix.toLowerCase() === right.prefix.toLowerCase();
}

function sameSegment(left: string, right: string, windows: boolean): boolean {
  return windows ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function render(parsed: ParsedPath): string {
  const body = parsed.segments.join("/");
  if (parsed.kind === "relative") return body || ".";
  return `${parsed.prefix}${body}`;
}

export function normalizePath(file: string, root?: string): NormalizedPath {
  const filePath = parsePath(file);
  if (!root) return { file: render(filePath), outsideRoot: false };

  const rootPath = parsePath(root);
  if (rootPath.escaped || filePath.escaped) return { file: null, outsideRoot: true };
  if (filePath.kind !== "relative" && !sameRoot(filePath, rootPath)) return { file: null, outsideRoot: true };

  const candidateSegments = filePath.kind === "relative" ? [...rootPath.segments, ...filePath.segments] : filePath.segments;
  const combined = parsePath(`${rootPath.prefix}${candidateSegments.join("/")}`);
  if (combined.escaped || !sameRoot(combined, rootPath) || combined.segments.length < rootPath.segments.length) {
    return { file: null, outsideRoot: true };
  }
  const windows = rootPath.kind === "windows";
  const contained = rootPath.segments.every((segment, index) => sameSegment(segment, combined.segments[index] ?? "", windows));
  if (!contained) return { file: null, outsideRoot: true };
  return { file: combined.segments.slice(rootPath.segments.length).join("/") || ".", outsideRoot: false };
}
