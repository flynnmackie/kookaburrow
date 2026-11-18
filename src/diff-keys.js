// What the comparison tools (src/diff.js, src/compare.js) need to know about the columns of a CSV, worked out from the data:
//   volatile   changes between collections of an unchanged host (process ids, counters, uptime). Never compared.
//   time       holds a date or time (created, modified, last run, a time stamp). When an item's only difference is in these columns it is
//              noise, not a change: the same service with a new "last started" is still the same service.
//   key        the columns that say which item a row is (a service's name, a task's path). Two rows with the same key but different
//              other columns are one item that was modified, not one item gone and another new.
// Nothing here is a list of collections: it looks at names and values, so a CSV from a collection somebody wrote last week works too.
const VOLATILE = new Set([
  'pid', 'processid', 'owningprocess', 'parentprocessid', 'ppid',
  'cpu', 'cputime', 'totalprocessortime', 'workingset', 'workingset64', 'ws', 'pm', 'vm', 'npm',
  'privatememorysize64', 'virtualmemorysize64', 'pagedmemorysize64', 'handles', 'handlecount', 'threads', 'threadcount',
  'uptime', 'uptimehours', 'uptimeseconds', 'secondsexists', 'duration', 'durationms', 'elapsed', 'elapsedms',
  'collectedat', 'collectiontime', 'collectedtime', 'querytime', 'scantime', 'localdatetime',
  'freespace', 'freegb', 'freemb', 'freephysicalmemory', 'freevirtualmemory', 'sizeremaining', 'timetolive', 'ttl', 'nextrun', 'nextruntime',
].map((c) => c.toLowerCase()));
// Columns that say where a row came from.
const IDENTITY = new Set(['collection', 'targetip', 'hostname', 'hostaddress']);

// Words that make a column a time column ("LastWriteTime" is last + write + time). Split on case and punctuation so "Update" is not "date".
const TIME_WORDS = new Set(['time', 'date', 'datetime', 'timestamp', 'timestamps', 'created', 'modified', 'accessed', 'lastwrite', 'lastlogon', 'lastrun', 'nextrun', 'lastboot', 'started', 'written', 'installed', 'utc', 'logon']);
const words = (name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const timeName = (name) => { const w = words(name); return w.some((x) => TIME_WORDS.has(x)) && !w.includes('count') && !w.includes('zone') && !w.includes('format'); };
// A value that looks like a date and time: 2026-10-29 09:00, 29/10/2026 9:00:01, 2026-10-29T09:00:00Z, or a .NET /Date(...)/.
const TIME_VALUE = /^(?:\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}|\/Date\(\d+\)\/|[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2})/;
const timeValues = (vals) => { const v = vals.filter((x) => x !== '' && x != null).slice(0, 200); return v.length >= 3 && v.filter((x) => TIME_VALUE.test(String(x))).length / v.length >= 0.9; };

// Words that usually name the thing a row is about; those columns are tried first as the key.
const KEY_WORDS = ['name', 'path', 'id', 'key', 'user', 'username', 'account', 'sid', 'task', 'service', 'port', 'address', 'local', 'remote', 'command', 'commandline', 'program', 'display', 'title', 'rule', 'hash', 'sha256', 'file', 'filename', 'target', 'share', 'package', 'product', 'driver'];
const keyRank = (name) => { const w = words(name); const i = KEY_WORDS.findIndex((k) => w.includes(k) || w.join('') === k); return i < 0 ? 100 : i; };

const low = (h) => String(h).trim().toLowerCase();
// Splits a header into volatile and time columns (indexes). `rows` are the data rows of both sides, used to spot time columns by value.
function classify(header, rows, { ignore = [], pooled = false } = {}) {
  const ign = new Set(ignore.map(low));
  const volatile = [], time = [], other = [];
  header.forEach((h, i) => {
    const n = low(h);
    if (VOLATILE.has(n) || ign.has(n) || (pooled && IDENTITY.has(n) && n !== 'collection')) volatile.push(i);
    else if (timeName(h) || timeValues(rows.map((r) => r[i]))) time.push(i);
    else other.push(i);
  });
  return { volatile, time, other };
}

// The smallest set of columns (at most three, chosen from `cols`) that tells the rows of every side apart: it has to separate at least
// 97% of the distinct rows. sides: arrays of rows; rowIds(row) is the row's identity; header names the columns (name words rank the
// candidates). Returns indexes or null.
function inferKey(cols, sides, rowIds, header) {
  const total = (rows) => new Set(rows.map(rowIds)).size;
  const sized = sides.filter((s) => s.length);
  if (!sized.length || cols.length === 0) return null;
  const base = sized.map(total);
  const ok = (idx) => sized.every((rows, n) => base[n] > 0 && new Set(rows.map((r) => JSON.stringify(idx.map((i) => r[i] ?? '')))).size >= 0.97 * base[n]);
  const ranked = cols.slice().sort((a, b) => keyRank(header[a]) - keyRank(header[b]) || a - b).slice(0, 8);
  // free text (a command line, a message) only identifies an item when nothing tidier does: its slightest edit would make a new item
  const weak = new Set(ranked.filter((c) => words(header[c]).some((x) => ['commandline', 'command', 'message', 'description', 'details', 'arguments', 'args', 'text'].includes(x))));
  for (const pool of [ranked.filter((c) => !weak.has(c)), ranked]) for (const k of [1, 2, 3]) {
    const combos = [];
    const pick = (start, acc) => { if (acc.length === k) { combos.push(acc.slice()); return; } for (let i = start; i < pool.length; i++) { acc.push(pool[i]); pick(i + 1, acc); acc.pop(); } };
    pick(0, []);
    for (const c of combos) if (ok(c)) return c.sort((a, b) => a - b);
  }
  return null;
}

module.exports = { VOLATILE, IDENTITY, classify, inferKey, timeName, timeValues, TIME_VALUE, words, low };
