const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');
const { db, save, id } = require('./store');
const { dataDir, binariesDir } = require('./config');

// YARA rules (Settings > Collections > YARA Rules). Each rule file is kept as data/yara/<id>.yar and listed in db.yaraRules:
//   { id, name, filename, note, enabled, rules: [rule names], imports: [modules], size, sha256, by, at, check: { ok, error, how } }
// The enabled files are joined into binaries/kb-rules.yar, the file the YARA collections (Yara - Scan Files, Yara - Scan Processes)
// declare as a dependency and stage on the host next to yara64.exe, so every hunt scans with the current set. Imports are moved to
// the top of the joined file. Two enabled files may not define the same rule name (YARA refuses the whole file), so enabling one
// that clashes is refused. kb-rules.yar is only written here: it starts with MARK, so one uploaded by hand on the Binaries page is
// recognised and kept as a rule file ("Imported kb-rules.yar") the first time this page is opened.
// Each file is compiled when it is added, and the joined file whenever it changes, with YARA on this server when there is one:
// yara64.exe uploaded on the Binaries page (Windows server) or yara on the PATH (Linux). Without it nothing is compiled here, and
// a mistake only shows when a hunt runs.
const DIR = path.join(dataDir, 'yara');
const OUT = 'kb-rules.yar';
const MARK = '// Built by Kookaburrow from Settings > Collections > YARA Rules. Edit the rules there; changes here are overwritten.';
const MAX_BYTES = 5 * 1024 * 1024;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const list = () => (db.yaraRules ||= []);
const find = (rid) => list().find((r) => r.id === rid) || null;
const fileOf = (r) => path.join(DIR, `${r.id}.yar`);
let built = null; // { at, rules, files, check } for the joined file

// Rule names, imports and includes of a rule file, read from its text with comments and strings taken out.
function parse(text) {
  const bare = String(text)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/\/\/[^\n]*/g, '');
  const rules = [...bare.matchAll(/(?:^|[\s}])(?:(?:private|global)\s+)*rule\s+([A-Za-z_][A-Za-z0-9_]{0,127})/g)].map((m) => m[1]);
  const imports = [...String(text).matchAll(/^\s*import\s+"([^"]+)"/gm)].map((m) => m[1]);
  const includes = /^\s*include\s+"/m.test(String(text));
  return { rules, imports: [...new Set(imports)], includes };
}

// YARA on this server, to compile rules with: yara64.exe from the Binaries page (Windows) or yara on the PATH. null when there is none.
function compiler() {
  if (process.platform === 'win32') {
    const exe = path.join(binariesDir, 'yara64.exe');
    return fs.existsSync(exe) ? { exe, how: 'yara64.exe from the Binaries page' } : null;
  }
  try { execFileSync('yara', ['--version'], { stdio: 'ignore', timeout: 5000 }); return { exe: 'yara', how: 'yara on this server' }; } catch { return null; }
}
// Compiles a rule file with yara-python in the Python that comes with Kookaburrow (installed by npm run setup-winrm), when there is no YARA program.
function pyCheck(file) {
  const py = require('./remote/pyruntime').python();
  const none = { ok: null, how: 'not compiled: upload yara64.exe on the Binaries page to check rules here' };
  if (!py) return Promise.resolve(none);
  return new Promise((resolve) => execFile(py.exe, ['-c', 'import sys,yara;yara.compile(filepath=sys.argv[1])', file], { timeout: 60000, windowsHide: true, env: { ...process.env, ...py.env } }, (e, so, se) => {
    if (!e) return resolve({ ok: true, how: 'yara-python (bundled with Kookaburrow)' });
    if (/No module named/.test(String(se))) return resolve(none);
    const msg = String(se || e.message).trim().split(/\r?\n/).filter(Boolean).pop().replace(/^yara\.\w+:\s*/, '').slice(0, 400);
    resolve({ ok: false, error: msg, how: 'yara-python (bundled with Kookaburrow)' });
  }));
}
// Compiles a rule file by scanning an empty file with it. { ok: true|false|null, error, how }; ok null means not compiled (no YARA here).
function check(file) {
  const c = compiler();
  if (!c) return pyCheck(file); // no YARA program here: the yara-python of the bundled Python can still compile it
  const empty = path.join(os.tmpdir(), `kb-yara-${crypto.randomBytes(4).toString('hex')}.empty`);
  fs.writeFileSync(empty, '');
  return new Promise((resolve) => { try { execFile(c.exe, ['-w', file, empty], { timeout: 60000, windowsHide: true }, (e, so, se) => {
    fs.rm(empty, { force: true }, () => {});
    if (!e) return resolve({ ok: true, how: c.how });
    const msg = String(se || so || e.message).trim().split(/\r?\n/).filter(Boolean).slice(0, 3).join(' / ').replace(new RegExp(file.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&'), 'g'), 'line').slice(0, 400);
    resolve({ ok: false, error: msg || `YARA exited with ${e.code}`, how: c.how });
  }); } catch (e) { fs.rm(empty, { force: true }, () => {}); resolve({ ok: null, how: `could not run YARA here: ${e.message}`.slice(0, 200) }); } });
}

// Rule names that an enabled file other than `except` already defines.
const clashes = (names, except) => { const have = new Set(list().filter((r) => r.enabled && r.id !== except).flatMap((r) => r.rules)); return names.filter((n) => have.has(n)); };

async function add({ name, filename, text, note, by }) {
  text = String(text ?? '').replace(/^﻿/, '');
  name = String(name || filename || '').trim().slice(0, 80);
  if (!name) throw bad('Give the rule file a name');
  if (!text.trim()) throw bad('The rule file is empty');
  if (Buffer.byteLength(text) > MAX_BYTES) throw bad('That rule file is over 5 MB');
  const p = parse(text);
  if (p.includes) throw bad('include is not supported: add each included file as its own rule file instead');
  if (!p.rules.length) throw bad('No rules found in that file (a rule starts with: rule Name {)');
  const dup = p.rules.filter((n, i) => p.rules.indexOf(n) !== i);
  if (dup.length) throw bad(`The file defines ${[...new Set(dup)].join(', ')} more than once`);
  fs.mkdirSync(DIR, { recursive: true });
  const r = { id: id(), name, filename: path.basename(String(filename || `${name}.yar`)).slice(0, 120), note: String(note || '').slice(0, 300), enabled: false,
    rules: p.rules, imports: p.imports, size: Buffer.byteLength(text), sha256: crypto.createHash('sha256').update(text).digest('hex'), by: by || null, at: new Date().toISOString() };
  fs.writeFileSync(fileOf(r), text);
  r.check = await check(fileOf(r));
  const clash = clashes(r.rules, r.id);
  // a file that does not compile, or reuses a rule name, is kept but not enabled
  r.enabled = r.check.ok !== false && !clash.length;
  if (clash.length) r.check = { ...r.check, clash };
  list().push(r); save();
  await build();
  return r;
}

async function setEnabled(r, on) {
  if (on) {
    if (r.check?.ok === false) throw bad('That file does not compile, so it cannot be enabled. Fix it and add it again.');
    const clash = clashes(r.rules, r.id);
    if (clash.length) throw bad(`Another enabled file already defines ${clash.slice(0, 5).join(', ')}${clash.length > 5 ? ` and ${clash.length - 5} more` : ''}`);
  }
  r.enabled = !!on;
  if (r.check?.clash && on) delete r.check.clash;
  save();
  await build();
}

async function remove(r) {
  if (r.builtin) throw bad('Built-in rules ship with Kookaburrow and cannot be deleted. Disable them instead.');
  fs.rmSync(fileOf(r), { force: true });
  db.yaraRules = list().filter((x) => x.id !== r.id);
  save();
  await build();
}

// Rule files that ship with Kookaburrow (yara-rules/*.yar): generic, general-purpose rules (every executable, unsigned programs, packed
// programs, archives, secrets ...). They are listed with the others, marked built-in, kept up to date on every start, and cannot be deleted.
// They start disabled so the YARA hunts do not run them by default; they are meant to be chosen for one hunt (the YaraRule parameter) or one
// scan (Results > YARA scan). The name and description come from the first lines of each file: "// Name: ..." and "// Description: ...".
const BUILTIN_DIR = path.join(__dirname, '..', 'yara-rules');
async function installBuiltins() {
  let names = [];
  try { names = fs.readdirSync(BUILTIN_DIR).filter((f) => f.toLowerCase().endsWith('.yar')).sort(); } catch { return 0; }
  fs.mkdirSync(DIR, { recursive: true });
  let changed = 0;
  for (const f of names) {
    const body = fs.readFileSync(path.join(BUILTIN_DIR, f), 'utf8');
    const sha = crypto.createHash('sha256').update(body).digest('hex'), rid = `kb-${f.slice(0, -4)}`;
    const p = parse(body), name = (/^\/\/\s*Name:\s*(.+)$/m.exec(body) || [])[1] || f, note = (/^\/\/\s*Description:\s*(.+)$/m.exec(body) || [])[1] || '';
    let r = find(rid);
    if (r && r.sha256 === sha && fs.existsSync(fileOf(r)) && r.check) continue;
    if (!r) { r = { id: rid, name: name.trim(), filename: f, note: note.trim(), enabled: false, builtin: true, rules: p.rules, imports: p.imports, size: Buffer.byteLength(body), sha256: sha, by: null, at: new Date().toISOString() }; list().push(r); }
    else Object.assign(r, { name: name.trim(), note: note.trim(), rules: p.rules, imports: p.imports, size: Buffer.byteLength(body), sha256: sha, builtin: true });
    fs.writeFileSync(fileOf(r), body);
    r.check = await check(fileOf(r));
    changed++;
  }
  if (changed) { save(); await build(); }
  return changed;
}

const text = (r) => fs.readFileSync(fileOf(r), 'utf8');

// Writes binaries/kb-rules.yar from the enabled files (imports first), or removes it when none is enabled, and compiles it.
async function build() {
  const on = list().filter((r) => r.enabled && fs.existsSync(fileOf(r)));
  const dest = path.join(binariesDir, OUT);
  if (!on.length) {
    if (fs.existsSync(dest) && isOurs(dest)) fs.rmSync(dest, { force: true });
    built = { at: new Date().toISOString(), rules: 0, files: 0, check: null };
    return built;
  }
  const all = `${MARK}\n${joined(on)}`;
  fs.mkdirSync(binariesDir, { recursive: true });
  fs.writeFileSync(`${dest}.upload`, all); fs.renameSync(`${dest}.upload`, dest);
  built = { at: new Date().toISOString(), rules: on.reduce((n, r) => n + r.rules.length, 0), files: on.length, check: await check(dest) };
  return built;
}
// Rule files joined into one YARA source: their imports once at the top, then each file under a comment naming it.
function joined(files) {
  const imports = [...new Set(files.flatMap((r) => r.imports))];
  const body = files.map((r) => `// ---- ${r.name.replace(/[\r\n]/g, ' ')} (${r.filename.replace(/[\r\n]/g, ' ')}) ----\n${text(r).replace(/^\s*import\s+"[^"]+"\s*$/gm, '')}`).join('\n\n');
  return `// ${files.length} rule file(s), ${files.reduce((n, r) => n + r.rules.length, 0)} rule(s), ${new Date().toISOString()}\n\n${imports.map((m) => `import "${m}"`).join('\n')}${imports.length ? '\n\n' : ''}${body}\n`;
}
const isOurs = (file) => { try { return fs.readFileSync(file, 'utf8').startsWith(MARK); } catch { return false; } };

// A kb-rules.yar uploaded by hand before this page existed becomes a rule file, so building does not throw it away.
async function adoptExisting(by) {
  const dest = path.join(binariesDir, OUT);
  if (list().some((r) => !r.builtin) || !fs.existsSync(dest) || isOurs(dest)) return null; // the built-in files do not count: only a rule file added by a person means it was already adopted
  try { return await add({ name: 'Imported kb-rules.yar', filename: OUT, text: fs.readFileSync(dest, 'utf8'), note: 'The kb-rules.yar that was uploaded on the Binaries page', by }); } catch { return null; }
}

// What the page shows: the files, the joined file, and whether the scanner and the YARA collections are ready.
async function view(by) {
  await adoptExisting(by);
  await installBuiltins();
  if (!built) await build();
  const has = (n) => fs.existsSync(path.join(binariesDir, n));
  return {
    files: list().map(({ id: rid, name, filename, note, enabled, rules, imports, size, sha256, by: who, at, builtin, check: c }) => ({ id: rid, name, filename, note, enabled, rules, imports, size, sha256, by: who, at, builtin: !!builtin, check: c || null })),
    built, scanner: { yara64: has('yara64.exe'), rulesFile: has(OUT) }, compiler: compiler()?.how || null,
  };
}

module.exports = { MAX_BYTES, OUT, list, find, parse, add, setEnabled, remove, text, build, view, joined, compiler, check, installBuiltins };
