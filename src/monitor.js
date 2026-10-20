const net = require('net');
const { execFile } = require('child_process');
const { db } = require('./store');

// Health monitor for every saved (authenticated) host. It runs in the server, so it keeps checking while no page is open.
//   Host    ping every minute
//   Remote  the host's remote-management port every 5 minutes: WinRM (5985 or 5986) for Windows hosts, SSH (22) for Linux
// Results are kept in memory only; after a restart every host shows "unknown" until its first check (a few seconds).
const PING_MS = 60 * 1000;
const PORT_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const LIMIT = 16;          // checks in flight at once
const PORT_TIMEOUT = 2000;

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
  for (const address of new Set(db.hosts.map((h) => h.address))) {
    const key = `ping|${address}`;
    if (!inflight.has(key) && due(pings, address, PING_MS)) {
      out.push({ key, run: async () => { const r = await ping(address); record(pings, address, r.up, 'up', { rttMs: r.rttMs ?? null }); } });
      pings.set(address, { ...(pings.get(address) || { up: false, since: now, checkedAt: 0 }), startedAt: now }); // marks it as started so it is not queued twice
    }
  }
  for (const h of db.hosts) {
    for (const port of portsFor(h)) {
      const k = `${h.address}:${port}`, key = `port|${k}`;
      if (inflight.has(key) || !due(ports, k, PORT_MS) || out.some((j) => j.key === key)) continue;
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
  const hosts = db.hosts.map((h) => {
    const pg = pings.get(h.address);
    const pgChecked = pg && pg.checkedAt > 0;
    const ps = portsFor(h).map((port) => ({ port, ...(ports.get(`${h.address}:${port}`) || {}) }));
    const checked = ps.filter((p) => p.checkedAt > 0);
    const anyOpen = checked.some((p) => p.open);
    const remote = anyOpen ? 'up' : checked.length === ps.length ? 'down' : 'unknown';
    const rSince = anyOpen ? Math.min(...checked.filter((p) => p.open).map((p) => p.since)) : checked.length ? Math.max(...checked.map((p) => p.since)) : null;
    return {
      id: h.id, name: h.name || h.hostname || h.address, hostname: h.hostname || null, address: h.address, protocol: h.protocol, os: h.os || null,
      host: { state: pgChecked ? (pg.up ? 'up' : 'down') : 'unknown', rttMs: pgChecked ? pg.rttMs ?? null : null, since: pgChecked ? pg.since : null, checkedAt: pgChecked ? pg.checkedAt : null },
      remote: {
        label: remoteLabel(h), state: remote, since: rSince,
        checkedAt: checked.length ? Math.max(...checked.map((p) => p.checkedAt)) : null,
        ports: ps.map((p) => ({ port: p.port, state: p.checkedAt > 0 ? (p.open ? 'open' : 'closed') : 'unknown' })),
      },
    };
  });
  return {
    hosts,
    summary: {
      total: hosts.length,
      hostsUp: hosts.filter((h) => h.host.state === 'up').length,
      remoteUp: hosts.filter((h) => h.remote.state === 'up').length,
      pingEveryMs: PING_MS, portsEveryMs: PORT_MS,
    },
  };
}

function start() {
  tick();
  setInterval(tick, TICK_MS).unref();
}

module.exports = { start, snapshot, checkNow };
