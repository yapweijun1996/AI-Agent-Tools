import path from 'node:path';

function escapesRoot(relative) {
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

export function resolveRoot(inputRoot, cwd = process.cwd()) {
  const root = path.resolve(cwd, inputRoot || '.');
  return root;
}

export function safeRelative(root, absolutePath) {
  const rel = path.relative(root, absolutePath);
  if (!rel || rel === '') return '.';
  if (escapesRoot(rel)) {
    throw new Error(`Path escapes root: ${absolutePath}`);
  }
  return rel.split(path.sep).join('/');
}

export function assertSafeQueryPath(root, queryPath) {
  if (!queryPath) return undefined;
  const absolute = path.resolve(root, queryPath);
  const rel = path.relative(root, absolute);
  if (escapesRoot(rel)) {
    throw new Error(`Refusing path outside root: ${queryPath}`);
  }
  return rel.split(path.sep).join('/');
}
