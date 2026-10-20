const fs = require('fs');
const crypto = require('crypto');
const { save } = require('./store');

// The hunt activity log (a chain-of-custody trail, same idea as KingfishIR's Log tab). Every action a hunt takes is
// recorded with a UTC timestamp, in two places: run.events (what Output > Log shows) and a CSV file in the hunt's
// evidence folder (hunt-log.csv) that is appended to as it happens, so it survives outside the platform.
// An event is { t, kind, host, action, artefact, size, sourceHash, receivedHash, match, outcome, detail }.
// kind drives the row colour: hunt, session (host/tool steps), collect, evidence, warn, error.
// Credentials and output text must never be put in an event.
const FIELDS = ['Timestamp', 'Host', 'Action', 'Artefact', 'SizeBytes', 'SourceHash', 'ReceivedHash', 'Match', 'Outcome', 'Detail'];

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csvLine = (cells) => cells.map(cell).join(',') + '\r\n';
const toRow = (e) => [e.t, e.host, e.action, e.artefact, e.size, e.sourceHash, e.receivedHash, e.match, e.outcome, e.detail];
const toCsv = (events) => csvLine(FIELDS) + events.map((e) => csvLine(toRow(e))).join('');

function createAudit(run, csvPath) {
  run.events = [];
  fs.writeFileSync(csvPath, csvLine(FIELDS));
  return {
    log(e) {
      const ev = {
        t: new Date().toISOString(), kind: e.kind || 'session', host: e.host || '-', action: e.action || '', artefact: e.artefact || '',
        size: e.size ?? '', sourceHash: e.sourceHash || '', receivedHash: e.receivedHash || '',
        match: e.sourceHash && e.receivedHash ? (e.sourceHash === e.receivedHash ? 'Y' : 'N') : 'N/A',
        outcome: e.outcome || 'ok', detail: e.detail || '',
      };
      run.events.push(ev);
      try { fs.appendFileSync(csvPath, csvLine(toRow(ev))); } catch { /* the log in the database still has it */ }
      save();
      return ev;
    },
  };
}

// Hunts run before the log existed have no events; rebuild a plain summary from what was stored.
function eventsFor(run) {
  if (Array.isArray(run.events)) return run.events;
  const ev = (t, o) => ({ t, kind: 'collect', host: '-', action: '', artefact: '', size: '', sourceHash: '', receivedHash: '', match: 'N/A', outcome: 'ok', detail: '', ...o });
  const out = [ev(run.startedAt, {
    kind: 'hunt', action: 'Hunt started', detail: `${run.collectionName || 'collection'} on ${new Set(run.results.map((r) => r.hostId)).size} host(s) (reconstructed: this hunt ran before the activity log existed)`,
  })];
  for (const r of [...run.results].filter((x) => x.finishedAt).sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
    const bad = r.status === 'error';
    out.push(ev(r.finishedAt, {
      kind: bad ? 'error' : 'collect', host: r.address, action: 'collect', artefact: r.collectionName || run.collectionName,
      outcome: bad ? 'error' : 'ok',
      detail: bad ? String(r.error || r.stderr || 'Failed').split(/\r?\n/)[0].slice(0, 300) : [r.rows != null ? `${r.rows} rows` : '', r.file ? `→ ${r.file}` : '', r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : ''].filter(Boolean).join(' '),
    }));
  }
  if (run.finishedAt) out.push(ev(run.finishedAt, { kind: run.status === 'completed' ? 'hunt' : 'error', action: run.status === 'completed' ? 'Hunt complete' : `Hunt ${run.status.replaceAll('_', ' ')}`, outcome: run.status === 'completed' ? 'ok' : 'error', detail: run.evidenceDir ? `evidence saved to evidence/${run.evidenceDir}` : '' }));
  return out;
}

module.exports = { createAudit, eventsFor, toCsv, sha256 };
