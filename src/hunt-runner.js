const fs = require('fs');
const path = require('path');
const { db, save, id } = require('./store');
const { runConcurrency } = require('./config');
const collections = require('./collections');
const { createAudit, sha256 } = require('./audit');
const { safeName, createRunFolder, parseCsv, combine } = require('./output');

// A hunt runs one or more collections on a set of hosts and writes what comes back under output/hunts/ (the layout is described in
// src/output.js): a folder per hunt, a folder per host inside it with one CSV per collection, and the hunt's log, All_Hosts CSV and
// All_Hosts JSON next to those. The run is also kept in db.runs (kind 'hunt') so Burrow > Hunt lists it.

const csvCell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Linux collections print text; each line becomes a row of a one-column CSV so the output is CSV everywhere.
const linesToCsv = (text) => ['Output', ...text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')].map(csvCell).join('\r\n') + '\r\n';
// PowerShell output may carry a leading/trailing blank line from Out-String.
const tidyCsv = (text) => text.replace(/^\s*\r?\n/, '').replace(/\s+$/, '') + '\r\n';

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
  const folder = createRunFolder('hunt', huntName, started);
  const label = (h) => h.hostname || h.name || h.address;

  const run = {
    id: id(), kind: 'hunt', name: huntName, startedBy: startedBy || null, ...(scheduleId ? { scheduleId } : {}),
    collectionIds: chosen.map((c) => c.id), collectionNames: chosen.map((c) => c.name),
    collectionName: chosen.map((c) => c.name).join(', '),
    outputPath: folder.rel, status: 'running', startedAt: started.toISOString(),
    results: hosts.flatMap((h) => chosen.map((c) => ({
      hostId: h.id, hostLabel: label(h), address: h.address, collectionId: c.id, collectionName: c.name, status: 'queued',
    }))),
  };
  db.runs.unshift(run);
  save();
  const audit = createAudit(run, path.join(folder.abs, `${folder.base}_Log.csv`));
  audit.log({ kind: 'hunt', action: 'Hunt started', detail: `${huntName}: ${chosen.length} collection${chosen.length === 1 ? '' : 's'} (${run.collectionName}) on ${hosts.length} host${hosts.length === 1 ? '' : 's'}${startedBy ? `, started by ${startedBy}` : ''}` });
  const proto = (h) => (h.protocol === 'ssh' ? 'SSH' : 'WinRM');
  const hostBase = (h) => `${folder.base}_${safeName(h.address, 'host')}`;

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
            const dir = path.join(folder.abs, hostBase(host));
            fs.mkdirSync(dir, { recursive: true });
            const base = `${safeName(path.basename(c.file, path.extname(c.file)), 'collection')}_${folder.date}_${safeName(host.address, 'host')}.csv`;
            fs.writeFileSync(path.join(dir, base), csv);
            file = `${hostBase(host)}/${base}`;
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
          Object.assign(res, { status: ok ? 'ok' : 'error', exitCode: out.exitCode, durationMs: out.durationMs, file, error, truncated: !!out.truncated, finishedAt: new Date().toISOString() });
          save();
        }
        audit.log({ kind: 'session', host: host.address, action: 'host finished', outcome: okRuns === chosen.length ? 'ok' : 'errors', detail: `${okRuns} of ${chosen.length} collection${chosen.length === 1 ? '' : 's'} ok` });
      }
    }));

    // The All_Hosts CSV (every collection and host in one file) and JSON (the same data as records, per collection), top level of the hunt's folder
    const allBase = `${folder.base}_All_Hosts`;
    const partsOf = (c) => hosts.filter((h) => data.has(`${c.id}|${h.id}`)).map((h) => ({ item: c.name, address: h.address, csv: data.get(`${c.id}|${h.id}`) }));
    const everything = combine(chosen.flatMap(partsOf), { itemLabel: 'Collection', withItem: true });
    if (chosen.some((c) => partsOf(c).length)) {
      fs.writeFileSync(path.join(folder.abs, `${allBase}.csv`), everything.csv);
      audit.log({ kind: 'evidence', host: 'All hosts', action: 'output written', artefact: 'All_Hosts.csv', size: Buffer.byteLength(everything.csv), receivedHash: sha256(everything.csv),
        detail: `${everything.rows} row${everything.rows === 1 ? '' : 's'} from ${hosts.length} host${hosts.length === 1 ? '' : 's'} → ${allBase}.csv` });
    }
    const details = chosen.map((c) => {
      const parts = partsOf(c), combined = parts.length ? combine(parts) : null;
      return {
        collection: { id: c.id, name: c.name, description: c.description, type: c.type, kind: c.kind, footprint: c.footprint, returns: c.returns, tags: c.tags },
        columns: combined ? combined.columns : [],
        totalRows: combined ? combined.rows : 0,
        records: combined ? combined.records : [], // this collection's rows from every host, one object per row, with TargetIP
        hosts: run.results.filter((r) => r.collectionId === c.id).map((r) => ({
          hostname: r.hostLabel, address: r.address, status: r.status, rows: r.rows || 0,
          file: r.file || null, durationMs: r.durationMs ?? null, error: r.error || null,
        })),
      };
    });
    run.status = run.results.some((r) => r.status === 'error') ? 'completed_with_errors' : 'completed';
    run.finishedAt = new Date().toISOString();
    const huntJson = JSON.stringify({
      name: huntName, startedBy: startedBy || null, folder: folder.base, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      hosts: hosts.map((h) => ({ hostname: label(h), address: h.address, os: h.os || null, protocol: h.protocol })),
      collections: details,
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(folder.abs, `${allBase}.json`), huntJson);
    audit.log({ kind: 'evidence', host: 'All hosts', action: 'output written', artefact: 'All_Hosts.json', size: Buffer.byteLength(huntJson), receivedHash: sha256(huntJson), detail: `${allBase}.json` });
    const okAll = run.results.filter((r) => r.status === 'ok').length;
    audit.log({ kind: 'hunt', action: run.status === 'completed' ? 'Hunt complete' : 'Hunt completed with errors', outcome: run.status === 'completed' ? 'ok' : 'errors',
      detail: `${okAll} of ${run.results.length} collection runs ok; output saved to output/${folder.rel}` });
    save();
  })().catch((e) => {
    run.status = 'failed'; run.error = e.message; run.finishedAt = new Date().toISOString();
    audit.log({ kind: 'error', action: 'Hunt failed', outcome: 'error', detail: e.message });
    save();
  });

  return run;
}

module.exports = { startHunt, parseCsv };
