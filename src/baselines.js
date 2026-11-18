const fs = require('fs');
const path = require('path');
const { db, save, id } = require('./store');
const { dataDir, outputDir } = require('./config');

// Baselines (Results > Analysis > Baseline): a known-good state that runs are compared against, in Diff and by recurring hunts set to
// compare with one. A baseline is a folder, data/baselines/<id>/, laid out like a run's output folder so src/diff.js reads it the same way:
//   from a run   a copy of the run's output folder without raw/ (the CSVs and the workflow output; collected files such as event logs
//                are left out: Diff only notes whether they exist, and they can be GBs)
//   uploaded     a zip is unpacked (a zip of a run folder lines up with later runs of that hunt); any other file is kept as it is
// A record: { id, name, note, source: 'run' | 'upload', filename, size, files, sha256 (uploads), runId, runName, runBase, root,
// os ('windows' | 'linux' | 'other'), standard (the reference for its os: newer baselines are compared with it), profile { hosts, rows,
// collections: [{ key, label, rows, hosts }] }, uploadedBy, at }. runBase is the original run folder's name (H_<name>_<date>), which Diff takes out of paths and values; root is
// the folder inside an unpacked zip that holds the run (when the zip has one top folder).
// Uploads made before baselines could be compared were kept as data/baselines/<id>.dat; prepare() unpacks them on first use.
const ROOT = path.join(dataDir, 'baselines');
const STAMPED = /^[HR]_.+_\d{8}_\d{4}(?:_\d+)?$/;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const list = () => (db.baselines ||= []);
const find = (bid) => list().find((b) => b.id === bid) || null;
const folderOf = (b) => path.join(ROOT, b.id);

// The size and number of files below a folder.
function measure(dir) {
  let size = 0, files = 0;
  const walk = (d) => { for (const n of fs.readdirSync(d)) { const f = path.join(d, n), st = fs.lstatSync(f); if (st.isDirectory()) walk(f); else if (st.isFile()) { size += st.size; files++; } } };
  walk(dir);
  return { size, files };
}

// Copies a run's output folder (not raw/, not links) into a new baseline.
function fromRun(run, { name, note, by }) {
  if (!run?.outputPath || !/^(hunts|responses)\/[^\\/]+$/.test(run.outputPath)) throw bad('That run has no output folder');
  const src = path.join(outputDir, ...run.outputPath.split('/'));
  if (!fs.existsSync(src)) throw bad('That run\'s output folder is gone');
  checkName(name);
  const rec = { id: id(), name: name.trim(), note: String(note || '').slice(0, 500), source: 'run', runId: run.id, runName: run.name || '', runBase: path.basename(src), filename: path.basename(src), uploadedBy: by || null, at: new Date().toISOString() };
  const dest = folderOf(rec);
  const copy = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const n of fs.readdirSync(from)) {
      const f = path.join(from, n), st = fs.lstatSync(f);
      if (st.isSymbolicLink() || n.endsWith('.tmp')) continue;
      if (st.isDirectory()) { if (n.toLowerCase() !== 'raw' && n !== '_unpacked') copy(f, path.join(to, n)); } else if (st.isFile()) fs.copyFileSync(f, path.join(to, n));
    }
  };
  try { copy(src, dest); } catch (e) { fs.rmSync(dest, { recursive: true, force: true }); throw bad(`Could not copy the run: ${e.message}`, 500); }
  Object.assign(rec, measure(dest));
  describe(rec);
  list().push(rec); save();
  return rec;
}

function checkName(name) {
  const n = String(name || '').trim();
  if (!n || n.length > 80) throw bad('Give the baseline a name (80 characters at most)');
  if (list().some((b) => b.name.toLowerCase() === n.toLowerCase())) throw bad('A baseline with that name already exists');
}

// Turns an uploaded file (<id>.dat) into the baseline's folder: a zip is unpacked, anything else is kept under its own name.
async function prepare(b) {
  const dir = folderOf(b);
  if (fs.existsSync(dir)) return dir;
  const dat = path.join(ROOT, `${b.id}.dat`);
  if (!fs.existsSync(dat)) throw bad('The baseline\'s files are gone', 404);
  const head = Buffer.alloc(4), fd = fs.openSync(dat, 'r'); fs.readSync(fd, head, 0, 4, 0); fs.closeSync(fd);
  const tmp = `${dir}.tmp`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    if (head.readUInt32LE(0) === 0x04034b50) { // PK\3\4: a zip
      await require('./processors').unzip(dat, tmp);
      const top = fs.readdirSync(tmp).filter((n) => !n.startsWith('.') && n !== '__MACOSX');
      if (top.length === 1 && fs.statSync(path.join(tmp, top[0])).isDirectory()) { b.root = top[0]; if (STAMPED.test(top[0])) b.runBase = top[0]; }
    } else fs.copyFileSync(dat, path.join(tmp, path.basename(b.filename || 'baseline')));
    fs.renameSync(tmp, dir);
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw bad(`Could not read the baseline: ${e.message}`); }
  fs.rmSync(dat, { force: true });
  b.files = measure(dir).files;
  try { const root = b.root ? path.join(dir, b.root) : dir, info = JSON.parse(fs.readFileSync(path.join(root, '.baseline.json'), 'utf8')); if (!b.osSet && OSES.includes(info.os)) b.os = info.os; } catch { /* not an export */ }
  describe(b);
  save();
  return dir;
}

// Work out what a baseline holds (hosts, collections, rows) and which operating system it is of. Done once, when it is made or first read.
const OSES = ['windows', 'linux', 'other'];
const stemOf = (rel) => { const b = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.csv$/i, ''); const m = /^(.*?)[_-]\d{8}[_-]\d{4,6}/.exec(b); return (m ? m[1] : b).toLowerCase(); };
function describe(b) {
  const dir = folderOf(b);
  if (!fs.existsSync(dir)) return b;
  const root = b.root ? path.join(dir, b.root) : dir;
  const diff = require('./diff'), cols = new Map(), hosts = new Set();
  let rows = 0, os = null;
  const lines = (f) => { let n = 0, content = false; for (const c of fs.readFileSync(f)) { if (c === 10) { if (content) n++; content = false; } else if (c !== 13) content = true; } return Math.max(0, n + (content ? 1 : 0) - 1); };
  const walk = (d, rel) => {
    for (const n of fs.readdirSync(d)) {
      if (n.startsWith('.')) continue;
      const f = path.join(d, n), st = fs.lstatSync(f), r = rel ? `${rel}/${n}` : n;
      if (st.isDirectory()) { if (rel === '' && /^(raw|All[-_]Hosts)/i.test(n)) continue; if (!rel) hosts.add(n); walk(f, r); }
      else if (st.isFile()) {
        if (/_All_Hosts\.json$/i.test(n) && !rel) {
          try {
            const hs = JSON.parse(fs.readFileSync(f, 'utf8')).hosts || [];
            if (hs.length) os = hs.every((h) => h.protocol === 'ssh' || /linux|ubuntu|debian|centos|red hat|rhel/i.test(h.os || '')) ? 'linux' : hs.some((h) => /windows/i.test(h.os || '') || h.protocol === 'winrm') ? 'windows' : null;
          } catch { /* not a run summary */ }
        }
        if (!/\.csv$/i.test(n) || diff.kindOf(r) !== 'data') continue;
        const key = diff.scopeOf(r, 'data') || stemOf(r), c = cols.get(key) || { key, label: diff.collectionInfo(key).label, rows: 0, hosts: new Set() };
        const n2 = lines(f);
        c.rows += n2; rows += n2; c.hosts.add(rel.split('/')[0]); cols.set(key, c);
      }
    }
  };
  walk(root, '');
  b.profile = { hosts: hosts.size, rows, collections: [...cols.values()].map((c) => ({ key: c.key, label: c.label, rows: c.rows, hosts: c.hosts.size })).sort((x, y) => x.label.localeCompare(y.label)) };
  if (!OSES.includes(b.os)) b.os = os || 'other';
  if (typeof b.standard !== 'boolean') b.standard = false;
  return b;
}
const ensure = (b) => { if (!b.profile && fs.existsSync(folderOf(b))) { describe(b); save(); } return b; };

// Name, note, operating system and whether it is the standard. One baseline is the standard of each operating system.
function update(b, p) {
  if (p.name !== undefined && String(p.name).trim() !== b.name) { checkName(p.name); b.name = String(p.name).trim(); }
  if (p.note !== undefined) b.note = String(p.note).slice(0, 500);
  if (p.os !== undefined) { if (!OSES.includes(p.os)) throw bad('The operating system is windows, linux or other'); if (p.os !== b.os) b.standard = false; b.os = p.os; b.osSet = true; }
  if (p.standard !== undefined) {
    b.standard = !!p.standard;
    if (b.standard) for (const x of list()) if (x.id !== b.id && x.os === b.os) x.standard = false;
  }
  save();
  return b;
}
const standardFor = (os) => list().find((b) => b.os === os && b.standard) || null;

// A baseline as a zip that another Kookaburrow can take in with Add baseline > Upload (a hidden file inside says what it is).
function exportZip(b) {
  const dir = folderOf(b);
  if (!fs.existsSync(dir)) throw bad("The baseline's files are gone", 404);
  const root = b.root ? path.join(dir, b.root) : dir, info = path.join(root, '.baseline.json');
  fs.writeFileSync(info, JSON.stringify({ name: b.name, note: b.note || '', os: b.os, at: b.at, exportedFrom: 'Kookaburrow' }));
  try { return { name: b.name.replace(/[^A-Za-z0-9._-]+/g, '_') || 'baseline', buffer: require('./zip').zipFolder(root, b.runBase || 'baseline') }; } finally { fs.rmSync(info, { force: true }); }
}

// What changed between two baselines (or a baseline and a run), as a short summary for the Baseline page. Baselines never change, so
// the answer is kept for as long as the server runs. Hosts are pooled when the two share none (a golden image against a fleet).
const summaries = new Map();
function changes(pa, pb, { strict = false, pool = 'auto' } = {}) {
  const key = `${pa}|${pb}|${strict}|${pool}`, diff = require('./diff');
  const live = /^baseline:/.test(pa) && /^baseline:/.test(pb);
  if (live && summaries.has(key)) return summaries.get(key);
  const s = diff.summarise(pa, pb, { strict, pool });
  const per = new Map();
  for (const f of s.files) {
    if (f.kind !== 'data' || f.hostMissing || !f.collection) continue;
    const c = per.get(f.collection) || { key: f.collection, label: f.label, attention: f.attention || 0, added: 0, removed: 0, modified: 0, status: 'same' };
    if (f.status === 'changed') { c.added += f.added || 0; c.removed += f.removed || 0; c.modified += f.modified || 0; c.status = 'changed'; }
    else if (f.status === 'added') { c.added += f.rows || 0; c.status = 'changed'; c.onlyNew = true; }
    else if (f.status === 'removed') { c.removed += f.rows || 0; c.status = 'changed'; c.onlyOld = true; }
    per.set(f.collection, c);
  }
  const all = [...per.values()], changed = all.filter((c) => c.status === 'changed');
  const out = { added: s.rows.added, removed: s.rows.removed, modified: s.rows.modified, noise: s.rows.noise, pooled: s.pooled, same: all.length - changed.length,
    collections: changed.sort((x, y) => y.attention - x.attention || (y.added + y.removed + y.modified) - (x.added + x.removed + x.modified)) };
  if (live) summaries.set(key, out);
  return out;
}

function remove(b) {
  fs.rmSync(folderOf(b), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, `${b.id}.dat`), { force: true });
  db.baselines = list().filter((x) => x.id !== b.id);
  summaries.clear();
  for (const s of db.schedules || []) if (s.compareTo?.baselineId === b.id) s.compareTo = null; // back to the previous run
  save();
}

// For src/diff.js: what "baseline:<id>" or "baseline:<id>/<path inside it>" points at, like browse.node() does for output paths.
// The baseline must be prepared already (summaries are synchronous); its folder is the root, or the one top folder of a zip.
function locate(vpath) {
  const m = /^baseline:([0-9a-f]+)(?:\/(.*))?$/.exec(String(vpath));
  const b = m && find(m[1]);
  if (!b) throw bad('Baseline not found', 404);
  const dir = folderOf(b);
  if (!fs.existsSync(dir)) throw bad('The baseline is not ready yet; open it again in a moment', 409);
  const root = b.root ? path.join(dir, b.root) : dir;
  const rel = (m[2] || '').split('/').filter(Boolean);
  if (rel.some((s) => s === '.' || s === '..' || /[\\:\0]/.test(s))) throw bad('Invalid path');
  const full = path.join(root, ...rel);
  const st = fs.statSync(full);
  // rawless: a baseline made from a run has no raw/ folders, so Diff leaves collected files out instead of calling them all new
  return { dir: st.isDirectory(), full, file: full, size: st.size, name: rel.length ? rel[rel.length - 1] : b.name, base: b.runBase || '', rawless: b.source === 'run' };
}

module.exports = { ROOT, OSES, list, find, fromRun, checkName, prepare, remove, locate, folderOf, ensure, update, standardFor, exportZip, changes, describe };
