const net = require('net');
const { execFile } = require('child_process');
const { db, save } = require('./store');

// Health monitor for every saved (authenticated) host. It runs in the server, so it keeps checking while no page is open.
//   Host    ping, every minute by default
//   Remote  the host's remote-management port, every 5 minutes by default: WinRM (5985 or 5986) for Windows hosts, SSH (22) for Linux
// Both intervals and the hosts that are checked (all of them by default) are set in Settings > System > Health Settings.
// Results are kept in memory only; after a restart every host shows "unknown" until its first check (a few seconds).
const TICK_MS = 1000;
const LIMIT = 16;          // checks in flight at once
const PORT_TIMEOUT = 2000;

// What can be changed in Health Settings (kept in db.settings.health). `pingOff` and `remoteOff` list the hosts whose ping, or whose
// WinRM/SSH port, is not checked; a host that is added later is checked both ways until it is listed. (Older settings had one
// `excluded` list, which switched both off; it is read as both lists.)
const DEFAULTS = { enabled: true, pingSeconds: 60, portSeconds: 5 * 60, pingOff: [], remoteOff: [] };
const LIMITS = { pingSeconds: [5, 3600], portSeconds: [10, 86400] };
const knownIds = () => new Set(db.hosts.map((h) => h.id));
const idList = (v, known) => [...new Set(Array.isArray(v) ? v.map(String) : [])].filter((id) => known.has(id));
function settings() {
  const s = (db.settings && db.settings.health) || {}, known = knownIds();
  return {
    enabled: s.enabled !== false,
    pingSeconds: Number.isInteger(s.pingSeconds) ? s.pingSeconds : DEFAULTS.pingSeconds,
    portSeconds: Number.isInteger(s.portSeconds) ? s.portSeconds : DEFAULTS.portSeconds,
    pingOff: idList(s.pingOff ?? s.excluded, known),
    remoteOff: idList(s.remoteOff ?? s.excluded, known),
  };
}
// Any field left out keeps its current value, so the on/off switch can be saved on its own.
function setSettings(b) {
  const cur = settings(), out = { enabled: b.enabled === undefined ? cur.enabled : !!b.enabled };
  for (const [key, label] of [['pingSeconds', 'The ping interval'], ['portSeconds', 'The port check interval']]) {
    const v = b[key] === undefined ? cur[key] : Number(b[key]), [lo, hi] = LIMITS[key];
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${label} must be a whole number of seconds from ${lo} to ${hi}`);
    out[key] = v;
  }
  const known = knownIds();
  out.pingOff = b.pingOff !== undefined ? idList(b.pingOff, known) : b.excluded !== undefined ? idList(b.excluded, known) : cur.pingOff;
  out.remoteOff = b.remoteOff !== undefined ? idList(b.remoteOff, known) : b.excluded !== undefined ? idList(b.excluded, known) : cur.remoteOff;
  db.settings = { ...(db.settings || {}), health: out };
  save();
  if (!out.enabled) queue.length = 0; // nothing waiting to run once monitoring is off
  checkNow(); // new intervals, newly added hosts and switching back on take effect straight away
}
const pingHosts = (s = settings()) => db.hosts.filter((h) => !s.pingOff.includes(h.id));
const remoteHosts = (s = settings()) => db.hosts.filter((h) => !s.remoteOff.includes(h.id));

const pings = new Map();   // address -> { up, rttMs, startedAt, checkedAt, since }
const ports = new Map();   // `${address}:${port}` -> { open, startedAt, checkedAt, since }
const inflight = new Set();

const SAFE_ADDR = /^[A-Za-z0-9.:_-]+$/; // an address becomes a ping argument, so nothing else is let through
const portsFor = (h) => (h.protocol === 'ssh' ? [h.port || 22] : h.port ? [h.port] : [5985, 5986]);
const remoteLabel = (h) => (h.protocol === 'ssh' ? 'SSH' : 'WinRM');

function ping(address) {
  return new Promise((resolve) => {
    if (!SAFE_ADDR.test(address)) return resolve({ up: false });
    const args = process.platform === 'win32' ? ['-n', '1', '-w', '1500', address] : ['-c', '1', '-W', '2', address];
    execFile('ping', args, { timeout: 6000, windowsHide: true }, (err, stdout) => {
      // A Windows ping exits 0 even for "destination host unreachable", so a real reply is recognised by its TTL.
      const out = String(stdout || '');
      if (!/ttl=/i.test(out)) return resolve({ up: false });
      const m = /time[=<]\s*([\d.]+)\s*ms/i.exec(out);
      resolve({ up: true, rttMs: m ? Math.max(1, Math.round(Number(m[1]))) : null });
    });
  });
}

function probe(address, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: address, port, timeout: PORT_TIMEOUT });
    const done = (open) => { s.destroy(); resolve({ open }); };
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

function record(map, key, up, field, extra = {}) {
  const prev = map.get(key), now = Date.now();
  map.set(key, { ...extra, [field]: up, startedAt: prev?.startedAt ?? now, checkedAt: now, since: prev && prev[field] === up ? prev.since : now });
}

function jobs(now) {
  const due = (m, key, every) => { const r = m.get(key); return !r || now - r.startedAt >= every - 500; };
  const out = [];
  const s = settings(), pingMs = s.pingSeconds * 1000, portMs = s.portSeconds * 1000;
  for (const address of new Set(pingHosts(s).map((h) => h.address))) {
    const key = `ping|${address}`;
    if (!inflight.has(key) && due(pings, address, pingMs)) {
      out.push({ key, run: async () => { const r = await ping(address); record(pings, address, r.up, 'up', { rttMs: r.rttMs ?? null }); } });
      pings.set(address, { ...(pings.get(address) || { up: false, since: now, checkedAt: 0 }), startedAt: now }); // marks it as started so it is not queued twice
    }
  }
  for (const h of remoteHosts(s)) {
    for (const port of portsFor(h)) {
      const k = `${h.address}:${port}`, key = `port|${k}`;
      if (inflight.has(key) || !due(ports, k, portMs) || out.some((j) => j.key === key)) continue;
      out.push({ key, run: async () => { const r = await probe(h.address, port); record(ports, k, r.open, 'open'); } });
      ports.set(k, { ...(ports.get(k) || { open: false, since: now, checkedAt: 0 }), startedAt: now });
    }
  }
  return out;
}

let active = 0;
const queue = [];
function pump() {
  while (active < LIMIT && queue.length) {
    const j = queue.shift();
    active++; inflight.add(j.key);
    j.run().catch(() => {}).finally(() => { active--; inflight.delete(j.key); pump(); });
  }
}
function tick() {
  if (!settings().enabled) return; // monitoring is switched off in Health Settings
  queue.push(...jobs(Date.now()));
  pump();
}

// Runs every check now instead of waiting for the schedule.
function checkNow() {
  for (const r of pings.values()) r.startedAt = 0;
  for (const r of ports.values()) r.startedAt = 0;
  tick();
}

function snapshot() {
  const cfg = settings();
  if (!cfg.enabled) {
    return { enabled: false, hosts: [], summary: { enabled: false, total: 0, pingTotal: 0, remoteTotal: 0, hostsUp: 0, remoteUp: 0, excluded: 0, pingEveryMs: cfg.pingSeconds * 1000, portsEveryMs: cfg.portSeconds * 1000 } };
  }
  // A host appears here if at least one of its two checks is on; the one that is off says "not monitored".
  const shown = db.hosts.filter((h) => !cfg.pingOff.includes(h.id) || !cfg.remoteOff.includes(h.id));
  const hosts = shown.map((h) => {
    const pingOn = !cfg.pingOff.includes(h.id), remoteOn = !cfg.remoteOff.includes(h.id);
    const pg = pings.get(h.address);
    const pgChecked = pingOn && pg && pg.checkedAt > 0;
    const ps = portsFor(h).map((port) => ({ port, ...(ports.get(`${h.address}:${port}`) || {}) }));
    const checked = remoteOn ? ps.filter((p) => p.checkedAt > 0) : [];
    const anyOpen = checked.some((p) => p.open);
    const remote = !remoteOn ? 'off' : anyOpen ? 'up' : checked.length === ps.length ? 'down' : 'unknown';
    const rSince = anyOpen ? Math.min(...checked.filter((p) => p.open).map((p) => p.since)) : checked.length ? Math.max(...checked.map((p) => p.since)) : null;
    return {
      id: h.id, name: h.name || h.hostname || h.address, hostname: h.hostname || null, address: h.address, protocol: h.protocol, os: h.os || null,
      host: { state: !pingOn ? 'off' : pgChecked ? (pg.up ? 'up' : 'down') : 'unknown', rttMs: pgChecked ? pg.rttMs ?? null : null, since: pgChecked ? pg.since : null, checkedAt: pgChecked ? pg.checkedAt : null },
      remote: {
        label: remoteLabel(h), state: remote, since: rSince,
        checkedAt: checked.length ? Math.max(...checked.map((p) => p.checkedAt)) : null,
        ports: ps.map((p) => ({ port: p.port, state: !remoteOn ? 'off' : p.checkedAt > 0 ? (p.open ? 'open' : 'closed') : 'unknown' })),
      },
    };
  });
  return {
    enabled: true,
    hosts,
    summary: {
      enabled: true,
      total: hosts.length,
      pingTotal: hosts.filter((h) => h.host.state !== 'off').length,
      remoteTotal: hosts.filter((h) => h.remote.state !== 'off').length,
      hostsUp: hosts.filter((h) => h.host.state === 'up').length,
      remoteUp: hosts.filter((h) => h.remote.state === 'up').length,
      pingEveryMs: cfg.pingSeconds * 1000, portsEveryMs: cfg.portSeconds * 1000, excluded: db.hosts.length - shown.length,
    },
  };
}

function start() {
  tick();
  setInterval(tick, TICK_MS).unref();
}

module.exports = { start, snapshot, checkNow, settings, setSettings, DEFAULTS, LIMITS };
