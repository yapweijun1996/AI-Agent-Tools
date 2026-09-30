import path from 'node:path';

export function resolveRoot(inputRoot, cwd = process.cwd()) {
  const root = path.resolve(cwd, inputRoot || '.');
  return root;
}

export function safeRelative(root, absolutePath) {
  const rel = path.relative(root, absolutePath).split(path.sep).join('/');
  if (!rel || rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes root: ${absolutePath}`);
  }
  return rel;
}

export function assertSafeQueryPath(root, queryPath) {
  if (!queryPath) return undefined;
  const absolute = path.resolve(root, queryPath);
  const rel = path.relative(root, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing path outside root: ${queryPath}`);
  }
  return rel.split(path.sep).join('/');
}
