'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { refuse } = require('./request.cjs');
const limits = require('./limits.cjs');

function canonicalRoot(input) {
  if (/^[/\\]{2}/.test(input) || /^[a-z]:(?![/\\])/i.test(input)) refuse('UNSAFE_PATH');
  const root = fs.realpathSync.native(path.resolve(input));
  if (/^[/\\]{2}/.test(root) || !fs.statSync(root).isDirectory()) refuse('UNSAFE_PATH');
  return root;
}

const within = (root, p) => {
  const rel = path.relative(root, p);
  return !path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`);
};
const blocked = s => /[\x00-\x1f:*?"<>|\\]|[. ]$/.test(s) ||
  /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/i.test(s) ||
  /^(?:\.git|\.ssh|\.aws|\.gnupg|\.npmrc|\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?)$/i.test(s);
const same = (a, b) => a === b || (a && b && ['dev','ino','mode','size','ctimeNs','mtimeNs'].every(k => a[k] === b[k]));

// The only disk adapter used by config parsing, discovery and compiler resolution.
class ProjectIO {
  constructor(root, libDir, libraryNames, deadline) {
    this.root = root;
    this.libDir = libDir;
    this.libraryNames = libraryNames;
    this.deadline = deadline;
    this.observed = new Map();
    this.contents = new Map();
    this.bytes = 0;
    this.entries = 0;
  }

  tick() { if (performance.now() >= this.deadline) refuse('RESOURCE_LIMIT'); }

  address(input, library = false) {
    this.tick();
    if (/^[/\\]{2}/.test(input)) return undefined;
    const p = path.resolve(this.root, input);
    const anchor = library && (p === this.libDir || (path.dirname(p) === this.libDir && this.libraryNames.has(path.basename(p))))
      ? this.libDir : this.root;
    if (!within(anchor, p)) return undefined; // Negative compiler probe: no stat outside either authority.
    const rel = path.relative(anchor, p);
    const parts = rel ? rel.split(path.sep) : [];
    if (parts.some(blocked)) return undefined;
    if (parts.length > limits.max_depth) refuse('RESOURCE_LIMIT');
    return { anchor, parts, file: path.join(anchor, ...parts) };
  }

  observe(file) {
    let now = null;
    try { now = fs.lstatSync(file, { bigint: true }); }
    catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') refuse('INPUT_IO'); }
    if (this.observed.has(file)) {
      if (!same(this.observed.get(file), now)) refuse('INPUT_CHANGED');
    } else {
      if (this.observed.size >= limits.max_observed_paths) refuse('RESOURCE_LIMIT');
      this.observed.set(file, now);
    }
    if (now?.isSymbolicLink()) refuse('UNSAFE_PATH');
    return now;
  }

  stat(address) {
    if (!address) return null;
    let file = address.anchor, st = this.observe(file);
    for (const part of address.parts) {
      if (!st?.isDirectory()) return null;
      file = path.join(file, part);
      st = this.observe(file);
    }
    return st;
  }

  read(input, kind) {
    const addr = this.address(input, kind === 'compiler');
    if (!addr) refuse('RESOLUTION_INCOMPLETE');
    const { file } = addr;
    const dependency = addr.parts.some(p => p.toLowerCase() === 'node_modules');
    const allowed = kind === 'config' ? file.endsWith('.json') :
      path.basename(file) === 'package.json' || (dependency ? /\.d\.(?:[cm]?ts)$/.test(file) : /\.(?:[cm]?ts|tsx)$/.test(file));
    if (!allowed) refuse('UNSUPPORTED_SCOPE');
    const before = this.stat(addr);
    if (!before) return undefined;
    if (!before.isFile()) refuse('UNSAFE_PATH');
    if (this.contents.has(file)) return this.contents.get(file);
    if (this.contents.size >= limits.max_files || before.size > limits.max_file_bytes ||
        this.bytes + Number(before.size) > limits.max_input_bytes) refuse('RESOURCE_LIMIT');
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      const opened = fs.fstatSync(fd, { bigint: true });
      if (!same(before, opened) || !opened.isFile() || path.relative(file, fs.realpathSync.native(file))) refuse('INPUT_CHANGED');
      const bytes = Buffer.alloc(Number(opened.size) + 1);
      let used = 0;
      while (used < bytes.length) {
        this.tick();
        const n = fs.readSync(fd, bytes, used, Math.min(65536, bytes.length - used), null);
        if (!n) break;
        used += n;
      }
      if (BigInt(used) !== opened.size || !same(opened, fs.fstatSync(fd, { bigint: true })) || !same(opened, this.stat(addr))) refuse('INPUT_CHANGED');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)); }
      catch { refuse('INVALID_INPUT'); }
      if (path.basename(file) === 'package.json') {
        try {
          text = text.replace(/^\uFEFF/, '');
          const meta = JSON.parse(text);
          if (!meta || typeof meta !== 'object' || Array.isArray(meta)) refuse('INVALID_INPUT');
        } catch { refuse('INVALID_INPUT'); }
      }
      this.bytes += used;
      this.contents.set(file, text);
      return text;
    } catch (err) {
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes(err?.code)) refuse('INPUT_CHANGED');
      throw err;
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }

  list(dir) {
    const addr = this.address(dir);
    if (!addr) refuse('RESOLUTION_INCOMPLETE');
    const files = [], directories = [];
    if (!this.stat(addr)?.isDirectory()) return { files, directories };
    const handle = fs.opendirSync(addr.file);
    try {
      let entry;
      while ((entry = handle.readSync()) !== null) {
        this.tick();
        if (++this.entries > limits.max_directory_entries) refuse('RESOURCE_LIMIT');
        // Do not descend, or silently claim complete discovery, through unknown links.
        if (entry.isSymbolicLink()) refuse('UNSAFE_PATH');
        (entry.isDirectory() ? directories : files).push(entry.name);
      }
    } finally { handle.closeSync(); }
    this.stat(addr);
    return { files, directories };
  }

  verify() {
    // Includes directories and negative lookups, not just files that supplied bytes.
    for (const p of this.observed.keys()) this.stat(this.address(p, true));
    this.tick();
  }
}

module.exports = { ProjectIO, canonicalRoot, within };
