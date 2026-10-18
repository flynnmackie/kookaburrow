const fs = require('fs');
const path = require('path');
const { collectionsDir, actionsDir, binariesDir } = require('./config');
const { db } = require('./store');

// Read-only file browser behind Browse. Paths are virtual: "/<root>/<...>". Four roots:
//   collections, actions, binaries  real folders (never anything outside them, no symlinks followed)
//   evidence                        built from stored runs: evidence/<run>/<host>/{output.txt,errors.txt,result.json}
const ROOTS = {
  collections: { dir: collectionsDir, label: 'Collections', desc: 'Read-only scripts that gather data from a host' },
  actions: { dir: actionsDir, label: 'Actions', desc: 'Scripts that change a host' },
  binaries: { dir: binariesDir, label: 'Binaries', desc: 'External tools uploaded for collections to use' },
  evidence: { dir: null, label: 'Evidence', desc: 'Output collected from hunts, by run and host' },
};
const MAX_PREVIEW = 512 * 1024;

const bad = (m) => { const e = new Error(m); e.status = 404; return e; };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'run';
const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? 'undated' : d.toISOString().slice(0, 16).replace('T', '_').replace(':', ''); };
const hostDir = (r) => String(r.hostLabel || r.address || 'host').replace(/[\\/:*?"<>|]/g, '_');

function segments(vpath) {
  const segs = String(vpath || '/').split('/').filter(Boolean);
  for (const s of segs) if (s === '.' || s === '..' || /[\\:\0]/.test(s)) throw bad('Invalid path');
  return segs;
}

// ---- evidence (virtual) --------------------------------------------------------------------
const runDirName = (r) => `${stamp(r.startedAt)}_${slug(r.collectionName || r.huntName)}_${r.id.slice(0, 8)}`;
function resultFiles(res) {
  const files = { 'output.txt': res.stdout || '' };
  if (res.stderr) files['errors.txt'] = res.stderr;
  const { stdout, stderr, ...meta } = res;
  files['result.json'] = JSON.stringify(meta, null, 2);
  return files;
}
function evidenceNode(segs) { // segs excludes the "evidence" root
  const runs = db.runs;
  if (segs.length === 0) {
    return { dir: true, entries: runs.map((r) => ({ name: runDirName(r), dir: true, modified: r.finishedAt || r.startedAt, count: r.results.length })) };
  }
  const run = runs.find((r) => runDirName(r) === segs[0]);
  if (!run) throw bad('Not found');
  if (segs.length === 1) {
    const seen = new Map();
    for (const res of run.results) seen.set(hostDir(res), res);
    return { dir: true, entries: [...seen].map(([name, res]) => ({ name, dir: true, modified: res.finishedAt || run.startedAt, count: Object.keys(resultFiles(res)).length })) };
  }
  const res = run.results.find((x) => hostDir(x) === segs[1]);
  if (!res) throw bad('Not found');
  const files = resultFiles(res);
  if (segs.length === 2) {
    return { dir: true, entries: Object.entries(files).map(([name, text]) => ({ name, dir: false, size: Buffer.byteLength(text), modified: res.finishedAt || run.startedAt })) };
  }
  if (segs.length === 3 && segs[2] in files) {
    const text = files[segs[2]];
    return { dir: false, size: Buffer.byteLength(text), modified: res.finishedAt || run.startedAt, buffer: Buffer.from(text) };
  }
  throw bad('Not found');
}

// ---- real folders --------------------------------------------------------------------------
function realNode(root, segs) {
  const base = path.resolve(root.dir);
  const full = path.resolve(base, ...segs);
  if (full !== base && !full.startsWith(base + path.sep)) throw bad('Not found');
  if (!fs.existsSync(base)) { if (segs.length === 0) return { dir: true, entries: [] }; throw bad('Not found'); }
  let st;
  try { st = fs.lstatSync(full); } catch { throw bad('Not found'); }
  if (st.isSymbolicLink()) throw bad('Not found');
  if (st.isDirectory()) {
    const entries = [];
    for (const name of fs.readdirSync(full)) {
      if (name.startsWith('.') || name.endsWith('.tmp')) continue;
      let s; try { s = fs.lstatSync(path.join(full, name)); } catch { continue; }
      if (s.isSymbolicLink()) continue;
      entries.push(s.isDirectory()
        ? { name, dir: true, modified: s.mtime.toISOString(), count: fs.readdirSync(path.join(full, name)).filter((n) => !n.startsWith('.')).length }
        : { name, dir: false, size: s.size, modified: s.mtime.toISOString() });
    }
    return { dir: true, entries };
  }
  if (!st.isFile()) throw bad('Not found');
  return { dir: false, size: st.size, modified: st.mtime.toISOString(), file: full };
}

function node(vpath) {
  const segs = segments(vpath);
  if (!segs.length) return { top: true, segs };
  const root = ROOTS[segs[0]];
  if (!root || !Object.hasOwn(ROOTS, segs[0])) throw bad('Not found');
  const n = segs[0] === 'evidence' ? evidenceNode(segs.slice(1)) : realNode(root, segs.slice(1));
  return { ...n, segs };
}

const sortEntries = (e) => e.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));

function list(vpath) {
  const n = node(vpath);
  if (n.top) {
    return { path: '/', entries: Object.entries(ROOTS).map(([name, r]) => {
      const sub = n.segs.length ? [] : node('/' + name);
      return { name, label: r.label, desc: r.desc, dir: true, count: sub.entries.length };
    }) };
  }
  if (!n.dir) throw bad('Not a folder');
  return { path: '/' + n.segs.join('/'), entries: sortEntries(n.entries) };
}

function readBuffer(n, limit) {
  if (n.buffer) return n.buffer.subarray(0, limit);
  const fd = fs.openSync(n.file, 'r');
  try { const b = Buffer.alloc(Math.min(n.size, limit)); fs.readSync(fd, b, 0, b.length, 0); return b; } finally { fs.closeSync(fd); }
}
const looksBinary = (b) => b.subarray(0, 8192).includes(0);

function preview(vpath) {
  const n = node(vpath);
  if (n.top || n.dir) throw bad('Not a file');
  const name = n.segs[n.segs.length - 1];
  const b = readBuffer(n, MAX_PREVIEW);
  const binary = looksBinary(b);
  return { path: '/' + n.segs.join('/'), name, size: n.size, modified: n.modified, binary, truncated: n.size > MAX_PREVIEW, text: binary ? null : b.toString('utf8') };
}

// For downloads: a Buffer for virtual files, a path for real ones.
function source(vpath) {
  const n = node(vpath);
  if (n.top || n.dir) throw bad('Not a file');
  return { name: n.segs[n.segs.length - 1], buffer: n.buffer, file: n.file };
}

module.exports = { list, preview, source };
