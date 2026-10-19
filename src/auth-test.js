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

  try {
    const facts = await withTimeout((protocol === 'winrm' ? winrm : ssh).verify(conn), TEST_TIMEOUT_MS, 'Timed out');
    const existing = db.hosts.find((h) => h.address === ip && h.protocol === protocol);
    const host = existing || { id: id(), address: ip, protocol };
    Object.assign(host, {
      port: conn.port, username: conn.username, auth: conn.auth, useSsl: conn.useSsl, profileId: profile.id,
      ...facts, name: existing?.name || facts.hostname || ip, secret: encrypt(conn.password), verifiedAt: new Date().toISOString(),
    });
    if (!existing) db.hosts.push(host);
    save();
    return { state: 'authenticated', protocol, reason: '', hostname: facts.hostname, os: facts.os, profile: profile.name, added: !existing };
  } catch (e) {
    return { ...classify(protocol, e.message), protocol };
  }
}

module.exports = { testHost, classify };
