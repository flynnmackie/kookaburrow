const { db } = require('./store');
const collections = require('./collections');
const responseRunner = require('./response-runner');
const scheduler = require('./scheduler');

// Starts a response from the body Burrow > Respond sends: { name, actionIds, hostIds?, listIds?, params?, schedule?, quick? }.
// check() does every test without starting anything, so a request for approval is refused for the same reasons a direct run is, and
// launch() is what runs when the request is allowed (straight away, or once an approver says yes).
function plan(b) {
  const hostIds = Array.isArray(b.hostIds) ? [...b.hostIds] : [];
  const listIds = Array.isArray(b.listIds) ? b.listIds : [];
  for (const lid of listIds) {
    const list = db.lists.find((l) => l.id === lid);
    if (!list) throw new Error('Unknown group');
    hostIds.push(...list.hostIds);
  }
  const hosts = [...new Set(hostIds)].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
  const actionIds = Array.isArray(b.actionIds) ? b.actionIds : [];
  if (b.quick && (b.schedule || listIds.length || hosts.length !== 1)) throw new Error('A quick response runs once, on exactly one host');
  const actions = actionIds.map((aid) => { const a = collections.resolveAction(aid); if (!a) throw new Error(`Unknown action: ${aid}`); return a; });
  if (!actions.length) throw new Error('Select at least one action');
  if (!hosts.length) throw new Error('Select at least one host or group');
  if (!String(b.name || '').trim()) throw new Error('Give the response a name');
  for (const a of actions) collections.paramValues(a, b.params && b.params[a.id]);
  if (b.schedule) scheduler.parseSchedule(b.schedule);
  return { hosts, actions, actionIds, hostIds: Array.isArray(b.hostIds) ? b.hostIds : [], listIds };
}

// approval: { id, requestedBy, approvedBy } when an approver allowed it; it is written to the response's log and kept on the run.
function launch(b, startedBy, approval) {
  const p = plan(b);
  const sched = b.schedule ? scheduler.prepare({ kind: 'response', name: b.name, hostIds: p.hostIds, listIds: p.listIds, itemIds: p.actionIds, params: b.params, schedule: b.schedule, createdBy: startedBy }) : null;
  if (sched && approval) sched.approval = approval;
  const run = responseRunner.startResponse({ name: b.name, actionIds: p.actionIds, hosts: p.hosts, params: b.params, startedBy, scheduleId: sched?.id, quick: !!b.quick, approval });
  if (sched) scheduler.activate(sched, run);
  return run;
}

module.exports = { plan, launch };
