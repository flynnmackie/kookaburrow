const fs = require('fs');
const path = require('path');
const browse = require('./browse');
const { parseCsv } = require('./output');
const keys = require('./diff-keys');

// Cross-host comparison (Results > Analysis): one hunt's CSV from every host side by side, to find the host that is not like the others.
// Three views of the same data:
//   rows     every distinct row and how many hosts have it (a service, port or autorun found on one host out of forty stands out);
//   items    drift: an item (a service, a task, a local user) is found by its key columns, and the hosts that have it are grouped by what
//            else is true of it: "Spooler: Running on 38 hosts, Stopped on 2". An item some hosts lack is listed as partial;
//   hosts    each host scored by how far it is from the rest (rows nobody else has, items it has in a minority state, common items it lacks).
// A row is matched on every column except the ones that differ between hosts for no reason: process ids and counters (src/diff-keys.js
// VOLATILE, a collection's $DiffIgnore), and times (a column of dates, or named like one). The user can put any of them back.
const MAX_BYTES = 20 * 1024 * 1024, MAX_ROWS = 5000, MAX_ITEMS = 2000;
const STAMP = /[_-]?\d{8}[_-]\d{4,6}(?:-\d+)?/g;
const bad = (m) => Object.assign(new Error(m), { status: 400 });

// The hosts of a run: each folder directly inside it holds that host's CSVs (the combined All-Hosts folder is not a host). Host folders
// are named <run folder>_<IP> (older runs: just the IP), and a host's CSVs <collection>_<date>_<IP>.csv, so the key of a CSV is its
// name with the date and the host taken out: the same collection lines up across hosts. Workflow output in processed/ is included
// (key processed/<processor>/<file>); collected files in raw/ are not CSVs of rows.
function hostDirs(vpath) {
  const n = browse.node(vpath);
  if (n.top || !n.dir || !n.full) throw bad('Choose a run');
  const runBase = n.segs[n.segs.length - 1], out = [];
  for (const name of fs.readdirSync(n.full)) {
    if (name.startsWith('.') || /^All[-_]Hosts/i.test(name)) continue;
    const dir = path.join(n.full, name);
    let st; try { st = fs.lstatSync(dir); } catch { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const host = name.startsWith(`${runBase}_`) ? name.slice(runBase.length + 1) : name;
    const keyOf = (rel) => rel.replace(STAMP, '').split(`_${host}.`).join('.').replace(/__+/g, '_');
    const files = [];
    const walk = (d, rel) => {
      for (const f of fs.readdirSync(d)) {
        if (f.startsWith('.')) continue;
        const full = path.join(d, f), r = rel ? `${rel}/${f}` : f;
        let s; try { s = fs.lstatSync(full); } catch { continue; }
        if (s.isSymbolicLink()) continue;
        if (s.isDirectory()) { if (!(rel === '' && f === 'raw')) walk(full, r); }
        else if (/\.csv$/i.test(f)) files.push({ file: full, key: keyOf(r), size: s.size, mtime: s.mtimeMs });
      }
    };
    walk(dir, '');
    out.push({ host, files });
  }
  return out;
}

// The CSVs that can be compared: each one, how many of the run's hosts have it, and a label (the collection's name, from labelOf).
function list(vpath, labelOf = () => null) {
  const hosts = hostDirs(vpath), by = new Map();
  for (const h of hosts) for (const f of h.files) { const e = by.get(f.key) || { key: f.key, hosts: 0 }; e.hosts++; by.set(f.key, e); }
  // a CSV from only one host has nothing to be compared with, so it is not offered
  const files = [...by.values()].filter((f) => f.hosts >= 2).map((f) => ({ ...f, label: labelOf(f.key) || null }));
  return { hosts: hosts.length, files: files.sort((a, b) => (a.key.startsWith('processed/') - b.key.startsWith('processed/')) || (a.label || a.key).localeCompare(b.label || b.key, undefined, { numeric: true })) };
}

const ruleOf = (key) => { if (key.includes('/')) return null; try { return require('./collections').diffRules().byStem.get(key.replace(/\.csv$/i, '').toLowerCase()) || null; } catch { return null; } };

// Reads one CSV from every host that has it.
function readTables(vpath, key) {
  const hosts = hostDirs(vpath);
  const sources = hosts.map((h) => ({ host: h.host, f: h.files.find((f) => f.key === key) })).filter((x) => x.f);
  if (!sources.length) throw bad('That file is not in this run');
  if (sources.length < 2) throw bad('Only one host has that file, so there is nothing to compare it with');
  const tables = sources.map((s) => {
    if (s.f.size > MAX_BYTES) return { host: s.host, header: [], rows: [], skipped: true };
    const rows = parseCsv(fs.readFileSync(s.f.file, 'utf8'));
    return { host: s.host, header: rows[0] || [], rows: rows.slice(1) };
  });
  return { tables, hostsTotal: hosts.length, sig: sources.map((s) => `${s.host}:${s.f.size}:${s.f.mtime}`).join('|') };
}

// opts: columns (the columns a row is matched on), keyColumns (the item key), nameOf (host folder -> name)
function analyse(tables, key, opts = {}) {
  const nameOf = opts.nameOf || ((x) => x), low = keys.low;
  const columns = [];
  for (const t of tables) for (const c of t.header) if (!columns.includes(c)) columns.push(c);
  const aligned = tables.map((t) => { const idx = columns.map((c) => t.header.indexOf(c)); return { host: t.host, rows: t.rows.map((r) => idx.map((i) => (i < 0 ? '' : r[i] ?? ''))) }; });
  const rule = ruleOf(key), all = aligned.flatMap((t) => t.rows);
  const cls = keys.classify(columns, all, { ignore: rule?.ignore || [] });
  let useIdx;
  if (Array.isArray(opts.columns) && opts.columns.length) useIdx = columns.map((c, i) => (opts.columns.includes(c) ? i : -1)).filter((i) => i >= 0);
  else if (rule?.key?.length && columns.some((c) => rule.key.map(low).includes(low(c)))) useIdx = columns.map((c, i) => (rule.key.map(low).includes(low(c)) ? i : -1)).filter((i) => i >= 0);
  else useIdx = cls.other.length ? cls.other : columns.map((_, i) => i).filter((i) => !cls.volatile.includes(i));
  if (!useIdx.length) throw bad('Choose at least one column to match rows on');
  const tup = (r, idx) => JSON.stringify(idx.map((i) => r[i]));
  // the item key
  let keyIdx = [];
  if (Array.isArray(opts.keyColumns) && opts.keyColumns.length) keyIdx = columns.map((c, i) => (opts.keyColumns.includes(c) && useIdx.includes(i) ? i : -1)).filter((i) => i >= 0);
  else if (rule?.key?.length) keyIdx = useIdx.slice();
  else if (useIdx.length > 1) { const k = keys.inferKey(useIdx, aligned.map((t) => t.rows.slice(0, 20000)), (r) => tup(r, useIdx), columns); if (k && k.length < useIdx.length) keyIdx = k; }
  const restIdx = useIdx.filter((i) => !keyIdx.includes(i));
  const n = tables.length;
  // rows
  const rowsMap = new Map();
  for (const t of aligned) {
    const seen = new Set();
    for (const r of t.rows) {
      const k = tup(r, useIdx);
      if (seen.has(k)) continue;
      seen.add(k);
      let e = rowsMap.get(k); if (!e) { e = { values: r, hosts: [] }; rowsMap.set(k, e); }
      e.hosts.push(t.host);
    }
  }
  const rows = [...rowsMap.values()].sort((a, b) => a.hosts.length - b.hosts.length).slice(0, MAX_ROWS).map((e) => ({ values: e.values, count: e.hosts.length, hosts: e.hosts.map(nameOf) }));
  // items: key -> variants
  const items = [], score = new Map(aligned.map((t) => [t.host, { rare: 0, minority: 0, missing: 0 }]));
  let same = 0;
  if (keyIdx.length) {
    const by = new Map();
    for (const t of aligned) {
      const seen = new Set();
      for (const r of t.rows) {
        const k = tup(r, keyIdx), v = tup(r, restIdx), id = `${k}\u0001${v}`;
        if (seen.has(id)) continue;
        seen.add(id);
        let it = by.get(k); if (!it) { it = { key: keyIdx.map((i) => r[i]), variants: new Map(), hosts: new Set() }; by.set(k, it); }
        let va = it.variants.get(v); if (!va) { va = { values: restIdx.map((i) => r[i]), hosts: [] }; it.variants.set(v, va); }
        va.hosts.push(t.host); it.hosts.add(t.host);
      }
    }
    for (const it of by.values()) {
      const vars = [...it.variants.values()].sort((a, b) => b.hosts.length - a.hosts.length);
      const differs = vars.length > 1, partial = !differs && it.hosts.size < n;
      if (!differs && !partial) { same++; continue; }
      const lacking = aligned.filter((t) => !it.hosts.has(t.host)).map((t) => t.host);
      // a minority is a state held by fewer than half of the hosts that have the item; an item most hosts have is missing from the rest
      if (differs) for (const va of vars.slice(1)) for (const h of va.hosts) score.get(h).minority++;
      if (it.hosts.size * 2 > n) for (const h of lacking) score.get(h).missing++;
      else if (it.hosts.size === 1 || it.hosts.size * 10 <= n) for (const h of it.hosts) score.get(h).rare++;
      items.push({ key: it.key, kind: differs ? 'differs' : 'partial', hostsWith: it.hosts.size, variants: vars.map((va) => ({ values: va.values, count: va.hosts.length, hosts: va.hosts.map(nameOf) })), lacking: lacking.map(nameOf) });
    }
    items.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'differs' ? -1 : 1) || Math.min(...a.variants.map((v) => v.count)) - Math.min(...b.variants.map((v) => v.count)) || a.hostsWith - b.hostsWith);
  } else for (const e of rowsMap.values()) if (e.hosts.length === 1 && n > 2) score.get(e.hosts[0]).rare++;
  const hostScores = aligned.map((t) => { const s = score.get(t.host); return { host: nameOf(t.host), rows: t.rows.length, ...s, score: s.rare + s.minority + s.missing }; }).sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
  const names = (idx) => idx.map((i) => columns[i]);
  return {
    key, columns, matchOn: names(useIdx), keyColumns: names(keyIdx), restColumns: names(restIdx),
    volatileColumns: names(cls.volatile), timeColumns: names(cls.time),
    hosts: tables.map((t) => ({ host: nameOf(t.host), rows: t.rows.length, skipped: !!t.skipped })), hostsWith: n,
    rows, totalRows: rowsMap.size, truncated: rowsMap.size > MAX_ROWS,
    items: items.slice(0, MAX_ITEMS), itemCounts: { differs: items.filter((i) => i.kind === 'differs').length, partial: items.filter((i) => i.kind === 'partial').length, same, truncated: items.length > MAX_ITEMS },
    hostScores,
    onOneHost: n > 2 ? [...rowsMap.values()].filter((e) => e.hosts.length === 1).length : 0,
  };
}

function compare(vpath, key, opts = {}, nameOf = (x) => x) {
  const { tables, hostsTotal } = readTables(vpath, key);
  return { ...analyse(tables, key, { ...(Array.isArray(opts) ? { columns: opts } : opts), nameOf }), hostsTotal };
}

// One line per comparable CSV of a run: how much it differs between hosts, so the interesting ones can be opened first.
// Kept for a minute per run (the files are read once).
const cache = new Map();
function overview(vpath, labelOf = () => null, nameOf = (x) => x) {
  const hosts = hostDirs(vpath), by = new Map();
  for (const h of hosts) for (const f of h.files) { const e = by.get(f.key) || { key: f.key, hosts: 0 }; e.hosts++; by.set(f.key, e); }
  const out = [];
  for (const e of by.values()) {
    if (e.hosts < 2) continue;
    let r = null;
    try {
      const { tables, sig } = readTables(vpath, e.key), ck = `${vpath}|${e.key}`, hit = cache.get(ck);
      if (hit && hit.sig === sig && Date.now() - hit.at < 60000) r = hit.r;
      else { r = analyse(tables, e.key, { nameOf: (x) => x }); r.rows = []; r.items = []; cache.set(ck, { sig, at: Date.now(), r }); if (cache.size > 300) cache.delete(cache.keys().next().value); }
    } catch { r = null; }
    const top = r && r.hostScores.length && r.hostScores[0].score ? r.hostScores[0] : null;
    out.push({ key: e.key, label: labelOf(e.key) || null, hosts: e.hosts, rows: r ? r.totalRows : null, onOneHost: r ? r.onOneHost : 0,
      differs: r ? r.itemCounts.differs : 0, partial: r ? r.itemCounts.partial : 0, keyColumns: r ? r.keyColumns : [],
      oddHost: top ? { host: nameOf(top.host), score: top.score } : null, skipped: !r });
  }
  const interest = (x) => x.differs * 3 + x.partial * 2 + x.onOneHost;
  return { hosts: hosts.length, collections: out.sort((a, b) => interest(b) - interest(a) || (a.key.startsWith('processed/') - b.key.startsWith('processed/')) || (a.label || a.key).localeCompare(b.label || b.key)) };
}

module.exports = { list, compare, overview };
