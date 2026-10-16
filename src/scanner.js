const net = require('net');
const dns = require('dns').promises;
const { scan: cfg } = require('./config');
const { id } = require('./store');

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

async function scanHost(ip) {
  const results = await Promise.all(cfg.ports.map(async (p) => ((await probe(ip, p)) ? p : null)));
  const open = results.filter(Boolean);
  if (!open.length) return null;
  let hostname = null;
  try { hostname = (await dns.reverse(ip))[0] || null; } catch { /* no PTR record */ }
  return { ip, hostname, openPorts: open, osGuess: guessOs(open) };
}

function startScan(cidr) {
  const ips = expandCidr(cidr);
  const job = { id: id(), cidr, status: 'running', total: ips.length, done: 0, found: [], startedAt: new Date().toISOString() };
  jobs.set(job.id, job);

  (async () => {
    // Each worker scans one host at a time; the ports within a host are probed in parallel.
    const workers = Math.max(1, Math.floor(cfg.concurrency / cfg.ports.length));
    let next = 0;
    await Promise.all(Array.from({ length: workers }, async () => {
      while (next < ips.length && job.status === 'running') {
        const ip = ips[next++];
        const r = await scanHost(ip).catch(() => null);
        job.done++;
        if (r) job.found.push(r);
      }
    }));
    job.found.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
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

module.exports = { startScan, getScan, cancelScan };
