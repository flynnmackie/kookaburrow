const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFile } = require('child_process');
const { db, save } = require('./store');
const { dataDir } = require('./config');
const pyruntime = require('./remote/pyruntime');
const serverSettings = require('./server-settings');

// HTTPS for the server (Settings > System > Certificate), the same idea as Velociraptor: Kookaburrow makes its own certificate authority (CA)
// and a server certificate signed by it that names the addresses people browse to. Browsers trust it once the CA file is imported on
// the machine they browse from. Everything is kept in data/tls/ (the keys are not encrypted, like data/secret.key). db.settings.tls holds
// { enabled, names } (names: the DNS names and IP addresses the certificate is made for, besides localhost).
// With HTTPS on, one port serves both: a connection that starts with a TLS handshake is served over HTTPS and a plain HTTP request is
// redirected to HTTPS. Connections from this PC itself are never redirected, so localhost stays reachable whatever the certificate is.
const dir = path.join(dataDir, 'tls');
const files = { caCert: 'ca.pem', caKey: 'ca.key', cert: 'server.pem', key: 'server.key' };
const file = (k) => path.join(dir, files[k]);
const err = (m) => Object.assign(new Error(m), { status: 400 });
const DNS_NAME = /^(\*\.)?[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const saved = () => (db.settings && db.settings.tls) || {};
const readPem = (k) => { try { return fs.readFileSync(file(k), 'utf8'); } catch { return null; } };
const exists = () => fs.existsSync(file('cert')) && fs.existsSync(file('key'));

// "a.example, 10.0.0.5" -> ['a.example', '10.0.0.5'], with a clear error for anything that is neither a name nor an address
function cleanNames(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/);
  const out = [];
  for (const n0 of raw.map((x) => String(x).trim()).filter(Boolean)) {
    const n = n0.replace(/^\[|\]$/g, '');
    if (!(net.isIP(n) || DNS_NAME.test(n))) throw err(`"${n0}" is not a host name or an IP address.`);
    if (!out.includes(n.toLowerCase())) out.push(n.toLowerCase());
  }
  if (out.length > 30) throw err('At most 30 names and addresses.');
  return out;
}

function describe(pem) {
  try {
    const x = new crypto.X509Certificate(pem);
    const san = (x.subjectAltName || '').split(/,\s*/).map((s) => s.replace(/^(DNS|IP Address):/, '')).filter(Boolean);
    const end = new Date(x.validTo);
    return { subject: x.subject.replace(/\n/g, ', '), names: san, notBefore: new Date(x.validFrom).toISOString(), notAfter: end.toISOString(), daysLeft: Math.floor((end - Date.now()) / 86400000), fingerprint: x.fingerprint256 };
  } catch { return null; }
}

function status(ctx = {}) {
  const s = saved(), cert = exists() ? describe(readPem('cert')) : null, ca = readPem('caCert') ? describe(readPem('caCert')) : null;
  const warnings = [];
  if (cert) {
    if (cert.daysLeft < 0) warnings.push('The server certificate has expired: browsers will refuse it. Generate a new one.');
    else if (cert.daysLeft < 30) warnings.push(`The server certificate expires in ${cert.daysLeft} day${cert.daysLeft === 1 ? '' : 's'}. Generate a new one before then.`);
    // addresses this server is reached on that the certificate does not name
    const have = new Set(cert.names.map((n) => n.toLowerCase()));
    const wildcard = (h) => [...have].some((n) => n.startsWith('*.') && h.endsWith(n.slice(1)) && h.split('.').length === n.split('.').length);
    const lacking = [];
    const sv = serverSettings.settings();
    const wanted = sv.host === '0.0.0.0' ? serverSettings.localAddresses().map((a) => a.address) : sv.host === '127.0.0.1' ? [] : [sv.host];
    for (const a of wanted) if (!have.has(a)) lacking.push(a);
    const hn = String(ctx.hostHeader || '').replace(/:\d+$/, '').toLowerCase();
    if (hn && !have.has(hn) && !wildcard(hn) && !/^\[?::1\]?$/.test(hn)) lacking.unshift(hn);
    if (lacking.length) warnings.push(`The certificate does not name ${[...new Set(lacking)].join(', ')}. Browsing to a name or address it does not list gives a certificate error; add them below and generate again.`);
  }
  if (s.enabled && !cert) warnings.push('HTTPS is on but there is no certificate.');
  return { enabled: !!s.enabled, hasCert: !!cert, cert, ca, names: s.names || [], warnings, engine: pyruntime.check().ok, loadError: s.loadError || null };
}

function run(args, input) {
  return new Promise((resolve, reject) => {
    const py = pyruntime.command();
    if (!py) return reject(err('The bundled Python (needed to make certificates) is not installed. Run: npm run setup-winrm'));
    const p = execFile(py.exe, ['-u', path.join(__dirname, 'tls_gen.py')], { env: { ...process.env, ...py.env }, timeout: 60000, maxBuffer: 4 << 20 }, (e, out, errText) => {
      if (e) return reject(err(`Could not make the certificate: ${String(errText || e.message).trim().split(/\r?\n/).pop()}`));
      try { resolve(JSON.parse(out)); } catch { reject(err('Could not make the certificate: unexpected output.')); }
    });
    p.stdin.end(JSON.stringify(input));
  });
}

// Makes the certificate for `names` (plus localhost). With newCa false an existing CA is kept, so machines that trust it do not need the new CA.
async function generate(namesInput, { newCa = false } = {}) {
  const names = cleanNames(namesInput);
  const keep = !newCa && readPem('caCert') && readPem('caKey');
  const out = await run([], { names, days: 825, ...(keep ? { ca_cert: readPem('caCert'), ca_key: readPem('caKey') } : {}) });
  fs.mkdirSync(dir, { recursive: true });
  const write = (k, text) => { const t = file(k) + '.tmp'; fs.writeFileSync(t, text, { mode: 0o600 }); fs.renameSync(t, file(k)); };
  if (!keep) { write('caCert', out.ca_cert); write('caKey', out.ca_key); }
  write('cert', out.server_cert); write('key', out.server_key);
  db.settings = { ...(db.settings || {}), tls: { ...saved(), names, loadError: null } };
  save();
  return { reusedCa: !!keep };
}

// Turn HTTPS on or off (the server restarts to apply it).
function setEnabled(on) {
  if (on && !exists()) throw err('Generate a certificate first.');
  if (on && !describe(readPem('cert'))) throw err('The certificate file cannot be read. Generate a new one.');
  db.settings = { ...(db.settings || {}), tls: { ...saved(), enabled: !!on, loadError: null } };
  save();
}
const enabled = () => !!saved().enabled;
const caPem = () => readPem('caCert');

// The options for https.createServer, or null (with the reason saved for the page) when HTTPS is on but cannot be used.
function loadOptions() {
  if (!enabled()) return null;
  try {
    const cert = readPem('cert'), key = readPem('key');
    if (!cert || !key) throw new Error('the certificate or key file is missing');
    new crypto.X509Certificate(cert); crypto.createPrivateKey(key);
    return { cert, key, minVersion: 'TLSv1.2' };
  } catch (e) {
    db.settings = { ...(db.settings || {}), tls: { ...saved(), loadError: `HTTPS could not start (${e.message}); the server is using plain HTTP.` } };
    save();
    return null;
  }
}

module.exports = { status, generate, setEnabled, enabled, caPem, loadOptions, cleanNames };
