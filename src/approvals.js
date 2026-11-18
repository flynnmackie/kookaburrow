const { db, save, id } = require('./store');
const { encrypt, decrypt } = require('./crypto');
const collections = require('./collections');
const launcher = require('./response-launch');

// Approvals (Settings > System > Approvals, Burrow > Approvals): an admin can require that running actions (Burrow > Respond) is allowed
// by a second person first. A request is a saved copy of the Respond form; nothing runs until someone with "Approve actions" says yes,
// and then the response starts exactly as it was asked for, as the person who asked.
//   db.settings.approvals  { enabled, scope: 'all' | 'selected', actionIds, selfApprove, expireHours }
//   db.approvals           [{ id, status, requestedBy, requestedAt, expiresAt, body, params, summary, decidedBy, decidedAt, note, runId }]
//     status  pending | approved | rejected | cancelled | expired
// The values typed for parameters can be passwords: they are kept encrypted while the request waits and removed as soon as it is decided.
// A recurring response is approved once, as a whole (its later runs do not ask again). Quarantine (Monitor) and shells are not actions
// in this sense and are not held for approval.
const DEFAULTS = { enabled: false, scope: 'all', actionIds: [], selfApprove: false, expireHours: 72 };
const KEEP_DECIDED = 500;
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function settings() {
  const s = (db.settings && db.settings.approvals) || {};
  return {
    enabled: !!s.enabled, scope: s.scope === 'selected' ? 'selected' : 'all',
    actionIds: Array.isArray(s.actionIds) ? s.actionIds.map(String) : [],
    selfApprove: !!s.selfApprove,
    expireHours: Number.isInteger(s.expireHours) && s.expireHours >= 0 && s.expireHours <= 24 * 90 ? s.expireHours : DEFAULTS.expireHours,
  };
}
function setSettings(b = {}) {
  const cur = settings();
  const scope = b.scope === undefined ? cur.scope : b.scope;
  if (!['all', 'selected'].includes(scope)) throw err('Scope must be all or selected');
  const actionIds = b.actionIds === undefined ? cur.actionIds : (Array.isArray(b.actionIds) ? [...new Set(b.actionIds.map(String))] : null);
  if (!actionIds) throw err('The actions must be a list');
  for (const a of actionIds) if (!collections.resolveAction(a)) throw err(`Unknown action: ${a}`);
  const enabled = b.enabled === undefined ? cur.enabled : !!b.enabled;
  if (enabled && scope === 'selected' && !actionIds.length) throw err('Tick at least one action, or choose All actions');
  const expireHours = b.expireHours === undefined ? cur.expireHours : Number(b.expireHours);
  if (!Number.isInteger(expireHours) || expireHours < 0 || expireHours > 24 * 90) throw err('Expire after must be a whole number of hours from 0 (never) to 2160');
  db.settings = { ...(db.settings || {}), approvals: { enabled, scope, actionIds, selfApprove: b.selfApprove === undefined ? cur.selfApprove : !!b.selfApprove, expireHours } };
  save();
  return settings();
}

// Does running these actions need an approval?
function required(actionIds) {
  const s = settings();
  if (!s.enabled) return false;
  return s.scope === 'all' || (actionIds || []).some((a) => s.actionIds.includes(a));
}

const label = (h) => h.name || h.hostname || h.address;
const SECRET = /pass|secret|token|key|cred|pwd/i;

function request(body, by) {
  const p = launcher.plan(body); // refuses what could not run anyway
  const params = {};
  for (const a of p.actions) if (a.parameters.length) params[a.id] = collections.paramValues(a, body.params && body.params[a.id]);
  const s = settings(), now = Date.now();
  const a = {
    id: id(), status: 'pending', requestedBy: by || null, requestedAt: new Date(now).toISOString(),
    expiresAt: s.expireHours ? new Date(now + s.expireHours * 3600000).toISOString() : null,
    body: { name: String(body.name).trim(), actionIds: p.actionIds, hostIds: p.hostIds, listIds: p.listIds, schedule: body.schedule || null, quick: !!body.quick },
    params: Object.keys(params).length ? encrypt(JSON.stringify(params)) : '',
    summary: {
      actions: p.actions.map((x) => ({ id: x.id, name: x.name, description: x.description || '', footprint: x.footprint, type: x.type, parameters: x.parameters })),
      hosts: p.hosts.map((h) => ({ id: h.id, name: label(h), address: h.address, os: h.os || '' })),
      groups: p.listIds.map((l) => db.lists.find((x) => x.id === l)?.name).filter(Boolean),
    },
    decidedBy: null, decidedAt: null, note: '', runId: null,
  };
  db.approvals.unshift(a);
  trim();
  save();
  return a;
}

function trim() {
  const decided = db.approvals.filter((a) => a.status !== 'pending');
  if (decided.length > KEEP_DECIDED) { const drop = new Set(decided.slice(KEEP_DECIDED).map((a) => a.id)); db.approvals = db.approvals.filter((a) => !drop.has(a.id)); }
}
// Pending requests whose time ran out are closed (and their saved parameter values removed).
function sweep() {
  const now = Date.now();
  let changed = false;
  for (const a of db.approvals) {
    if (a.status === 'pending' && a.expiresAt && Date.parse(a.expiresAt) <= now) { Object.assign(a, { status: 'expired', decidedAt: new Date(now).toISOString(), params: '' }); changed = true; }
  }
  if (changed) save();
}
const find = (aid) => { sweep(); return db.approvals.find((a) => a.id === aid) || null; };

// What a person sees: the request, with parameter values shown to an approver (a value whose name looks like a secret is hidden).
function view(a, { values = false } = {}) {
  let params = null;
  if (values && a.params) {
    try {
      const all = JSON.parse(decrypt(a.params));
      params = Object.fromEntries(Object.entries(all).map(([aid, vs]) => [aid, Object.fromEntries(Object.entries(vs).map(([k, v]) => [k, SECRET.test(k) ? '(hidden)' : v]))]));
    } catch { params = null; }
  }
  const sched = a.body.schedule;
  return {
    id: a.id, status: a.status, name: a.body.name, requestedBy: a.requestedBy, requestedAt: a.requestedAt, expiresAt: a.expiresAt,
    decidedBy: a.decidedBy, decidedAt: a.decidedAt, note: a.note, runId: a.runId, quick: !!a.body.quick,
    actions: a.summary.actions, hosts: a.summary.hosts, groups: a.summary.groups,
    recurring: sched ? { everyMinutes: sched.everyMinutes, until: sched.until } : null,
    ...(values ? { params } : {}),
  };
}
function list({ mayApprove, user }) {
  sweep();
  return db.approvals.filter((a) => mayApprove || a.requestedBy === user).map((a) => view(a));
}
const pendingCount = () => { sweep(); return db.approvals.filter((a) => a.status === 'pending').length; };

function approve(aid, by, note) {
  const a = find(aid);
  if (!a) throw err('Not found', 404);
  if (a.status !== 'pending') throw err(`This request is already ${a.status}`);
  if (!settings().selfApprove && a.requestedBy === by) throw err('You asked for this yourself, so someone else has to approve it. (Settings > System > Approvals can allow approving your own requests.)', 403);
  let params = {};
  try { params = a.params ? JSON.parse(decrypt(a.params)) : {}; } catch { throw err('The saved parameter values could not be read. Reject it and ask for it again.'); }
  const approval = { id: a.id, requestedBy: a.requestedBy, approvedBy: by, note: String(note || '').slice(0, 300) };
  const run = launcher.launch({ ...a.body, params }, a.requestedBy, approval); // throws when it can no longer run (a host was deleted, ...): the request stays pending
  Object.assign(a, { status: 'approved', decidedBy: by, decidedAt: new Date().toISOString(), note: approval.note, runId: run.id, params: '' });
  save();
  return { approval: view(a), run };
}
function reject(aid, by, note) {
  const a = find(aid);
  if (!a) throw err('Not found', 404);
  if (a.status !== 'pending') throw err(`This request is already ${a.status}`);
  Object.assign(a, { status: 'rejected', decidedBy: by, decidedAt: new Date().toISOString(), note: String(note || '').slice(0, 300), params: '' });
  save();
  return view(a);
}
// The person who asked can withdraw it; an approver can too.
function cancel(aid, by, mayApprove) {
  const a = find(aid);
  if (!a) throw err('Not found', 404);
  if (a.status !== 'pending') throw err(`This request is already ${a.status}`);
  if (a.requestedBy !== by && !mayApprove) throw err('Only the person who asked, or an approver, can withdraw it', 403);
  Object.assign(a, { status: 'cancelled', decidedBy: by, decidedAt: new Date().toISOString(), params: '' });
  save();
  return view(a);
}

setInterval(sweep, 60 * 1000).unref();
module.exports = { settings, setSettings, required, request, view, list, find, pendingCount, approve, reject, cancel, DEFAULTS };
