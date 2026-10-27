const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { collectionsDir, actionsDir, binariesDir } = require('./config');
const runSettings = require('./run-settings');
const { db, save, id } = require('./store');
const winrm = require('./remote/winrm');
const ssh = require('./remote/ssh');

// Collections live in collections/powershell (*.ps1) and collections/bash (*.sh); the id is "<type>/<file>".
// Every collection opens with four metadata variables (see collections/TEMPLATE.ps1 and TEMPLATE.sh):
//   PowerShell                         Bash
//   $Name = 'Title'                    NAME='Title'
//   $Description = 'What it finds'     DESCRIPTION='What it finds'
//   $Dependencies = @('tool.exe')      DEPENDENCIES=('tool')      (@() / () for none)
//   $Tags = @('persistence', 'wmi')    TAGS=(persistence wmi)
// Three optional descriptors say what the script does; when left out they are worked out from the script's
// dependencies (see describe() below):
//   $Footprint = 'none'                FOOTPRINT="none"      none | transient | persistent  (what it leaves on the host)
//   $Returns = 'records'               RETURNS="records"     records | files | both         (what comes back)
//   $Type = 'command'                  TYPE="command"        command | artefact | tool      (how it gets the data)
//   $Produces = @('evtx')              PRODUCES=(evtx)          the raw artefact kinds it leaves in raw/ (feeds workflow processors, see processors/)
//   $Transfer = 'none'                 TRANSFER="none"       none | large                   (large: the script writes files to $OutDir / $OUT_DIR, which can be GBs,
//                                                             and they are pulled back over SMB (Windows hosts) or SFTP (Linux hosts); see src/large-transfer.js)
// The platform reads them as text and never executes the file to do so. Comments and blank
// lines may sit between them; the first other line starts the collection itself.
const COLLECTION_TYPES = [
  { type: 'powershell', ext: '.ps1' },
  { type: 'bash', ext: '.sh' },
];
// collections/verified.json maps collection ids to the SHA-256 of the shipped file (line endings ignored).
// A collection is "verified" only while its file still matches; edited or user-added collections are not.
// Regenerate the manifest after changing a shipped collection: node scripts/verify-collections.js
const hashText = (t) => crypto.createHash('sha256').update(t.split('\r\n').join('\n')).digest('hex');
function loadVerified(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'verified.json'), 'utf8')); } catch { return {}; }
}
const FIELDS = ['name', 'description', 'dependencies', 'tags'];
const FOOTPRINTS = ['none', 'transient', 'persistent'];
const RETURNS = ['records', 'files', 'both'];
const KINDS = ['command', 'artefact', 'tool'];
const TRANSFERS = ['none', 'large'];
// Fills in whatever a script does not declare: one with dependencies stages a tool (transient footprint), one that
// returns only files is an artefact pull, and actions change the host (persistent footprint).
function describe(fields, dependencies, isAction) {
  const pick = (v, allowed) => { const x = String(v ?? '').trim().toLowerCase().replace('artifact', 'artefact'); return allowed.includes(x) ? x : null; };
  const returns = pick(fields.returns, RETURNS) || 'records';
  const footprint = pick(fields.footprint, FOOTPRINTS) || (isAction ? 'persistent' : dependencies.length ? 'transient' : 'none');
  const kind = pick(fields.type, KINDS) || (dependencies.length ? 'tool' : returns === 'files' ? 'artefact' : 'command');
  const transfer = pick(fields.transfer, TRANSFERS) || 'none';
  return { footprint, returns, kind, transfer };
}

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

const rawParams = (fields) => (Array.isArray(fields.parameters) ? fields.parameters : String(fields.parameters ?? '').split(/[,;]/)).map((x) => x.trim()).filter(Boolean);
function parseCollection(text, type, isAction = false) {
  const s = text.replace(/^\uFEFF/, '');
  const ps = type === 'powershell';
  const re = ps ? /^[ \t]*\$(Name|Description|Dependencies|Tags|Parameters|Footprint|Returns|Type|Transfer|Produces)[ \t]*=[ \t]*/i : /^[ \t]*(NAME|DESCRIPTION|DEPENDENCIES|TAGS|PARAMETERS|FOOTPRINT|RETURNS|TYPE|TRANSFER|PRODUCES)=/;
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
    if (!r) break; // unsupported or malformed value: treat as the start of the collection
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
  const dependencies = deps.map((d) => d.trim()).filter((d) => d && !/^(none|n\/a|-)$/i.test(d));
  return {
    name: flat(fields.name),
    description: flat(fields.description),
    dependencies,
    ...describe(fields, dependencies, isAction),
    // Actions only: names of the inputs the script expects, e.g. $Parameters = @('ProcessName').
    parameters: rawParams(fields).map((x) => x.replace(/\?$/, '')),
    optionalParameters: rawParams(fields).filter((x) => x.endsWith('?')).map((x) => x.slice(0, -1)), // written with a trailing ? in the header
    tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    // The kinds of raw artefact it leaves in raw/ (for example 'evtx'); workflow processors that accept one of them can run on it.
    produces: [...new Set((Array.isArray(fields.produces) ? fields.produces : String(fields.produces ?? '').split(/[,;]/)).map((t) => t.trim().toLowerCase()).filter(Boolean))],
    body: s.slice(end).replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, ''),
    warnings: FIELDS.filter((f) => fields[f] === undefined).map((f) => `Missing ${label(f)} variable at the top of the script`),
  };
}

// With a query, only collections whose header fields or script text contain it (case-insensitive)
// are returned, each tagged with where it matched. `tags` (array) keeps only collections that
// carry every one of those tags. `requiresDeps` keeps only collections that declare at least one
// dependency (an external binary).
function listScripts(root, query, tags = [], requiresDeps = false) {
  const isAction = root === actionsDir;
  const q = String(query || '').trim().toLowerCase();
  const wanted = tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const out = [];
  const verified = loadVerified(root);
  for (const { type, ext } of COLLECTION_TYPES) {
    const dir = path.join(root, type);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(ext)).sort()) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const p = parseCollection(text, type, isAction);
      const collection = {
        id: `${type}/${f}`, type, file: f,
        name: p.name || f.slice(0, -ext.length), description: p.description,
        dependencies: p.dependencies, footprint: p.footprint, returns: p.returns, kind: p.kind, transfer: p.transfer, produces: p.produces, parameters: p.parameters, optionalParameters: p.optionalParameters, tags: p.tags, warnings: p.warnings,
        verified: verified[`${type}/${f}`] === hashText(text),
      };
      if (!wanted.every((t) => collection.tags.includes(t))) continue;
      if (requiresDeps && !collection.dependencies.length) continue;
      collection.missingDependencies = resolveBinaries(collection).missing; // declared binaries not uploaded yet
      if (q) {
        const inName = [collection.name, f, collection.description, ...collection.dependencies, ...collection.tags].some((s) => s.toLowerCase().includes(q));
        const line = text.split(/\r?\n/).find((l) => l.toLowerCase().includes(q));
        if (!inName && line === undefined) continue;
        collection.match = { name: inName, script: line !== undefined, line: line?.trim().slice(0, 160) ?? null };
      }
      out.push(collection);
    }
  }
  return out;
}

// Every tag used by collections of one type, most common first, for the tag filter.
function listTags(type, root = collectionsDir) {
  const counts = new Map();
  for (const h of listScripts(root)) {
    if (type && h.type !== type) continue;
    for (const t of h.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// Resolve by matching against the directory listing, never by joining user input to a path.
// `text` is the full file (what gets executed); `body` is the script without the header.
function resolveCollection(collectionId, root = collectionsDir) {
  const h = listScripts(root).find((x) => x.id === collectionId);
  if (!h) return null;
  const file = path.join(root, h.type, h.file);
  const text = fs.readFileSync(file, 'utf8');
  return { ...h, file, text, body: parseCollection(text, h.type, root === actionsDir).body };
}

// Maps a collection's $Dependencies to hunter-provided files in binaries/. Dependency names come from
// collection files, so anything that is not a bare file name is treated as missing.
function resolveBinaries(collection) {
  const found = [], missing = [];
  for (const dep of collection.dependencies) {
    const file = path.join(binariesDir, dep);
    const safe = dep === path.basename(dep) && !dep.startsWith('.');
    if (safe && fs.existsSync(file) && fs.statSync(file).isFile()) found.push(file);
    else missing.push(dep);
  }
  return { found, missing };
}

// outDir (large-transfer collections): the folder on the host the script writes its files to, given to it as $OutDir / $OUT_DIR.
// Parameters (hunts and responses): a collection or action lists the inputs it takes in $Parameters / PARAMETERS (a trailing ? marks an
// optional one). The values typed in the New Hunt / New Response dialog are set as variables of the same name on the first lines of the
// script for that run. They are never stored or logged (they can be passwords); only the names are recorded.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const psQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const shQuote = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;
// Checks what was given for one item and returns { parameter: value }. Throws when a required one is blank.
function paramValues(item, given) {
  const g = (given && typeof given === 'object' && given) || {}, v = {};
  for (const p of item.parameters) {
    if (!IDENT.test(p)) throw new Error(`${item.name}: "${p}" is not a valid parameter name`);
    const x = g[p] == null ? '' : g[p];
    if (String(x) === '' && !item.optionalParameters.includes(p)) throw new Error(`${item.name}: enter a value for ${p}`);
    if (String(x).includes('\0')) throw new Error(`${item.name}: ${p} has an invalid character`);
    v[p] = String(x);
  }
  return v;
}
// The script with its parameters set as variables on the first lines.
function withParams(item, values) {
  const lines = item.parameters.map((p) => (item.type === 'bash' ? `${p}=${shQuote(values[p])}` : `$${p} = ${psQuote(values[p])}`));
  if (!lines.length) return item.text;
  const nl = item.type === 'bash' ? '\n' : '\r\n';
  return `${lines.join(nl)}${nl}${item.text}`;
}

async function executeOnHost(host, collection, { csv = false, outDir = '', timeoutMs, signal } = {}) {
  const started = Date.now();
  let r;
  try {
    const bins = resolveBinaries(collection);
    if (bins.missing.length) throw new Error(`Missing binaries: ${bins.missing.join(', ')}. Place them in the binaries folder and run again.`);

    if (collection.type === 'powershell' && host.protocol === 'winrm') r = await winrm.runScript(host, collection.file, bins.found, { csv, outDir, timeoutMs, signal });
    else if (host.protocol === 'ssh') r = await ssh.runScript(host, collection.text, collection.type, { outDir, timeoutMs, binaries: bins.found, signal });
    else throw new Error(`${collection.type} collections cannot run over ${host.protocol}`);
  } catch (e) {
    r = { exitCode: -1, stdout: '', stderr: e.message, truncated: false };
  }
  return { ...r, durationMs: Date.now() - started };
}

function startRun(collection, hosts) {
  const run = {
    id: id(),
    collectionId: collection.id,
    collectionName: collection.name,
    status: 'running',
    startedAt: new Date().toISOString(),
    results: hosts.map((h) => ({ hostId: h.id, hostLabel: h.hostname || h.address, address: h.address, status: 'queued' })),
  };
  db.runs.unshift(run);
  save();

  (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(runSettings.settings().concurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const i = next++;
        const res = run.results[i];
        res.status = 'running';
        const out = await executeOnHost(hosts[i], collection);
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

const listCollections = (...a) => listScripts(collectionsDir, ...a);
const listActions = (...a) => listScripts(actionsDir, ...a);
const resolveAction = (id) => resolveCollection(id, actionsDir);

module.exports = { FOOTPRINTS, RETURNS, KINDS, parseCollection, loadVerified, hashText, listCollections, listActions, listTags, resolveCollection, resolveAction, startRun, executeOnHost, paramValues, withParams, collectionsDir, actionsDir };
