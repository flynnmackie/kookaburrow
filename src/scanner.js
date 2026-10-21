const net = require('net');
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const { scan: cfg } = require('./config');
const { id, db } = require('./store');

const jobs = new Map();

function ipToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error(`Invalid IP: ${ip}`);
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
const intToIp = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

function expandCidr(cidr) {
  const [base, bitsStr] = String(cidr).trim().split('/');
  const bits = bitsStr === undefined ? 32 : Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error('Invalid prefix length');
  const size = 2 ** (32 - bits);
  if (size > cfg.maxHosts) throw new Error(`Subnet too large (max ${cfg.maxHosts} addresses, use /20 or smaller)`);
  const start = Math.floor(ipToInt(base) / size) * size;
  const ips = [];
  for (let i = 0; i < size; i++) {
    // skip network/broadcast on normal subnets
    if (size > 2 && (i === 0 || i === size - 1)) continue;
    ips.push(intToIp(start + i));
  }
  return ips;
}

// A scan target is one or more comma-separated parts, chained freely:
//   192.168.50.0/24          a subnet (network/broadcast skipped)
//   192.168.50.10-20         last-octet range;  192.168.50.10-192.168.51.5  full range
//   192.168.50.7             one address
//   192.168.50.5,6,7  or  192.168.50.5,10-20   shorthand: a bare number reuses the previous address's first three octets
function parseTargets(spec) {
  const tokens = String(spec || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) throw new Error('Enter an address, range or subnet to scan');
  const seen = new Set(), ips = [];
  const bad = (t) => new Error(`Can't read "${t}". Use forms like 192.168.50.0/24, 192.168.50.10-20, 192.168.50.5,6,7 or full addresses, separated by commas`);
  const range = (from, to, t) => {
    if (to < from) throw new Error(`The range "${t}" runs backwards`);
    if (to - from + 1 + ips.length > cfg.maxHosts) throw new Error(`Too many addresses (max ${cfg.maxHosts} per scan)`);
    for (let n = from; n <= to; n++) if (!seen.has(n)) { seen.add(n); ips.push(intToIp(n)); }
  };
  const head = (ip) => ip.split('.').slice(0, 3).join('.');
  let prefix = null; // first three octets of the previous full address
  for (const t of tokens) {
    let m;
    if ((m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(t))) {
      if (!prefix) throw bad(t);
      range(ipToInt(`${prefix}.${m[1]}`), ipToInt(`${prefix}.${m[2] ?? m[1]}`), t);
    } else if (t.includes('/')) {
      const list = expandCidr(t);
      if (list.length + ips.length > cfg.maxHosts) throw new Error(`Too many addresses (max ${cfg.maxHosts} per scan)`);
      for (const ip of list) { const n = ipToInt(ip); if (!seen.has(n)) { seen.add(n); ips.push(ip); } }
      prefix = head(t.split('/')[0]);
    } else if ((m = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(\d{1,3})$/.exec(t))) {
      range(ipToInt(`${m[1]}.${m[2]}`), ipToInt(`${m[1]}.${m[3]}`), t);
      prefix = m[1];
    } else if ((m = /^(\d{1,3}(?:\.\d{1,3}){3})-(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t))) {
      range(ipToInt(m[1]), ipToInt(m[2]), t);
      prefix = head(m[1]);
    } else if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) {
      range(ipToInt(t), ipToInt(t), t);
      prefix = head(t);
    } else throw bad(t);
  }
  return ips;
}

function probe(ip, port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(cfg.timeoutMs);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
  });
}

// Heuristic only; the real OS is verified once a credentialed connection succeeds.
function guessOs(open) {
  const win = [135, 445, 3389, 5985, 5986].filter((p) => open.includes(p)).length;
  if (win >= 2 || open.includes(5985) || open.includes(5986)) return 'Windows (likely)';
  if (open.includes(22) && !win) return 'Linux/Unix (likely)';
  if (open.includes(22)) return 'Unknown (SSH open)';
  return win ? 'Windows (likely)' : 'Unknown';
}

// ---- Remote protocol check ----
// After a host is found, ask the protocol its OS uses whether it really answers, rather than trusting an open port:
//   WinRM  an unauthenticated POST to /wsman on 5985 (HTTP) and 5986 (HTTPS, any certificate). A real WinRM service answers 401 and offers
//          Negotiate/Kerberos/Basic (or is the Windows HTTP.sys server), which is not something a random web server does.
//   SSH    connect to port 22 and read the banner: every SSH server speaks first with "SSH-2.0-...".
// Each is tried twice, so one dropped packet does not make a host look down. This sends no credentials.
const REMOTE_TIMEOUT_MS = 3000;
function wsman(ip, port, secure) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const req = (secure ? https : http).request({
      host: ip, port, path: '/wsman', method: 'POST', timeout: REMOTE_TIMEOUT_MS, rejectUnauthorized: false,
      headers: { 'Content-Type': 'application/soap+xml;charset=UTF-8', 'Content-Length': 0 },
    }, (res) => {
      res.resume();
      const auth = String(res.headers['www-authenticate'] || ''), server = String(res.headers.server || '');
      const ok = (res.statusCode === 401 && /negotiate|kerberos|ntlm|basic|credssp/i.test(auth)) || (/httpapi/i.test(server) && [200, 401, 405, 500].includes(res.statusCode));
      finish({ ok, port, detail: `HTTP${secure ? 'S' : ''} ${res.statusCode}${auth ? ` (${auth.split(',')[0].trim()})` : ''}` });
    });
    req.on('timeout', () => { req.destroy(); finish({ ok: false, port, detail: `port ${port} timed out` }); });
    req.on('error', (e) => finish({ ok: false, port, detail: `port ${port} ${e.code || e.message}` }));
    req.end();
  });
}
function sshBanner(ip, port = 22) {
  return new Promise((resolve) => {
    let done = false, buf = '';
    const s = net.connect({ host: ip, port });
    const finish = (v) => { if (!done) { done = true; s.destroy(); resolve(v); } };
    s.setTimeout(REMOTE_TIMEOUT_MS);
    s.on('data', (d) => { buf += d.toString('latin1'); if (buf.includes('\n') || buf.length > 255) finish(/^SSH-/.test(buf) ? { ok: true, port, detail: buf.split(/\r?\n/)[0].slice(0, 80) } : { ok: false, port, detail: `port ${port} is open but is not SSH` }); });
    s.once('timeout', () => finish(buf.startsWith('SSH-') ? { ok: true, port, detail: buf.trim().slice(0, 80) } : { ok: false, port, detail: `port ${port} gave no SSH banner` }));
    s.once('error', (e) => finish({ ok: false, port, detail: `port ${port} ${e.code || e.message}` }));
    s.once('close', () => finish({ ok: false, port, detail: `port ${port} closed the connection` }));
  });
}
// Windows hosts are asked over WinRM, everything else over SSH.
async function checkRemote(r) {
  const protocol = /^Windows/.test(r.osGuess) ? 'winrm' : 'ssh';
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const tries = protocol === 'winrm' ? [await wsman(r.ip, 5985, false), await wsman(r.ip, 5986, true)] : [await sshBanner(r.ip, 22)];
    const hit = tries.find((t) => t.ok);
    if (hit) return { protocol, available: true, port: hit.port, detail: hit.detail };
    last = tries;
  }
  return { protocol, available: false, port: null, detail: last.map((t) => t.detail).join('; ') };
}

async function scanHost(ip) {
  const results = await Promise.all(cfg.ports.map(async (p) => ((await probe(ip, p)) ? p : null)));
  const open = results.filter(Boolean);
  if (!open.length) return null;
  let hostname = null;
  try { hostname = (await dns.reverse(ip))[0] || null; } catch { /* no PTR record */ }
  return { ip, hostname, openPorts: open, osGuess: guessOs(open) };
}

function startScan(spec) {
  const ips = parseTargets(spec);
  const job = { id: id(), cidr: String(spec), status: 'running', phase: 'scan', total: ips.length, done: 0, found: [], startedAt: new Date().toISOString() };
  jobs.set(job.id, job);

  (async () => {
    // Each worker scans one host at a time; the ports within a host are probed in parallel.
    const workers = Math.max(1, Math.floor(cfg.concurrency / cfg.ports.length));
    let next = 0;
    const checks = []; // the remote protocol check of every host found, started as soon as it is found
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next < ips.length && job.status === 'running') {
        const ip = ips[next++];
        const r = await scanHost(ip).catch(() => null);
        job.done++;
        if (r) {
          // already authenticated and saved under Hosts? the page shows it as such instead of asking again
          const saved = db.hosts.find((h) => h.address === r.ip);
          if (saved) r.known = { protocol: saved.protocol, hostname: saved.hostname || saved.name, os: saved.os };
          job.found.push(r);
          checks.push(checkRemote(r).then((x) => { r.remote = x; }).catch(() => { r.remote = { protocol: /^Windows/.test(r.osGuess) ? 'winrm' : 'ssh', available: false, port: null, detail: 'the check failed' }; }));
        }
      }
    }));
    if (job.status === 'running') job.phase = 'remote';
    await Promise.all(checks);
    job.found.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
    job.phase = 'done';
    if (job.status === 'running') job.status = 'complete';
    job.finishedAt = new Date().toISOString();
  })();

  return job;
}

const getScan = (jobId) => jobs.get(jobId);
function cancelScan(jobId) {
  const j = jobs.get(jobId);
  if (j && j.status === 'running') j.status = 'cancelled';
  return j;
}

module.exports = { startScan, getScan, cancelScan, parseTargets, checkRemote };
