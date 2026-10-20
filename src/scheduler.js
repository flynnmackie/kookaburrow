const { db, save, id } = require('./store');
const { encrypt, decrypt } = require('./crypto');
const collections = require('./collections');
const huntRunner = require('./hunt-runner');
const responseRunner = require('./response-runner');

// Recurring hunts and responses (Burrow > Recurring). When a hunt or response is started with a schedule, it runs straight away and
// then again every `everyMinutes` minutes, until the end time passes or the schedule is deleted (until.type 'time' or 'forever').
// A schedule is { id, kind: 'hunt'|'response', name, hostIds, listIds, itemIds (collection or action ids), params (response only,
// encrypted: the values are needed to run unattended), everyMinutes, until, createdBy, createdAt, nextRun, lastRun, runCount, runIds,
// status: 'active'|'finished', lastError }. Every run it starts is an ordinary hunt/response record carrying scheduleId, so it appears
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

function prepare({ kind, name, hostIds, listIds, itemIds, params, schedule, createdBy }) {
  const sched = parseSchedule(schedule);
  return {
    id: id(), kind, name: String(name || '').trim(), hostIds: [...hostIds], listIds: [...listIds], itemIds: [...itemIds],
    params: kind === 'response' && params ? encrypt(JSON.stringify(params)) : '',
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

function hostsOf(s) {
  const ids = new Set(s.hostIds);
  for (const lid of s.listIds) db.lists.find((l) => l.id === lid)?.hostIds.forEach((h) => ids.add(h));
  return [...ids].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
}
function startRun(s) {
  const hosts = hostsOf(s);
  if (!hosts.length) throw new Error('None of its hosts exist any more');
  if (s.kind === 'hunt') return huntRunner.startHunt({ name: s.name, collectionIds: s.itemIds, hosts, startedBy: s.createdBy, scheduleId: s.id });
  return responseRunner.startResponse({ name: s.name, actionIds: s.itemIds, hosts, params: s.params ? JSON.parse(decrypt(s.params)) : {}, startedBy: s.createdBy, scheduleId: s.id });
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
const start = () => { tick(); setInterval(tick, TICK_MS).unref?.(); };

// What the Recurring page shows: the schedule, what it runs and on which hosts, and its latest runs. Never the parameter values.
function view(s) {
  const lib = s.kind === 'hunt' ? (x) => collections.resolveCollection(x) : (x) => collections.resolveAction(x);
  return {
    id: s.id, kind: s.kind, name: s.name, everyMinutes: s.everyMinutes, until: s.until, createdBy: s.createdBy, createdAt: s.createdAt,
    nextRun: s.nextRun, lastRun: s.lastRun, runCount: s.runCount, status: s.status, lastError: s.lastError,
    totalRuns: totalRuns({ ...s }, Date.parse(s.createdAt)),
    hosts: hostsOf({ hostIds: s.hostIds, listIds: [] }).map((h) => ({ name: h.name || h.hostname || h.address, address: h.address })),
    groups: s.listIds.map((l) => db.lists.find((x) => x.id === l)).filter(Boolean).map((l) => ({ name: l.name, hosts: l.hostIds.length })),
    items: s.itemIds.map((x) => { const c = lib(x); return c ? { id: x, name: c.name, description: c.description, type: c.type, parameters: s.kind === 'response' ? c.parameters.map((p) => (c.optionalParameters.includes(p) ? `${p}?` : p)) : [] } : { id: x, name: x, description: 'No longer in the library', type: '', parameters: [] }; }),
    runs: s.runIds.slice(-15).reverse().map((rid) => db.runs.find((r) => r.id === rid)).filter(Boolean).map((r) => ({ id: r.id, startedAt: r.startedAt, finishedAt: r.finishedAt || null, status: r.status })),
  };
}

module.exports = { parseSchedule, totalRuns, prepare, activate, start, tick, view };
