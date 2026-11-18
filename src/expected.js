const { db, save, id } = require('./store');

// Expected changes (Results > Analysis > Baseline, marked from Diff): rows that are known to come and go, such as an updater's
// scheduled task. A marked row is no longer reported as new or gone by Diff (except with "compare every column") or by recurring
// hunts. It applies to every host and every run of the same collection.
//   { id, scope, key, header, row, note, by, at }
//   scope   the collection the row came from (its file stem, e.g. "tasks-list"), or processed/<processor>/<file> for workflow output
//   key     the row as Diff matches it (the compared columns only, see src/diff.js), so a row with a new PID still matches
//   header, row  what it looked like, to show in the list
const MAX = 5000;
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const list = () => (db.expected ||= []);

let cache = null; // scope -> Set of keys, rebuilt when the list changes
const keysFor = (scope) => {
  if (!cache) { cache = new Map(); for (const e of list()) { if (!cache.has(e.scope)) cache.set(e.scope, new Set()); cache.get(e.scope).add(e.key); } }
  return cache.get(scope) || null;
};

function add({ scope, key, header, row, note, by }) {
  scope = String(scope || '').trim(); key = String(key || '');
  if (!scope || scope.length > 200 || !/^[\w./-]+$/.test(scope)) throw bad('That row cannot be marked (no collection)');
  if (!key || key.length > 20000) throw bad('That row cannot be marked');
  if (list().length >= MAX) throw bad(`There are already ${MAX} expected changes; remove some first`);
  const have = list().find((e) => e.scope === scope && e.key === key);
  if (have) return have;
  const cut = (a) => (Array.isArray(a) ? a.slice(0, 60).map((v) => String(v ?? '').slice(0, 500)) : typeof a === 'string' ? [a.slice(0, 2000)] : []);
  const e = { id: id(), scope, key, header: cut(header), row: cut(row), note: String(note || '').slice(0, 300), by: by || null, at: new Date().toISOString() };
  list().push(e); cache = null; save();
  return e;
}

function remove(eid) {
  const before = list().length;
  db.expected = list().filter((e) => e.id !== eid);
  if (db.expected.length === before) throw Object.assign(new Error('Not found'), { status: 404 });
  cache = null; save();
}

module.exports = { list, add, remove, keysFor };
