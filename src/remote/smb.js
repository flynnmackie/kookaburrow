// SMB client used to pull large files from Windows hosts (see src/large-transfer.js).
//   Windows server: the built-in SMB client. smb-connect.ps1 connects the session with the host's credentials, then the files are
//                   read through UNC paths (\\host\C$\...), so SMB3 signing and encryption work.
//   Linux server:   the smbclient program (package smbclient / samba-client), which the installer must provide. NOT TESTED YET.
const { spawn } = require('child_process');
const net = require('net');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decrypt } = require('../crypto');
const { copyStream, hashFile } = require('./copy');

const isWindows = process.platform === 'win32';
const connectScript = path.join(__dirname, 'smb-connect.ps1');
const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', connectScript];

// The address this server uses to reach the host: the host's firewall rule is limited to it while SMB is open.
function clientIpFor(address) {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket(net.isIPv6(address) ? 'udp6' : 'udp4');
    s.on('error', (e) => { try { s.close(); } catch { /* closed */ } reject(e); });
    s.connect(445, address, () => { const ip = s.address().address; s.close(); resolve(ip); }); // no packet is sent: this only picks the route
  });
}

function portOpen(address, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = net.connect({ host: address, port, timeout: timeoutMs });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => { s.destroy(); resolve(false); });
  });
}

// Polls until the port is open (wantOpen) or closed, up to totalMs. Resolves true when it got there.
async function waitPort(address, port, wantOpen, totalMs) {
  const end = Date.now() + totalMs;
  for (;;) {
    if ((await portOpen(address, port, 2000)) === wantOpen) return true;
    if (Date.now() >= end) return false;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// A local account is named HOST\user so the host checks it against its own accounts.
const smbUser = (host) => (/[\\@]/.test(host.username) ? host.username : `${host.hostname || host.address}\\${host.username}`);

function runProcess(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

// share is e.g. 'C$'. Resolves to a connection object for fetch() and disconnect().
async function connect(host, share) {
  const password = host.password ?? decrypt(host.secret);
  if (isWindows) {
    const r = await runProcess('powershell.exe', psArgs, { KB_HOST: host.address, KB_SHARE: share, KB_USER: smbUser(host), KB_PASS: password, KB_ACTION: 'connect' });
    if (r.code !== 0) throw new Error(`SMB connection to \\\\${host.address}\\${share} failed: ${(r.err || r.out).trim().split(/\r?\n/)[0]}`);
    return { host, share, address: host.address };
  }
  // smbclient reads the credentials from a private file, never the command line
  const auth = path.join(os.tmpdir(), `kb-smb-${process.pid}-${Date.now()}`);
  const full = smbUser(host);
  const [domain, user] = full.includes('\\') ? full.split('\\') : ['', host.username];
  fs.writeFileSync(auth, `username = ${user}\npassword = ${password}\n${domain ? `domain = ${domain}\n` : ''}`, { mode: 0o600 });
  const conn = { host, share, address: host.address, auth };
  const r = await runProcess('smbclient', [`//${host.address}/${share}`, '-A', auth, '-m', 'SMB3', '-c', 'ls'], {});
  if (r.code !== 0) {
    fs.rmSync(auth, { force: true });
    throw new Error(`SMB connection to //${host.address}/${share} failed: ${(r.err || r.out).trim().split(/\r?\n/)[0] || 'is smbclient installed?'}`);
  }
  return conn;
}

async function disconnect(conn) {
  if (isWindows) await runProcess('powershell.exe', psArgs, { KB_HOST: conn.address, KB_SHARE: conn.share, KB_ACTION: 'disconnect' });
  else fs.rmSync(conn.auth, { force: true });
}

// Copies one file (remotePath is the path on the host, e.g. C:\Users\x\Temp\kb-out-1\a.evtx) to dest. Resolves { size, sha256 } of what arrived.
async function fetch(conn, remotePath, dest, onBytes) {
  const rest = remotePath.replace(/^[A-Za-z]:[\\/]/, '');
  if (isWindows) return copyStream(fs.createReadStream(`\\\\${conn.address}\\${conn.share}\\${rest}`, { highWaterMark: 4 * 1024 * 1024 }), dest, onBytes);
  if (/["';\r\n]/.test(rest) || /["\r\n]/.test(dest)) throw new Error(`cannot fetch a file with that name over smbclient: ${rest}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = await runProcess('smbclient', [`//${conn.address}/${conn.share}`, '-A', conn.auth, '-m', 'SMB3', '-c', `get "${rest}" "${dest}"`], {});
  if (r.code !== 0 || /NT_STATUS/.test(r.out + r.err)) throw new Error((r.err || r.out).trim().split(/\r?\n/)[0] || 'smbclient failed');
  const h = await hashFile(dest);
  if (onBytes) onBytes(h.size);
  return h;
}

module.exports = { clientIpFor, portOpen, waitPort, connect, disconnect, fetch };
