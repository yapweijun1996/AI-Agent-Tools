import type { Evidence, EvidenceKind, EvidenceToken } from "../types.js";

interface EvidenceSource {
  kind: EvidenceKind;
  path: string;
  pointer?: string;
}

export function compareCodePoint(left: string, right: string): number {
  if (left === right) return 0;
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index] ?? 0;
    const rightPoint = rightPoints[index] ?? 0;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length < rightPoints.length ? -1 : 1;
}

export class EvidenceStore {
  private readonly sources = new Map<EvidenceToken, EvidenceSource>();

  add(source: EvidenceSource): EvidenceToken {
    const token = JSON.stringify([source.path, source.kind, source.pointer ?? null]);
    if (!this.sources.has(token)) {
      this.sources.set(token, { ...source });
    }
    return token;
  }

  file(path: string): EvidenceToken {
    return this.add({ kind: "file", path });
  }

  manifest(path: string, pointer: string): EvidenceToken {
    return this.add({ kind: "manifest", path, pointer });
  }

  sourcePath(token: EvidenceToken): string | null {
    return this.sources.get(token)?.path ?? null;
  }

  materialize(usedTokens: ReadonlySet<EvidenceToken>): { records: Evidence[]; ids: Map<EvidenceToken, string> } {
    const sources = Array.from(usedTokens)
      .map((token) => ({ token, source: this.sources.get(token) }))
      .filter((entry): entry is { token: string; source: EvidenceSource } => entry.source !== undefined)
      .sort((left, right) => {
        const pathOrder = compareCodePoint(left.source.path, right.source.path);
        if (pathOrder !== 0) return pathOrder;
        const kindOrder = compareCodePoint(left.source.kind, right.source.kind);
        if (kindOrder !== 0) return kindOrder;
        return compareCodePoint(left.source.pointer ?? "", right.source.pointer ?? "");
      });

    const ids = new Map<EvidenceToken, string>();
    const records: Evidence[] = [];
    sources.forEach((entry, index) => {
      const id = `ev-${String(index + 1).padStart(6, "0")}`;
      ids.set(entry.token, id);
      const record: Evidence = {
        id,
        kind: entry.source.kind,
        path: entry.source.path,
      };
      if (entry.source.pointer !== undefined) record.pointer = entry.source.pointer;
      records.push(record);
    });
    return { records, ids };
  }
}

export function sortStrings(values: readonly string[]): string[] {
  return [...values].sort(compareCodePoint);
}

export function sortByPath<T extends { path: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareCodePoint(left.path, right.path));
}

export function sortEvidenceTokens(values: readonly EvidenceToken[]): EvidenceToken[] {
  return sortStrings(values);
}
