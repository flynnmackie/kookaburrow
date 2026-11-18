const { db, save, id } = require('./store');
const { encrypt, decrypt } = require('./crypto');
const collections = require('./collections');
const huntRunner = require('./hunt-runner');
const responseRunner = require('./response-runner');

// Recurring hunts and responses (Burrow > Recurring). When a hunt or response is started with a schedule, it runs straight away and
// then again every `everyMinutes` minutes, until the end time passes or the schedule is deleted (until.type 'time' or 'forever').
// A schedule is { id, kind: 'hunt'|'response', name, hostIds, listIds, itemIds (collection or action ids), params (response only,
// encrypted: the values are needed to run unattended), everyMinutes, until, createdBy, createdAt, nextRun, lastRun, runCount, runIds,
// status: 'active'|'paused'|'finished', lastError }. Every run it starts is an ordinary hunt/response record carrying scheduleId, so it appears
// in the lists and the log with a green R. Missed runs (the server was off) are not made up: at most one run happens when it is back.
const TICK_MS = 5000;
const MAX_EVERY = 60 * 24 * 365; // a year, in minutes

// { everyMinutes, until: { type: 'time', at } | { type: 'forever' } }, checked against the system clock.
function parseSchedule(b, now = Date.now()) {
  const every = Number(b?.everyMinutes);
  if (!Number.isInteger(every) || every < 1 || every > MAX_EVERY) throw new Error('Run every must be a whole number of minutes, at least 1');
  if (b.until?.type === 'forever') return { everyMinutes: every, until: { type: 'forever' } };
  if (b.until?.type !== 'time') throw new Error('Choose when the recurring run ends');
  const at = Date.parse(b.until.at);
  if (!Number.isFinite(at)) throw new Error('The end time is not a valid date');
  if (at <= now) throw new Error('The end time must be in the future');
  return { everyMinutes: every, until: { type: 'time', at: new Date(at).toISOString() } };
}
// How many times it runs in total, counting the one that happens now; null when it never ends.
const totalRuns = (s, now = Date.now()) => (s.until.type === 'forever' ? null : Math.floor((Date.parse(s.until.at) - now) / (s.everyMinutes * 60000)) + 1);
// The next time after `from` that is still before the end, or null when it has finished.
function nextAfter(s, from, now = Date.now()) {
  const step = s.everyMinutes * 60000;
  let t = from + step;
  while (t <= now) t += step; // skip runs that were missed
  return s.until.type === 'time' && t > Date.parse(s.until.at) ? null : new Date(t).toISOString();
}

function prepare({ kind, name, hostIds, listIds, itemIds, params, schedule, createdBy, workflowId = null, sendElastic }) {
  const sched = parseSchedule(schedule);
  return {
    id: id(), kind, ...(workflowId ? { workflowId } : {}), ...(typeof sendElastic === 'boolean' ? { sendElastic } : {}), name: String(name || '').trim(), hostIds: [...hostIds], listIds: [...listIds], itemIds: [...itemIds],
    params: params && Object.keys(params).length ? encrypt(JSON.stringify(params)) : '',
    ...sched, createdBy: createdBy || null, createdAt: new Date().toISOString(),
    nextRun: null, lastRun: null, runCount: 0, runIds: [], status: 'active', lastError: '',
  };
}
// Called once the first run has started: records it and works out when the next one is due.
function activate(s, run) {
  const now = Date.now();
  s.runIds.push(run.id); s.runCount = 1; s.lastRun = run.startedAt;
  s.nextRun = nextAfter(s, now, now);
  if (!s.nextRun) s.status = 'finished';
  db.schedules.unshift(s);
  save();
}

// Pausing keeps the schedule and what it already ran; nothing runs until it is resumed. Resuming starts a fresh cycle: the next run is
// one interval from now (or it finishes, when its end time has already passed).
function pause(s) {
  if (s.status !== 'active') throw new Error(s.status === 'paused' ? 'It is already paused' : 'It has finished, so it cannot be paused');
  s.status = 'paused'; s.nextRun = null; s.lastError = ''; save();
}
function resume(s) {
  if (s.status !== 'paused') throw new Error('It is not paused');
  const now = Date.now();
  s.nextRun = nextAfter(s, now, now);
  s.status = s.nextRun ? 'active' : 'finished';
  s.lastError = ''; save();
}
function hostsOf(s) {
  const ids = new Set(s.hostIds);
  for (const lid of s.listIds) db.lists.find((l) => l.id === lid)?.hostIds.forEach((h) => ids.add(h));
  return [...ids].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
}
function startRun(s) {
  const hosts = hostsOf(s);
  if (!hosts.length) throw new Error('None of its hosts exist any more');
  if (s.kind === 'hunt') return huntRunner.startHunt({ name: s.name, collectionIds: s.itemIds, hosts, params: s.params ? JSON.parse(decrypt(s.params)) : {}, startedBy: s.createdBy, scheduleId: s.id, workflowId: s.workflowId || null, sendElastic: s.sendElastic });
  return responseRunner.startResponse({ name: s.name, actionIds: s.itemIds, hosts, params: s.params ? JSON.parse(decrypt(s.params)) : {}, startedBy: s.createdBy, scheduleId: s.id, approval: s.approval || null });
}

function tick() {
  const now = Date.now();
  for (const s of db.schedules) {
    if (s.status !== 'active' || !s.nextRun || Date.parse(s.nextRun) > now) continue;
    const due = Date.parse(s.nextRun);
    const busy = s.runIds.some((rid) => db.runs.find((r) => r.id === rid)?.status === 'running');
    if (busy) s.lastError = 'The previous run was still going, so this one was skipped';
    else {
      try { const run = startRun(s); s.runIds.push(run.id); s.runCount++; s.lastRun = run.startedAt; s.lastError = ''; }
      catch (e) { s.lastError = e.message; }
    }
    s.nextRun = nextAfter(s, due, now);
    if (!s.nextRun) s.status = 'finished';
    save();
  }
}
// What changed since the previous run (Burrow > Recurring shows it as +new / −gone, and clicking it opens Diff with the two runs).
// Worked out once a run has finished (and its workflow with it) and kept on the run as `changes`:
//   { against: previous run id, added, removed (rows; a raw file counts as one), files (how many differ), notCollected: ['what' on 'host'],
//     hostsMissing: [addresses collected in only one of the two runs], at, seen }
// The previous run is the last earlier run of the same schedule that finished; a schedule with compareTo { baselineId } is compared
// with that baseline instead (src/baselines.js; `against` is then "baseline:<id>"). Hosts or collections that failed or were offline
// in one of the two are listed under notCollected / hostsMissing instead of making everything look new or gone. Rows marked as
// expected (src/expected.js) are not counted; marking one, or changing what a schedule compares with, makes the changes stale
// (stale: true) and they are worked out again, newest run first, keeping whether they were seen.
const DONE = new Set(['completed', 'completed_with_errors']);
const MAX_PER_TICK = 2; // a diff reads both runs' files; a backlog (after an upgrade) is worked through a couple at a time
const stemOf = (id) => require('./output').safeName(require('path').basename(String(id || ''), require('path').extname(String(id || ''))), 'collection').toLowerCase();
const vpathOf = (r) => r.vpath || `/output/${r.outputPath}`;
function changesBetween(prev, run) {
  const diff = require('./diff'), { safeName } = require('./output');
  const sum = diff.summarise(vpathOf(prev), vpathOf(run));
  const notCollected = new Set();
  let added = 0, removed = 0, modified = 0, files = 0;
  // a file only in one run, whose collection (or workflow step) did not succeed in the other run on that host, was not collected there
  const failedIn = (r, host, key) => {
    const ip = host.replace(/^[_-]+/, ''), rest = key.slice(key.indexOf('/') + 1);
    if (rest.startsWith('processed/')) {
      const st = (r.workflow?.stages || []).find((s) => safeName(s.address, 'host') === ip && s.status !== 'ok');
      return st ? `${st.processor} on ${st.address}` : null;
    }
    const low = rest.toLowerCase();
    const res = (r.results || []).find((x) => { const st = stemOf(x.collectionId || x.actionId); return safeName(x.address, 'host') === ip && (low.startsWith(`${st}_`) || low.startsWith(`raw/${st}/`)); });
    return res && res.status !== 'ok' ? `${res.collectionName || res.actionName || 'a collection'} on ${res.address}` : null;
  };
  for (const f of sum.files) {
    if (f.kind === 'record' || f.kind === 'combined' || f.hostMissing || f.status === 'same') continue;
    const host = f.key.includes('/') ? f.key.slice(0, f.key.indexOf('/')) : null;
    const why = host && (f.status === 'removed' ? failedIn(run, host, f.key) : f.status === 'added' ? failedIn(prev, host, f.key) : null);
    if (why) { notCollected.add(why); continue; }
    files++;
    if (f.status === 'changed') { added += f.added || 0; removed += f.removed || 0; modified += f.modified || 0; } else if (f.status === 'added') added += f.kind === 'raw' ? 1 : f.rows || 0; else removed += f.kind === 'raw' ? 1 : f.rows || 0;
  }
  const missing = [...sum.hosts.onlyA, ...sum.hosts.onlyB].map((h) => h.replace(/^[_-]+/, ''));
  return { against: prev.id, added, removed, modified, files, notCollected: [...notCollected], hostsMissing: missing, at: new Date().toISOString(), seen: !added && !removed && !modified };
}
// The baseline a schedule compares with, as a stand-in for the previous run; null when it compares with the previous run. A baseline
// that was uploaded is unpacked first (asynchronously), so it may not be ready on the first tick.
const preparing = new Set();
function baselineFor(s) {
  const bid = s.compareTo?.baselineId; if (!bid) return null;
  const baselines = require('./baselines'), b = baselines.find(bid);
  if (!b) return { missing: true };
  if (!require('fs').existsSync(baselines.folderOf(b))) {
    if (!preparing.has(b.id)) { preparing.add(b.id); baselines.prepare(b).catch((e) => console.error(`Baseline ${b.name}:`, e.message)).finally(() => preparing.delete(b.id)); }
    return { notReady: true };
  }
  return { id: `baseline:${b.id}`, vpath: `baseline:${b.id}`, name: b.name, results: [] };
}
function checkChanges() {
  let done = 0;
  for (const s of db.schedules) {
    const runs = s.runIds.map((rid) => db.runs.find((r) => r.id === rid)).filter(Boolean);
    const base = baselineFor(s);
    if (base?.notReady) continue;
    for (let i = runs.length - 1; i >= 0 && done < MAX_PER_TICK; i--) { // newest first, so the badge on the Recurring page is right soonest
      const run = runs[i], old = run.changes;
      if ((old && !old.stale) || !DONE.has(run.status) || !run.outputPath) continue;
      const keepSeen = (c) => ({ ...c, seen: c.seen || !!old?.seen });
      if (base?.missing) { run.changes = keepSeen({ error: 'The baseline it compares with was deleted', at: new Date().toISOString(), seen: true }); save(); continue; }
      const prev = base || runs.slice(0, i).reverse().find((r) => DONE.has(r.status) && r.outputPath);
      if (!prev) { run.changes = { first: true, at: new Date().toISOString(), seen: true }; save(); continue; }
      done++;
      try { run.changes = keepSeen(changesBetween(prev, run)); } catch (e) { run.changes = { against: prev.id, error: e.message, at: new Date().toISOString(), seen: true }; }
      if (base) run.changes.againstName = base.name;
      save();
    }
  }
}
// Marks the worked-out changes as out of date so checkChanges works them out again: all of them (an expected row was marked or
// removed), or one schedule's when what it compares with changed (then they start unseen again).
function staleChanges(s = null) {
  for (const sc of s ? [s] : db.schedules) {
    for (const rid of sc.runIds) {
      const r = db.runs.find((x) => x.id === rid);
      if (!r?.changes) continue;
      if (s) delete r.changes; else r.changes.stale = true;
    }
  }
  save();
}
function setCompareTo(s, baselineId) {
  if (baselineId && !require('./baselines').find(baselineId)) throw new Error('Baseline not found');
  const was = s.compareTo?.baselineId || null;
  s.compareTo = baselineId ? { baselineId } : null;
  if (was !== (baselineId || null)) staleChanges(s);
  save();
}
function markSeen(s, runId) {
  const run = s.runIds.includes(runId) && db.runs.find((r) => r.id === runId);
  if (!run || !run.changes) throw new Error('Not found');
  if (!run.changes.seen) { run.changes.seen = true; save(); }
}

const start = () => { const both = () => { tick(); try { checkChanges(); } catch (e) { console.error('Recurring changes:', e.message); } }; both(); setInterval(both, TICK_MS).unref?.(); };

// What the Recurring page shows: the schedule, what it runs and on which hosts, and its latest runs. Never the parameter values.
function view(s) {
  const lib = s.kind === 'hunt' ? (x) => collections.resolveCollection(x) : (x) => collections.resolveAction(x);
  return {
    id: s.id, kind: s.kind, name: s.name, sendElastic: typeof s.sendElastic === 'boolean' ? s.sendElastic : null, workflow: s.workflowId ? (require('./workflows').find(s.workflowId)?.name || 'a deleted workflow') : null, everyMinutes: s.everyMinutes, until: s.until, createdBy: s.createdBy, createdAt: s.createdAt,
    nextRun: s.nextRun, lastRun: s.lastRun, runCount: s.runCount, status: s.status, lastError: s.lastError,
    compareTo: s.compareTo?.baselineId ? { baselineId: s.compareTo.baselineId, name: require('./baselines').find(s.compareTo.baselineId)?.name || 'a deleted baseline' } : null,
    totalRuns: totalRuns({ ...s }, Date.parse(s.createdAt)),
    hosts: hostsOf({ hostIds: s.hostIds, listIds: [] }).map((h) => ({ name: h.name || h.hostname || h.address, address: h.address })),
    groups: s.listIds.map((l) => db.lists.find((x) => x.id === l)).filter(Boolean).map((l) => ({ name: l.name, hosts: l.hostIds.length })),
    items: s.itemIds.map((x) => { const c = lib(x); return c ? { id: x, name: c.name, description: c.description, type: c.type, parameters: s.kind === 'response' ? c.parameters.map((p) => (c.optionalParameters.includes(p) ? `${p}?` : p)) : [] } : { id: x, name: x, description: 'No longer in the library', type: '', parameters: [] }; }),
    runs: s.runIds.slice(-15).reverse().map((rid) => db.runs.find((r) => r.id === rid)).filter(Boolean).map((r) => ({ id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt || null, status: r.status, outputPath: r.outputPath || null, ...(r.changes ? { changes: r.changes, againstPath: againstPath(r) } : {}) })),
    // the newest run whose changes are worked out, and how many runs have changes nobody has opened yet
    latestChanges: (() => { const r = s.runIds.map((rid) => db.runs.find((x) => x.id === rid)).filter((x) => x?.changes && !x.changes.first).pop(); return r ? { runId: r.id, outputPath: r.outputPath, againstPath: againstPath(r), startedAt: r.startedAt, ...r.changes } : null; })(),
    unseen: s.runIds.map((rid) => db.runs.find((x) => x.id === rid)).filter((x) => x?.changes && !x.changes.seen).length,
  };
}
// What Diff opens as run A for a run's changes: the output path of the run it was measured against, or "baseline:<id>".
const againstPath = (r) => {
  const a = r?.changes?.against; if (!a) return null;
  if (a.startsWith('baseline:')) return require('./baselines').find(a.slice(9)) ? a : null;
  return db.runs.find((x) => x.id === a)?.outputPath || null;
};

module.exports = { parseSchedule, totalRuns, prepare, activate, pause, resume, start, tick, view, checkChanges, changesBetween, markSeen, againstPath, staleChanges, setCompareTo };
