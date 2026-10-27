const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('./config');
const pyruntime = require('./remote/pyruntime');
const deps = require('./dependencies');

// Processors: server-side tools a workflow runs on what a hunt collected (processors/*.json, one manifest per tool).
// A processor is a manifest, never a script or a free-text command line:
//   id, name, description
//   accepts       the artefact kinds it can read (a collection's $Produces, for example "evtx")
//   tool          per platform ({ win32: {...}, linux: {...} }): system (a program installed on the server, found by Settings > External > Dependencies) or archive (the file uploaded under Settings > External > Binaries, usually a zip of
//                 the tool), exe (a glob for the program inside it; it is run from the folder it is found in, so rules next to it are found)
//   each          optional: file name patterns (for example ["Amcache.hve"]). The command runs once per matching file below the input folder, with {file} {n} (1, 2, ...) and {name}
//   cwd           optional: the folder to run in (may use {output} and {n}); default is the folder the tool is in
//   launcher      optional: "dotnet" runs the tool as `dotnet <file>` (for .dll tools)
//   requires      optional: server dependencies that must be installed (ids from src/dependencies.js, for example "dotnet10")
//   parameters    [{ name, label, default, options? }] values are validated against the manifest, never put in a shell
//   command       the arguments after the program, as an array. {input} {output} {Param} are replaced inside an element
//   outputs       [{ file, format, timeColumn?, timeUtc? }]  files it writes into {output} (file may use * for tools that add a time stamp to the name); csv outputs can be sent to Elastic; timeUtc says the time column is UTC without a zone (the Eric Zimmerman tools)
//   timeoutMinutes
// The program is started directly (no shell) with a time limit, and is killed when the run is cancelled.
const DIR = path.join(__dirname, '..', 'processors');
const TOOLS = path.join(config.dataDir, 'tools');
const SAFE_VALUE = /^[A-Za-z0-9 ._:,@+-]{0,120}$/;
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function validate(m, file) {
  const bad = (t) => { throw new Error(`${file}: ${t}`); };
  if (!/^[a-z0-9-]{2,40}$/.test(m.id || '')) bad('id must be lowercase letters, digits and dashes');
  if (!m.name) bad('name is required');
  if (!Array.isArray(m.accepts) || !m.accepts.length) bad('accepts is required');
  if (!m.tool || typeof m.tool !== 'object') bad('tool is required');
  if (m.requires !== undefined && (!Array.isArray(m.requires) || !m.requires.every(deps.known))) bad('requires must list known server dependencies');
  if (m.launcher !== undefined && m.launcher !== 'dotnet') bad('launcher must be "dotnet"');
  for (const [plat, t] of Object.entries(m.tool)) {
    if (!t || !((t.archive && t.exe) || t.system)) bad(`tool.${plat} needs archive and exe, or system`);
    if (t.system && !(deps.known(t.system) && (m.requires || []).includes(t.system))) bad(`tool.${plat}.system must be a known dependency that is also listed in requires`);
  }
  if (m.each !== undefined && !(Array.isArray(m.each) && m.each.length && m.each.every((x) => typeof x === 'string'))) bad('each must be a list of file name patterns');
  if (m.cwd !== undefined && typeof m.cwd !== 'string') bad('cwd must be a string');
  if (!Array.isArray(m.command) || !m.command.every((x) => typeof x === 'string')) bad('command must be an array of strings');
  if (!Array.isArray(m.outputs)) bad('outputs is required');
  return m;
}
let cache = null;
function load() {
  if (cache) return cache;
  const list = [];
  if (fs.existsSync(DIR)) {
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.json') && n !== 'verified.json').sort()) {
      try { list.push(validate(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), f)); } catch (e) { console.error('Processor skipped: ' + e.message); }
    }
  }
  return (cache = list);
}
const toolOf = (p) => p.tool[process.platform] || null;

function view(p) {
  const tool = toolOf(p);
  const dependencies = tool && tool.archive ? [tool.archive] : [];
  const have = dependencies.filter((d) => fs.existsSync(path.join(config.binariesDir, d)));
  return {
    id: p.id, name: p.name, description: p.description || '', accepts: p.accepts, dependencies,
    missing: tool ? dependencies.filter((d) => !have.includes(d)) : [],
    requires: (p.requires || []).map((id) => ({ id, name: deps.name(id) })), missingSystem: deps.unmet(p.requires),
    supported: !!tool, homepage: p.homepage || '',
    parameters: (p.parameters || []).map((x) => ({ name: x.name, label: x.label || x.name, default: x.default ?? '', options: x.options || null })),
    outputs: p.outputs, timeoutMinutes: p.timeoutMinutes || 60,
  };
}
const list = () => load().map(view);
const get = (id) => load().find((p) => p.id === id) || null;
// For the Binaries page: the processors declare tool archives like collections declare binaries.
const declared = () => load().map((p) => ({ name: p.name, id: p.id, dependencies: toolOf(p) && toolOf(p).archive ? [toolOf(p).archive] : [] }));

// Checks a workflow step's parameter values against the manifest and fills in defaults.
function resolveParams(p, given = {}) {
  const out = {};
  for (const d of p.parameters || []) {
    const v = given[d.name] === undefined || given[d.name] === '' ? d.default ?? '' : String(given[d.name]);
    if (d.options && !d.options.includes(v)) throw err(`${d.label || d.name} must be one of: ${d.options.join(', ')}`);
    if (!SAFE_VALUE.test(String(v))) throw err(`${d.label || d.name} has characters that are not allowed`);
    out[d.name] = String(v);
  }
  return out;
}

// ---- the tool: an uploaded archive, unpacked once per version into data/tools/<id>/<hash> ----
const hashMemo = new Map();
function fileHash(file) {
  const st = fs.statSync(file), key = `${file}|${st.size}|${st.mtimeMs}`;
  if (hashMemo.has(key)) return hashMemo.get(key);
  const h = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
  hashMemo.set(key, h);
  return h;
}
function unzip(zip, dest) {
  return new Promise((resolve, reject) => {
    const py = pyruntime.command();
    // zip or tar(.gz); nothing may land outside dest and links are refused
    const code = [
      'import sys,os,zipfile,tarfile',
      'a=sys.argv[1];d=os.path.realpath(sys.argv[2])',
      'def ok(n):',
      '    t=os.path.realpath(os.path.join(d,n));return t==d or t.startswith(d+os.sep)',
      'if zipfile.is_zipfile(a):',
      '    z=zipfile.ZipFile(a)',
      '    for n in z.namelist():',
      '        if not ok(n): sys.exit("unsafe path in archive: "+n)',
      '    z.extractall(d)',
      'else:',
      '    t=tarfile.open(a)',
      '    for m in t.getmembers():',
      '        if not ok(m.name) or m.islnk() or m.issym(): sys.exit("unsafe entry in archive: "+m.name)',
      '    t.extractall(d)',
    ].join('\n');
    const run = py ? [py.exe, ['-I', '-c', code, zip, dest], { env: { ...process.env, ...py.env } }] : ['tar', ['-xf', zip, '-C', dest], {}];
    execFile(run[0], run[1], { ...run[2], timeout: 10 * 60 * 1000, windowsHide: true }, (e, so, se) => (e ? reject(new Error(`Could not unpack the tool: ${String(se || e.message).trim().split(/\r?\n/).pop()}`)) : resolve()));
  });
}
const globRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
function findExe(dir, pattern, depth = 2) {
  const re = globRe(pattern);
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isFile() && re.test(e.name)) return path.join(dir, e.name);
  if (depth > 0) for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) { const r = findExe(path.join(dir, e.name), pattern, depth - 1); if (r) return r; }
  return null;
}
const building = new Map();
async function ensureTool(p) {
  const tool = toolOf(p);
  if (!tool) throw err(`${p.name} has no tool for this server's operating system (${process.platform})`);
  if (tool.system) { // a program installed on the server (Settings > External > Dependencies), not an uploaded archive
    const s = deps.lastKnown(tool.system);
    if (!s || !s.found) throw err(`${deps.name(tool.system)} is not installed on the server (Settings > External > Dependencies)`);
    return { exe: s.path, dir: path.dirname(s.path) };
  }
  const archive = path.join(config.binariesDir, tool.archive);
  if (!fs.existsSync(archive)) throw err(`${tool.archive} is not uploaded (Settings > External > Binaries)`);
  const dest = path.join(TOOLS, p.id, fileHash(archive));
  if (!fs.existsSync(path.join(dest, '.ok'))) {
    const key = dest;
    if (!building.has(key)) building.set(key, (async () => {
      fs.rmSync(path.join(TOOLS, p.id), { recursive: true, force: true }); // an older version of the same tool
      fs.mkdirSync(dest, { recursive: true });
      await unzip(archive, dest);
      fs.writeFileSync(path.join(dest, '.ok'), new Date().toISOString());
    })().finally(() => building.delete(key)));
    await building.get(key);
  }
  const exe = findExe(dest, tool.exe);
  if (!exe) throw err(`${tool.exe} was not found inside ${tool.archive}` + (p.launcher === 'dotnet' ? ' (this tool needs the .NET build of the download, not the .NET Framework one)' : ''));
  if (process.platform !== 'win32') { try { fs.chmodSync(exe, 0o755); } catch { /* not ours to fix */ } } // unpacking drops the execute bit
  return { exe, dir: path.dirname(exe) };
}

const countRows = async (file, format) => {
  if (format === 'zeek') { // Zeek logs: header lines start with #, one record per other line
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l && l[0] !== '#').length;
  }
  return new Promise((resolve) => {
    let n = 0, last = 0;
    fs.createReadStream(file).on('data', (b) => { for (let i = 0; i < b.length; i++) if (b[i] === 10) n++; last = b[b.length - 1]; })
      .on('end', () => resolve(Math.max(0, n - 1 + (last === 10 || n === 0 ? 0 : 1)))).on('error', () => resolve(0));
  });
};

// Every file below a folder, as paths relative to it with forward slashes (links are not followed).
function walk(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(dir, r, out); else if (e.isFile()) out.push(r);
  }
  return out;
}

// A collection can return archives (KAPE returns one .zip). Unpacks every .zip below dir into dest and returns dest, or null when there are none.
async function unpackArchives(dir, dest) {
  const zips = walk(dir).filter((f) => /\.zip$/i.test(f));
  if (!zips.length) return null;
  fs.rmSync(dest, { recursive: true, force: true });
  for (let i = 0; i < zips.length; i++) {
    const to = path.join(dest, String(i + 1));
    fs.mkdirSync(to, { recursive: true });
    await unzip(path.join(dir, zips[i]), to);
  }
  return dest;
}

// Starts the program once and waits for it. Rejects with { cancelled: true } when the signal fires.
function exec(p, launch, cwd, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
    const child = execFile(launch[0], launch[1], { cwd, env: { ...process.env, ...deps.envFor(p.requires) }, timeout: timeoutMs || (p.timeoutMinutes || 60) * 60000, windowsHide: true, maxBuffer: 8 << 20 }, (e, so, se) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (signal?.aborted) return reject(Object.assign(new Error('Cancelled'), { cancelled: true }));
      if (e) {
        const tail = String(se || so || e.message).trim().split(/\r?\n/).filter(Boolean).slice(-2).join(' / ').slice(0, 300);
        return reject(new Error(e.killed ? `Timed out after ${(p.timeoutMinutes || 60)} minutes` : `${p.name} failed (exit ${e.code}): ${tail}`));
      }
      resolve();
    });
    const onAbort = () => { try { child.kill(); } catch { /* already gone */ } };
    signal?.addEventListener('abort', onAbort);
  });
}

// Runs a processor over one input folder. Resolves { files: [{ name, size, format, rows }], seconds, note }; rejects with the reason it failed.
// A processor with "each" runs once for every file below the input folder whose name matches (one named file per run, like $MFT or Amcache.hve).
async function run(p, { inputDir, outputDir, params, signal, timeoutMs }) {
  const t0 = Date.now();
  const values = resolveParams(p, params);
  const unmet = deps.unmet(p.requires);
  if (unmet.length) throw err(`${p.name} needs ${unmet.join(', ')} installed on the server (Settings > External > Dependencies)`);
  const { exe, dir } = await ensureTool(p);
  fs.mkdirSync(outputDir, { recursive: true });
  const jobs = [];
  if (p.each) {
    const res = p.each.map(globRe);
    const found = walk(inputDir).filter((f) => res.some((re) => re.test(path.basename(f)))).sort();
    if (!found.length) return { files: [], seconds: Math.round((Date.now() - t0) / 1000), note: `No ${p.each.join(' or ')} file in what was collected` };
    found.forEach((f, i) => jobs.push({ file: path.join(inputDir, ...f.split('/')), n: String(i + 1), name: path.basename(f).replace(/[^A-Za-z0-9._-]/g, '_') }));
  } else jobs.push({});
  const failures = [];
  for (const job of jobs) {
    const sub = (s) => s.replace(/\{(input|output|file|n|name)\}/g, (_, k) => (k === 'input' ? inputDir : k === 'output' ? outputDir : job[k] ?? '')).replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
    const cwd = p.cwd ? sub(p.cwd) : dir;
    fs.mkdirSync(cwd, { recursive: true });
    const args = p.command.map(sub);
    try { await exec(p, p.launcher === 'dotnet' ? [deps.dotnetExe(), [exe, ...args]] : [exe, args], cwd, signal, timeoutMs); }
    catch (e) { if (e.cancelled) throw e; failures.push(`${job.file ? path.basename(job.file) + ': ' : ''}${e.message}`); }
  }
  if (failures.length === jobs.length) throw new Error(failures.length > 1 ? `${failures[0]} (and ${failures.length - 1} more)` : failures[0]);
  const note = failures.length ? `${failures.length} of ${jobs.length} files failed: ${failures[0]}`.slice(0, 300) : '';
  const files = [], seen = new Set();
  const present = walk(outputDir);
  for (const o of p.outputs) {
    const re = globRe(o.file);
    for (const name of present.filter((n) => re.test(n) && !seen.has(n)).sort()) {
      seen.add(name);
      const f = path.join(outputDir, ...name.split('/'));
      files.push({ name, size: fs.statSync(f).size, format: o.format, timeColumn: o.timeColumn || '', timeUtc: !!o.timeUtc, timeEpoch: !!o.timeEpoch, rows: ['csv', 'zeek'].includes(o.format) ? await countRows(f, o.format) : null });
    }
  }
  return { files, seconds: Math.round((Date.now() - t0) / 1000), note };
}

module.exports = { list, get, declared, resolveParams, ensureTool, run, view, unpackArchives };
