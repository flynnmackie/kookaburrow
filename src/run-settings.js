const os = require('os');
const fs = require('fs');
const { db, save } = require('./store');
const config = require('./config');

// How many hosts a hunt or response works on at the same time (Settings > System > Run Settings, kept in db.settings.runs):
//   concurrency        hosts at once in each hunt or response. A host's collections / actions still run one after another.
//   largeConcurrency   hosts at once that are pulling files back over SMB / SFTP (collections with $Transfer = 'large'), counted across
//                      all running hunts together. A host over this limit waits for a free slot.
// A change applies to hunts and responses started afterwards, and to large transfers that have not started yet.
const DEFAULTS = { concurrency: config.runConcurrency, largeConcurrency: 2 };
const LIMITS = { concurrency: [1, 32], largeConcurrency: [1, 16] };
const err = (m) => Object.assign(new Error(m), { status: 400 });

function settings() {
  const s = (db.settings && db.settings.runs) || {};
  const int = (v, d, [lo, hi]) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  return { concurrency: int(s.concurrency, DEFAULTS.concurrency, LIMITS.concurrency), largeConcurrency: int(s.largeConcurrency, DEFAULTS.largeConcurrency, LIMITS.largeConcurrency) };
}
function setSettings(b) {
  const cur = settings(), out = {};
  for (const [key, label] of [['concurrency', 'Hosts at once'], ['largeConcurrency', 'Large file transfers at once']]) {
    const v = b[key] === undefined ? cur[key] : Number(b[key]), [lo, hi] = LIMITS[key];
    if (!Number.isInteger(v) || v < lo || v > hi) throw err(`${label} must be a whole number from ${lo} to ${hi}`);
    out[key] = v;
  }
  db.settings = { ...(db.settings || {}), runs: out };
  save();
  drain(); // a higher limit lets waiting transfers start now
}

// What this server can take, for the recommendations on the Run Settings page. Each WinRM host runs its own powershell.exe on the server
// (about 90 MB measured, plus bursts of CPU while its session starts), so hosts at once is bounded by cores and memory:
//   recommended = the lower of 2 per core and 2 per GB of RAM    (2 cores / 4 GB -> 4, 4 / 8 -> 8, 8 / 16 -> 16)
//   caution     = the lower of 4 per core and 4 per GB of RAM    (above this the server is likely to slow down or run short of memory)
// Large transfers are limited by disk and network: 2 is the default, 4 is reasonable with 8+ cores, 16+ GB and plenty of free disk.
function serverInfo() {
  const cores = os.cpus().length, ramGb = os.totalmem() / 2 ** 30;
  let freeDiskGb = null;
  try { const s = fs.statfsSync(config.outputDir || '.'); freeDiskGb = (s.bavail * s.bsize) / 2 ** 30; } catch { /* unknown */ }
  const cap = ([lo, hi], v) => Math.max(lo, Math.min(hi, Math.floor(v)));
  return {
    cores, ramGb: Math.round(ramGb * 10) / 10, freeRamGb: Math.round((os.freemem() / 2 ** 30) * 10) / 10, freeDiskGb: freeDiskGb == null ? null : Math.round(freeDiskGb),
    perHostMb: 100,
    recommended: { concurrency: cap(LIMITS.concurrency, Math.min(cores * 2, ramGb * 2)), caution: cap(LIMITS.concurrency, Math.min(cores * 4, ramGb * 4)), largeConcurrency: cores >= 8 && ramGb >= 16 ? 4 : 2 },
  };
}

// A counter for large transfers shared by every running hunt. acquireLarge() resolves with a release function.
let activeLarge = 0;
const waiting = [];
function drain() {
  while (waiting.length && activeLarge < settings().largeConcurrency) { activeLarge++; waiting.shift()(); }
}
// With a signal, cancelling while waiting gives up the place in the queue and resolves with null.
function acquireLarge(onWait, signal) {
  return new Promise((resolve) => {
    const release = () => { activeLarge--; drain(); };
    if (signal?.aborted) return resolve(null);
    if (activeLarge < settings().largeConcurrency) { activeLarge++; return resolve(release); }
    if (onWait) onWait();
    const turn = () => { signal?.removeEventListener('abort', giveUp); resolve(release); };
    const giveUp = () => { const i = waiting.indexOf(turn); if (i >= 0) waiting.splice(i, 1); resolve(null); };
    signal?.addEventListener('abort', giveUp, { once: true });
    waiting.push(turn);
  });
}

module.exports = { serverInfo, settings, setSettings, acquireLarge, DEFAULTS, LIMITS };
