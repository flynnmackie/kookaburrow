const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { huntsDir, actionsDir, binariesDir, runConcurrency } = require('./config');
const { db, save, id } = require('./store');
const winrm = require('./remote/winrm');
const ssh = require('./remote/ssh');

// Hunts live in hunts/powershell (*.ps1) and hunts/bash (*.sh); the id is "<type>/<file>".
// Every hunt opens with four metadata variables (see hunts/TEMPLATE.ps1 and TEMPLATE.sh):
//   PowerShell                         Bash
//   $Name = 'Title'                    NAME='Title'
//   $Description = 'What it finds'     DESCRIPTION='What it finds'
//   $Dependencies = @('tool.exe')      DEPENDENCIES=('tool')      (@() / () for none)
//   $Tags = @('persistence', 'wmi')    TAGS=(persistence wmi)
// The platform reads them as text and never executes the file to do so. Comments and blank
// lines may sit between them; the first other line starts the hunt itself.
const HUNT_TYPES = [
  { type: 'powershell', ext: '.ps1' },
  { type: 'bash', ext: '.sh' },
];
// hunts/verified.json maps hunt ids to the SHA-256 of the shipped file (line endings ignored).
// A hunt is "verified" only while its file still matches; edited or user-added hunts are not.
// Regenerate the manifest after changing a shipped hunt: node scripts/verify-hunts.js
const hashText = (t) => crypto.createHash('sha256').update(t.split('\r\n').join('\n')).digest('hex');
function loadVerified(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'verified.json'), 'utf8')); } catch { return {}; }
}
const FIELDS = ['name', 'description', 'dependencies', 'tags'];

// Reads a quoted string starting at s[i] (the opening quote). Returns [value, indexAfter] or null.
// PowerShell: '' inside '...' is a literal quote, ` escapes in "...". Bash: \ escapes in "...".
// (Avoid apostrophes inside bash single quotes; use double quotes instead.)
function readString(s, i, type) {
  const q = s[i];
  let out = '';
  for (i++; i < s.length; i++) {
    const c = s[i];
    if (q === "'") {
      if (c !== "'") { out += c; continue; }
      if (type === 'powershell' && s[i + 1] === "'") { out += "'"; i++; continue; }
      return [out, i + 1];
    }
    if (c === '"') return [out, i + 1];
    if (c === (type === 'powershell' ? '`' : '\\') && i + 1 < s.length) { out += s[++i]; continue; }
    out += c;
  }
  return null; // unterminated
}

// Reads an array whose "(" is at s[i]: quoted or bare items split by commas/whitespace.
function readArray(s, i, type) {
  const items = [];
  for (i++; i < s.length;) {
    const c = s[i];
    if (c === ')') return [items, i + 1];
    if (/[\s,]/.test(c)) { i++; continue; }
    if (c === '"' || c === "'") {
      const r = readString(s, i, type);
      if (!r) return null;
      items.push(r[0]);
      i = r[1];
      continue;
    }
    let j = i;
    while (j < s.length && !/[\s,)]/.test(s[j])) j++;
    items.push(s.slice(i, j));
    i = j;
  }
  return null;
}

function parseHunt(text, type) {
  const s = text.replace(/^\uFEFF/, '');
  const ps = type === 'powershell';
  const re = ps ? /^[ \t]*\$(Name|Description|Dependencies|Tags|Parameters)[ \t]*=[ \t]*/i : /^[ \t]*(NAME|DESCRIPTION|DEPENDENCIES|TAGS|PARAMETERS)=/;
  const fields = {};
  let pos = 0, end = 0;
  while (pos < s.length) {
    let eol = s.indexOf('\n', pos);
    if (eol < 0) eol = s.length;
    const line = s.slice(pos, eol);
    if (!line.trim() || /^\s*#/.test(line)) { pos = eol + 1; continue; }
    const m = re.exec(line);
    if (!m) break;
    const vs = pos + m[0].length;
    let r = null;
    if (s[vs] === '"' || s[vs] === "'") r = readString(s, vs, type);
    else if (s.startsWith(ps ? '@(' : '(', vs)) r = readArray(s, vs + (ps ? 1 : 0), type);
    if (!r) break; // unsupported or malformed value: treat as the start of the hunt
    let e2 = s.indexOf('\n', r[1]);
    if (e2 < 0) e2 = s.length;
    // Only a trailing comment may follow the value; anything else (e.g. "'a' + 'b'") is an expression.
    if (!/^[ \t]*(#.*)?\r?$/.test(s.slice(r[1], e2))) break;
    fields[m[1].toLowerCase()] = r[0];
    pos = end = e2 + 1;
  }
  const flat = (v) => (Array.isArray(v) ? v.join(', ') : String(v ?? '')).replace(/\s*\r?\n\s*/g, ' ').trim();
  const deps = Array.isArray(fields.dependencies) ? fields.dependencies : String(fields.dependencies ?? '').split(/[,;]/);
  const tags = Array.isArray(fields.tags) ? fields.tags : String(fields.tags ?? '').split(/[,;]/);
  const label = (f) => (ps ? `$${f[0].toUpperCase()}${f.slice(1)}` : f.toUpperCase());
  return {
    name: flat(fields.name),
    description: flat(fields.description),
    dependencies: deps.map((d) => d.trim()).filter((d) => d && !/^(none|n\/a|-)$/i.test(d)),
    // Actions only: names of the inputs the script expects, e.g. $Parameters = @('ProcessName').
    parameters: (Array.isArray(fields.parameters) ? fields.parameters : String(fields.parameters ?? '').split(/[,;]/)).map((x) => x.trim()).filter(Boolean),
    tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    body: s.slice(end).replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, ''),
    warnings: FIELDS.filter((f) => fields[f] === undefined).map((f) => `Missing ${label(f)} variable at the top of the script`),
  };
}

// With a query, only hunts whose header fields or script text contain it (case-insensitive)
// are returned, each tagged with where it matched. `tags` (array) keeps only hunts that
// carry every one of those tags. `requiresDeps` keeps only hunts that declare at least one
// dependency (an external binary).
function listScripts(root, query, tags = [], requiresDeps = false) {
  const q = String(query || '').trim().toLowerCase();
  const wanted = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const out = [];
  const verified = loadVerified(root);
  for (const { type, ext } of HUNT_TYPES) {
    const dir = path.join(root, type);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(ext)).sort()) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const p = parseHunt(text, type);
      const hunt = {
        id: `${type}/${f}`, type, file: f,
        name: p.name || f.slice(0, -ext.length), description: p.description,
        dependencies: p.dependencies, parameters: p.parameters, tags: p.tags, warnings: p.warnings,
        verified: verified[`${type}/${f}`] === hashText(text),
      };
      if (!wanted.every((t) => hunt.tags.includes(t))) continue;
      if (requiresDeps && !hunt.dependencies.length) continue;
      hunt.missingDependencies = resolveBinaries(hunt).missing; // declared binaries not uploaded yet
      if (q) {
        const inName = [hunt.name, f, hunt.description, ...hunt.dependencies, ...hunt.tags].some((s) => s.toLowerCase().includes(q));
        const line = text.split(/\r?\n/).find((l) => l.toLowerCase().includes(q));
        if (!inName && line === undefined) continue;
        hunt.match = { name: inName, script: line !== undefined, line: line?.trim().slice(0, 160) ?? null };
      }
      out.push(hunt);
    }
  }
  return out;
}

// Every tag used by hunts of one type, most common first, for the tag filter.
function listTags(type, root = huntsDir) {
  const counts = new Map();
  for (const h of listScripts(root)) {
    if (type && h.type !== type) continue;
    for (const t of h.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Resolve by matching against the directory listing, never by joining user input to a path.
// `text` is the full file (what gets executed); `body` is the script without the header.
function resolveHunt(huntId, root = huntsDir) {
  const h = listScripts(root).find((x) => x.id === huntId);
  if (!h) return null;
  const file = path.join(root, h.type, h.file);
  const text = fs.readFileSync(file, 'utf8');
  return { ...h, file, text, body: parseHunt(text, h.type).body };
}

// Maps a hunt's $Dependencies to hunter-provided files in binaries/. Dependency names come from
// hunt files, so anything that is not a bare file name is treated as missing.
function resolveBinaries(hunt) {
  const found = [], missing = [];
  for (const dep of hunt.dependencies) {
    const file = path.join(binariesDir, dep);
    const safe = dep === path.basename(dep) && !dep.startsWith('.');
    if (safe && fs.existsSync(file) && fs.statSync(file).isFile()) found.push(file);
    else missing.push(dep);
  }
  return { found, missing };
}

async function executeOnHost(host, hunt) {
  const started = Date.now();
  let r;
  try {
    const bins = resolveBinaries(hunt);
    if (bins.missing.length) throw new Error(`Missing binaries: ${bins.missing.join(', ')}. Place them in the binaries folder and run again.`);
    if (bins.found.length && host.protocol !== 'winrm') throw new Error('Binary staging over SSH is not implemented yet');

    if (hunt.type === 'powershell' && host.protocol === 'winrm') r = await winrm.runScript(host, hunt.file, bins.found);
    else if (host.protocol === 'ssh') r = await ssh.runScript(host, hunt.text, hunt.type);
    else throw new Error(`${hunt.type} hunts cannot run over ${host.protocol}`);
  } catch (e) {
    r = { exitCode: -1, stdout: '', stderr: e.message, truncated: false };
  }
  return { ...r, durationMs: Date.now() - started };
}

function startRun(hunt, hosts) {
  const run = {
    id: id(),
    huntId: hunt.id,
    huntName: hunt.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    results: hosts.map((h) => ({ hostId: h.id, hostLabel: h.hostname || h.address, address: h.address, status: 'queued' })),
  };
  db.runs.unshift(run);
  save();

  (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(runConcurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const i = next++;
        const res = run.results[i];
        res.status = 'running';
        const out = await executeOnHost(hosts[i], hunt);
        Object.assign(res, out, { status: out.exitCode === 0 ? 'ok' : 'error', finishedAt: new Date().toISOString() });
        save();
      }
    }));
    run.status = run.results.some((r) => r.status === 'error') ? 'completed_with_errors' : 'completed';
    run.finishedAt = new Date().toISOString();
    save();
  })();

  return run;
}

const listHunts = (...a) => listScripts(huntsDir, ...a);
const listActions = (...a) => listScripts(actionsDir, ...a);
const resolveAction = (id) => resolveHunt(id, actionsDir);

module.exports = { parseHunt, loadVerified, hashText, listHunts, listActions, listTags, resolveHunt, resolveAction, startRun, huntsDir, actionsDir };
