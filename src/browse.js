const fs = require('fs');
const path = require('path');
const { collectionsDir, actionsDir, binariesDir, outputDir } = require('./config');

// Read-only file browser behind Browse. Paths are virtual: "/<root>/<...>". Five roots:
//   collections, actions, binaries, output, reports   real folders (never anything outside them, no symlinks followed);
//   output holds hunts/ and responses/ (a folder per run, see src/output.js) and Pulled-Files/;
//   reports is output/reports, shown as a root of its own and hidden from output.
const ROOTS = {
  collections: { dir: collectionsDir, label: 'Collections', desc: 'Read-only scripts that gather data from a host' },
  actions: { dir: actionsDir, label: 'Actions', desc: 'Scripts that change a host' },
  binaries: { dir: binariesDir, label: 'Binaries', desc: 'External tools uploaded for collections to use' },
  output: { dir: outputDir, label: 'Output', desc: 'What hunts and responses brought back: Hunts and Responses folders (a folder per run, then per host), and pulled files', hide: ['reports'] },
  reports: { dir: path.join(outputDir, 'reports'), label: 'Reports', desc: 'HTML reports generated from hunts and responses, one file per run' },
};
const MAX_PREVIEW = 2 * 1024 * 1024;

const bad = (m) => { const e = new Error(m); e.status = 404; return e; };

function segments(vpath) {
  const segs = String(vpath || '/').split('/').filter(Boolean);
  for (const s of segs) if (s === '.' || s === '..' || /[\\:\0]/.test(s)) throw bad('Invalid path');
  return segs;
}

// ---- real folders --------------------------------------------------------------------------
function realNode(root, segs) {
  if (root.hide && root.hide.includes(segs[0])) throw bad('Not found'); // lives under its own root instead
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
      if (root.hide && segs.length === 0 && root.hide.includes(name)) continue;
      let s; try { s = fs.lstatSync(path.join(full, name)); } catch { continue; }
      if (s.isSymbolicLink()) continue;
      entries.push(s.isDirectory()
        ? { name, dir: true, modified: s.mtime.toISOString(), count: fs.readdirSync(path.join(full, name)).filter((n) => !n.startsWith('.')).length }
        : { name, dir: false, size: s.size, modified: s.mtime.toISOString() });
    }
    return { dir: true, entries, full };
  }
  if (!st.isFile()) throw bad('Not found');
  return { dir: false, size: st.size, modified: st.mtime.toISOString(), file: full };
}

function node(vpath) {
  const segs = segments(vpath);
  if (!segs.length) return { top: true, segs };
  const root = ROOTS[segs[0]];
  if (!root || !Object.hasOwn(ROOTS, segs[0])) throw bad('Not found');
  const n = realNode(root, segs.slice(1));
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

// For downloading a folder as a zip: the real folder on disk and its name.
function dirSource(vpath) {
  const n = node(vpath);
  if (n.top) throw bad('Open a folder first');
  if (!n.dir || !n.full) throw bad('Not a folder');
  return { name: n.segs[n.segs.length - 1], dir: n.full };
}

// ---- search -------------------------------------------------------------------------------
// Looks for a piece of text in folder and file names, and inside text files, below a folder (or in every root except Binaries).
// Reads files one at a time and gives the event loop a turn between them; capped so a huge output folder cannot hang the server.
const SEARCH = { files: 60000, ms: 25000, results: 300, fileBytes: 2 * 1024 * 1024 };
const SKIP_EXT = /\.(exe|dll|sys|zip|gz|tgz|7z|rar|evtx|png|jpe?g|gif|ico|pdf|pyc|bin|dmp|mem|raw|pf|lnk|db|sqlite)$/i;
const tick = () => new Promise((r) => setImmediate(r));

async function search(query, vpath = '/') {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 2) throw Object.assign(new Error('Type at least 2 characters to search'), { status: 400 });
  const start = Date.now();
  const stack = [];
  const n = node(vpath);
  if (n.top) for (const [name, r] of Object.entries(ROOTS)) { if (name !== 'binaries') stack.push({ v: '/' + name, real: path.resolve(r.dir), root: r }); }
  else if (n.dir && n.full) stack.push({ v: '/' + n.segs.join('/'), real: n.full, root: ROOTS[n.segs[0]] });
  else throw bad('Not a folder');
  const results = [], stats = { scanned: 0, truncated: false };
  while (stack.length && !stats.truncated) {
    const { v, real, root } = stack.pop();
    let names; try { names = fs.readdirSync(real); } catch { continue; }
    for (const name of names.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) { // newest runs first
      if (name.startsWith('.') || name.endsWith('.tmp')) continue;
      if (root.hide && v === '/output' && root.hide.includes(name)) continue;
      const full = path.join(real, name), vp = `${v}/${name}`;
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      const nameHit = name.toLowerCase().includes(q);
      if (st.isDirectory()) {
        if (nameHit) results.push({ path: vp, name, dir: true, nameMatch: true, count: 0 });
        stack.push({ v: vp, real: full, root });
        continue;
      }
      stats.scanned++;
      let count = 0, snippet = '';
      if (st.size <= SEARCH.fileBytes && !SKIP_EXT.test(name)) {
        let buf; try { buf = await fs.promises.readFile(full); } catch { buf = null; }
        if (buf && !looksBinary(buf)) {
          const text = buf.toString('utf8'), low = text.toLowerCase();
          let i = low.indexOf(q);
          if (i >= 0) {
            const a = Math.max(0, i - 50), b = Math.min(text.length, i + q.length + 70);
            snippet = (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
            for (; i >= 0 && count < 5000; i = low.indexOf(q, i + q.length)) count++;
          }
        }
      }
      if (nameHit || count) results.push({ path: vp, name, dir: false, nameMatch: nameHit, count, snippet, size: st.size, modified: st.mtime.toISOString() });
      if (results.length >= SEARCH.results || stats.scanned >= SEARCH.files || Date.now() - start > SEARCH.ms) { stats.truncated = true; break; }
      if (stats.scanned % 50 === 0) await tick();
    }
  }
  results.sort((a, b) => (b.nameMatch - a.nameMatch) || (b.count - a.count));
  return { query: String(query).trim(), results, scanned: stats.scanned, truncated: stats.truncated, seconds: Math.round((Date.now() - start) / 100) / 10 };
}

// ---- delete -------------------------------------------------------------------------------
// Only what hunts and responses brought back can be deleted here: a run's folder, or anything inside it, a report, or a pulled file.
// The scripts and binaries have their own pages, and the top-level folders (Hunts, Responses, Pulled-Files) are never removed.
function removable(vpath) {
  const n = node(vpath);
  if (n.top || !n.segs.length) throw bad('Nothing to delete here');
  const [root, ...rest] = n.segs;
  if (root === 'reports') { if (rest.length < 1) throw bad('Open a report to delete it'); }
  else if (root === 'output') { if (rest.length < 2) throw bad('The Hunts, Responses and Pulled-Files folders cannot be deleted'); }
  else throw bad('Only hunt and response output, reports and pulled files can be deleted here');
  return { n, target: n.dir ? n.full : n.file, isDir: !!n.dir };
}
// Returns what was removed. `runFolder` is "hunts/<name>" or "responses/<name>" when a whole run's folder went (the caller drops the run record).
function remove(vpath) {
  const { n, target, isDir } = removable(vpath);
  const [root, ...rest] = n.segs;
  fs.rmSync(target, { recursive: true, force: true });
  const runFolder = root === 'output' && rest.length === 2 && (rest[0] === 'hunts' || rest[0] === 'responses') ? `${rest[0]}/${rest[1]}` : null;
  return { path: '/' + n.segs.join('/'), dir: isDir, runFolder };
}
// The kind of thing a path is (for the pin list): exists, folder or file, and a readable label.
function describe(vpath) {
  try { const n = node(vpath); return n.top ? { exists: true, dir: true } : { exists: true, dir: !!n.dir, size: n.size, modified: n.modified }; } catch { return { exists: false }; }
}

// ---- EVTX ---------------------------------------------------------------------------------
// Windows event log files, read with @ts-evtx/core (loaded when first needed, it is an ES module).
const EVTX_MAX_BYTES = 200 * 1024 * 1024, EVTX_EVENTS = 3000;
async function evtxView(vpath) {
  const n = node(vpath);
  if (n.top || n.dir) throw bad('Not a file');
  if (n.size > EVTX_MAX_BYTES) throw Object.assign(new Error('That event log is over 200 MB. Download it to open it in Event Viewer.'), { status: 400 });
  const { evtx } = await import('@ts-evtx/core');
  const all = await evtx(n.file).withMessages('off').last(EVTX_EVENTS).toArray();
  const events = all.reverse().map((e) => ({
    time: e.timestamp, id: e.eventId, level: e.levelName || String(e.level ?? ''), provider: e.provider?.name || '', channel: e.channel || '', computer: e.computer || '',
    pid: e.core?.execution?.processId ?? null,
    data: (e.data?.items || []).map((i) => (i.name && i.name !== 'Data' ? `${i.name}=${i.value}` : String(i.value ?? ''))).join(' | '),
  }));
  return { path: '/' + n.segs.join('/'), name: n.segs[n.segs.length - 1], size: n.size, events, shown: events.length, newestFirst: true, truncated: events.length >= EVTX_EVENTS };
}

module.exports = { list, preview, source, dirSource, search, remove, describe, evtxView, node, ROOTS };
