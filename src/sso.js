const crypto = require('crypto');
const https = require('https');
const http = require('http');
const tls = require('tls');
const { db, save, id } = require('./store');
const { encrypt, decrypt } = require('./crypto');
const auth = require('./auth');

// Single sign-on with OpenID Connect (Settings > External > Single Sign-On, kept in db.settings.sso). Works with any provider that publishes
// /.well-known/openid-configuration: authentik, Keycloak, Entra ID, Okta, Google, ADFS.
//   1. GET /api/auth/sso/login      sends the browser to the provider (authorization code flow with PKCE, a state and a nonce)
//   2. GET /api/auth/sso/callback   the provider sends it back with a code; the server swaps the code for an ID token over TLS, checks the
//                                   token's signature (RS*, PS* or ES*, against the provider's published keys), issuer, audience, expiry and
//                                   nonce, finds or creates the user and starts the same session a password sign-in starts
// Users: one already linked to this provider identity signs in as that user. Otherwise a user whose name matches the username claim is linked
// to it (when "link existing users" is on). Otherwise a user is created with the "No Access" role (no permissions) when that is on.
const DEFAULTS = { enabled: false, name: 'SSO', issuer: '', clientId: '', scopes: 'openid profile email', usernameClaim: 'preferred_username', publicUrl: '', ca: '', linkExisting: true, createUsers: true };
const raw = () => ({ ...DEFAULTS, ...((db.settings && db.settings.sso) || {}) });
const err = (m, status = 400) => Object.assign(new Error(m), { status });
const loopback = (h) => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i.test(h);
const CB_PATH = '/api/auth/sso/callback';
const redirectUri = (s) => (s.publicUrl ? s.publicUrl + CB_PATH : '');
const configured = (s) => !!(s.issuer && s.clientId && s.clientSecretEnc && s.publicUrl);

function settings() {
  const { clientSecretEnc, ...rest } = raw();
  return { ...rest, hasSecret: !!clientSecretEnc, redirectUri: redirectUri(raw()) };
}
const cleanUrl = (v, what, { origin } = {}) => {
  const t = String(v || '').trim();
  if (!t) return '';
  let u;
  try { u = new URL(t); } catch { throw err(`${what} is not a valid address`); }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback(u.hostname))) throw err(`${what} must start with https:// (http:// is only allowed for localhost)`);
  if (u.username || u.password || u.hash || u.search) throw err(`${what} must not contain a user name, ? or #`);
  if (origin && u.pathname !== '/') throw err(`${what} is the address of this server only, without a path (for example https://kookaburrow.lab:46200)`);
  return origin ? u.origin : t.replace(/\/+$/, '') + (u.pathname.endsWith('/') ? '/' : '');
};
function checkCa(pem) {
  const t = String(pem || '').trim();
  if (!t) return '';
  if (t.length > 40000) throw err('The CA certificate is too long');
  const blocks = t.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks) throw err('The CA certificate must be in PEM form (-----BEGIN CERTIFICATE-----)');
  for (const b of blocks) { try { new crypto.X509Certificate(b); } catch { throw err('One of the CA certificates could not be read'); } }
  return blocks.join('\n');
}
// Validates a settings form and returns the record to store. The secret is kept when it is left blank.
function clean(b, old = raw()) {
  const out = { ...DEFAULTS, ...old };
  if (b.enabled !== undefined) out.enabled = !!b.enabled;
  if (b.name !== undefined) { out.name = String(b.name).trim().slice(0, 40) || DEFAULTS.name; }
  if (b.issuer !== undefined) out.issuer = cleanUrl(b.issuer, 'The issuer address');
  if (b.clientId !== undefined) { out.clientId = String(b.clientId).trim(); if (out.clientId.length > 200 || /\s/.test(out.clientId)) throw err('The client ID is not valid'); }
  if (b.clientSecret) out.clientSecretEnc = encrypt(String(b.clientSecret).trim());
  if (b.scopes !== undefined) {
    const sc = String(b.scopes).trim().split(/\s+/).filter(Boolean);
    if (!sc.every((x) => /^[\w.:/-]{1,100}$/.test(x))) throw err('The scopes are not valid');
    if (!sc.includes('openid')) throw err('The scopes must include openid');
    out.scopes = sc.join(' ');
  }
  if (b.usernameClaim !== undefined) { out.usernameClaim = String(b.usernameClaim).trim(); if (!/^[A-Za-z0-9_.:-]{1,60}$/.test(out.usernameClaim)) throw err('The username claim is not valid'); }
  if (b.publicUrl !== undefined) out.publicUrl = cleanUrl(b.publicUrl, "This server's address", { origin: true });
  if (b.ca !== undefined) out.ca = checkCa(b.ca);
  if (b.linkExisting !== undefined) out.linkExisting = !!b.linkExisting;
  if (b.createUsers !== undefined) out.createUsers = !!b.createUsers;
  if (out.enabled && !configured(out)) throw err('To turn single sign-on on, fill in the issuer, client ID, client secret and this server\'s address');
  return out;
}
function setSettings(b) {
  db.settings = db.settings || {};
  db.settings.sso = clean(b);
  save();
  disc = null; keys = null;
}
const status = () => { const s = raw(); return { enabled: !!(s.enabled && configured(s)), name: s.name }; };

// ---- talking to the provider ----
const NICE = {
  SELF_SIGNED_CERT_IN_CHAIN: "the provider's certificate is not trusted. Paste its CA certificate into 'CA certificate'",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the provider's certificate is self-signed. Paste it into 'CA certificate'",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the provider's certificate chain is not trusted. Paste its CA certificate into 'CA certificate'",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "the provider's certificate chain is not trusted. Paste its CA certificate into 'CA certificate'",
  CERT_HAS_EXPIRED: "the provider's certificate has expired",
  ERR_TLS_CERT_ALTNAME_INVALID: "the provider's certificate is not for that name",
  ENOTFOUND: 'the name could not be found', ECONNREFUSED: 'the connection was refused', EHOSTUNREACH: 'the host cannot be reached', ETIMEDOUT: 'the connection timed out',
};
function request(url, { method = 'GET', headers = {}, body = null, ca = '' } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error(`Not a valid address: ${url}`)); }
    const secure = u.protocol === 'https:';
    if (!secure && !(u.protocol === 'http:' && loopback(u.hostname))) return reject(new Error(`The provider gave an address that is not https: ${url}`));
    const opts = { method, headers, timeout: 15000 };
    if (secure && ca) opts.ca = [...tls.rootCertificates, ca];
    const req = (secure ? https : http).request(u, opts, (res) => {
      const chunks = []; let size = 0;
      res.on('data', (d) => { size += d.length; if (size > 1 << 20) req.destroy(new Error('The response was too large')); else chunks.push(d); });
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => reject(new Error(`Could not reach ${u.host}: ${NICE[e.code] || e.message}`)));
    if (body) req.write(body);
    req.end();
  });
}
const json = (r, what) => { try { return JSON.parse(r.body); } catch { throw new Error(`${what} did not answer with JSON (status ${r.status})`); } };

let disc = null, keys = null;
async function discovery(s, force = false) {
  const base = s.issuer.replace(/\/+$/, '');
  if (!force && disc && disc.base === base && disc.ca === s.ca && Date.now() - disc.at < 10 * 60 * 1000) return disc.doc;
  const r = await request(base + '/.well-known/openid-configuration', { ca: s.ca });
  if (r.status !== 200) throw new Error(`The provider answered ${r.status} at ${base}/.well-known/openid-configuration. Check the issuer address`);
  const doc = json(r, 'The provider');
  if (String(doc.issuer || '').replace(/\/+$/, '') !== base) throw new Error(`The provider says its issuer is "${doc.issuer}", which does not match the issuer address you entered`);
  for (const k of ['authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
    if (!doc[k]) throw new Error(`The provider's configuration has no ${k}`);
    try { const u = new URL(doc[k]); if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback(u.hostname))) throw 0; } catch { throw new Error(`The provider's ${k} is not an https address`); }
  }
  disc = { base, ca: s.ca, at: Date.now(), doc };
  return doc;
}
async function jwks(s, doc, kid, force = false) {
  const stale = !keys || keys.uri !== doc.jwks_uri || Date.now() - keys.at > 60 * 60 * 1000;
  const missing = kid && keys && keys.uri === doc.jwks_uri && !keys.list.some((k) => k.kid === kid) && Date.now() - keys.at > 30 * 1000;
  if (force || stale || missing) {
    const r = await request(doc.jwks_uri, { ca: s.ca });
    if (r.status !== 200) throw new Error(`The provider answered ${r.status} for its signing keys`);
    const list = json(r, 'The provider').keys;
    if (!Array.isArray(list) || !list.length) throw new Error('The provider published no signing keys');
    keys = { uri: doc.jwks_uri, at: Date.now(), list };
  }
  return keys.list;
}

// ---- checking an ID token ----
const b64u = (t) => Buffer.from(String(t).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const HASH = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512', PS256: 'sha256', PS384: 'sha384', PS512: 'sha512', ES256: 'sha256', ES384: 'sha384', ES512: 'sha512' };
async function verifyIdToken(token, s, doc, nonce) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('The provider did not send a valid ID token');
  let header, payload;
  try { header = JSON.parse(b64u(parts[0]).toString('utf8')); payload = JSON.parse(b64u(parts[1]).toString('utf8')); } catch { throw new Error('The ID token could not be read'); }
  const alg = header.alg;
  if (!HASH[alg]) {
    if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') throw new Error('The provider signed the ID token with the client secret (HS256). Choose a signing key on the provider so it signs with RS256 (in authentik: the provider\'s Signing Key)');
    throw new Error(`The ID token uses a signing method that is not accepted (${alg})`);
  }
  const list = await jwks(s, doc, header.kid);
  const jwk = header.kid ? list.find((k) => k.kid === header.kid && (!k.use || k.use === 'sig')) : (list.filter((k) => !k.use || k.use === 'sig').length === 1 ? list.find((k) => !k.use || k.use === 'sig') : null);
  if (!jwk) throw new Error('The ID token was signed with a key the provider does not publish');
  let ok;
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const data = Buffer.from(parts[0] + '.' + parts[1]), sig = b64u(parts[2]);
    if (alg.startsWith('RS')) ok = crypto.verify(HASH[alg], data, key, sig);
    else if (alg.startsWith('PS')) ok = crypto.verify(HASH[alg], data, { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST }, sig);
    else ok = crypto.verify(HASH[alg], data, { key, dsaEncoding: 'ieee-p1363' }, sig);
  } catch { ok = false; }
  if (!ok) throw new Error('The ID token signature is not valid');
  const now = Math.floor(Date.now() / 1000), leeway = 120;
  if (payload.iss !== doc.issuer) throw new Error('The ID token is from a different issuer');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(s.clientId)) throw new Error('The ID token is not for this client (audience mismatch)');
  if (aud.length > 1 && payload.azp !== s.clientId) throw new Error('The ID token was issued to a different client');
  if (typeof payload.exp !== 'number' || payload.exp + leeway < now) throw new Error('The ID token has expired');
  if (typeof payload.nbf === 'number' && payload.nbf - leeway > now) throw new Error('The ID token is not valid yet');
  if (typeof payload.iat === 'number' && payload.iat - 300 > now) throw new Error('The ID token was issued in the future (check the clock on this server)');
  if (!payload.nonce || payload.nonce !== nonce) throw new Error('The ID token does not belong to this sign-in (nonce mismatch)');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('The ID token has no subject');
  return payload;
}

// ---- the user a sign-in belongs to ----
const NO_ACCESS = { id: 'no-access', name: 'No Access', description: 'No permissions. New single sign-on users get this role until an administrator gives them another.' };
function ensureNoAccessRole() {
  let r = db.roles.find((x) => x.id === NO_ACCESS.id);
  if (!r) { r = { ...NO_ACCESS, builtin: false, permissions: [] }; db.roles.push(r); }
  return r;
}
const safeName = (v) => String(v).trim().replace(/[^A-Za-z0-9._@-]/g, '_').slice(0, 64);
function userFor({ issuer, sub, name }, s) {
  const linked = db.users.find((u) => u.sso && u.sso.issuer === issuer && u.sso.sub === sub);
  if (linked) return { user: linked, how: 'linked' };
  const username = safeName(name);
  if (username.length < 2) throw err('The provider sent a user name that is too short');
  const same = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (same) {
    if (same.sso) throw err(`The user "${same.username}" is already linked to a different single sign-on identity`);
    if (!s.linkExisting) throw err(`A user named "${same.username}" exists but is not linked to single sign-on, and linking existing users is off`);
    same.sso = { issuer, sub, linkedAt: new Date().toISOString() };
    save();
    return { user: same, how: 'linked now' };
  }
  if (!s.createUsers) throw err('There is no Kookaburrow user for you, and new users are not created automatically. Ask an administrator');
  const role = ensureNoAccessRole();
  const user = { id: id(), username, createdAt: new Date().toISOString(), roles: [role.id], sso: { issuer, sub, linkedAt: new Date().toISOString(), created: true } };
  db.users.push(user);
  save();
  return { user, how: 'created' };
}

// ---- the two browser routes ----
const pending = new Map(); // state -> { nonce, verifier, at }
const rand = (n) => crypto.randomBytes(n).toString('base64url');
const COOKIE = 'kb_sso';
const secureFlag = (req) => (req.socket.encrypted ? '; Secure' : '');
const cookieState = (req) => { for (const p of String(req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0 && p.slice(0, i).trim() === COOKIE) return p.slice(i + 1).trim(); } return ''; };
const toLogin = (res, msg) => res.redirect('/login.html?sso_error=' + encodeURIComponent(String(msg).slice(0, 300)));

async function begin(req, res) {
  const s = raw();
  if (!s.enabled || !configured(s)) return toLogin(res, 'Single sign-on is not turned on');
  try {
    const doc = await discovery(s);
    const now = Date.now();
    for (const [k, v] of pending) if (now - v.at > 10 * 60 * 1000) pending.delete(k);
    if (pending.size > 500) pending.clear();
    const state = rand(24), nonce = rand(24), verifier = rand(48);
    pending.set(state, { nonce, verifier, at: now });
    const q = new URLSearchParams({ response_type: 'code', client_id: s.clientId, redirect_uri: redirectUri(s), scope: s.scopes, state, nonce, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    // Lax, not Strict: the browser comes back from the provider (another site) and must still send this cookie
    res.set('Set-Cookie', `${COOKIE}=${state}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag(req)}`);
    res.redirect(doc.authorization_endpoint + (doc.authorization_endpoint.includes('?') ? '&' : '?') + q);
  } catch (e) { toLogin(res, e.message); }
}

async function callback(req, res) {
  const s = raw();
  const clear = `${COOKIE}=; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;
  res.set('Set-Cookie', clear);
  try {
    if (!s.enabled || !configured(s)) throw new Error('Single sign-on is not turned on');
    if (req.query.error) throw new Error(`The provider refused the sign-in: ${String(req.query.error)}${req.query.error_description ? ` (${String(req.query.error_description).slice(0, 200)})` : ''}`);
    const state = String(req.query.state || ''), code = String(req.query.code || '');
    const entry = pending.get(state);
    pending.delete(state); // each sign-in attempt can be completed once
    if (!state || !entry || cookieState(req) !== state || Date.now() - entry.at > 10 * 60 * 1000) throw new Error('This sign-in attempt is not valid or has expired. Start again');
    if (!code) throw new Error('The provider did not send a code');
    const doc = await discovery(s);
    const secret = decrypt(s.clientSecretEnc);
    const basic = Array.isArray(doc.token_endpoint_auth_methods_supported) && !doc.token_endpoint_auth_methods_supported.includes('client_secret_post') && doc.token_endpoint_auth_methods_supported.includes('client_secret_basic');
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(s), client_id: s.clientId, code_verifier: entry.verifier });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (basic) headers.Authorization = 'Basic ' + Buffer.from(`${encodeURIComponent(s.clientId)}:${encodeURIComponent(secret)}`).toString('base64'); else form.set('client_secret', secret);
    const r = await request(doc.token_endpoint, { method: 'POST', headers, body: form.toString(), ca: s.ca });
    const tok = json(r, 'The provider');
    if (r.status !== 200 || tok.error) throw new Error(`The provider would not give a token: ${tok.error || r.status}${tok.error_description ? ` (${String(tok.error_description).slice(0, 200)})` : ''}`);
    const claims = await verifyIdToken(tok.id_token, s, doc, entry.nonce);
    let name = claims[s.usernameClaim];
    if ((typeof name !== 'string' || !name) && doc.userinfo_endpoint && tok.access_token) {
      const u = await request(doc.userinfo_endpoint, { headers: { Authorization: 'Bearer ' + tok.access_token, Accept: 'application/json' }, ca: s.ca });
      if (u.status === 200) { const info = json(u, 'The provider'); if (info.sub === claims.sub) name = info[s.usernameClaim]; }
    }
    if (typeof name !== 'string' || !name.trim()) throw new Error(`The provider did not send "${s.usernameClaim}". Check the scopes and the username claim in the single sign-on settings`);
    const { user, how } = userFor({ issuer: doc.issuer, sub: claims.sub, name }, s);
    const session = auth.startSession(user.username);
    console.log(`Single sign-on: ${user.username} signed in (${how})`);
    res.set('Set-Cookie', [clear, session.cookie + secureFlag(req)]);
    // not a redirect: a redirect that began on the provider's site would not carry the Strict session cookie to the first page
    res.type('html').send('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/#home/home"><title>Signing in</title><p style="font:14px sans-serif">Signing in… <a href="/#home/home">Continue</a></p>');
  } catch (e) { toLogin(res, e.message); }
}

// Settings > Test: reads the provider's configuration and keys with the values on the form (nothing is saved).
async function test(b) {
  const s = clean(b, raw());
  s.enabled = false;
  if (!s.issuer) throw err('Enter the issuer address first');
  const doc = await discovery(s, true);
  const list = await jwks(s, doc, null, true);
  const algs = doc.id_token_signing_alg_values_supported || [];
  const notes = [], warnings = [];
  if (algs.length && !algs.some((a) => HASH[a])) warnings.push('The provider only offers signing methods Kookaburrow does not accept. It needs RS256 (in authentik: choose a Signing Key on the provider).');
  if (Array.isArray(doc.code_challenge_methods_supported) && !doc.code_challenge_methods_supported.includes('S256')) warnings.push('The provider does not list PKCE (S256) support.');
  if (Array.isArray(doc.grant_types_supported) && !doc.grant_types_supported.includes('authorization_code')) warnings.push('The provider does not list the authorization code flow.');
  if (Array.isArray(doc.scopes_supported) && s.scopes.split(' ').some((x) => !doc.scopes_supported.includes(x))) warnings.push(`Some scopes are not listed by the provider: ${s.scopes.split(' ').filter((x) => !doc.scopes_supported.includes(x)).join(', ')}`);
  if (!s.publicUrl) warnings.push("Enter this server's address: it is needed for the redirect address.");
  if (s.publicUrl.startsWith('http://')) notes.push('This server\'s address is http://. Most providers only accept https redirect addresses (localhost is the exception).');
  notes.push('The client ID and secret are only checked when someone signs in.');
  return { ok: true, issuer: doc.issuer, authorization_endpoint: doc.authorization_endpoint, keys: list.length, algs: algs.filter((a) => HASH[a]), redirectUri: redirectUri(s), warnings, notes };
}

module.exports = { settings, setSettings, status, begin, callback, test, redirectUri, NO_ACCESS };
