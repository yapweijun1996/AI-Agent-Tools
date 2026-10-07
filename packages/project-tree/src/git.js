import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { safeRelative } from './safety.js';
import { isIgnoredDirectory } from './scope.js';

const inflate = promisify(zlib.inflate);
const GIT_MAX_OBJECT_BYTES = 10 * 1024 * 1024;
const PACK_READ_CHUNK_SIZES = [16384, 262144, 4194304, 16777216];
const PACK_MAX_DELTA_DEPTH = 50;
const OBJ_TYPE_NAMES = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' };
const ZERO_TIME = new Date(0).toISOString();

async function readTextIfExists(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function resolveGitDir(root) {
  const dotgit = path.join(root, '.git');
  const stat = await fs.stat(dotgit).catch(() => null);
  if (!stat) return null;
  if (stat.isDirectory()) return dotgit;
  if (!stat.isFile()) return null;
  const text = await readTextIfExists(dotgit);
  const match = text?.match(/^gitdir:\s*(.+)\s*$/i);
  if (!match) return null;
  const gitdir = path.resolve(root, match[1]);
  try {
    safeRelative(root, gitdir);
  } catch {
    return null;
  }
  return gitdir;
}

async function resolveRef(gitDir, ref) {
  if (!/^[A-Za-z0-9_./-]+$/.test(ref) || ref.includes('..')) return null;
  const loose = (await readTextIfExists(path.join(gitDir, ...ref.split('/'))))?.trim();
  if (/^[0-9a-f]{40}$/i.test(loose || '')) return loose.toLowerCase();
  const packed = await readTextIfExists(path.join(gitDir, 'packed-refs'));
  if (packed) {
    for (const line of packed.split('\n')) {
      if (!line || line.startsWith('#') || line.startsWith('^')) continue;
      const [oid, name] = line.trim().split(/\s+/);
      if (name === ref && /^[0-9a-f]{40}$/i.test(oid)) return oid.toLowerCase();
    }
  }
  return null;
}

async function headCommit(gitDir) {
  const head = (await readTextIfExists(path.join(gitDir, 'HEAD')))?.trim();
  if (!head) return null;
  const ref = head.match(/^ref:\s*(.+)$/);
  if (ref) return resolveRef(gitDir, ref[1]);
  return /^[0-9a-f]{40}$/i.test(head) ? head.toLowerCase() : null;
}

async function readLooseObject(gitDir, oid) {
  if (!/^[0-9a-f]{40}$/i.test(oid)) return null;
  const objectPath = path.join(gitDir, 'objects', oid.slice(0, 2), oid.slice(2));
  const stat = await fs.stat(objectPath).catch(() => null);
  if (!stat || !stat.isFile() || stat.size > GIT_MAX_OBJECT_BYTES) return null;
  const inflated = await inflate(await fs.readFile(objectPath)).catch(() => null);
  if (!inflated) return null;
  const nul = inflated.indexOf(0);
  if (nul < 0) return null;
  const header = inflated.subarray(0, nul).toString('utf8');
  const [type, sizeText] = header.split(' ');
  const body = inflated.subarray(nul + 1);
  if (Number(sizeText) !== body.length) return null;
  return { type, body };
}

const PACK_IDX_MAGIC = 0xff744f63;

async function parsePackIndexV2(idxPath) {
  const buf = await fs.readFile(idxPath).catch(() => null);
  if (!buf || buf.length < 8 || buf.readUInt32BE(0) !== PACK_IDX_MAGIC || buf.readUInt32BE(4) !== 2) return null;
  const fanoutStart = 8;
  const objectCount = buf.readUInt32BE(fanoutStart + 255 * 4);
  const shaStart = fanoutStart + 256 * 4;
  const crcStart = shaStart + objectCount * 20;
  const offsetStart = crcStart + objectCount * 4;
  const extStart = offsetStart + objectCount * 4;
  const map = new Map();
  for (let i = 0; i < objectCount; i++) {
    const oid = buf.subarray(shaStart + i * 20, shaStart + i * 20 + 20).toString('hex');
    let offset = buf.readUInt32BE(offsetStart + i * 4);
    if (offset & 0x80000000) {
      const extIndex = offset & 0x7fffffff;
      const hi = buf.readUInt32BE(extStart + extIndex * 8);
      const lo = buf.readUInt32BE(extStart + extIndex * 8 + 4);
      offset = hi * 2 ** 32 + lo;
    }
    map.set(oid, offset);
  }
  return map;
}

async function loadPacks(gitDir) {
  const packDir = path.join(gitDir, 'objects', 'pack');
  const entries = await fs.readdir(packDir).catch(() => []);
  const packs = [];
  for (const entry of entries.filter((f) => f.endsWith('.idx')).sort()) {
    const idxPath = path.join(packDir, entry);
    const packPath = path.join(packDir, entry.replace(/\.idx$/, '.pack'));
    const map = await parsePackIndexV2(idxPath);
    if (map) packs.push({ packPath, map });
  }
  return packs;
}

async function getPacks(gitDir, cache) {
  if (!cache.packsByDir.has(gitDir)) cache.packsByDir.set(gitDir, await loadPacks(gitDir));
  return cache.packsByDir.get(gitDir);
}

async function readChunk(packPath, position, length) {
  const fd = await fs.open(packPath, 'r').catch(() => null);
  if (!fd) return null;
  try {
    const stat = await fd.stat();
    const len = Math.max(0, Math.min(length, stat.size - position));
    if (len <= 0) return { buffer: Buffer.alloc(0), atEnd: true };
    const buffer = Buffer.alloc(len);
    await fd.read(buffer, 0, len, position);
    return { buffer, atEnd: position + len >= stat.size };
  } finally {
    await fd.close();
  }
}

async function readAndInflate(packPath, start) {
  for (const size of PACK_READ_CHUNK_SIZES) {
    if (size > GIT_MAX_OBJECT_BYTES * 2) break;
    const chunk = await readChunk(packPath, start, size);
    if (!chunk || chunk.buffer.length === 0) return null;
    try {
      return zlib.inflateSync(chunk.buffer);
    } catch {
      if (chunk.atEnd) return null;
    }
  }
  return null;
}

function parseObjectHeader(buf) {
  let i = 0;
  let byte = buf[i++];
  const type = (byte >> 4) & 0x7;
  let size = byte & 0x0f;
  let shift = 4;
  while (byte & 0x80) {
    byte = buf[i++];
    size |= (byte & 0x7f) << shift;
    shift += 7;
  }
  return { type, size, headerLen: i };
}

function parseOfsDeltaOffset(buf, start) {
  let i = start;
  let byte = buf[i++];
  let offset = byte & 0x7f;
  while (byte & 0x80) {
    offset += 1;
    byte = buf[i++];
    offset = (offset << 7) | (byte & 0x7f);
  }
  return { offset, bytesConsumed: i - start };
}

function readDeltaVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let i = pos;
  let byte;
  do {
    byte = buf[i++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return { value: result, next: i };
}

function applyDelta(base, delta) {
  let pos = 0;
  const src = readDeltaVarint(delta, pos);
  pos = src.next;
  const dst = readDeltaVarint(delta, pos);
  pos = dst.next;
  if (dst.value > GIT_MAX_OBJECT_BYTES) return null;
  const target = Buffer.alloc(dst.value);
  let targetPos = 0;
  while (pos < delta.length) {
    const opcode = delta[pos++];
    if (opcode & 0x80) {
      let copyOffset = 0;
      let copySize = 0;
      if (opcode & 0x01) copyOffset += delta[pos++];
      if (opcode & 0x02) copyOffset += delta[pos++] * 0x100;
      if (opcode & 0x04) copyOffset += delta[pos++] * 0x10000;
      if (opcode & 0x08) copyOffset += delta[pos++] * 0x1000000;
      if (opcode & 0x10) copySize += delta[pos++];
      if (opcode & 0x20) copySize += delta[pos++] * 0x100;
      if (opcode & 0x40) copySize += delta[pos++] * 0x10000;
      if (copySize === 0) copySize = 0x10000;
      base.copy(target, targetPos, copyOffset, copyOffset + copySize);
      targetPos += copySize;
    } else if (opcode) {
      delta.copy(target, targetPos, pos, pos + opcode);
      pos += opcode;
      targetPos += opcode;
    } else {
      return null;
    }
  }
  return target;
}

async function readPackedObjectAtOffset(pack, offset, cache, depth = 0) {
  if (depth > PACK_MAX_DELTA_DEPTH) return null;
  const headerChunk = await readChunk(pack.packPath, offset, 32);
  if (!headerChunk || headerChunk.buffer.length === 0) return null;
  const { type, headerLen } = parseObjectHeader(headerChunk.buffer);
  let dataStart = offset + headerLen;
  let deltaBaseOffset = null;
  let deltaBaseOid = null;
  if (type === 6) {
    const parsed = parseOfsDeltaOffset(headerChunk.buffer, headerLen);
    deltaBaseOffset = offset - parsed.offset;
    dataStart = offset + headerLen + parsed.bytesConsumed;
  } else if (type === 7) {
    const refChunk = await readChunk(pack.packPath, offset + headerLen, 20);
    if (!refChunk || refChunk.buffer.length < 20) return null;
    deltaBaseOid = refChunk.buffer.toString('hex');
    dataStart = offset + headerLen + 20;
  } else if (!OBJ_TYPE_NAMES[type]) {
    return null;
  }
  const payload = await readAndInflate(pack.packPath, dataStart);
  if (!payload) return null;
  if (type === 6 || type === 7) {
    const base = type === 6 ? await readPackedObjectAtOffset(pack, deltaBaseOffset, cache, depth + 1) : await readObject(cache.gitDir, deltaBaseOid, cache, depth + 1);
    if (!base) return null;
    const body = applyDelta(base.body, payload);
    if (!body) return null;
    return { type: base.type, body };
  }
  if (payload.length > GIT_MAX_OBJECT_BYTES) return null;
  return { type: OBJ_TYPE_NAMES[type], body: payload };
}

async function readPackedObject(gitDir, oid, cache, depth = 0) {
  const packs = await getPacks(gitDir, cache);
  for (const pack of packs) {
    const offset = pack.map.get(oid);
    if (offset !== undefined) return readPackedObjectAtOffset(pack, offset, cache, depth);
  }
  return null;
}

async function readObject(gitDir, oid, cache, depth = 0) {
  if (!/^[0-9a-f]{40}$/i.test(oid)) return null;
  const loose = await readLooseObject(gitDir, oid);
  if (loose) return loose;
  return readPackedObject(gitDir, oid, cache, depth);
}

function parseTree(body) {
  const entries = [];
  let i = 0;
  while (i < body.length) {
    const space = body.indexOf(32, i);
    const nul = body.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 21 > body.length) break;
    const mode = body.subarray(i, space).toString('utf8');
    const name = body.subarray(space + 1, nul).toString('utf8');
    const oid = body.subarray(nul + 1, nul + 21).toString('hex');
    entries.push({ mode, name, oid });
    i = nul + 21;
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function walkHeadTree(gitDir, treeOid, cache, prefix = '', capture = { files: new Map(), complete: true }, limit = 1000, ignore = []) {
  if (capture.files.size >= limit) {
    capture.complete = false;
    return capture;
  }
  const tree = await readObject(gitDir, treeOid, cache);
  if (tree?.type !== 'tree') {
    capture.complete = false;
    return capture;
  }
  for (const entry of parseTree(tree.body)) {
    if (entry.mode === '40000' && isIgnoredDirectory(prefix ? prefix + '/' + entry.name : entry.name, ignore)) continue;
    if (capture.files.size >= limit) {
      capture.complete = false;
      break;
    }
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.mode === '40000') await walkHeadTree(gitDir, entry.oid, cache, rel, capture, limit, ignore);
    else if (entry.mode === '100644' || entry.mode === '100755' || entry.mode === '120000') capture.files.set(rel, { oid: entry.oid, mode: entry.mode });
  }
  return capture;
}

async function headTree(gitDir, commitOid, cache) {
  const commit = await readObject(gitDir, commitOid, cache);
  if (commit?.type !== 'commit') return null;
  const firstLine = commit.body.toString('utf8', 0, Math.min(commit.body.length, 256)).split('\n')[0];
  const match = firstLine.match(/^tree ([0-9a-f]{40})$/i);
  return match ? match[1].toLowerCase() : null;
}

async function blobDigest(gitDir, oid, cache) {
  const blob = await readObject(gitDir, oid, cache);
  return blob?.type === 'blob' ? sha256(blob.body) : null;
}

async function missingWorktreePath(root, relative) {
  const parts = relative.split('/');
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    safeRelative(root, current);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      return error.code === 'ENOENT' ? true : undefined;
    }
    // An uncaptured path through a symlink or non-directory is unknown, not a proven deletion.
    if (index < parts.length - 1 && !stat.isDirectory()) return undefined;
  }
  return false;
}

export async function readGitChanges(root, nodes, options = {}) {
  const scannedAt = options.scannedAt || ZERO_TIME;
  const gitDir = await resolveGitDir(root);
  if (!gitDir) return { vcs: 'git', available: false, changed: [], note: 'No .git directory found.', freshness: { scannedAt } };
  const cache = { gitDir, packsByDir: new Map() };
  const commitOid = await headCommit(gitDir);
  if (!commitOid) return { vcs: 'git', available: false, changed: [], note: 'Git HEAD could not be resolved without executing git.', freshness: { scannedAt } };
  const treeOid = await headTree(gitDir, commitOid, cache);
  if (!treeOid) return { vcs: 'git', available: false, changed: [], note: 'Git HEAD object is unavailable (missing loose object and no pack index could resolve it); no commands were executed.', freshness: { scannedAt } };
  const maxChanges = Math.max(1, Number(options.maxChanges || options.maxFiles || 1000));
  const capture = await walkHeadTree(gitDir, treeOid, cache, '', { files: new Map(), complete: true }, maxChanges, options.ignore);
  const tracked = capture.files;
  const fileNodes = nodes.filter((node) => node.provenance?.source === 'filesystem' && node.kind !== 'workspace' &&
    node.path && node.path !== '.' && !isIgnoredDirectory(path.posix.dirname(node.path), options.ignore));
  const byPath = new Map(fileNodes.map((node) => [node.path, node]));
  let incomplete = !capture.complete;
  const changed = [];
  for (const rel of [...tracked.keys()].sort()) {
    const head = tracked.get(rel);
    const node = byPath.get(rel);
    if (!node) {
      const missing = await missingWorktreePath(root, rel);
      if (missing === true) changed.push({ path: rel, status: 'deleted', provenance: { source: 'git-head-tree' } });
      else incomplete = true;
    }
    else if (node.digest) {
      const headDigest = await blobDigest(gitDir, head.oid, cache);
      if (headDigest && headDigest !== node.digest) changed.push({ path: rel, status: 'modified', nodeId: node.id, provenance: { source: 'git-head-tree' } });
      if (!headDigest) incomplete = true;
    } else {
      incomplete = true;
    }
  }
  for (const rel of [...byPath.keys()].sort()) {
    if (capture.complete && !tracked.has(rel)) changed.push({ path: rel, status: 'untracked', nodeId: byPath.get(rel)?.id, provenance: { source: 'git-head-tree' } });
  }
  return { vcs: 'git', available: true, base: { commit: commitOid }, changed: changed.slice(0, maxChanges), truncated: incomplete || changed.length >= maxChanges || tracked.size >= maxChanges, note: 'Compared captured files in the scan scope to Git HEAD using read-only .git objects; uncaptured paths require an observed absence, incomplete HEAD capture cannot prove untracked status, and index/stage state is not inspected.', freshness: { scannedAt } };
}
