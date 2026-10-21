const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, save, id } = require('./store');
const { runConcurrency } = require('./config');
const collections = require('./collections');
const { createAudit, sha256 } = require('./audit');
const { safeName, createRunFolder, streamsToCsv, combine } = require('./output');

// A response runs one or more actions (scripts that CHANGE a host) on a set of hosts. It mirrors a hunt, under output/responses/ (the
// layout is described in src/output.js): a folder per response, a folder per host with one CSV per action (what the action printed,
// one row per line, with a Stream column), and the response's log, All_Hosts CSV and All_Hosts JSON at the top level.
// It is kept in db.runs with kind 'response' so Burrow > Respond lists it. Parameter VALUES are used to run the action but are
// never stored or logged (they can be passwords); only the parameter names are recorded.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const psQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;
const shQuote = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;

// The action with its parameters set as variables of the same name on the first lines.
function withParams(action, values) {
  const lines = action.parameters.map((p) => (action.type === 'bash' ? `${p}=${shQuote(values[p])}` : `$${p} = ${psQuote(values[p])}`));
  if (!lines.length) return action.text;
  const nl = action.type === 'bash' ? '\n' : '\r\n';
  return `${lines.join(nl)}${nl}${action.text}`;
}

function startResponse({ name, actionIds, hosts, params, startedBy, scheduleId }) {
  const chosen = actionIds.map((aid) => {
    const a = collections.resolveAction(aid);
    if (!a) throw new Error(`Unknown action: ${aid}`);
    return a;
  });
  if (!chosen.length) throw new Error('Select at least one action');
  if (!hosts.length) throw new Error('Select at least one host or group');
  const respName = String(name || '').trim();
  if (!respName) throw new Error('Give the response a name');
  const values = new Map(); // action id -> { parameter: value }
  for (const a of chosen) {
    const given = (params && typeof params[a.id] === 'object' && params[a.id]) || {}, v = {};
    for (const p of a.parameters) {
      if (!IDENT.test(p)) throw new Error(`${a.name}: "${p}" is not a valid parameter name`);
      const x = given[p] == null ? '' : given[p];
      if (String(x) === '' && !a.optionalParameters.includes(p)) throw new Error(`${a.name}: enter a value for ${p}`);
      if (String(x).includes('\0')) throw new Error(`${a.name}: ${p} has an invalid character`);
      v[p] = String(x);
    }
    values.set(a.id, v);
  }

  const started = new Date();
  const folder = createRunFolder('response', respName, started);
  const label = (h) => h.hostname || h.name || h.address;
  const proto = (h) => (h.protocol === 'ssh' ? 'SSH' : 'WinRM');
  const hostBase = (h) => `${folder.base}_${safeName(h.address, 'host')}`;
  const outputs = new Map(); // `${actionId}|${hostId}` -> csv text
  const run = {
    id: id(), kind: 'response', name: respName, startedBy: startedBy || null, ...(scheduleId ? { scheduleId } : {}),
    actionIds: chosen.map((a) => a.id), actionNames: chosen.map((a) => a.name),
    collectionIds: [], collectionName: chosen.map((a) => a.name).join(', '),
    parameterNames: Object.fromEntries(chosen.map((a) => [a.id, a.parameters.map((p) => (a.optionalParameters.includes(p) ? `${p}?` : p))])),
    outputPath: folder.rel, status: 'running', startedAt: started.toISOString(),
    results: hosts.flatMap((h) => chosen.map((a) => ({ hostId: h.id, hostLabel: label(h), address: h.address, actionId: a.id, actionName: a.name, status: 'queued' }))),
  };
  db.runs.unshift(run);
  save();
  const audit = createAudit(run, path.join(folder.abs, `${folder.base}_Log.csv`));
  audit.log({ kind: 'hunt', action: 'Response started', detail: `${respName}: ${chosen.length} action${chosen.length === 1 ? '' : 's'} (${run.collectionName}) on ${hosts.length} host${hosts.length === 1 ? '' : 's'}${startedBy ? `, started by ${startedBy}` : ''}` });

  (async () => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(runConcurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const host = hosts[next++];
        let okRuns = 0;
        audit.log({ kind: 'session', host: host.address, action: 'host started', detail: `${label(host)} over ${proto(host)}` });
        for (const a of chosen) {
          const res = run.results.find((r) => r.hostId === host.id && r.actionId === a.id);
          res.status = 'running'; save();
          audit.log({ kind: 'collect', host: host.address, action: 'action started', artefact: a.name,
            detail: `${a.kind}, footprint ${a.footprint}${a.parameters.length ? `; parameters: ${a.parameters.join(', ')}` : ''}${a.dependencies.length ? `; copies ${a.dependencies.join(', ')} to a temporary folder on the host` : ''}` });
          const full = withParams(a, values.get(a.id));
          const tmp = path.join(os.tmpdir(), `kb-act-${id()}${path.extname(a.file)}`);
          let out;
          try {
            fs.writeFileSync(tmp, full);
            out = await collections.executeOnHost(host, { ...a, file: tmp, text: full }, { csv: false });
          } finally { fs.promises.unlink(tmp).catch(() => {}); }
          const ok = out.exitCode === 0;
          const dir = path.join(folder.abs, hostBase(host));
          fs.mkdirSync(dir, { recursive: true });
          const base = `${safeName(path.basename(a.file, path.extname(a.file)), 'action')}_${folder.date}_${safeName(host.address, 'host')}.csv`, file = `${hostBase(host)}/${base}`;
          const text = streamsToCsv(out.stdout, out.stderr);
          fs.writeFileSync(path.join(dir, base), text);
          outputs.set(`${a.id}|${host.id}`, text);
          const error = ok ? '' : String(out.stderr || out.stdout || 'Failed').trim().split(/\r?\n/)[0].slice(0, 300);
          if (ok) {
            okRuns++;
            audit.log({ kind: 'collect', host: host.address, action: 'action finished', artefact: a.name, size: Buffer.byteLength(text), receivedHash: sha256(text),
              outcome: 'ok', detail: `completed in ${(out.durationMs / 1000).toFixed(1)}s → ${file}` });
          } else audit.log({ kind: 'error', host: host.address, action: 'action failed', artefact: a.name, outcome: 'error', detail: error });
          if (a.dependencies.length) {
            audit.log({ kind: 'session', host: host.address, action: 'tool cleanup', artefact: a.dependencies.join(', '), outcome: ok ? 'ok' : 'unconfirmed',
              detail: ok ? 'temporary folder removed from the host after the run' : 'the run failed, so removal of the temporary folder was not confirmed; check the host' });
          }
          Object.assign(res, { status: ok ? 'ok' : 'error', exitCode: out.exitCode, durationMs: out.durationMs, file, error, truncated: !!out.truncated, finishedAt: new Date().toISOString() });
          save();
        }
        audit.log({ kind: 'session', host: host.address, action: 'host finished', outcome: okRuns === chosen.length ? 'ok' : 'errors', detail: `${okRuns} of ${chosen.length} action${chosen.length === 1 ? '' : 's'} ok` });
      }
    }));
    run.status = run.results.some((r) => r.status === 'error') ? 'completed_with_errors' : 'completed';
    run.finishedAt = new Date().toISOString();
    // The All_Hosts CSV (every action on every host in one file) and JSON, at the top level of the response's folder
    const allBase = `${folder.base}_All_Hosts`;
    const partsOf = (a) => hosts.filter((h) => outputs.has(`${a.id}|${h.id}`)).map((h) => ({ item: a.name, address: h.address, csv: outputs.get(`${a.id}|${h.id}`) }));
    const everything = combine(chosen.flatMap(partsOf), { itemLabel: 'Action', withItem: true });
    if (chosen.some((a) => partsOf(a).length)) {
      fs.writeFileSync(path.join(folder.abs, `${allBase}.csv`), everything.csv);
      audit.log({ kind: 'evidence', host: 'All hosts', action: 'output written', artefact: 'All_Hosts.csv', size: Buffer.byteLength(everything.csv), receivedHash: sha256(everything.csv), detail: `${everything.rows} row${everything.rows === 1 ? '' : 's'} → ${allBase}.csv` });
    }
    const json = JSON.stringify({
      name: respName, startedBy: startedBy || null, folder: folder.base, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt,
      hosts: hosts.map((h) => ({ hostname: label(h), address: h.address, os: h.os || null, protocol: h.protocol })),
      actions: chosen.map((a) => ({ id: a.id, name: a.name, description: a.description, type: a.type, parameters: a.parameters,
        output: (partsOf(a).length ? combine(partsOf(a)).records : []), // what the action printed on each host, one object per line, with TargetIP
        hosts: run.results.filter((r) => r.actionId === a.id).map((r) => ({ hostname: r.hostLabel, address: r.address, status: r.status, file: r.file || null, durationMs: r.durationMs ?? null, error: r.error || null })) })),
    }, null, 2) + '\n';
    fs.writeFileSync(path.join(folder.abs, `${allBase}.json`), json);
    audit.log({ kind: 'evidence', host: 'All hosts', action: 'output written', artefact: 'All_Hosts.json', size: Buffer.byteLength(json), receivedHash: sha256(json), detail: `${allBase}.json` });
    const okAll = run.results.filter((r) => r.status === 'ok').length;
    audit.log({ kind: 'hunt', action: run.status === 'completed' ? 'Response complete' : 'Response completed with errors', outcome: run.status === 'completed' ? 'ok' : 'errors', detail: `${okAll} of ${run.results.length} action runs ok; output saved to output/${folder.rel}` });
    save();
  })().catch((e) => {
    run.status = 'failed'; run.error = e.message; run.finishedAt = new Date().toISOString();
    audit.log({ kind: 'error', action: 'Response failed', outcome: 'error', detail: e.message });
    save();
  });
  return run;
}
module.exports = { startResponse };
