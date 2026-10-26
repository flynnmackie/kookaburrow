const fs = require('fs');
const path = require('path');
const browse = require('./browse');
const { parseCsv } = require('./output');

// Cross-host comparison (Results > Analysis): one hunt's CSV from every host side by side. A row is a row of the CSV (or of the chosen
// columns); for each one we count how many hosts have it, so a service, port or autorun found on one host out of forty stands out.
const MAX_BYTES = 20 * 1024 * 1024, MAX_ROWS = 5000;
const STAMP = /[_-]?\d{8}[_-]\d{4,6}(?:-\d+)?/g;
const bad = (m) => Object.assign(new Error(m), { status: 400 });

// The hosts of a run: each folder directly inside it holds that host's CSVs (the combined All-Hosts folder is not a host).
function hostDirs(vpath) {
  const n = browse.node(vpath);
  if (n.top || !n.dir || !n.full) throw bad('Choose a run');
  const out = [];
  for (const name of fs.readdirSync(n.full)) {
    if (name.startsWith('.') || /^All[-_]Hosts/i.test(name)) continue;
    const dir = path.join(n.full, name);
    let st; try { st = fs.lstatSync(dir); } catch { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const files = fs.readdirSync(dir).filter((f) => /\.csv$/i.test(f) && !f.startsWith('.')).map((f) => ({ file: path.join(dir, f), key: f.replace(STAMP, '').replace(name, '').replace(/[_-]+(?=\.csv$)/i, '').replace(/__+/g, '_') }));
    out.push({ host: name, files });
  }
  return out;
}

// The CSVs that can be compared: each one and how many of the run's hosts have it.
function list(vpath) {
  const hosts = hostDirs(vpath), by = new Map();
  for (const h of hosts) for (const f of h.files) { const e = by.get(f.key) || { key: f.key, hosts: 0 }; e.hosts++; by.set(f.key, e); }
  // a CSV from only one host has nothing to be compared with, so it is not offered
  return { hosts: hosts.length, files: [...by.values()].filter((f) => f.hosts >= 2).sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })) };
}

// nameOf maps a host folder name (an IP address) to the saved host's name. `cols` picks the columns that identify a row (default: all).
function compare(vpath, key, cols, nameOf = (x) => x) {
  const hosts = hostDirs(vpath);
  const sources = hosts.map((h) => ({ host: h.host, f: h.files.find((f) => f.key === key) })).filter((x) => x.f);
  if (!sources.length) throw bad('That file is not in this run');
  if (sources.length < 2) throw bad('Only one host has that file, so there is nothing to compare it with');
  const tables = sources.map((s) => {
    const size = fs.statSync(s.f.file).size;
    if (size > MAX_BYTES) return { host: s.host, header: [], rows: [], skipped: true };
    const rows = parseCsv(fs.readFileSync(s.f.file, 'utf8'));
    return { host: s.host, header: rows[0] || [], rows: rows.slice(1) };
  });
  const columns = [];
  for (const t of tables) for (const c of t.header) if (!columns.includes(c)) columns.push(c);
  const use = Array.isArray(cols) && cols.length ? columns.filter((c) => cols.includes(c)) : columns;
  if (!use.length) throw bad('Choose at least one column to match rows on');
  const agg = new Map();
  for (const t of tables) {
    const idx = columns.map((c) => t.header.indexOf(c));
    const seen = new Set();
    for (const r of t.rows) {
      const full = idx.map((i) => (i < 0 ? '' : r[i] ?? ''));
      const k = JSON.stringify(use.map((c) => full[columns.indexOf(c)]));
      if (seen.has(k)) continue; // a host counts once for a row
      seen.add(k);
      let e = agg.get(k); if (!e) { e = { values: full, hosts: [] }; agg.set(k, e); }
      e.hosts.push(t.host);
    }
  }
  const rows = [...agg.values()].sort((a, b) => a.hosts.length - b.hosts.length).slice(0, MAX_ROWS)
    .map((e) => ({ values: e.values, count: e.hosts.length, hosts: e.hosts.map(nameOf) }));
  return {
    key, columns, matchOn: use, hostsWith: sources.length, hostsTotal: hosts.length,
    hosts: tables.map((t) => ({ host: nameOf(t.host), rows: t.rows.length, skipped: !!t.skipped })),
    rows, totalRows: agg.size, truncated: agg.size > MAX_ROWS,
  };
}

module.exports = { list, compare };
