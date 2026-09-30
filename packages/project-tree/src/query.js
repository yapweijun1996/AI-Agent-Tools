import { assertSafeQueryPath } from './safety.js';

function filterByPath(graph, rel) {
  if (!rel) return graph.graph.nodes;
  return graph.graph.nodes.filter((n) => n.path === rel || n.path?.startsWith(`${rel.replace(/\/$/, '')}/`));
}

function nodesById(graph) {
  return new Map(graph.graph.nodes.map((node) => [node.id, node]));
}

function relatedNodes(graph, seeds, edgeKinds) {
  const byId = nodesById(graph);
  const seen = new Set(seeds.map((node) => node.id));
  const queue = [...seen];
  while (queue.length) {
    const id = queue.shift();
    for (const edge of graph.graph.edges) {
      if (!edgeKinds.has(edge.kind)) continue;
      const next = edge.to === id ? edge.from : undefined;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return [...seen]
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => (a.path || '').localeCompare(b.path || ''));
}

export function queryGraph(graph, command, options = {}) {
  const rel = assertSafeQueryPath(options.root || process.cwd(), options.path);
  const nodes = filterByPath(graph, rel);
  if (command === 'context') return { ...graph, query: { command, path: rel || '.' } };
  if (command === 'evidence') return { schema: 'aptree.query.v1', query: { command, path: rel || '.' }, evidence: nodes.filter((n) => n.plane === 'evidence' || n.kind === 'test') };
  if (command === 'tests-for') return { schema: 'aptree.query.v1', query: { command, path: rel || '.' }, tests: relatedNodes(graph, nodes, new Set(['tests', 'imports'])).filter((n) => n.kind === 'test') };
  if (command === 'impact') return { schema: 'aptree.query.v1', query: { command, path: rel || '.' }, impacted: relatedNodes(graph, nodes, new Set(['tests', 'imports'])), note: 'Impact follows reverse local import and filename-linked test edges.' };
  if (command === 'changed') return { schema: 'aptree.query.v1', query: { command }, changed: graph.change?.changed || [], adapter: graph.change || { vcs: 'git', available: false, changed: [] } };
  if (command === 'goals') return { schema: 'aptree.query.v1', query: { command }, goals: graph.graph.nodes.filter((n) => /(^|\/)(GOAL|ROADMAP|TASK|PROGRESS|EPIC)(\.md)?$/i.test(n.path || '')) };
  if (command === 'progress') return { schema: 'aptree.query.v1', query: { command }, progress: graph.graph.nodes.filter((n) => /(^|\/)(PROGRESS|TASK)(\.md)?$/i.test(n.path || '')) };
  if (command === 'path-to-done') return { schema: 'aptree.query.v1', query: { command }, steps: ['scan workspace', 'inspect goals/progress', 'map impact', 'run tests-for', 'attach evidence'], evidence: graph.graph.nodes.filter((n) => n.kind === 'test') };
  throw new Error(`Unknown command: ${command}`);
}
