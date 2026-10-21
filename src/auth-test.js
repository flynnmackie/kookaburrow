const net = require('net');
const { db, save, id } = require('./store');
const { decrypt, encrypt } = require('./crypto');
const winrm = require('./remote/winrm');
const ssh = require('./remote/ssh');

// Tests the profile assigned to a discovered host (Host Management > Discover). Result states, as in KingfishIR:
//   absent         nothing is listening on the protocol's port, so the host can't be authenticated
//   rejected       something answered but refused these credentials
//   authenticated  logged in; the host is saved so hunts can target it
//   error          anything else (client setup, timeouts, ...) with the reason
const TEST_TIMEOUT_MS = 60 * 1000;

const tcpOpen = (host, port, ms = 3000) => new Promise((resolve) => {
  const s = net.connect({ host, port });
  const done = (ok) => { s.destroy(); resolve(ok); };
  s.setTimeout(ms, () => done(false));
  s.once('connect', () => done(true));
  s.once('error', () => done(false));
});

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

// Turns a transport error into a short state + plain-language reason.
function classify(protocol, raw) {
  const m = String(raw || '');
  const first = m.split(/\r?\n\s*At\s/)[0].replace(/\s*\r?\n\s*/g, ' ').trim();
  if (protocol === 'ssh') {
    if (/All configured authentication methods failed|Permission denied|authentication/i.test(m)) {
      return { state: 'rejected', reason: 'Wrong username or password for SSH on this host.' };
    }
    if (/ECONNREFUSED/.test(m)) return { state: 'absent', reason: 'SSH refused the connection on port 22.' };
    if (/timed out|ETIMEDOUT|Timed out/i.test(m)) return { state: 'error', reason: 'SSH did not answer in time (a firewall may be dropping the connection).' };
    return { state: 'error', reason: first.slice(0, 300) || 'SSH connection failed.' };
  }
  if (/TrustedHosts/i.test(m)) {
    return { state: 'error', reason: 'This PC will not use WinRM to an IP address until it is trusted. As administrator run: Set-Item WSMan:\\localhost\\Client\\TrustedHosts -Value <ip> -Concatenate -Force' };
  }
  if (/Access is denied|logon failure|user name or password is incorrect|0x8009030c|0x80090311|unknown user name|bad password/i.test(m)) {
    return { state: 'rejected', reason: 'Wrong username or password, or the account is not an administrator on the host (local accounts other than the built-in Administrator may be blocked by remote UAC).' };
  }
  if (/0x8009030e|logon session does not exist/i.test(m)) {
    return { state: 'rejected', reason: 'Windows could not log on with this username and password.' };
  }
  if (/host process|2148007941/i.test(m)) {
    return { state: 'error', reason: 'The login worked but Windows could not start the remote session. On this PC that happens when Kookaburrow is not running as administrator.' };
  }
  if (/Timed out|timed out|OperationTimeout|no response/i.test(m)) {
    return { state: 'error', reason: 'The host did not respond in time.' };
  }
  if (/cannot connect|connection refused|ECONNREFUSED|unable to connect|no listener|WinRM client cannot|network path/i.test(m)) {
    return { state: 'absent', reason: 'WinRM did not accept the connection. It may not be enabled on the host, or a firewall is blocking it.' };
  }
  return { state: 'error', reason: first.slice(0, 300) || 'Connection failed.' };
}

async function testHost(ip) {
  const profileId = db.assignments[ip];
  const profile = db.profiles.find((p) => p.id === profileId);
  if (!profile) return { state: 'error', protocol: null, reason: 'No profile is assigned to this host. Select one first.' };

  const protocol = profile.kind === 'Linux (SSH)' ? 'ssh' : 'winrm';
  const conn = { address: ip, protocol, auth: 'Negotiate', useSsl: false };

  if (protocol === 'winrm') {
    const http = await tcpOpen(ip, 5985), https = http ? false : await tcpOpen(ip, 5986);
    if (!http && !https) return { state: 'absent', protocol, reason: 'WinRM is not listening on port 5985 or 5986. It may not be enabled on the host, or a firewall is blocking it.' };
    if (https) { conn.port = 5986; conn.useSsl = true; }
    conn.username = profile.domain && !/[\\@]/.test(profile.username) ? `${profile.domain}\\${profile.username}` : profile.username;
  } else {
    if (!(await tcpOpen(ip, 22))) return { state: 'absent', protocol, reason: 'SSH is not listening on port 22. It may not be installed on the host, or a firewall is blocking it.' };
    conn.username = profile.username;
  }
  conn.password = decrypt(profile.secret);

  const r = await authenticate(conn, { profileId: profile.id });
  return r.state === 'authenticated' ? { ...r, profile: profile.name } : r;
}

// Logs in with the credentials in conn and, only if that works, saves the host (or refreshes it if it is already saved).
// Used by Discover (testHost) and by Manually Add (testManual). Always resolves to { state, protocol, reason, ... }.
async function authenticate(conn, { profileId, name } = {}) {
  const { protocol, address } = conn;
  try {
    const facts = await withTimeout((protocol === 'winrm' ? winrm : ssh).verify(conn), TEST_TIMEOUT_MS, 'Timed out');
    const existing = db.hosts.find((h) => h.address === address && h.protocol === protocol);
    const host = existing || { id: id(), address, protocol };
    Object.assign(host, {
      // the profile's name is kept on the host as it was at the time, so it still reads right if the profile is renamed or deleted
      profileName: db.profiles.find((p) => p.id === profileId)?.name || 'Manual entry',
      port: conn.port, username: conn.username, auth: conn.auth, useSsl: conn.useSsl, profileId,
      ...facts, name: name || existing?.name || facts.hostname || address, secret: encrypt(conn.password), verifiedAt: new Date().toISOString(),
    });
    host.remoteCheck = { up: true, at: host.verifiedAt }; // authenticating proves the remote port is up right now
    if (!existing) db.hosts.push(host);
    save();
    return { state: 'authenticated', protocol, reason: '', hostname: facts.hostname, os: facts.os, name: host.name, added: !existing };
  } catch (e) {
    return { ...classify(protocol, e.message), protocol };
  }
}

// Manually Add: the user types the address and credentials instead of using a profile. Returns the same states as testHost;
// anything wrong with the form itself throws (shown as a 400).
const ADDR_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
async function testManual(b) {
  const address = String(b.address || '').trim();
  if (!ADDR_RE.test(address)) throw new Error('Enter an IP address or host name');
  const protocol = b.protocol === 'ssh' ? 'ssh' : 'winrm';
  const username = String(b.username || '').trim();
  const password = String(b.password ?? '');
  if (!username || !password) throw new Error('A username and password are required');
  const port = b.port === undefined || b.port === null || b.port === '' ? undefined : Number(b.port);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('Port must be a number from 1 to 65535');

  const conn = { address, protocol, auth: 'Negotiate', useSsl: false, username, password };
  if (protocol === 'winrm') {
    const domain = String(b.domain || '').trim();
    if (domain && !/[\\@]/.test(username)) conn.username = `${domain}\\${username}`;
    if (port) {
      if (!(await tcpOpen(address, port))) return { state: 'absent', protocol, reason: `Nothing is listening on port ${port}. WinRM may not be enabled on the host, or a firewall is blocking it.` };
      conn.port = port; conn.useSsl = !!b.useSsl || port === 5986;
    } else {
      const http = await tcpOpen(address, 5985), https = http ? false : await tcpOpen(address, 5986);
      if (!http && !https) return { state: 'absent', protocol, reason: 'WinRM is not listening on port 5985 or 5986. It may not be enabled on the host, or a firewall is blocking it.' };
      if (https) { conn.port = 5986; conn.useSsl = true; }
    }
  } else {
    const p = port || 22;
    if (!(await tcpOpen(address, p))) return { state: 'absent', protocol, reason: `SSH is not listening on port ${p}. It may not be installed on the host, or a firewall is blocking it.` };
    if (port) conn.port = port;
  }
  return authenticate(conn, { name: String(b.name || '').trim().slice(0, 80) || undefined });
}

module.exports = { testHost, testManual, classify };
