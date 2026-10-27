const net = require('net');
const os = require('os');
const { db, save } = require('./store');
const config = require('./config');

// Where the server listens and who may connect (Settings > System > Server Settings, kept in db.settings.server):
//   host        the address it listens on: 127.0.0.1 (this PC only), 0.0.0.0 (every network interface) or one address of this machine
//   port        1 to 65535
//   allowFrom   addresses that may connect besides this PC: IPv4 addresses or ranges (10.0.0.5, 192.168.1.0/24)
// This PC (127.0.0.1 and ::1) is ALWAYS allowed and always listened on, whatever is saved, so the settings can never lock the admin out.
// Changing them restarts the server. If the saved settings cannot be used when it starts (port taken, address gone) it falls back to
// localhost and says so on the settings page.
const DEFAULTS = { host: config.host, port: config.port, allowFrom: [] };
const err = (m) => Object.assign(new Error(m), { status: 400 });

const isLoopbackHost = (h) => h === '127.0.0.1' || h === 'localhost';
const ipv4 = (s) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s);
const toInt = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
// "10.0.0.5" or "10.0.0.0/24" -> { text, lo, hi } or null
function parseRange(text) {
  const m = /^(\S+?)(?:\/(\d{1,2}))?$/.exec(String(text).trim());
  if (!m || !ipv4(m[1])) return null;
  const bits = m[2] === undefined ? 32 : Number(m[2]);
  if (bits > 32) return null;
  const size = 2 ** (32 - bits), lo = Math.floor(toInt(m[1]) / size) * size;
  return { text: m[2] === undefined ? m[1] : `${m[1]}/${bits}`, lo, hi: lo + size - 1, bits };
}
// ::ffff:1.2.3.4 -> 1.2.3.4
const clean = (a) => String(a || '').replace(/^::ffff:/i, '');
const isLoopbackAddr = (a) => clean(a) === '::1' || clean(a).startsWith('127.');

function settings() {
  const s = (db.settings && db.settings.server) || {};
  const host = typeof s.host === 'string' && (s.host === '0.0.0.0' || ipv4(s.host)) ? s.host : DEFAULTS.host;
  const port = Number.isInteger(s.port) && s.port >= 1 && s.port <= 65535 ? s.port : DEFAULTS.port;
  const allowFrom = (Array.isArray(s.allowFrom) ? s.allowFrom : []).map((x) => parseRange(x)?.text).filter(Boolean);
  return { host, port, allowFrom };
}
const hasSaved = () => !!(db.settings && db.settings.server);

// IPv4 addresses of this machine, with the network each is on.
function localAddresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, list]) => (list || []).filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => ({ name, address: i.address, netmask: i.netmask, range: parseRange(`${i.address}/${i.netmask.split('.').reduce((n, o) => n + Number(o).toString(2).replace(/0/g, '').length, 0)}`) })));
}

// Is this client address allowed? This PC always is; others only when listed.
function clientAllowed(addr, list = settings().allowFrom) {
  const a = clean(addr);
  if (isLoopbackAddr(a)) return true;
  if (!ipv4(a)) return false;
  const n = toInt(a);
  return list.some((r) => { const p = parseRange(r); return p && n >= p.lo && n <= p.hi; });
}

// The Host values a request may carry (blocks DNS rebinding): this PC's names, and, when the server is open to the network, its own addresses and name.
function allowedHosts(s = settings()) {
  const port = s.port, set = new Set();
  const add = (h) => { set.add(`${h}:${port}`.toLowerCase()); if (port === 80) set.add(String(h).toLowerCase()); };
  ['localhost', '127.0.0.1', '[::1]'].forEach(add);
  if (!isLoopbackHost(s.host)) {
    if (s.host !== '0.0.0.0') add(s.host);
    else localAddresses().forEach((a) => add(a.address));
    add(os.hostname());
    if (process.env.USERDNSDOMAIN) add(`${os.hostname()}.${process.env.USERDNSDOMAIN}`);
  }
  return set;
}

// Can something listen on host:port right now? (A port we already hold is fine.)
const canListen = (host, port) => new Promise((resolve) => {
  const t = net.createServer();
  t.once('error', (e) => resolve(e.code || e.message));
  t.once('listening', () => t.close(() => resolve(null)));
  t.listen(port, host);
});

// Looks at proposed settings. errors stop the save; warnings need the admin to confirm. ctx: { clientAddr, hostHeader } of the admin's own request.
async function check(body, ctx = {}) {
  const errors = [], warnings = [], cur = settings();
  const host = String(body.host ?? cur.host).trim(), port = Number(body.port ?? cur.port);
  const rawList = Array.isArray(body.allowFrom) ? body.allowFrom : String(body.allowFrom ?? '').split(/[\s,;]+/);
  const entries = rawList.map((x) => String(x).trim()).filter(Boolean);
  const ranges = [];
  for (const e of entries) { const p = parseRange(e); if (!p) errors.push(`"${e}" is not an IPv4 address or range (examples: 10.0.0.5 or 192.168.1.0/24).`); else if (!ranges.some((r) => r.text === p.text)) ranges.push(p); }
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('The port must be a whole number from 1 to 65535.');
  if (host !== '0.0.0.0' && !ipv4(host)) errors.push('The listen address must be 127.0.0.1, 0.0.0.0 or an IPv4 address of this machine.');
  const locals = localAddresses();
  const mine = new Set(['127.0.0.1', '0.0.0.0', ...locals.map((a) => a.address)]);
  if (ipv4(host) && !mine.has(host)) errors.push(`${host} is not an address of this machine, so the server cannot listen on it. This machine has: ${['127.0.0.1', ...locals.map((a) => a.address)].join(', ')}.`);
  if (!errors.length) {
    const portChanged = port !== cur.port;
    if (portChanged) {
      const r = await canListen(host === '0.0.0.0' || isLoopbackHost(host) ? '0.0.0.0' : host, port);
      if (r === 'EADDRINUSE') errors.push(`Port ${port} is already in use by another program on this machine.`);
      else if (r === 'EACCES') errors.push(`This account is not allowed to listen on port ${port}.`);
      else if (r) errors.push(`Port ${port} cannot be used (${r}).`);
    }
  }
  if (!errors.length) {
    const open = !isLoopbackHost(host);
    const httpsOn = !!(db.settings && db.settings.tls && db.settings.tls.enabled);
    if (open && !httpsOn) warnings.push('The server will be open to the network over plain HTTP: sign-in passwords and everything the server shows cross the network unencrypted. Only do this on a network you trust (a lab or management network), or turn on HTTPS under Settings > System > Certificate.');
    if (port < 1024) warnings.push(`Port ${port} is a privileged port: on Linux the server needs root to use it, and on Windows other programs may already expect it.`);
    if (open && !ranges.length) warnings.push('No allowed addresses are set, so only this PC can connect even though the server listens on the network. Add the addresses or ranges that may connect.');
    if (!open && ranges.length) warnings.push(`The server only listens on this PC (${host}), so the allowed addresses below cannot reach it. Choose "All network interfaces" or one of this machine's addresses to let them in.`);
    for (const r of ranges) {
      if (r.bits === 0 || r.bits < 8) warnings.push(`${r.text} allows a huge part of the internet address space. Narrow it to the machines that need access.`);
      else if (open && !locals.some((a) => a.range && a.range.lo <= r.hi && r.lo <= a.range.hi)) warnings.push(`${r.text} is not on any network this server is directly connected to (${locals.map((a) => a.range?.text).filter(Boolean).join(', ') || 'none found'}); it can only reach the server through a router, and a firewall may block it.`);
    }
    const me = clean(ctx.clientAddr);
    if (me && !isLoopbackAddr(me) && !clientAllowed(me, ranges.map((r) => r.text))) warnings.push(`You are connected from ${me}, which is not in the allowed list: after the restart this browser will be locked out. You can still use the server from this PC (localhost).`);
    if (ctx.hostHeader) {
      const h = String(ctx.hostHeader).toLowerCase(), want = allowedHosts({ host, port, allowFrom: [] });
      if (!want.has(h)) {
        const name = h.replace(/:\d+$/, ''), same = allowedHosts({ host, port, allowFrom: [] }).has(`${name}:${port}`); // the same name with the new port, when it still works
        const use = same ? `${name}:${port}` : `${isLoopbackHost(host) ? '127.0.0.1' : host === '0.0.0.0' ? (locals[0]?.address || '127.0.0.1') : host}:${port}`;
        warnings.push(`You are using this page as ${ctx.hostHeader}. After the restart that address will stop working; use ${use} instead.`);
      }
    }
    if (open && process.platform === 'win32') warnings.push(`Windows Firewall may block connections to port ${port} from other machines; add an inbound rule for it if they cannot connect.`);
  }
  const addrs = host === '0.0.0.0' ? ['127.0.0.1', ...locals.map((a) => a.address)] : isLoopbackHost(host) ? ['127.0.0.1'] : ['127.0.0.1', host];
  return { errors, warnings, urls: errors.length ? [] : addrs.map((a) => `http://${a}:${port}`), normalized: { host, port, allowFrom: ranges.map((r) => r.text) } };
}

let restarter = null;
const onRestart = (fn) => { restarter = fn; };
const restart = () => { if (restarter) restarter(); };
async function setSettings(body, ctx) {
  const c = await check(body, ctx);
  if (c.errors.length) throw err(c.errors[0]);
  if (c.warnings.length && body.confirm !== true) throw Object.assign(err('The settings look wrong. Confirm to save them anyway.'), { warnings: c.warnings });
  db.settings = { ...(db.settings || {}), server: c.normalized };
  if (db.settings.serverFallback) delete db.settings.serverFallback;
  save();
  if (restarter) restarter();
  return c;
}

// Used at start-up when the saved settings could not be listened on.
function noteFallback(reason, used) {
  db.settings = { ...(db.settings || {}), serverFallback: { at: new Date().toISOString(), reason, used } };
  save();
}
const fallback = () => (db.settings && db.settings.serverFallback) || null;
const dismissFallback = () => { if (db.settings && db.settings.serverFallback) { delete db.settings.serverFallback; save(); } };

module.exports = { DEFAULTS, settings, hasSaved, localAddresses, clientAllowed, allowedHosts, check, setSettings, onRestart, restart, noteFallback, fallback, dismissFallback, isLoopbackHost, isLoopbackAddr, clean };
