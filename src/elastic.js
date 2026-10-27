const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { db, save } = require('./store');
const { encrypt, decrypt } = require('./crypto');
const { parseCsv, runDir } = require('./output');

// Forwarding hunt results to Elasticsearch (Settings > System > Elastic, kept in db.settings.elastic). Each hunt decides for itself whether
// it sends (run.sendElastic, set in the New Hunt dialog); the settings page holds the connection and whether new hunts send by default.
// Every row of every collection's CSV becomes one document, sent with the _bulk API as results arrive:
//   index       <prefix>-<collection>      one index per collection (so columns of different collections never share a mapping)
//   _id         hash of run + file + row   sending a run again overwrites its documents instead of duplicating them
//   @timestamp  when the row was collected
//   host.name, host.ip, event.dataset, event.module
//   kookaburrow.{run_id, hunt, run_by, scheduled, collection, collection_id}   run_by is the user who started the hunt (a schedule's creator)
//   kookaburrow.data.<column>              the CSV columns, as text
// Works with plain Elasticsearch 7/8 and with SOF-ELK (point it at the Elasticsearch port, 9200).
const DEFAULTS = { enabled: false, url: '', auth: 'none', username: '', index: 'kookaburrow', insecure: false, ca: '' };
const err = (m) => Object.assign(new Error(m), { status: 400 });

function raw() { return { ...DEFAULTS, ...((db.settings && db.settings.elastic) || {}) }; }
const hasSecret = (s) => !!(s.apiKeyEnc || s.passwordEnc);

// What the page sees: never the secret itself.
function settings() {
  const s = raw();
  return { enabled: !!s.enabled, url: s.url, auth: s.auth, username: s.username, index: s.index, insecure: !!s.insecure, ca: s.ca, hasApiKey: !!s.apiKeyEnc, hasPassword: !!s.passwordEnc };
}

const indexOk = (s) => /^[a-z0-9][a-z0-9._-]{0,80}$/.test(s);
function normalise(b, cur) {
  const out = { ...cur };
  if (b.url !== undefined) {
    let u = String(b.url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
    if (u) { try { const p = new URL(u); if (!/^https?:$/.test(p.protocol)) throw 0; u = p.origin + (p.pathname === '/' ? '' : p.pathname.replace(/\/+$/, '')); } catch { throw err('The address is not a valid http:// or https:// URL'); } }
    out.url = u;
  }
  if (b.auth !== undefined) { if (!['none', 'apikey', 'basic'].includes(b.auth)) throw err('Unknown sign-in type'); out.auth = b.auth; }
  if (b.username !== undefined) out.username = String(b.username).trim();
  if (b.index !== undefined) { const i = String(b.index).trim().toLowerCase(); if (!indexOk(i)) throw err('The index name may only use lowercase letters, digits, . _ - (and must start with a letter or digit)'); out.index = i; }
  if (b.insecure !== undefined) out.insecure = !!b.insecure;
  if (b.ca !== undefined) { const ca = String(b.ca).trim(); if (ca && !/-----BEGIN CERTIFICATE-----/.test(ca)) throw err('The CA must be a PEM certificate (-----BEGIN CERTIFICATE-----)'); out.ca = ca; }
  // a secret is only replaced when one is typed; clearApiKey / clearPassword remove it
  if (b.apiKey) out.apiKeyEnc = encrypt(String(b.apiKey).trim());
  if (b.password) out.passwordEnc = encrypt(String(b.password));
  if (b.clearApiKey) delete out.apiKeyEnc;
  if (b.clearPassword) delete out.passwordEnc;
  if (b.enabled !== undefined) out.enabled = !!b.enabled;
  if (out.auth === 'apikey' && !out.apiKeyEnc) { if (out.enabled) throw err('Enter the API key'); }
  if (out.auth === 'basic' && (!out.username || !out.passwordEnc)) { if (out.enabled) throw err('Enter the user name and password'); }
  if (out.enabled && !out.url) throw err('Enter the Elasticsearch address first');
  return out;
}
function setSettings(b) {
  db.settings = { ...(db.settings || {}), elastic: normalise(b || {}, raw()) };
  save();
  if (queue.length) kick();
}

// ---- talking to Elasticsearch ----
function authHeader(s) {
  if (s.auth === 'apikey' && s.apiKeyEnc) {
    let k = decrypt(s.apiKeyEnc);
    if (k.includes(':')) k = Buffer.from(k).toString('base64'); // "id:key" form
    return `ApiKey ${k}`;
  }
  if (s.auth === 'basic' && s.passwordEnc) return 'Basic ' + Buffer.from(`${s.username}:${decrypt(s.passwordEnc)}`).toString('base64');
  return null;
}
function request(s, method, urlPath, body, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const u = new URL(s.url + urlPath);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = { Accept: 'application/json' };
    const a = authHeader(s); if (a) headers.Authorization = a;
    if (body !== undefined) { headers['Content-Type'] = contentType; headers['Content-Length'] = Buffer.byteLength(body); }
    const opts = { method, headers, timeout: 30000 };
    if (u.protocol === 'https:') { opts.rejectUnauthorized = !s.insecure; if (s.ca) opts.ca = s.ca; }
    const r = lib.request(u, opts, (res) => {
      const parts = []; res.on('data', (d) => parts.push(d));
      res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ } resolve({ status: res.statusCode, json, text }); });
    });
    r.on('timeout', () => r.destroy(new Error('timed out')));
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}
const friendly = (e) => {
  const c = e.code || '';
  if (c === 'ECONNREFUSED') return 'Connection refused: nothing is listening at that address and port';
  if (c === 'ENOTFOUND') return 'The host name could not be found';
  if (c === 'ETIMEDOUT' || /timed out/.test(e.message)) return 'Timed out: the server did not answer';
  if (/self.signed|unable to verify|certificate|CERT_/i.test(c + ' ' + e.message)) return 'The server\'s certificate is not trusted. Paste its CA below, or tick "Skip certificate check"';
  if (/wrong version number|EPROTO/.test(c + e.message)) return 'The server did not speak TLS on that port: try http:// instead of https://';
  return e.message || String(e);
};

// Can we reach it, sign in, and write? `b` can carry unsaved values from the form (a blank secret falls back to the saved one).
async function test(b = {}) {
  const cur = raw();
  const s = normalise({ ...b, enabled: false }, cur);
  if (!s.url) throw err('Enter the Elasticsearch address first');
  const out = { ok: false, url: s.url };
  try {
    const r = await request(s, 'GET', '/');
    if (r.status === 401 || r.status === 403) { out.error = r.status === 401 ? 'Sign-in was refused: check the API key or user name and password' : 'This account is not allowed to read the cluster. It needs the "monitor" cluster privilege'; return out; }
    if (r.status !== 200 || !r.json) { out.error = `Unexpected answer (HTTP ${r.status}). Is this the Elasticsearch port (usually 9200)?`; return out; }
    out.cluster = r.json.cluster_name; out.node = r.json.name; out.version = r.json.version && r.json.version.number;
    if (!r.json.version) { out.error = 'That is not Elasticsearch'; return out; }
  } catch (e) { out.error = friendly(e); return out; }
  // can it create and write to our indices? (not available when security is off)
  try {
    const p = await request(s, 'POST', '/_security/user/_has_privileges', JSON.stringify({ index: [{ names: [`${s.index}-*`], privileges: ['auto_configure', 'create_index', 'index'] }] }));
    if (p.status === 200 && p.json) {
      out.security = true;
      out.canWrite = !!p.json.has_all_requested;
      if (!out.canWrite) out.missing = Object.entries((p.json.index || {})[`${s.index}-*`] || {}).filter(([, v]) => !v).map(([k]) => k);
    } else if (p.status === 401 || p.status === 403) { out.security = true; out.canWrite = null; out.note = 'Signed in, but the account cannot check its own privileges'; }
    else { out.security = false; out.canWrite = true; out.note = 'Security looks switched off on this server (no sign-in needed)'; }
  } catch (e) { out.canWrite = null; }
  out.ok = out.canWrite !== false;
  if (out.canWrite === false) out.error = `The account cannot write to ${s.index}-*: it needs ${out.missing.length ? out.missing.join(', ') : 'create_index, index and auto_configure'} on that index pattern`;
  return out;
}

// ---- turning rows into documents ----
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'collection';
const colName = (c, i) => String(c).trim().replace(/[.\s]+/g, '_').replace(/^_+|_+$/g, '') || `column_${i + 1}`;

function rowsToDocs(csv, ctx) {
  const table = parseCsv(csv);
  if (table.length < 2) return [];
  const names = []; // unique, dot-free column names
  table[0].forEach((c, i) => { let n = colName(c, i); while (names.includes(n)) n += '_'; names.push(n); });
  const s = raw(), index = `${s.index}-${slug(ctx.collection.name)}`;
  const when = ctx.when || new Date().toISOString();
  const tcol = ctx.timeColumn ? names.indexOf(colName(ctx.timeColumn, 0)) : -1;
  return table.slice(1).map((r, i) => {
    const data = {};
    names.forEach((n, j) => { if (r[j] !== undefined && r[j] !== '') data[n] = r[j]; });
    // a column the processor says holds the event time becomes @timestamp (the collection time is the fallback)
    let at = when;
    if (tcol >= 0 && r[tcol]) {
      let v = String(r[tcol]).replace(' +', '+').replace(' -', '-');
      if (ctx.timeEpoch && /^\d+(\.\d+)?$/.test(v)) v = new Date(Number(v) * 1000).toISOString(); // seconds since 1970 (Zeek)
      if (ctx.timeUtc && !/(Z|[+-]\d\d:?\d\d)$/i.test(v)) v = v.replace(' ', 'T') + 'Z'; // the tool writes UTC without saying so
      const t = Date.parse(v); if (!Number.isNaN(t)) at = new Date(t).toISOString(); }
    const id = crypto.createHash('sha1').update(`${ctx.run.id}|${ctx.file || ctx.collection.id}|${ctx.host.address}|${i}`).digest('hex');
    return {
      index, id, run: ctx.run,
      doc: {
        '@timestamp': at,
        event: { module: 'kookaburrow', dataset: `kookaburrow.${slug(ctx.collection.name)}`, kind: 'event' },
        host: { name: ctx.host.hostLabel || ctx.host.name || ctx.host.address, ip: [ctx.host.address] },
        kookaburrow: { ...(ctx.workflow ? { workflow: ctx.workflow.name, processor: ctx.workflow.processor } : {}), run_id: ctx.run.id, hunt: ctx.run.name, run_by: ctx.run.startedBy || 'unknown', ...(ctx.run.scheduleId ? { scheduled: true } : {}), collection: ctx.collection.name, collection_id: ctx.collection.id, data },
      },
    };
  });
}

// ---- the send queue ----
const MAX_QUEUE = 500000, BATCH_DOCS = 500, BATCH_BYTES = 5 * 1024 * 1024;
const queue = [];
const stats = { sent: 0, failed: 0, lastOkAt: null, lastError: null, lastErrorAt: null };
let working = false, timer = null;

const bump = (run, key, n, error) => {
  run.elastic = run.elastic || { sent: 0, failed: 0 };
  run.elastic[key] += n;
  if (error) { run.elastic.lastError = error; }
  if (key === 'sent') run.elastic.lastAt = new Date().toISOString();
};
function kick() { if (!timer && !working && queue.length) timer = setTimeout(() => { timer = null; work(); }, queue.length >= BATCH_DOCS ? 0 : 1000); }

async function work() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const s = raw();
      const batch = []; let bytes = 0;
      while (queue.length && batch.length < BATCH_DOCS && bytes < BATCH_BYTES) { const it = queue.shift(); it.line = JSON.stringify({ index: { _index: it.index, _id: it.id } }) + '\n' + JSON.stringify(it.doc) + '\n'; bytes += it.line.length; batch.push(it); }
      let attempt = 0, done = false;
      while (!done) {
        try {
          const r = await request(s, 'POST', '/_bulk', batch.map((b) => b.line).join(''), 'application/x-ndjson');
          if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`HTTP ${r.status}`), { retry: true });
          if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Elasticsearch refused the sign-in or the privileges'), { fatal: true });
          if (r.status !== 200 || !r.json) throw Object.assign(new Error(`HTTP ${r.status}: ${String(r.text).slice(0, 150)}`), { fatal: true });
          const failed = new Map();
          (r.json.items || []).forEach((it, i) => { const x = it.index || it.create || {}; if (x.error) failed.set(i, `${x.error.type}: ${x.error.reason}`.slice(0, 200)); });
          let ok = 0;
          batch.forEach((b, i) => { if (failed.has(i)) { bump(b.run, 'failed', 1, failed.get(i)); stats.failed++; } else { bump(b.run, 'sent', 1); ok++; } });
          stats.sent += ok; if (ok) stats.lastOkAt = new Date().toISOString();
          if (failed.size) { stats.lastError = [...failed.values()][0]; stats.lastErrorAt = new Date().toISOString(); }
          done = true;
        } catch (e) {
          if (e.retry || (!e.fatal && !e.status)) {
            if (++attempt <= 4) { await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
          }
          const msg = e.fatal ? e.message : friendly(e);
          for (const b of batch) bump(b.run, 'failed', 1, msg);
          stats.failed += batch.length; stats.lastError = msg; stats.lastErrorAt = new Date().toISOString();
          done = true;
        }
      }
      save();
    }
  } finally { working = false; }
}

function enqueue(items) {
  if (queue.length + items.length > MAX_QUEUE) { stats.lastError = `The send queue is full (${MAX_QUEUE} documents); rows were dropped`; stats.lastErrorAt = new Date().toISOString(); return false; }
  for (const it of items) queue.push(it);
  kick();
  return true;
}

// Called by the hunt runner for each collection result as it is saved. Never throws.
function forwardResult({ run, collection, host, csv }) {
  try {
    const s = raw();
    if (!run.sendElastic || !s.url || !csv) return;
    enqueue(rowsToDocs(csv, { run, collection, host, file: `${collection.id}`, when: new Date().toISOString() }));
  } catch (e) { stats.lastError = e.message; stats.lastErrorAt = new Date().toISOString(); }
}

// A processor's output (a CSV a workflow produced) as documents. The hunt decides whether it is sent (run.sendElastic). Returns { queued } or { skipped: reason }.
const MAX_FILE = 300 * 1024 * 1024;
// A Zeek log (tab separated, with #fields and other # header lines) as CSV text. "-" (unset) and "(empty)" become empty cells.
function zeekToCsv(text) {
  const cell = (v) => (v === '-' || v === '(empty)' ? '' : /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  let header = null;
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('#fields')) { header = line.split('\t').slice(1); out.push(header.map(cell).join(',')); continue; }
    if (line[0] === '#') continue;
    if (header) out.push(line.replace(/\r$/, '').split('\t').map(cell).join(','));
  }
  return out.join('\n') + '\n';
}

function forwardFile({ run, collection, host, file, relName, timeColumn, timeUtc, timeEpoch, format, workflow }) {
  const s = raw();
  if (!s.url) return { skipped: 'Elastic is not set up (Settings > System > Elastic)' };
  const size = fs.statSync(file).size;
  if (size > MAX_FILE) return { skipped: `the output is ${(size / 1048576).toFixed(0)} MB, over the ${MAX_FILE / 1048576} MB limit for sending` };
  const text = fs.readFileSync(file, 'utf8');
  const items = rowsToDocs(format === 'zeek' ? zeekToCsv(text) : text, { run, collection, host, file: relName, timeColumn, timeUtc, timeEpoch, workflow, when: new Date().toISOString() });
  if (!enqueue(items)) return { skipped: 'the send queue is full' };
  return { queued: items.length };
}

// Send (or send again) everything a finished hunt saved. Documents have fixed ids, so nothing is duplicated.
function forwardRun(runId) {
  const run = db.runs.find((r) => r.id === runId);
  if (!run || run.kind !== 'hunt') throw Object.assign(new Error('Hunt not found'), { status: 404 });
  const s = raw();
  if (!s.url) throw err('Set the Elasticsearch address first');
  if (run.status === 'running') throw err('The hunt is still running');
  const dir = runDir(run);
  if (!dir) throw err('This hunt has no saved results folder');
  run.elastic = { sent: 0, failed: 0 };
  let docs = 0;
  for (const r of run.results || []) {
    if (r.status !== 'ok' || !r.file) continue;
    let csv; try { csv = fs.readFileSync(path.join(dir, ...r.file.split('/')), 'utf8'); } catch { continue; }
    const items = rowsToDocs(csv, { run, collection: { id: r.collectionId, name: r.collectionName }, host: r, file: r.collectionId, when: r.finishedAt || run.finishedAt });
    docs += items.length;
    if (!enqueue(items)) throw err('The send queue is full');
  }
  kick();
  save();
  return { queued: docs };
}

// Is Elastic set up, and should a new hunt send to it unless told otherwise (Settings > System > Elastic, "send hunts by default")?
const configured = () => !!raw().url;
const defaultOn = () => !!raw().enabled && configured();
const target = () => { try { return new URL(raw().url).host; } catch { return ''; } };

function status() { return { ...stats, queued: queue.length, working }; }

module.exports = {
  zeekToCsv, settings, setSettings, test, forwardResult, forwardRun, forwardFile, status, configured, defaultOn, target, DEFAULTS, rowsToDocs };
