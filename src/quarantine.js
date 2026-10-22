const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, save, id } = require('./store');
const collections = require('./collections');
const responseRunner = require('./response-runner');

// Quarantine (Health > Monitor): network-isolates a host with the Host - Isolate action and lifts it with Host - Release, so the
// containment is exactly what those actions do (firewall rules on Windows, iptables on Linux). It runs as an ordinary response, so
// each step also appears under Burrow > Respond. What is quarantined, since when, until when and by whom is kept in db.quarantine
// (host id -> record); every step is written to db.quarantineLog for Health > Quarantine log.
// The host must keep talking to this server, so the address the host sees this server on is worked out first and allowed through.
const POLL_MS = 500, MAX_WAIT_MS = 30 * 60 * 1000;

const records = () => (db.quarantine ||= {});
const logList = () => (db.quarantineLog ||= []);
function note(host, action, detail, by, extra = {}) {
  logList().push({ t: new Date().toISOString(), hostId: host.id, host: host.name || host.hostname || host.address, address: host.address, action, by: by || null, detail, ...extra });
  if (logList().length > 5000) logList().splice(0, logList().length - 5000);
  save();
}
const getLog = (limit = 500) => logList().slice(-limit).reverse();
const get = (hostId) => records()[hostId] || null;

// The address this machine uses to reach the host (the interface the operating system would route through).
function routeAddress(address) {
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.once('error', () => { try { s.close(); } catch { /* closed */ } resolve(null); });
    s.connect(53, address, () => { let a = null; try { a = s.address().address; } catch { /* none */ } try { s.close(); } catch { /* closed */ } resolve(a); });
  });
}
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// The addresses the HOST sees this server connecting from (they differ from our own behind NAT or a VPN).
async function seenByHost(host) {
  const win = host.protocol !== 'ssh';
  const text = win
    ? "$ErrorActionPreference = 'SilentlyContinue'\nGet-NetTCPConnection -LocalPort 5985,5986 -State Established | ForEach-Object { $_.RemoteAddress } | Where-Object { $_ -and $_ -notin '127.0.0.1', '::1' } | Sort-Object -Unique\n"
    : 'echo "$SSH_CLIENT" | cut -d" " -f1\n';
  const file = path.join(os.tmpdir(), `kb-q-${id()}${win ? '.ps1' : '.sh'}`);
  try {
    fs.writeFileSync(file, text);
    const out = await collections.executeOnHost(host, { type: win ? 'powershell' : 'bash', file, text, dependencies: [] }, { csv: false });
    return out.exitCode === 0 ? [...new Set(String(out.stdout).match(IPV4) || [])] : [];
  } catch { return []; } finally { fs.promises.unlink(file).catch(() => {}); }
}
async function serverAddresses(host) {
  const [mine, seen] = await Promise.all([routeAddress(host.address), seenByHost(host)]);
  if (mine && seen.includes(mine)) return [mine];
  if (seen.length === 1) return seen;                 // the one connection: that is this server, as the host sees it
  const out = [...new Set([...(mine ? [mine] : []), ...seen])];
  return out;
}

function runAction(host, actionId, params, by, name) {
  return new Promise((resolve, reject) => {
    let run;
    try { run = responseRunner.startResponse({ name, actionIds: [actionId], hosts: [host], params: { [actionId]: params }, startedBy: by }); } catch (e) { return reject(e); }
    const t0 = Date.now();
    const timer = setInterval(() => {
      if (run.status === 'running') { if (Date.now() - t0 > MAX_WAIT_MS) { clearInterval(timer); reject(new Error('Timed out waiting for the action to finish')); } return; }
      clearInterval(timer);
      const r = run.results[0] || {};
      resolve({ ok: r.status === 'ok', error: r.error || run.error || 'The action failed', run });
    }, POLL_MS);
  });
}
const isolateId = (host) => (host.protocol === 'ssh' ? 'bash/host-isolate.sh' : 'powershell/host-isolate.ps1');
const releaseId = (host) => (host.protocol === 'ssh' ? 'bash/host-release.sh' : 'powershell/host-release.ps1');
const PARAMS = (host, allowed, minutes) => (host.protocol === 'ssh'
  ? { ALLOWED_ADDRESSES: allowed.join(','), ...(minutes ? { AUTO_RELEASE_MINUTES: String(minutes) } : {}) }
  : { AllowedAddresses: allowed.join(','), ...(minutes ? { AutoReleaseMinutes: String(minutes) } : {}) });

// Both calls return straight away: the record is 'pending' (isolating) or 'releasing' while the action runs in the background, and
// becomes 'active' (or is dropped, with a log line saying why) when it finishes. The Monitor page shows the progress.
// minutes: a whole number, or null/0 to stay quarantined until it is released here.
function quarantine(host, minutes, by) {
  if (get(host.id)) throw new Error('That host is already quarantined');
  minutes = minutes ? Number(minutes) : 0;
  if (minutes && (!Number.isInteger(minutes) || minutes < 1 || minutes > 60 * 24 * 30)) throw new Error('For how long must be a whole number of minutes, up to 30 days');
  const rec = records()[host.id] = { status: 'pending', since: new Date().toISOString(), until: null, minutes: minutes || null, by: by || null };
  save();
  note(host, 'Quarantine requested', minutes ? `for ${minutes} minute${minutes === 1 ? '' : 's'}` : 'until released', by);
  (async () => {
    try {
      const allowed = await serverAddresses(host);
      if (!allowed.length) throw new Error('Could not work out which address this server reaches the host from, so it was not isolated (it would have lost contact)');
      const now = Date.now(); // the host's own release timer starts when the script runs, so the end time counts from here
      const r = await runAction(host, isolateId(host), PARAMS(host, allowed, minutes), by, `Quarantine ${host.name || host.address}`);
      if (!r.ok) { note(host, 'Quarantine failed', r.error, by, { runId: r.run.id }); delete records()[host.id]; save(); return; }
      Object.assign(rec, { status: 'active', since: new Date(now).toISOString(), until: minutes ? new Date(now + minutes * 60000).toISOString() : null, runId: r.run.id, allowed });
      save();
      note(host, 'Quarantined', `${minutes ? `until ${new Date(now + minutes * 60000).toLocaleString()} (${minutes} minute${minutes === 1 ? '' : 's'}; the host releases itself)` : 'until released here'}; allowed through: ${allowed.join(', ')}`, by, { runId: r.run.id });
    } catch (e) { note(host, 'Quarantine failed', e.message, by); delete records()[host.id]; save(); }
  })();
  return rec;
}

function release(host, by) {
  const rec = get(host.id);
  if (!rec) throw new Error('That host is not quarantined');
  if (rec.status !== 'active') throw new Error(rec.status === 'pending' ? 'The host is still being quarantined. Wait for that to finish.' : 'The host is already being released');
  rec.status = 'releasing'; delete rec.lastError; save();
  note(host, 'Release requested', '', by);
  (async () => {
    try {
      const r = await runAction(host, releaseId(host), {}, by, `Unquarantine ${host.name || host.address}`);
      if (!r.ok) throw Object.assign(new Error(r.error), { runId: r.run.id });
      delete records()[host.id]; save();
      note(host, 'Released', 'the host is back on the network', by, { runId: r.run.id });
    } catch (e) { rec.status = 'active'; rec.lastError = e.message; save(); note(host, 'Release failed', e.message, by, e.runId ? { runId: e.runId } : {}); }
  })();
  return rec;
}

// A timed quarantine ends by itself on the host; once its time has passed the record is dropped and the log says so.
function expire() {
  const now = Date.now();
  for (const [hid, q] of Object.entries(records())) {
    if (q.status !== 'active' || !q.until || Date.parse(q.until) > now - 90000) continue; // a minute and a half of grace: the host's own timer fires on the minute
    const host = db.hosts.find((h) => h.id === hid) || { id: hid, name: hid, address: '' };
    delete records()[hid];
    note(host, 'Released (time ran out)', 'the quarantine time ended, so the host released itself', null);
  }
}
// A restart while a step was running leaves it unfinished: say so, and let the user look at the host.
function start() {
  for (const [hid, q] of Object.entries(records())) {
    const host = db.hosts.find((h) => h.id === hid) || { id: hid, name: hid, address: '' };
    if (q.status === 'pending') { delete records()[hid]; note(host, 'Quarantine failed', 'The server restarted while the host was being isolated. Check the host (Host - Release undoes a partial isolation).', null); }
    else if (q.status === 'releasing') { q.status = 'active'; note(host, 'Release failed', 'The server restarted while the host was being released. Try Unquarantine again.', null); }
  }
  save();
  setInterval(expire, 15000).unref();
}

module.exports = { quarantine, release, get, getLog, records, start };
