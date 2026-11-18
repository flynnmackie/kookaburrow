const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, save, id } = require('./store');
const { dataDir } = require('./config');
const { parseCsv } = require('./output');

// Continuous (Monitor > Continuous): light watching of hosts, with no agent. A watch repeats a few cheap collections every few minutes on
// its hosts and reports only what CHANGED since the last time: a new listening port, a new service, a user that appeared, a process
// that is no longer there. It is a snapshot taken often, not an event stream: something that starts and stops between two runs is missed.
//   watch  { id, name, description, hostIds, listIds, collectionIds, everyMinutes, enabled, createdBy, createdAt, lastRun, nextRun,
//            running, state: { <hostId>: { status: 'ok' | 'error', error, lastRun, collections: { <collectionId>: { rows, at, error } } } } }
//   event  { id, watchId, watchName, at, hostId, host, address, collectionId, collection, kind, title, fields | changes, seen }
//          kind: new | gone | changed | bulk (most of a table changed at once) | unreachable | recovered
// The first run of a host and collection only takes the snapshot (data/watch/<watch>/<host>~<collection>.json): nothing is reported. Rows
// are compared with the Diff rules (src/diff.js): process ids, counters and times that change on every run are not changes, rows
// marked as expected are not reported. Only collections that change nothing on the host, need no uploaded tool and finish quickly
// are offered. Events are kept in db.watchEvents (the newest 5000).
const DIR = path.join(dataDir, 'watch');
const EVERY = [1, 2, 5, 10, 15, 30, 60, 120, 360, 720, 1440];
const MAX_COLLECTIONS = 10, MAX_EVENTS = 5000, PER_TABLE = 60, MAX_ROWS = 20000, HOST_TIMEOUT_MS = 120000, MAX_AT_ONCE = 2;
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const watches = () => (db.watches ||= []);
const events = () => (db.watchEvents ||= []);
const find = (wid) => watches().find((w) => w.id === wid) || null;
const isWin = (h) => h.protocol !== 'ssh';

// What may be watched: collections that change nothing, need no uploaded tool, return no files and need no required parameter.
function eligible() {
  const collections = require('./collections');
  return collections.listCollections('', [''], false)
    .filter((c) => c.footprint === 'none' && !c.dependencies.length && c.transfer !== 'large' && c.parameters.every((p) => c.optionalParameters.includes(p)))
    .map((c) => ({ id: c.id, name: c.name, type: c.type, tags: c.tags || [], description: c.description || '' }));
}
// Ready-made sets, as collection ids (those that do not exist here are left out when offered).
const PRESETS = [
  { id: 'processes', name: 'Processes', description: 'What is running: new and stopped processes.', collections: ['powershell/processes.ps1', 'bash/suspicious-processes.sh'] },
  { id: 'network', name: 'Network', description: 'New listening ports and connections.', collections: ['powershell/listening-ports.ps1', 'powershell/network-connections.ps1', 'bash/network-connections.sh', 'bash/network-socket-owners.sh'] },
  { id: 'persistence', name: 'Persistence', description: 'New autoruns, scheduled tasks, services, cron jobs and startup items.', collections: ['powershell/persistence-run-keys.ps1', 'powershell/tasks-list.ps1', 'powershell/services-unusual.ps1', 'powershell/wmi-persistence.ps1', 'bash/persistence-cron-all.sh', 'bash/persistence-systemd-units.sh', 'bash/shell-startup-persistence.sh'] },
  { id: 'accounts', name: 'Accounts', description: 'New users, admins and logon sessions.', collections: ['powershell/local-users.ps1', 'powershell/local-admins-and-logons.ps1', 'powershell/accounts-sessions.ps1', 'bash/users-and-groups.sh', 'bash/accounts-sudoers.sh', 'bash/ssh-keys-and-config.sh'] },
  { id: 'software', name: 'Software and drivers', description: 'New installed programs and drivers, and remote-access tools.', collections: ['powershell/system-software.ps1', 'powershell/system-drivers.ps1', 'powershell/system-remote-tools.ps1', 'bash/packages-installed.sh', 'bash/kernel-modules-preload.sh'] },
];

function hostsOf(w) {
  const ids = new Set(w.hostIds);
  for (const lid of w.listIds) db.lists.find((l) => l.id === lid)?.hostIds.forEach((h) => ids.add(h));
  return [...ids].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
}
const collectionsOf = (w) => w.collectionIds.map((cid) => require('./collections').resolveCollection(cid)).filter(Boolean);
// the collections that apply to a host: PowerShell ones for Windows (WinRM), bash ones for Linux (SSH)
const forHost = (w, h) => collectionsOf(w).filter((c) => (isWin(h) ? c.type === 'powershell' : c.type === 'bash'));

function clean(b, existing) {
  const name = String(b.name || '').trim();
  if (!name) throw bad('Give the watch a name');
  if (name.length > 80) throw bad('The name is too long (80 characters at most)');
  if (watches().some((w) => w.id !== existing?.id && w.name.toLowerCase() === name.toLowerCase())) throw bad('A watch with that name already exists');
  const hostIds = [...new Set(Array.isArray(b.hostIds) ? b.hostIds.map(String) : [])], listIds = [...new Set(Array.isArray(b.listIds) ? b.listIds.map(String) : [])];
  if (!hostIds.length && !listIds.length) throw bad('Choose at least one host or group');
  for (const l of listIds) if (!db.lists.some((x) => x.id === l)) throw bad('Unknown group');
  const collectionIds = [...new Set(Array.isArray(b.collectionIds) ? b.collectionIds.map(String) : [])];
  if (!collectionIds.length) throw bad('Choose at least one thing to watch');
  if (collectionIds.length > MAX_COLLECTIONS) throw bad(`A watch can have ${MAX_COLLECTIONS} collections at most: it runs every few minutes, so keep it light`);
  const ok = new Set(eligible().map((c) => c.id));
  for (const c of collectionIds) if (!ok.has(c)) throw bad(`${c} cannot be watched: only collections that change nothing, need no uploaded tool and return no files can`);
  const every = Number(b.everyMinutes);
  if (!EVERY.includes(every)) throw bad(`Run every must be one of: ${EVERY.join(', ')} minutes`);
  return { name, description: String(b.description || '').trim().slice(0, 300), hostIds, listIds, collectionIds, everyMinutes: every };
}
function create(b, by) {
  const w = { id: id(), ...clean(b), enabled: true, createdBy: by || null, createdAt: new Date().toISOString(), lastRun: null, nextRun: new Date().toISOString(), running: false, state: {} };
  watches().push(w); save();
  return w;
}
function update(w, b) {
  if (b.enabled !== undefined && Object.keys(b).length === 1) { w.enabled = !!b.enabled; w.nextRun = w.enabled ? new Date().toISOString() : null; save(); return w; }
  const c = clean(b, w);
  // a collection or host that was added is snapshotted on the next run; ones that were taken out lose their snapshots
  Object.assign(w, c); w.updatedAt = new Date().toISOString();
  w.nextRun = w.enabled ? new Date().toISOString() : null;
  prune(w); save();
  return w;
}
function remove(w) {
  db.watches = watches().filter((x) => x.id !== w.id);
  db.watchEvents = events().filter((e) => e.watchId !== w.id);
  fs.rmSync(path.join(DIR, w.id), { recursive: true, force: true }); save();
}
const snapFile = (w, h, c) => path.join(DIR, w.id, `${h.id}~${c.id.replace(/[^A-Za-z0-9.-]+/g, '_')}.json`);
function prune(w) {
  const keep = new Set();
  for (const h of hostsOf(w)) for (const c of forHost(w, h)) keep.add(path.basename(snapFile(w, h, c)));
  try { for (const f of fs.readdirSync(path.join(DIR, w.id))) if (!keep.has(f)) fs.rmSync(path.join(DIR, w.id, f), { force: true }); } catch { /* none yet */ }
}

// The rows a collection returned, as { header, rows }. WinRM collections print CSV; bash ones print lines (one column, "Output").
function table(c, h, out) {
  if (isWin(h)) { const t = parseCsv(String(out.stdout || '').replace(/^\s*\r?\n/, '')); return { header: t[0] || [], rows: t.slice(1) }; }
  const t = parseCsv(require('./output').textToCsv(out.stdout)); // tab-separated rows with a header become columns, other text one column
  return { header: t[0] || [], rows: t.slice(1) };
}
const short = (v) => String(v ?? '').slice(0, 200);
const titleOf = (header, row, keyCols) => {
  const idx = keyCols && keyCols.length ? keyCols.map((k) => header.indexOf(k)).filter((i) => i >= 0) : [];
  const parts = (idx.length ? idx : header.map((_, i) => i)).map((i) => row[i]).filter((v) => v !== '' && v != null).slice(0, 3);
  return short(parts.join(' · ')) || '(row)';
};
const fieldsOf = (header, row) => Object.fromEntries(header.slice(0, 14).map((h, i) => [h, short(row[i])]).filter(([, v]) => v !== ''));

function addEvent(w, h, c, e) {
  events().unshift({ id: id(), watchId: w.id, watchName: w.name, at: new Date().toISOString(), hostId: h.id, host: h.name || h.hostname || h.address, address: h.address, collectionId: c ? c.id : '', collection: c ? c.name : '', seen: false, ...e });
  if (events().length > MAX_EVENTS) events().length = MAX_EVENTS;
}

// One collection on one host: run it, compare with the snapshot, record what changed, keep the new snapshot.
async function watchOne(w, h, c, st) {
  const collections = require('./collections'), diff = require('./diff');
  const text = collections.withParams(c, collections.paramValues(c, {}));
  const tmp = path.join(os.tmpdir(), `kb-watch-${id()}${path.extname(c.file)}`);
  let out;
  try { fs.writeFileSync(tmp, text); out = await collections.executeOnHost(h, { ...c, file: tmp, text }, { csv: true, timeoutMs: HOST_TIMEOUT_MS }); }
  finally { fs.promises.unlink(tmp).catch(() => {}); }
  if (out.exitCode !== 0) throw new Error(String(out.stderr || out.stdout || 'failed').trim().split(/\r?\n/)[0].slice(0, 200));
  const now = table(c, h, out);
  if (now.rows.length > MAX_ROWS) now.rows.length = MAX_ROWS;
  const file = snapFile(w, h, c);
  let before = null;
  try { before = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* the first run */ }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), header: now.header, rows: now.rows }));
  st.collections[c.id] = { rows: now.rows.length, at: new Date().toISOString(), error: '', baseline: !before };
  if (!before) return;
  const stem = require('./output').safeName(path.basename(c.id, path.extname(c.id)), 'collection').toLowerCase();
  const r = diff.compareTables({ csv: true, header: before.header, rows: before.rows, hosts: [] }, { csv: true, header: now.header, rows: now.rows, hosts: [] }, { rel: `${stem}.csv`, scope: stem });
  const total = r.added.length + r.removed.length + r.modified.length;
  if (!total) return;
  // most of a table changing at once is a change of format or a reboot of everything, not forty separate events
  if (total > 20 && total > 0.5 * Math.max(before.rows.length, now.rows.length)) { addEvent(w, h, c, { kind: 'bulk', title: `${total} changes at once (the table has ${Math.max(before.rows.length, now.rows.length)} rows), not listed one by one`, fields: {} }); return; }
  let n = 0;
  const room = () => n++ < PER_TABLE;
  for (const x of r.modified) if (room()) addEvent(w, h, c, { kind: 'changed', title: titleOf(r.header, x.b, r.keyColumns), changes: x.changed.filter((f) => !f.time).slice(0, 12).map((f) => ({ col: f.col, a: short(f.a), b: short(f.b) })), fields: fieldsOf(r.header, x.b) });
  for (const x of r.added) if (room()) addEvent(w, h, c, { kind: 'new', title: titleOf(r.header, x.row, r.keyColumns), fields: fieldsOf(r.header, x.row) });
  for (const x of r.removed) if (room()) addEvent(w, h, c, { kind: 'gone', title: titleOf(r.header, x.row, r.keyColumns), fields: fieldsOf(r.header, x.row) });
  if (total > PER_TABLE) addEvent(w, h, c, { kind: 'bulk', title: `${total - PER_TABLE} more changes were not listed`, fields: {} });
}

let active = 0;
async function run(w) {
  if (w.running) throw bad('It is already running');
  const hosts = hostsOf(w);
  if (!hosts.length) throw bad('None of its hosts exist any more');
  w.running = true; save();
  active++;
  try {
    const runSettings = require('./run-settings');
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(runSettings.settings().concurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const h = hosts[next++], st = (w.state[h.id] ||= { status: 'ok', error: '', lastRun: null, collections: {} });
        const was = st.status; let failed = 0, firstError = '';
        for (const c of forHost(w, h)) {
          try { await watchOne(w, h, c, st); } catch (e) { failed++; firstError ||= e.message; st.collections[c.id] = { ...(st.collections[c.id] || {}), error: e.message, at: new Date().toISOString() }; }
        }
        const applicable = forHost(w, h).length;
        st.lastRun = new Date().toISOString();
        if (applicable && failed === applicable) { st.status = 'error'; st.error = firstError; if (was !== 'error') addEvent(w, h, null, { kind: 'unreachable', title: `Could not collect: ${firstError}`, fields: {} }); }
        else { st.status = 'ok'; st.error = failed ? firstError : ''; if (was === 'error') addEvent(w, h, null, { kind: 'recovered', title: 'Collecting again', fields: {} }); }
        if (!applicable) st.error = `None of the chosen collections is for ${isWin(h) ? 'Windows' : 'Linux'} hosts`;
        save();
      }
    }));
    for (const hid of Object.keys(w.state)) if (!hosts.some((h) => h.id === hid)) delete w.state[hid];
  } finally {
    active--; w.running = false; w.lastRun = new Date().toISOString();
    w.nextRun = w.enabled ? new Date(Date.now() + w.everyMinutes * 60000).toISOString() : null; save();
  }
  return w;
}
function tick() {
  const now = Date.now();
  for (const w of watches()) {
    if (!w.enabled || w.running || !w.nextRun || Date.parse(w.nextRun) > now || active >= MAX_AT_ONCE) continue;
    run(w).catch((e) => { w.running = false; w.lastError = e.message; w.nextRun = new Date(Date.now() + w.everyMinutes * 60000).toISOString(); save(); });
  }
}
function start() {
  for (const w of watches()) { w.running = false; if (w.enabled && (!w.nextRun || Date.parse(w.nextRun) < Date.now())) w.nextRun = new Date(Date.now() + 10000).toISOString(); }
  save();
  setInterval(tick, 15000).unref();
}

const unseen = () => events().filter((e) => !e.seen && !['recovered'].includes(e.kind)).length;
function view(w) {
  const hosts = hostsOf(w), since = Date.now() - 24 * 3600 * 1000;
  const mine = events().filter((e) => e.watchId === w.id);
  return {
    id: w.id, name: w.name, description: w.description, hostIds: w.hostIds, listIds: w.listIds, collectionIds: w.collectionIds, everyMinutes: w.everyMinutes, enabled: w.enabled,
    status: !w.enabled ? 'paused' : w.running ? 'running' : 'active', running: !!w.running, lastRun: w.lastRun, nextRun: w.nextRun, lastError: w.lastError || '', createdBy: w.createdBy, createdAt: w.createdAt,
    collections: collectionsOf(w).map((c) => ({ id: c.id, name: c.name, type: c.type })),
    hosts: hosts.map((h) => { const st = w.state[h.id] || {}; return { id: h.id, name: h.name || h.hostname || h.address, address: h.address, os: isWin(h) ? 'windows' : 'linux', status: st.status || 'waiting', error: st.error || '', lastRun: st.lastRun || null,
      collections: forHost(w, h).map((c) => ({ id: c.id, name: c.name, ...(st.collections && st.collections[c.id] ? st.collections[c.id] : { rows: null }) })) }; }),
    groups: w.listIds.map((l) => db.lists.find((x) => x.id === l)?.name).filter(Boolean),
    events24h: mine.filter((e) => Date.parse(e.at) >= since && e.kind !== 'recovered').length, unseen: mine.filter((e) => !e.seen && e.kind !== 'recovered').length,
  };
}
// Events newest first. q matches the title, host, collection and values; since is an ISO time.
function listEvents({ watch, host, kind, q, since, unseenOnly, limit = 500 } = {}) {
  const s = since ? Date.parse(since) : 0, needle = String(q || '').toLowerCase();
  let l = events().filter((e) => (!watch || e.watchId === watch) && (!host || e.hostId === host) && (!kind || e.kind === kind) && (!s || Date.parse(e.at) >= s) && (!unseenOnly || !e.seen));
  if (needle) l = l.filter((e) => `${e.title} ${e.host} ${e.address} ${e.collection} ${Object.values(e.fields || {}).join(' ')} ${(e.changes || []).map((c) => `${c.col} ${c.a} ${c.b}`).join(' ')}`.toLowerCase().includes(needle));
  return { total: l.length, events: l.slice(0, Math.min(2000, Math.max(1, Number(limit) || 500))) };
}
function markSeen({ ids, all, watch }) {
  const set = ids ? new Set(ids) : null;
  let n = 0;
  for (const e of events()) if (!e.seen && (all ? (!watch || e.watchId === watch) : set && set.has(e.id))) { e.seen = true; n++; }
  if (n) save();
  return n;
}
function presets() {
  const have = new Set(eligible().map((c) => c.id));
  return PRESETS.map((p) => ({ ...p, collections: p.collections.filter((c) => have.has(c)) })).filter((p) => p.collections.length);
}

module.exports = { EVERY, MAX_COLLECTIONS, find, list: () => watches().map(view), view, eligible, presets, create, update, remove, run, start, tick, listEvents, markSeen, unseen };
