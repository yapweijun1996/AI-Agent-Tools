import type { Match } from "../types";

const confidenceRank: Record<Match["confidence"], number> = {
  confirmed: 3,
  strong: 2,
  candidate: 1,
  unknown: 0
};

const relationRank: Record<Match["relation"], number> = {
  definition: 6,
  implementation: 5,
  inheritance: 5,
  import_alias: 4,
  reference: 3,
  declaration: 2
};

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameContextRank(match: Match, fromPath: string | undefined): number {
  return fromPath && match.path === fromPath ? 1 : 0;
}

export function sortMatches(matches: readonly Match[], query?: string, fromPath?: string): Match[] {
  const deduplicated = new Map<string, Match>();
  for (const match of matches) {
    const key = [match.symbolId, match.relation, match.path, match.range.start.line, match.range.start.column, match.range.end.line, match.range.end.column].join("|");
    if (!deduplicated.has(key)) {
      deduplicated.set(key, match);
    }
  }
  return [...deduplicated.values()].sort((left, right) => {
    const confidence = confidenceRank[right.confidence] - confidenceRank[left.confidence];
    if (confidence !== 0) return confidence;
    const relation = relationRank[right.relation] - relationRank[left.relation];
    if (relation !== 0) return relation;
    if (query) {
      const qualified = Number(right.qualifiedName === query) - Number(left.qualifiedName === query);
      if (qualified !== 0) return qualified;
      const simple = Number(right.name === query) - Number(left.name === query);
      if (simple !== 0) return simple;
    }
    const context = sameContextRank(right, fromPath) - sameContextRank(left, fromPath);
    if (context !== 0) return context;
    const path = compareString(left.path, right.path);
    if (path !== 0) return path;
    const line = left.range.start.line - right.range.start.line;
    if (line !== 0) return line;
    const column = left.range.start.column - right.range.start.column;
    if (column !== 0) return column;
    return compareString(left.symbolId, right.symbolId);
  });
}
