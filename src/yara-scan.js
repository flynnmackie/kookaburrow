const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { db, save, id } = require('./store');
const { outputDir } = require('./config');
const yara = require('./yara');

// YARA scans of hunt output (Results > Analysis > YARA scan). The chosen rule files (Settings > YARA Rules; the enabled ones by
// default) are joined into a temporary rules file and YARA on this server (src/yara.js compiler(): yara64.exe from the Binaries page,
// or yara on a Linux server) scans every file in the chosen runs' output folders, collected files under raw/ included. Runs are scanned
// one after another. A scan is kept in db.yaraScans (the latest MAX_KEPT):
//   { id, status: running | done | failed | cancelled, by, startedAt, finishedAt, ruleFiles: [{ id, name, rules }], rules,
//     runs: [{ path, name, status, matches, error }], matches: [{ run, host, rel, rule }], truncated, errors, error }
// host is the run's host folder the file is in (its address), or '' for files at the top of the run.
const MAX_KEPT = 20, MAX_MATCHES = 5000, TIMEOUT_MS = 2 * 60 * 60 * 1000;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const list = () => (db.yaraScans ||= []);
const procs = new Map(); // scan id -> the running yara process

// A run's output folder from its Browse path (/output/hunts/<folder> or /output/responses/<folder>).
function runDir(vpath) {
  const m = /^\/output\/(hunts|responses)\/([^/\\]+)$/.exec(String(vpath));
  if (!m || m[2] === '.' || m[2] === '..') throw bad(`Not a run: ${vpath}`);
  const dir = path.join(outputDir, m[1], m[2]);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw bad(`That run's output folder is gone: ${m[2]}`);
  return { dir, base: m[2] };
}

function start({ paths, ruleFileIds, by }) {
  const c = yara.compiler();
  if (!c) throw bad(process.platform === 'win32' ? 'Upload yara64.exe on Settings > External > Binaries first: the scan runs on this server' : 'Install YARA on this server first (apt install yara)');
  if (list().some((s) => s.status === 'running')) throw bad('A YARA scan is already running; wait for it or cancel it');
  const uniq = [...new Set((Array.isArray(paths) ? paths : []).map(String))];
  if (!uniq.length) throw bad('Choose at least one run');
  if (uniq.length > 200) throw bad('Choose 200 runs at most');
  const runs = uniq.map((p) => { const d = runDir(p); const rec = db.runs.find((r) => `/output/${r.outputPath}` === p); return { path: p, name: rec?.name || d.base, folder: d.base, dir: d.dir, status: 'queued', matches: 0 }; });
  const files = ruleFileIds?.length ? ruleFileIds.map((x) => yara.find(String(x))).filter(Boolean) : yara.list().filter((r) => r.enabled);
  if (!files.length) throw bad(ruleFileIds?.length ? 'None of those rule files exist any more' : 'No rule files are enabled: add some on Settings > Collections > YARA Rules, or choose some');
  const broken = files.filter((r) => r.check?.ok === false);
  if (broken.length) throw bad(`${broken.map((r) => r.name).join(', ')} ${broken.length === 1 ? 'does' : 'do'} not compile; leave ${broken.length === 1 ? 'it' : 'them'} out`);
  const names = files.flatMap((r) => r.rules), dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) throw bad(`Two of the chosen files define ${[...new Set(dup)].slice(0, 5).join(', ')}; choose only one of them`);
  const s = { id: id(), status: 'running', by: by || null, startedAt: new Date().toISOString(), finishedAt: null,
    ruleFiles: files.map((r) => ({ id: r.id, name: r.name, rules: r.rules.length })), rules: names.length,
    runs: runs.map(({ dir, ...r }) => r), matches: [], truncated: false, errors: 0, error: '' };
  list().unshift(s);
  db.yaraScans = list().slice(0, MAX_KEPT);
  save();
  const rulesFile = path.join(os.tmpdir(), `kb-yarascan-${s.id}.yar`);
  fs.writeFileSync(rulesFile, yara.joined(files));
  (async () => {
    try {
      for (let i = 0; i < runs.length; i++) {
        if (s.status === 'cancelled') { s.runs[i].status = 'cancelled'; continue; }
        s.runs[i].status = 'scanning'; save();
        try { await scanOne(s, i, c.exe, rulesFile, runs[i]); s.runs[i].status = s.status === 'cancelled' ? 'cancelled' : 'done'; } catch (e) { s.runs[i].status = 'error'; s.runs[i].error = String(e.message).slice(0, 300); }
        save();
      }
      if (s.status === 'running') s.status = s.runs.every((r) => r.status === 'error') ? 'failed' : 'done';
      if (s.status === 'failed') s.error = s.runs.find((r) => r.error)?.error || 'YARA failed';
    } catch (e) { s.status = 'failed'; s.error = e.message; }
    s.finishedAt = new Date().toISOString();
    fs.rm(rulesFile, { force: true }, () => {});
    save();
  })();
  return s;
}

// One run folder: yara -r over it, a match per output line "<rule> <file>". Lines that are YARA's own complaints (a file it could not
// open, a timeout on one file) are counted as errors, not matches.
function scanOne(s, i, exe, rulesFile, run) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, ['-w', '-r', '-N', '-a', '300', rulesFile, run.dir], { windowsHide: true });
    procs.set(s.id, p);
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    let buf = '', err = '';
    const line = (l) => {
      const m = /^(\S+)\s+(.+)$/.exec(l.trim());
      if (!m || /^error/i.test(l)) { if (l.trim()) s.errors++; return; }
      const full = m[2].trim(), rel = path.relative(run.dir, full).split(path.sep).join('/');
      if (rel.startsWith('..')) return;
      const top = rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '';
      const host = top && top.startsWith(`${run.folder}_`) ? top.slice(run.folder.length + 1) : top;
      s.runs[i].matches++;
      if (s.matches.length < MAX_MATCHES) s.matches.push({ run: run.path, runName: run.name, host, rel, rule: m[1] }); else s.truncated = true;
    };
    p.stdout.on('data', (d) => { buf += d; const parts = buf.split(/\r?\n/); buf = parts.pop(); parts.forEach(line); });
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', (e) => { clearTimeout(timer); procs.delete(s.id); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer); procs.delete(s.id);
      if (buf) line(buf);
      const errLines = err.split(/\r?\n/).filter((l) => l.trim());
      s.errors += errLines.filter((l) => !/^warning/i.test(l)).length;
      if (s.status === 'cancelled') return resolve();
      // YARA exits 1 when it could not scan something (a locked file) but still prints what matched; only a run with no output is a failure
      if (code !== 0 && !s.runs[i].matches && errLines.length && /error.*(rule|syntax|compil)/i.test(errLines[0])) return reject(new Error(errLines[0]));
      resolve();
    });
  });
}

function cancel(sid) {
  const s = list().find((x) => x.id === sid);
  if (!s) throw bad('Scan not found', 404);
  if (s.status !== 'running') throw bad('That scan is not running');
  s.status = 'cancelled';
  procs.get(sid)?.kill();
  save();
}

function remove(sid) {
  const s = list().find((x) => x.id === sid);
  if (!s) throw bad('Scan not found', 404);
  if (s.status === 'running') throw bad('Cancel the scan first');
  db.yaraScans = list().filter((x) => x.id !== sid); save();
}

// The matches as CSV.
function csv(sid) {
  const s = list().find((x) => x.id === sid);
  if (!s) throw bad('Scan not found', 404);
  const cell = (v) => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return ['Rule,Run,Host,File', ...s.matches.map((m) => [m.rule, m.runName, m.host, m.rel].map(cell).join(','))].join('\r\n') + '\r\n';
}

// A scan still marked running when the server starts was interrupted.
for (const s of list()) if (s.status === 'running') { s.status = 'failed'; s.error = 'The server restarted during the scan'; s.finishedAt = s.finishedAt || new Date().toISOString(); }

module.exports = { list, start, cancel, remove, csv };
