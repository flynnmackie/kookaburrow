const fs = require('fs');
const path = require('path');
const { outputDir } = require('./config');

// Where hunts and responses keep what they brought back. Layout (H_ for a hunt, R_ for a response):
//   output/
//     hunts/     H_<name>_<YYYYMMDD_HHMM>/
//     responses/ R_<name>_<YYYYMMDD_HHMM>/
//   and inside each run's folder:
//     H_<name>_<date>_Log.csv           the activity log
//     H_<name>_<date>_All_Hosts.csv     every host's rows from every CSV, with the target IP added to each row
//     H_<name>_<date>_All_Hosts.json    the run's details and the collected data as JSON
//     H_<name>_<date>_<IP>/             one folder per host
//       <collection or action>_<date>_<IP>.csv
//       raw/                            raw artefacts pulled back from the host (only when there are any)
//   output/Pulled-Files/ is where files pulled from a shell go.
const GROUPS = { hunt: ['H', 'hunts'], response: ['R', 'responses'] };

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
// Anything that is not a letter, digit, dash or dot (spaces, \ / : * ? " < > | and the rest) becomes an underscore, so a name is
// always a valid Windows file name.
const safeName = (s, fallback = 'x') => String(s ?? '').trim().replace(/[^A-Za-z0-9.-]+/g, '_').replace(/_+/g, '_').replace(/^[_.]+|[_.]+$/g, '').slice(0, 60) || fallback;

// Creates output/<hunts|responses>/<H|R>_<name>_<date>/ (a number is added if that name is already taken) and returns its names.
function createRunFolder(kind, name, when) {
  const [letter, group] = GROUPS[kind], date = stamp(when);
  fs.mkdirSync(path.join(outputDir, group), { recursive: true });
  const root = `${letter}_${safeName(name, kind)}_${date}`;
  let base = root, n = 2;
  while (fs.existsSync(path.join(outputDir, group, base))) base = `${root}_${n++}`;
  fs.mkdirSync(path.join(outputDir, group, base));
  return { base, date, rel: `${group}/${base}`, abs: path.join(outputDir, group, base) };
}
// A run's folder on disk, or null when the stored path is not one folder directly under hunts/ or responses/.
function runDir(run) {
  if (!run?.outputPath || !/^(hunts|responses)\/[^\\/]+$/.test(run.outputPath)) return null;
  return path.join(outputDir, ...run.outputPath.split('/'));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvRow = (cells) => cells.map(csvCell).join(',');

// Minimal CSV reader (quotes, doubled quotes, line breaks inside quotes). Returns an array of rows.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false, i = 0;
  const s = text.replace(/^﻿/, '');
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// What an action printed, as a CSV: one row per line, with a Stream column saying whether it came from stdout or stderr.
const streamsToCsv = (stdout, stderr) => {
  const lines = (t, label) => (t ? String(t).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n').map((l) => [label, l]) : []);
  return [['Stream', 'Output'], ...lines(stdout, 'stdout'), ...lines(stderr, 'stderr')].map(csvRow).join('\r\n') + '\r\n';
};

// Joins CSVs into one. parts: [{ item, address, csv }]. Columns that differ share one combined header and are left blank where a
// part has no value. The target IP is added to the end of every row; with withItem the name of the collection or action it came
// from is added at the start (for the single All_Hosts.csv that holds every collection).
function combine(parts, { itemLabel = 'Collection', withItem = false } = {}) {
  const parsed = parts.map((p, order) => ({ ...p, order, table: parseCsv(p.csv) })).filter((p) => p.table.length);
  const columns = [];
  for (const p of parsed) for (const c of p.table[0]) if (!columns.includes(c)) columns.push(c);
  parsed.sort((a, b) => a.order - b.order || 0);
  const uniq = (n) => { while (columns.includes(n)) n += '_added'; return n; };
  const lead = withItem ? uniq(itemLabel) : null, tail = uniq('TargetIP');
  const header = [...(withItem ? [lead] : []), ...columns, tail];
  const out = [header];
  let rows = 0;
  for (const p of parsed) {
    const idx = columns.map((c) => p.table[0].indexOf(c));
    for (const r of p.table.slice(1)) { out.push([...(withItem ? [p.item] : []), ...idx.map((i) => (i < 0 ? '' : r[i] ?? '')), p.address]); rows++; }
  }
  const records = out.slice(1).map((r) => Object.fromEntries(header.map((c, i) => [c, r[i]])));
  return { csv: out.map(csvRow).join('\r\n') + '\r\n', columns: header, rows, records };
}

module.exports = { GROUPS, stamp, safeName, createRunFolder, runDir, csvRow, parseCsv, streamsToCsv, combine };
