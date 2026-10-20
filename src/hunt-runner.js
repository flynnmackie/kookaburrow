const fs = require('fs');
const path = require('path');
const { db, save, id } = require('./store');
const { evidenceDir, runConcurrency } = require('./config');
const collections = require('./collections');
const { createAudit, sha256 } = require('./audit');

// A hunt runs one or more collections on a set of hosts and writes what comes back to
//   evidence/YYYYMMDD-HHMMSS-HuntName/
//     <ip address>/<collection>.csv     one folder per host hunted, one CSV per collection
//     All-Hosts/<collection>.csv        every host's rows for that collection in one CSV (Hostname and HostAddress first)
//     hunt-log.csv                      the activity log: every action the hunt took, timestamped, with hashes of what it wrote
//     All-Hosts/hunt.json               the hunt's details and, for each All-Hosts CSV, its full contents as records (one object per row)
// The run is also kept in db.runs (kind 'hunt') so Burrow > Hunt lists it.
const ALL_HOSTS = 'All-Hosts';

const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
// Names become folder names: keep letters, digits, dash and underscore only.
const safe = (s, fallback) => String(s || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
const safeAddr = (s) => String(s || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'host';

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

// Linux collections print text; each line becomes a row of a one-column CSV so the evidence is CSV everywhere.
const linesToCsv = (text) => ['Output', ...text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')].map(csvCell).join('\r\n') + '\r\n';
// PowerShell output may carry a leading/trailing blank line from Out-String.
const tidyCsv = (text) => text.replace(/^\s*\r?\n/, '').replace(/\s+$/, '') + '\r\n';

function createHuntFolder(name, when) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const base = `${stamp(when)}-${safe(name, 'Hunt')}`;
  let dir = base, n = 2;
  while (fs.existsSync(path.join(evidenceDir, dir))) dir = `${base}-${n++}`;
  fs.mkdirSync(path.join(evidenceDir, dir));
  return dir;
}

// Joins every host's CSV for one collection: Hostname and Address first, rows grouped by hostname. Hosts whose
// columns differ share one combined header and are left blank where they have no value.
function combine(parts) { // parts: [{ hostname, address, csv }]
  const parsed = parts.map((p) => ({ ...p, table: parseCsv(p.csv) })).filter((p) => p.table.length);
  const columns = [];
  for (const p of parsed) for (const c of p.table[0]) if (!columns.includes(c)) columns.push(c);
  parsed.sort((a, b) => a.hostname.localeCompare(b.hostname) || a.address.localeCompare(b.address, undefined, { numeric: true }));
  // the two leading columns are renamed with _host if the collection already has one of that name (Listening ports has Address)
  const lead = ['Hostname', 'HostAddress'].map((n) => { let x = n; while (columns.includes(x)) x += '_host'; return x; });
  const out = [[...lead, ...columns]];
  let rows = 0;
  for (const p of parsed) {
    const idx = columns.map((c) => p.table[0].indexOf(c));
    for (const r of p.table.slice(1)) { out.push([p.hostname, p.address, ...idx.map((i) => (i < 0 ? '' : r[i] ?? ''))]); rows++; }
  }
  // the same rows as JSON objects (column name -> value, values exactly as in the CSV) for loading into Elastic and the like
  const all = [...lead, ...columns];
  const records = out.slice(1).map((r) => Object.fromEntries(all.map((c, i) => [c, r[i]])));
  return { csv: out.map(csvRow).join('\r\n') + '\r\n', columns: all, rows, records };
}

function startHunt({ name, collectionIds, hosts, startedBy, scheduleId }) {
  const chosen = collectionIds.map((cid) => {
    const c = collections.resolveCollection(cid);
    if (!c) throw new Error(`Unknown collection: ${cid}`);
    return c;
  });
  if (!chosen.length) throw new Error('Select at least one collection');
  if (!hosts.length) throw new Error('Select at least one host or group');
  const huntName = String(name || '').trim();
  if (!huntName) throw new Error('Give the hunt a name');

  const started = new Date();
  const folder = createHuntFolder(huntName, started);
  const label = (h) => h.hostname || h.name || h.address;

  const run = {
    id: id(), kind: 'hunt', name: huntName, startedBy: startedBy || null, ...(scheduleId ? { scheduleId } : {}),
    collectionIds: chosen.map((c) => c.id), collectionNames: chosen.map((c) => c.name),
    collectionName: chosen.map((c) => c.name).join(', '),
    evidenceDir: folder, status: 'running', startedAt: started.toISOString(),
    results: hosts.flatMap((h) => chosen.map((c) => ({
      hostId: h.id, hostLabel: label(h), address: h.address, collectionId: c.id, collectionName: c.name, status: 'queued',
    }))),
  };
  db.runs.unshift(run);
  save();
  const audit = createAudit(run, path.join(evidenceDir, folder, 'hunt-log.csv'));
  audit.log({ kind: 'hunt', action: 'Hunt started', detail: `${huntName}: ${chosen.length} collection${chosen.length === 1 ? '' : 's'} (${run.collectionName}) on ${hosts.length} host${hosts.length === 1 ? '' : 's'}${startedBy ? `, started by ${startedBy}` : ''}` });
  const proto = (h) => (h.protocol === 'ssh' ? 'SSH' : 'WinRM');

  const data = new Map(); // `${collectionId}|${hostId}` -> csv text
  (async () => {
    let next = 0;
    // one worker per host at a time; a host's collections run one after another
    await Promise.all(Array.from({ length: Math.min(runConcurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const host = hosts[next++];
        let okRuns = 0;
        audit.log({ kind: 'session', host: host.address, action: 'host started', detail: `${label(host)} over ${proto(host)}` });
        for (const c of chosen) {
          const res = run.results.find((r) => r.hostId === host.id && r.collectionId === c.id);
          res.status = 'running'; save();
          audit.log({ kind: 'collect', host: host.address, action: 'collection started', artefact: c.name,
            detail: `${c.kind}, footprint ${c.footprint}, returns ${c.returns}${c.dependencies.length ? `; copies ${c.dependencies.join(', ')} to a temporary folder on the host` : ''}` });
          const out = await collections.executeOnHost(host, c, { csv: true });
          const ok = out.exitCode === 0;
          let rows = 0, file = '';
          if (ok) {
            const csv = c.type === 'powershell' && host.protocol === 'winrm' ? tidyCsv(out.stdout) : linesToCsv(out.stdout);
            const dir = path.join(evidenceDir, folder, safeAddr(host.address));
            fs.mkdirSync(dir, { recursive: true });
            const base = `${path.basename(c.file, path.extname(c.file))}.csv`;
            fs.writeFileSync(path.join(dir, base), csv);
            file = `${safeAddr(host.address)}/${base}`;
            rows = Math.max(0, parseCsv(csv).length - 1);
            data.set(`${c.id}|${host.id}`, csv);
          }
          const error = ok ? '' : String(out.stderr || out.stdout || 'Failed').trim().split(/\r?\n/)[0].slice(0, 300);
          if (ok) {
            okRuns++;
            const csv = data.get(`${c.id}|${host.id}`);
            audit.log({ kind: 'collect', host: host.address, action: 'collect', artefact: c.name, size: Buffer.byteLength(csv), receivedHash: sha256(csv),
              outcome: rows ? 'ok' : 'ok (empty)', detail: `${rows} row${rows === 1 ? '' : 's'} in ${(out.durationMs / 1000).toFixed(1)}s → ${file}` });
            if (out.truncated) audit.log({ kind: 'warn', host: host.address, action: 'output truncated', artefact: c.name, outcome: 'warning', detail: 'The output was larger than the size limit and was cut off' });
          } else {
            audit.log({ kind: 'error', host: host.address, action: 'collect', artefact: c.name, outcome: 'error', detail: error });
          }
          if (c.dependencies.length) {
            audit.log({ kind: 'session', host: host.address, action: 'tool cleanup', artefact: c.dependencies.join(', '), outcome: ok ? 'ok' : 'unconfirmed',
              detail: ok ? 'temporary folder removed from the host after the run' : 'the run failed, so removal of the temporary folder was not confirmed; check the host' });
          }
          Object.assign(res, { status: ok ? 'ok' : 'error', exitCode: out.exitCode, durationMs: out.durationMs, rows, file, error, truncated: !!out.truncated, finishedAt: new Date().toISOString() });
          save();
        }
        audit.log({ kind: 'session', host: host.address, action: 'host finished', outcome: okRuns === chosen.length ? 'ok' : 'errors', detail: `${okRuns} of ${chosen.length} collection${chosen.length === 1 ? '' : 's'} ok` });
      }
    }));

    // All-Hosts: one combined CSV per collection, plus hunt.json describing the hunt and those CSVs
    const allDir = path.join(evidenceDir, folder, ALL_HOSTS);
    fs.mkdirSync(allDir, { recursive: true });
    const details = [];
    for (const c of chosen) {
      const base = `${path.basename(c.file, path.extname(c.file))}.csv`;
      const mine = run.results.filter((r) => r.collectionId === c.id);
      const parts = hosts.filter((h) => data.has(`${c.id}|${h.id}`)).map((h) => ({ hostname: label(h), address: h.address, csv: data.get(`${c.id}|${h.id}`) }));
      let combined = null;
      if (parts.length) {
        combined = combine(parts); fs.writeFileSync(path.join(allDir, base), combined.csv);
        audit.log({ kind: 'evidence', host: 'All hosts', action: 'evidence written', artefact: c.name, size: Buffer.byteLength(combined.csv), receivedHash: sha256(combined.csv),
          detail: `${combined.rows} row${combined.rows === 1 ? '' : 's'} from ${parts.length} host${parts.length === 1 ? '' : 's'} → ${ALL_HOSTS}/${base}` });
      }
      details.push({
        collection: { id: c.id, name: c.name, description: c.description, type: c.type, kind: c.kind, footprint: c.footprint, returns: c.returns, tags: c.tags },
        file: combined ? `${ALL_HOSTS}/${base}` : null,
        columns: combined ? combined.columns : [],
        totalRows: combined ? combined.rows : 0,
        records: combined ? combined.records : [], // the contents of the All-Hosts CSV, one object per row
        hosts: mine.map((r) => ({
          hostname: r.hostLabel, address: r.address, status: r.status, rows: r.rows || 0,
          file: r.file || null, durationMs: r.durationMs ?? null, error: r.error || null,
        })),
      });
    }
    run.status = run.results.some((r) => r.status === 'error') ? 'completed_with_errors' : 'completed';
    run.finishedAt = new Date().toISOString();
    const huntJson = JSON.stringify({
      name: huntName, startedBy: startedBy || null, folder, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      hosts: hosts.map((h) => ({ hostname: label(h), address: h.address, os: h.os || null, protocol: h.protocol })),
      collections: details,
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(allDir, 'hunt.json'), huntJson);
    audit.log({ kind: 'evidence', host: 'All hosts', action: 'evidence written', artefact: 'hunt.json', size: Buffer.byteLength(huntJson), receivedHash: sha256(huntJson), detail: `${ALL_HOSTS}/hunt.json` });
    const okAll = run.results.filter((r) => r.status === 'ok').length;
    audit.log({ kind: 'hunt', action: run.status === 'completed' ? 'Hunt complete' : 'Hunt completed with errors', outcome: run.status === 'completed' ? 'ok' : 'errors',
      detail: `${okAll} of ${run.results.length} collection runs ok; evidence saved to evidence/${folder}` });
    save();
  })().catch((e) => {
    run.status = 'failed'; run.error = e.message; run.finishedAt = new Date().toISOString();
    audit.log({ kind: 'error', action: 'Hunt failed', outcome: 'error', detail: e.message });
    save();
  });

  return run;
}

module.exports = { startHunt, parseCsv, createHuntFolder };
