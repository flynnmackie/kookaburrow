const fs = require('fs');
const path = require('path');
const browse = require('./browse');
const { parseCsv, safeName } = require('./output');
const keys = require('./diff-keys');
const { VOLATILE, IDENTITY } = keys;

// Compare the output of two runs (two folders under Browse, or baselines), or two files. Files are paired by their path inside the run
// (the run's folder name and date stamps in names are ignored, so one hunt's files line up with the next run of the same hunt).
//
// What is compared, so that rerunning an unchanged hunt shows no changes:
//   record     the run's log (_Log.csv) and summary (_All_Hosts.json): how the run went (times, durations, file names), not what it
//              found. Listed, never compared.
//   combined   _All_Hosts.csv: every host's rows again in one file. Compared, but left out of the totals so a change counts once.
//   raw        files under raw/ (event logs, hives, captures): a file that appears or goes is a change; its bytes are not compared
//              (they differ on every collection). The strict mode compares them.
//   data       everything else: the per-host collection CSVs and the workflow output in processed/.
//
// CSV rows (src/diff-keys.js explains the column kinds):
//   * volatile columns (process ids, counters, uptime, a collection's $DiffIgnore) are never compared;
//   * time columns (created, modified, last run, time stamps) are left out of what identifies a row, so an item whose only difference is a
//     time is NOT a change. Those are counted as `noise` and can be listed on request. Tables whose time column is what tells rows apart
//     (event logs, a timeline) keep it: there a new time is a new event;
//   * an item is found by its key (the collection's $DiffKey, or the smallest set of columns that tells its rows apart). Same key, other
//     columns different = modified, with the fields that changed; a key only in B = new; only in A = gone;
//   * a collection's $DiffKey on its own decides what a row is (everything else is shown, not compared), as before.
// Cell values have the run's folder name taken out (workflow output records paths such as ...\H_name_20261028_0845\...). Strict compares
// every column and counts duplicate rows.
// Hosts are matched by name (the folder of the host). When the two sides have no host in common (a baseline of a golden image against a
// run, or two baselines) they are pooled: each collection is compared across all the hosts of each side, and rows say which hosts had them.
// Either side may be a baseline ("baseline:<id>", src/baselines.js). A baseline made from a run has no raw/ files, so collected files are
// left out of that comparison. Rows marked as expected (src/expected.js) are taken out of what is new, gone and modified, per collection.
const MAX_FILES = 3000, MAX_BYTES = 20 * 1024 * 1024, MAX_SHOWN = 500;
const STAMP = /[_-]?\d{8}[_-]\d{4,6}(?:-\d+)?/g;
const bad = (m) => Object.assign(new Error(m), { status: 400 });

function kindOf(rel) {
  if (!rel.includes('/')) {
    if (/_All_Hosts\.json$/i.test(rel) || /_Log\.csv$/i.test(rel) || /^hunt-log\.csv$/i.test(rel)) return 'record';
    if (/_All_Hosts\.csv$/i.test(rel)) return 'combined';
  }
  return /(^|\/)raw\//i.test(rel) ? 'raw' : 'data';
}

// The run folder's name (H_<name>_<date>) for a path inside output/hunts or output/responses, else the folder itself.
const runBaseOf = (segs, dir) => { const i = segs.findIndex((s, j) => j > 0 && /^(hunts|responses)$/.test(segs[j - 1])); return i >= 0 ? segs[i] : dir ? segs[segs.length - 1] : ''; };

// A Browse path (/output/hunts/...) or a baseline ("baseline:<id>[/path]"): { dir, full, file, size, name, base }.
function locate(vpath) {
  if (String(vpath).startsWith('baseline:')) return require('./baselines').locate(vpath);
  const n = browse.node(vpath);
  if (n.top) throw bad('Choose a run folder or a file');
  return { dir: n.dir, full: n.full, file: n.file, size: n.size, name: n.segs[n.segs.length - 1], base: runBaseOf(n.segs, n.dir) };
}

// pool: one entry per collection with every host's file as a part, instead of one entry per host and file.
function filesOf(vpath, pool = false) {
  const n = locate(vpath), base = n.base;
  if (!n.dir) {
    const name = n.name;
    return { single: true, name, base, files: new Map([['', { file: n.file, size: n.size, rel: name, kind: kindOf(name) === 'combined' ? 'combined' : 'data' }]]), hosts: new Set() };
  }
  const norm = (rel) => rel.split('/').map((s) => (base ? s.split(base).join('') : s).replace(STAMP, '')).join('/');
  const out = new Map(), hosts = new Set();
  const walk = (dir, rel) => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || name.endsWith('.tmp')) continue;
      const full = path.join(dir, name), r = rel ? `${rel}/${name}` : name;
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!rel) hosts.add(norm(r)); walk(full, r); }
      else if (out.size < MAX_FILES) {
        const kind = kindOf(r);
        if (pool) {
          if (kind !== 'data' || !rel) continue; // pooled: only the hosts' collection files
          const host = norm(rel.split('/')[0]), ip = host.replace(/^[_-]+/, ''), inner = norm(r.slice(r.indexOf('/') + 1)).split(`_${ip}`).join('').split(`-${ip}`).join(''); // a file's name ends with its host's address
          const e = out.get(inner) || { parts: [], size: 0, rel: inner, kind: 'data', file: null };
          e.parts.push({ file: full, host, size: st.size }); e.size += st.size; out.set(inner, e);
        } else { let k = norm(r), i = 2; while (out.has(k)) k = `${norm(r)} (${i++})`; out.set(k, { file: full, size: st.size, rel: r, kind }); }
      }
    }
  };
  walk(n.full, '');
  return { single: false, name: n.name, base, files: out, hosts, rawless: !!n.rawless };
}

// The collection a per-host CSV came from: the hunt runner names it <collection>_<date>_<IP>.csv.
const stemOf = (rel) => { const b = rel.slice(rel.lastIndexOf('/') + 1).replace(/\.csv$/i, ''); const m = /^(.*?)[_-]\d{8}[_-]\d{4,6}/.exec(b); return (m ? m[1] : b).toLowerCase(); };
let collectionRules = () => { try { return require('./collections').diffRules(); } catch { return { byStem: new Map(), byName: new Map() }; } };

// The collection (or workflow output) behind a file: its name and tags, so the report can say "Persistence - Autoruns" and put what
// matters first. attention: 3 persistence, accounts, c2, malware, defence evasion, privilege escalation; 2 execution, lateral movement; 1 network.
const WEIGHT = { persistence: 3, accounts: 3, c2: 3, malware: 3, 'defense-evasion': 3, 'privilege-escalation': 3, execution: 2, 'lateral-movement': 2, network: 1, logons: 1 };
let infoCache = null;
function collectionInfo(scope) {
  if (!infoCache || Date.now() - infoCache.at > 30000) {
    const m = new Map();
    try {
      const c = require('./collections');
      for (const x of [...c.listCollections(), ...c.listActions()]) {
        const stem = safeName(path.basename(x.id, path.extname(x.id)), 'collection').toLowerCase();
        if (!m.has(stem)) m.set(stem, { label: x.name, tags: x.tags || [] });
      }
    } catch { /* no library */ }
    infoCache = { at: Date.now(), m };
  }
  const pretty = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const p = /^processed\/([^/]+)\/(.+)$/i.exec(scope || '');
  if (p) return { label: `${pretty(p[1])}: ${p[2].replace(/\.csv$/i, '')}`, tags: [], attention: 0, workflow: true };
  const hit = infoCache.m.get(scope);
  const tags = hit ? hit.tags : [];
  return { label: hit ? hit.label : pretty(String(scope || '')), tags, attention: Math.max(0, ...tags.map((t) => WEIGHT[t] || 0)) };
}

// A connection's Local and Remote columns (address:port): one side is the service port and the other an ephemeral one that is new
// on every connection (each WinRM session of the hunt itself, for example). The higher port is dropped, so the same connection to
// the same service matches.
const ENDPOINT = /^(.*):(\d{1,5})$/;
function endpointPair(header) {
  const low = header.map(keys.low);
  const li = low.findIndex((h) => h === 'local' || h === 'localendpoint'), ri = low.findIndex((h) => h === 'remote' || h === 'remoteendpoint');
  if (li < 0 || ri < 0) return (r) => r;
  return (r) => {
    const a = ENDPOINT.exec(r[li] ?? ''), b = ENDPOINT.exec(r[ri] ?? '');
    if (!a || !b) return r;
    const c = r.slice();
    if (Number(a[2]) > Number(b[2])) c[li] = a[1]; else c[ri] = b[1];
    return c;
  };
}

// A run's folder name inside a value (a path that workflow output records) is replaced, so the same path from two runs matches.
const cleaner = (base) => (base ? (v) => String(v).split(base).join('\u0000run') : (v) => String(v));

// Reads a file (or the parts of a pooled collection) into rows. Returns null for a binary or oversized file.
function readTable(f, { base = '', strict = false } = {}) {
  const parts = f.parts || [{ file: f.file, host: null, size: f.size }];
  if (parts.some((p) => p.size > MAX_BYTES)) return null;
  const rows = [], hosts = [], textLines = [];
  let header = null, csv = null;
  for (const p of parts) {
    const buf = fs.readFileSync(p.file);
    if (buf.subarray(0, 8192).includes(0)) return null;
    const text = buf.toString('utf8');
    if (/\.csv$/i.test(p.file)) {
      csv = true;
      const t = parseCsv(text);
      if (!header) header = t[0] || [];
      const map = (t[0] || []).map((h) => header.findIndex((x) => keys.low(x) === keys.low(h)));
      for (const r of t.slice(1)) { rows.push(parts.length === 1 || map.every((m, i) => m === i) ? r : header.map((_, i) => { const j = map.indexOf(i); return j < 0 ? '' : r[j] ?? ''; })); hosts.push(p.host); }
    } else {
      csv = false;
      for (const l of text.split(/\r?\n/)) if (l.trim() !== '' && (strict || !/^#(open|close)\t/.test(l))) { textLines.push(l); hosts.push(p.host); }
    }
  }
  return csv ? { csv: true, header, rows, hosts } : { csv: false, header: [], rows: textLines, hosts };
}

// Compares two tables. Returns what is new, gone and modified, how many are the same and how many items differ only in a time column.
// Every item: { row, key } (new, gone), { a, b, changed: [{ col, a, b, time }], key } (modified); `hosts` says which hosts had it when pooled.
function compareTables(ra, rb, { rel, base = {}, strict = false, pooled = false, noiseList = false, scope = null }) {
  const header = rb.csv && rb.header.length ? rb.header : ra.header;
  const align = (t) => {
    if (!t.csv || t.header === header || t.header.every((h, i) => keys.low(h) === keys.low(header[i]))) return t.rows;
    const map = header.map((h) => t.header.findIndex((x) => keys.low(x) === keys.low(h)));
    return t.rows.map((r) => map.map((j) => (j < 0 ? '' : r[j] ?? '')));
  };
  const rowsA = align(ra), rowsB = align(rb);
  const cleanA = strict ? (v) => String(v) : cleaner(base.a), cleanB = strict ? (v) => String(v) : cleaner(base.b);
  const empty = { added: [], removed: [], modified: [], noiseRows: 0, noise: [], same: 0, expected: 0, ignored: [], timeColumns: [], keyColumns: [] };
  if (!(ra.csv || rb.csv)) { // text: by line
    const set = (rows, clean) => { const m = new Map(); rows.forEach((l, i) => { const k = clean(l); if (!m.has(k)) m.set(k, { row: l, key: k }); }); return m; };
    const a = set(rowsA, cleanA), b = set(rowsB, cleanB);
    let removed = [...a.values()].filter((x) => !b.has(x.key)), added = [...b.values()].filter((x) => !a.has(x.key));
    const same = [...a.keys()].filter((k) => b.has(k)).length, ex = strict || !scope ? null : require('./expected').keysFor(scope);
    const total = removed.length + added.length;
    if (ex && ex.size) { removed = removed.filter((x) => !ex.has(x.key)); added = added.filter((x) => !ex.has(x.key)); }
    return { ...empty, csv: false, header: [], added, removed, same, expected: total - removed.length - added.length };
  }
  const ep = strict ? (r) => r : endpointPair(header);
  const rules = strict ? null : collectionRules();
  const rule = rules ? rules.byStem.get(stemOf(rel || '')) : null;
  const nA = rowsA.map(ep), nB = rowsB.map(ep);
  const low = keys.low;
  let idCols, timeCols = [], keyCols = [], ignored = [];
  if (strict) idCols = header.map((_, i) => i);
  else if (rule?.key?.length && header.some((h) => rule.key.map(low).includes(low(h)))) {
    const want = new Set(rule.key.map(low));
    idCols = header.map((h, i) => (want.has(low(h)) || (!pooled && IDENTITY.has(low(h))) ? i : -1)).filter((i) => i >= 0);
    keyCols = idCols.slice(); ignored = header.filter((_, i) => !idCols.includes(i));
  } else {
    const cls = keys.classify(header, [...nA, ...nB], { ignore: rule?.ignore || [], pooled });
    const nonVol = [...cls.other, ...cls.time].sort((x, y) => x - y);
    const tup = (cols, clean) => (r) => JSON.stringify(cols.map((i) => clean(r[i] ?? '')));
    const distinct = (rows, cols, clean) => new Set(rows.map(tup(cols, clean))).size;
    idCols = cls.other.length ? cls.other : nonVol;
    timeCols = cls.other.length ? cls.time : [];
    // a time column that tells rows apart (an event log, a timeline) is part of what a row is
    if (timeCols.length && ((nA.length && distinct(nA, nonVol, cleanA) > 1.02 * distinct(nA, idCols, cleanA)) || (nB.length && distinct(nB, nonVol, cleanB) > 1.02 * distinct(nB, idCols, cleanB)))) { idCols = nonVol; timeCols = []; }
    ignored = cls.volatile.map((i) => header[i]);
    if (idCols.length > 1) { // which columns say which item a row is: the smallest set that tells the rows apart
      const k = keys.inferKey(idCols, [nA.slice(0, 20000), nB.slice(0, 20000)].filter((s) => s.length), (r) => JSON.stringify(idCols.map((i) => r[i] ?? '')), header);
      if (k && k.length < idCols.length) keyCols = k;
    }
  }
  const tupleOf = (clean) => (r) => JSON.stringify(idCols.map((i) => clean(r[i] ?? '')));
  const index = (orig, norm, hosts, tuple) => {
    const m = new Map();
    norm.forEach((n, i) => { const k = tuple(n); let e = m.get(k); if (!e) { e = { row: orig[i], norm: n, hosts: new Set(), count: 0 }; m.set(k, e); } e.count++; if (pooled && hosts[i]) e.hosts.add(hosts[i]); });
    return m;
  };
  const mapA = index(rowsA, nA, ra.hosts, tupleOf(cleanA)), mapB = index(rowsB, nB, rb.hosts, tupleOf(cleanB));
  const hostsOf = (e) => (pooled ? [...e.hosts].sort() : undefined);
  const item = (k, e) => ({ row: e.row, key: k, ...(pooled ? { hosts: hostsOf(e) } : {}) });
  let removed = [], added = [], modified = [], same = 0, noiseRows = 0;
  const noise = [];
  if (strict) { // duplicate rows count
    for (const [k, e] of mapA) { const eb = mapB.get(k); if (!eb) for (let i = 0; i < e.count; i++) removed.push(item(k, e)); else { same += Math.min(e.count, eb.count); for (let i = eb.count; i < e.count; i++) removed.push(item(k, e)); } }
    for (const [k, e] of mapB) { const ea = mapA.get(k); if (!ea) for (let i = 0; i < e.count; i++) added.push(item(k, e)); else for (let i = ea.count; i < e.count; i++) added.push(item(k, e)); }
  } else {
    const onlyA = [...mapA].filter(([k]) => !mapB.has(k)), onlyB = [...mapB].filter(([k]) => !mapA.has(k));
    same = mapA.size - onlyA.length;
    if (timeCols.length) for (const [k, ea] of mapA) { const eb = mapB.get(k); if (eb && timeCols.some((i) => cleanA(ea.row[i] ?? '') !== cleanB(eb.row[i] ?? ''))) { noiseRows++; if (noiseList && noise.length < 200) noise.push({ a: ea.row, b: eb.row, key: k, changed: timeCols.filter((i) => cleanA(ea.row[i] ?? '') !== cleanB(eb.row[i] ?? '')).map((i) => ({ col: header[i], a: ea.row[i] ?? '', b: eb.row[i] ?? '', time: true })) }); } }
    const keyOf = (clean) => (e) => JSON.stringify(keyCols.map((i) => clean(e.norm[i] ?? '')));
    const pair = new Map(); // key tuple -> { a: [...], b: [...] }
    const lone = onlyA.length === 1 && onlyB.length === 1 && mapA.size === 1 && mapB.size === 1; // a one-row table (system info): the row is the item
    if (keyCols.length || lone) {
      for (const [k, e] of onlyA) { const kk = lone ? '' : keyOf(cleanA)(e); (pair.get(kk) || pair.set(kk, { a: [], b: [] }).get(kk)).a.push([k, e]); }
      for (const [k, e] of onlyB) { const kk = lone ? '' : keyOf(cleanB)(e); (pair.get(kk) || pair.set(kk, { a: [], b: [] }).get(kk)).b.push([k, e]); }
      const cols = [...header.keys()].filter((i) => !ignored.includes(header[i]));
      for (const g of pair.values()) {
        const n = Math.min(g.a.length, g.b.length);
        for (let i = 0; i < n; i++) {
          const [, ea] = g.a[i], [kb, eb] = g.b[i];
          const changed = cols.filter((c) => cleanA(ea.norm[c] ?? '') !== cleanB(eb.norm[c] ?? '')).map((c) => ({ col: header[c], a: ea.row[c] ?? '', b: eb.row[c] ?? '', time: timeCols.includes(c) }));
          modified.push({ a: ea.row, b: eb.row, key: kb, changed, ...(pooled ? { hosts: hostsOf(eb), hostsA: hostsOf(ea) } : {}) });
        }
        g.a.slice(n).forEach(([k, e]) => removed.push(item(k, e)));
        g.b.slice(n).forEach(([k, e]) => added.push(item(k, e)));
      }
    } else { removed = onlyA.map(([k, e]) => item(k, e)); added = onlyB.map(([k, e]) => item(k, e)); }
  }
  // rows marked as expected (src/expected.js) are not reported (a modified item is accepted when its new state is expected)
  const ex = !strict && scope ? require('./expected').keysFor(scope) : null;
  let expected = 0;
  if (ex && ex.size) {
    const keep = (l) => l.filter((x) => !ex.has(x.key));
    const n0 = removed.length + added.length + modified.length;
    removed = keep(removed); added = keep(added); modified = keep(modified);
    expected = n0 - removed.length - added.length - modified.length;
  }
  return { csv: true, header, added, removed, modified, same, noiseRows, noise, expected, ignored, timeColumns: timeCols.map((i) => header[i]), keyColumns: keyCols.map((i) => header[i]) };
}

const hostOf = (key) => (key.includes('/') ? key.slice(0, key.indexOf('/')) : null);
const rowCount = (f, opts) => { try { const t = readTable(f, opts); return !t ? null : opts.strict ? t.rows.length : new Set(t.rows.map((r) => (Array.isArray(r) ? r.join('\u0001') : r))).size; } catch { return null; } };

// Rows marked as expected belong to a scope: the collection a per-host CSV came from, or the workflow output file.
// The combined file, run records and collected files have none.
const scopeOf = (rel, kind) => {
  if (kind !== 'data') return null;
  const m = /(?:^|\/)processed\/(.+)$/i.exec(rel);
  return m ? `processed/${m[1].replace(STAMP, '').toLowerCase()}` : stemOf(rel);
};

// Whether two sides are compared host by host, or pooled. opts.pool: true, false, or 'auto' (pooled when they share no host).
function poolDecision(A, B, pool) {
  if (A.single || B.single) return { pooled: false };
  if (pool === true) return { pooled: true, reason: 'chosen' };
  if (pool === false) return { pooled: false };
  const shared = [...A.hosts].filter((h) => B.hosts.has(h)).length;
  return A.hosts.size && B.hosts.size && !shared ? { pooled: true, reason: 'The two sides have no host in common, so every collection is compared across all the hosts of each side.' } : { pooled: false };
}

// opts: strict (every column, raw bytes); pool (true | false | 'auto'); nameOf (address -> host name)
function summarise(pa, pb, opts = {}) {
  const strict = !!opts.strict;
  const A0 = filesOf(pa), B0 = filesOf(pb), dec = poolDecision(A0, B0, opts.pool === undefined ? 'auto' : opts.pool);
  const A = dec.pooled ? filesOf(pa, true) : A0, B = dec.pooled ? filesOf(pb, true) : B0;
  const both = !A.single && !B.single, noRaw = A.rawless || B.rawless, nameOf = opts.nameOf || ((x) => x);
  const fkeys = A.single && B.single ? [''] : [...new Set([...A.files.keys(), ...B.files.keys()])].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const bases = { a: A.base, b: B.base };
  const files = fkeys.map((k) => {
    const fa = A.files.get(k), fb = B.files.get(k), kind = (fb || fa).kind;
    const host = both && !dec.pooled ? hostOf(k) : null, hostMissing = !!host && !(A.hosts.has(host) && B.hosts.has(host));
    const rel = (fb || fa).rel, scope = scopeOf(rel, kind);
    const rec = { key: k, rel: A.single && B.single ? `${fa.rel} ↔ ${fb.rel}` : rel, kind, sizeA: fa?.size ?? null, sizeB: fb?.size ?? null, ...(hostMissing ? { hostMissing: true } : {}),
      ...(host ? { host: host.replace(/^[_-]+/, ''), hostName: nameOf(host.replace(/^[_-]+/, '')) } : {}), ...(scope ? { collection: scope, ...collectionInfo(scope) } : {}) };
    if (dec.pooled) { rec.hostsA = fa ? new Set(fa.parts.map((p) => p.host)).size : 0; rec.hostsB = fb ? new Set(fb.parts.map((p) => p.host)).size : 0; }
    if (kind === 'record') return { ...rec, status: 'record' };
    if (kind === 'raw' && noRaw) return null; // one side is a baseline without collected files
    const cnt = (f, base) => rowCount(f, { base, strict });
    if (!fa) return { ...rec, status: 'added', ...(kind === 'raw' ? {} : { rows: cnt(fb, B.base) }) };
    if (!fb) return { ...rec, status: 'removed', ...(kind === 'raw' ? {} : { rows: cnt(fa, A.base) }) };
    if (kind === 'raw' && !strict) return { ...rec, status: 'same', binary: true, bytesNotCompared: true };
    let ta, tb; try { ta = readTable(fa, { base: A.base, strict }); tb = readTable(fb, { base: B.base, strict }); } catch { ta = tb = null; }
    if (!ta || !tb) return { ...rec, status: fa.size === fb.size && fs.readFileSync(fa.file).equals(fs.readFileSync(fb.file)) ? 'same' : 'changed', binary: true };
    const c = compareTables(ta, tb, { rel, base: bases, strict, pooled: dec.pooled, scope });
    const changed = c.added.length || c.removed.length || c.modified.length;
    return { ...rec, status: changed ? 'changed' : 'same', removed: c.removed.length, added: c.added.length, modified: c.modified.length, same: c.same, noise: c.noiseRows,
      ...(c.expected ? { expected: c.expected } : {}), ...(c.ignored.length ? { ignored: c.ignored } : {}), ...(c.keyColumns.length ? { keyColumns: c.keyColumns } : {}) };
  }).filter(Boolean);
  // the totals cover what was found: not the run records, not the combined file, and not hosts collected in only one of the runs
  const counted = files.filter((f) => f.kind !== 'record' && f.kind !== 'combined' && !f.hostMissing);
  const tally = (s) => counted.filter((f) => f.status === s).length;
  const rows = (s) => counted.reduce((n, f) => n + (f.status === 'changed' ? f[s] || 0 : s === 'modified' ? 0 : f.status === s ? (f.kind === 'raw' ? 1 : f.rows || 0) : 0), 0);
  return {
    a: { path: pa, name: A.name }, b: { path: pb, name: B.name }, strict, files, pooled: !!dec.pooled, ...(dec.reason ? { poolReason: dec.reason } : {}),
    totals: { same: tally('same'), changed: tally('changed'), added: tally('added'), removed: tally('removed') },
    rows: { added: rows('added'), removed: rows('removed'), modified: rows('modified'), noise: counted.reduce((n, f) => n + (f.noise || 0), 0) },
    hosts: both ? { onlyA: [...A0.hosts].filter((h) => !B0.hosts.has(h)), onlyB: [...B0.hosts].filter((h) => !A0.hosts.has(h)) } : { onlyA: [], onlyB: [] },
    hostCounts: both ? { a: A0.hosts.size, b: B0.hosts.size } : null,
    truncated: A.files.size >= MAX_FILES || B.files.size >= MAX_FILES,
  };
}

// The rows behind one changed file: `key` is the file's key from the summary. opts as for summarise, and noise: also list the items
// whose only difference is a time.
function detail(pa, pb, key, opts = {}) {
  const strict = !!opts.strict;
  const A0 = filesOf(pa), B0 = filesOf(pb), dec = poolDecision(A0, B0, opts.pool === undefined ? 'auto' : opts.pool);
  const A = dec.pooled ? filesOf(pa, true) : A0, B = dec.pooled ? filesOf(pb, true) : B0, k = String(key ?? '');
  const fa = A.files.get(k), fb = B.files.get(k);
  if (!fa && !fb) throw bad('That file is not in either run');
  const ta = fa && readTable(fa, { base: A.base, strict }), tb = fb && readTable(fb, { base: B.base, strict });
  if ((fa && !ta) || (fb && !tb)) return { binary: true };
  const none = { csv: false, header: [], rows: [], hosts: [] };
  const f = fb || fa, scope = A.single && B.single ? stemOf(f.rel) : scopeOf(f.rel, f.kind);
  const c = compareTables(ta || { ...none, csv: !!(tb && tb.csv), header: tb ? tb.header : [] }, tb || { ...none, csv: !!(ta && ta.csv), header: ta ? ta.header : [] },
    { rel: f.rel, base: { a: A.base, b: B.base }, strict, pooled: dec.pooled, noiseList: !!opts.noise, scope });
  const cut = (l) => l.slice(0, MAX_SHOWN);
  const nm = opts.nameOf || ((x) => x), names = (l) => (l ? l.map((h) => nm(String(h).replace(/^[_-]+/, ''))) : undefined);
  const out = (x) => (x.hosts ? { ...x, hosts: names(x.hosts), ...(x.hostsA ? { hostsA: names(x.hostsA) } : {}) } : x);
  return {
    csv: c.csv, header: c.header, ignored: c.ignored, timeColumns: c.timeColumns, keyColumns: c.keyColumns, pooled: dec.pooled,
    added: cut(c.added).map((x) => x.row), removed: cut(c.removed).map((x) => x.row),
    addedItems: cut(c.added).map(out), removedItems: cut(c.removed).map(out), modified: cut(c.modified).map(out),
    addedTotal: c.added.length, removedTotal: c.removed.length, modifiedTotal: c.modified.length, noiseRows: c.noiseRows, noise: c.noise,
    same: c.same, shown: MAX_SHOWN, expected: c.expected,
    ...(scope && !strict ? { scope, addedKeys: cut(c.added).map((x) => x.key), removedKeys: cut(c.removed).map((x) => x.key), modifiedKeys: cut(c.modified).map((x) => x.key) } : {}),
  };
}

// The files of one run, for picking a single file to compare.
function list(vpath) {
  const A = filesOf(vpath);
  return [...A.files.entries()].map(([key, f]) => ({ key, rel: f.rel, size: f.size, kind: f.kind })).sort((x, y) => x.rel.localeCompare(y.rel, undefined, { numeric: true }));
}

module.exports = { summarise, detail, list, kindOf, scopeOf, collectionInfo, compareTables, VOLATILE, _setRules: (fn) => { collectionRules = fn; } };
