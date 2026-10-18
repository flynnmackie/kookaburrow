// Minimal JSON-file store with atomic writes. Swap for SQLite later if needed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dataDir } = require('./config');

const file = path.join(dataDir, 'db.json');
const empty = () => ({ hosts: [], lists: [], runs: [], profiles: [], assignments: {} });

let db = empty();
if (fs.existsSync(file)) db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };

let pending = null;
function save() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }, 100);
}

const id = () => crypto.randomBytes(8).toString('hex');

// Runs saved before hunts were renamed to collections keep their data under the new field names.
for (const run of db.runs) {
  if ('huntId' in run) { run.collectionId = run.huntId; delete run.huntId; }
  if ('huntName' in run) { run.collectionName = run.huntName; delete run.huntName; }
}

// A restart mid-run would otherwise leave runs "running" forever.
for (const run of db.runs) {
  if (run.status !== 'running') continue;
  run.status = 'interrupted';
  run.finishedAt = new Date().toISOString();
  for (const r of run.results) {
    if (r.status === 'queued' || r.status === 'running') { r.status = 'error'; r.stderr = 'Interrupted by server restart'; }
  }
}

save();

function flush() {
  if (!pending) return;
  clearTimeout(pending);
  pending = null;
  fs.writeFileSync(file, JSON.stringify(db));
}
process.on('exit', flush);
// Ctrl+C / service stop don't fire 'exit' on their own.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0));

module.exports = { db, save, id };
