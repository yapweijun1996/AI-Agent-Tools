export const DEFAULT_IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache']);

export function isIgnoredDirectory(relative, ignore = []) {
  return relative.split('/').some((segment) => DEFAULT_IGNORE_DIRS.has(segment)) ||
    ignore.some((directory) => relative === directory || relative.startsWith(directory + '/'));
}
