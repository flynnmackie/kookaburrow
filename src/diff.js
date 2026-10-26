const fs = require('fs');
const path = require('path');
const browse = require('./browse');
const { parseCsv } = require('./output');

// Compare the output of two runs (two folders under Browse), or two files. Files are paired by their path inside the run
// (the date stamps in names are ignored, so one hunt's files line up with the next run of the same hunt). Content is compared
// by line, or by row for CSV, ignoring order: you see what is only in A (gone) and only in B (new).
const MAX_FILES = 3000, MAX_BYTES = 20 * 1024 * 1024, MAX_SHOWN = 500;
const STAMP = /[_-]?\d{8}[_-]\d{4,6}(?:-\d+)?/g;
const norm = (rel) => rel.split('/').map((s) => s.replace(STAMP, '')).join('/');
const bad = (m) => Object.assign(new Error(m), { status: 400 });

function filesOf(vpath) {
  const n = browse.node(vpath);
  if (n.top) throw bad('Choose a run folder or a file');
  if (!n.dir) return { single: true, name: n.segs[n.segs.length - 1], files: new Map([['', { file: n.file, size: n.size, rel: n.segs[n.segs.length - 1] }]]) };
  const out = new Map();
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || name.endsWith('.tmp')) continue;
      const full = path.join(dir, name), r = rel ? `${rel}/${name}` : name;
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(full, r);
      else if (out.size < MAX_FILES) { let k = norm(r), i = 2; while (out.has(k)) k = `${norm(r)} (${i++})`; out.set(k, { file: full, size: st.size, rel: r }); }
    }
  };
  walk(n.full, '');
  return { single: false, name: n.segs[n.segs.length - 1], files: out };
}

function readRows(file, size) {
  if (size > MAX_BYTES) return null;
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8192).includes(0)) return null;
  const text = buf.toString('utf8');
  if (/\.csv$/i.test(file)) {
    const rows = parseCsv(text);
    return { csv: true, header: rows[0] || [], keys: rows.slice(1).map((r) => ({ key: JSON.stringify(r), row: r })) };
  }
  return { csv: false, keys: text.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => ({ key: l, row: l })) };
}
const count = (list) => { const m = new Map(); for (const x of list) m.set(x.key, (m.get(x.key) || 0) + 1); return m; };

// Rows only in A, only in B, and how many are in both.
function compareRows(a, b) {
  const ca = count(a.keys), cb = count(b.keys);
  const onlyA = [], onlyB = [];
  let same = 0;
  const seenA = new Map(), seenB = new Map();
  for (const x of a.keys) { const used = (seenA.get(x.key) || 0) + 1; seenA.set(x.key, used); if (used > (cb.get(x.key) || 0)) onlyA.push(x); else same++; }
  for (const x of b.keys) { const used = (seenB.get(x.key) || 0) + 1; seenB.set(x.key, used); if (used > (ca.get(x.key) || 0)) onlyB.push(x); }
  return { onlyA, onlyB, same };
}

function summarise(pa, pb) {
  const A = filesOf(pa), B = filesOf(pb);
  const keys = A.single && B.single ? [''] : [...new Set([...A.files.keys(), ...B.files.keys()])].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const files = keys.map((k) => {
    const fa = A.files.get(k), fb = B.files.get(k);
    const rel = (fb || fa).rel, rec = { key: k, rel: A.single && B.single ? `${fa.rel} ↔ ${fb.rel}` : rel, sizeA: fa?.size ?? null, sizeB: fb?.size ?? null };
    if (!fa) return { ...rec, status: 'added' };
    if (!fb) return { ...rec, status: 'removed' };
    let ra, rb; try { ra = readRows(fa.file, fa.size); rb = readRows(fb.file, fb.size); } catch { ra = rb = null; }
    if (!ra || !rb) return { ...rec, status: fa.size === fb.size && fs.readFileSync(fa.file).equals(fs.readFileSync(fb.file)) ? 'same' : 'changed', binary: true };
    const c = compareRows(ra, rb);
    return { ...rec, status: c.onlyA.length || c.onlyB.length ? 'changed' : 'same', removed: c.onlyA.length, added: c.onlyB.length, same: c.same };
  });
  const tally = (s) => files.filter((f) => f.status === s).length;
  return { a: { path: pa, name: A.name }, b: { path: pb, name: B.name }, files, totals: { same: tally('same'), changed: tally('changed'), added: tally('added'), removed: tally('removed') }, truncated: A.files.size >= MAX_FILES || B.files.size >= MAX_FILES };
}

// The rows behind one changed file: `key` is the file's key from the summary.
function detail(pa, pb, key) {
  const A = filesOf(pa), B = filesOf(pb), k = String(key ?? '');
  const fa = A.files.get(k), fb = B.files.get(k);
  if (!fa && !fb) throw bad('That file is not in either run');
  const ra = fa && readRows(fa.file, fa.size), rb = fb && readRows(fb.file, fb.size);
  if ((fa && !ra) || (fb && !rb)) return { binary: true };
  const empty = { csv: false, header: [], keys: [] };
  const c = compareRows(ra || empty, rb || empty);
  const header = (rb && rb.csv ? rb.header : ra && ra.header) || [];
  const cut = (l) => l.slice(0, MAX_SHOWN).map((x) => x.row);
  return { csv: !!((rb && rb.csv) || (ra && ra.csv)), header, removed: cut(c.onlyA), added: cut(c.onlyB), removedTotal: c.onlyA.length, addedTotal: c.onlyB.length, same: c.same, shown: MAX_SHOWN };
}

// The files of one run, for picking a single file to compare.
function list(vpath) {
  const A = filesOf(vpath);
  return [...A.files.entries()].map(([key, f]) => ({ key, rel: f.rel, size: f.size })).sort((x, y) => x.rel.localeCompare(y.rel, undefined, { numeric: true }));
}

module.exports = { summarise, detail, list };
