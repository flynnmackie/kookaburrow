const crypto = require('crypto');
const { db, save, id } = require('./store');

// Sign-in. Users are stored in db.users with a salted scrypt hash (never the password). A successful login creates a
// session: a random token goes to the browser in an HttpOnly, SameSite=Strict cookie and only its SHA-256 is kept in
// db.sessions, so a copy of the database cannot be used to sign in. A session ends after IDLE_MS without use.
// The first run creates admin / admin; change it as soon as account management exists.
const COOKIE = 'kb_session';
const IDLE_MS = 8 * 60 * 60 * 1000;
const MAX_FAILS = 5, LOCK_MS = 30 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (password, salt) => crypto.scryptSync(String(password), salt, 64);

function makeUser(username, password) {
  const salt = crypto.randomBytes(16);
  return { id: id(), username, salt: salt.toString('hex'), hash: scrypt(password, salt).toString('hex'), createdAt: new Date().toISOString() };
}
function checkPassword(user, password) {
  const want = Buffer.from(user.hash, 'hex');
  const got = scrypt(password, Buffer.from(user.salt, 'hex'));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

if (!db.users.length) {
  db.users.push({ ...makeUser('admin', 'admin'), defaultPassword: true });
  save();
}
// Roles: the built-in admin role has full access to everything ('*') and cannot be edited or removed. Every user
// belongs to at least one role, and the original admin account is always an admin.
if (!db.roles.some((r) => r.id === 'admin')) {
  db.roles.unshift({ id: 'admin', name: 'admin', description: 'Full access to everything, including permissions added in future.', builtin: true, permissions: ['*'] });
}
// Roles that come with the platform. Each is added once (db.seededRoles remembers it), so a default role that is later
// deleted stays deleted. None is assigned to anyone by default; they can be edited like any other custom role.
//   user              stripped down, for day-to-day work: add hosts, run hunts, use shells, read-only libraries
//   privileged-user   everything admin can do except manage users, roles and system settings (those can still be viewed)
const DEFAULT_ROLES = [
  {
    id: 'user', name: 'user', builtin: false,
    description: 'Day-to-day hunting: add hosts, run hunts, use shells. No user, role, library or system changes, and no running actions.',
    permissions: ['hosts.manage', 'hunts.run', 'hunts.export', 'shell.files', 'collections.view', 'actions.view', 'system.view'],
  },
  {
    id: 'privileged-user', name: 'Privileged User', builtin: false,
    description: 'Everything an admin can do except add, edit or delete users and roles and change system settings. Those can still be viewed.',
    permissions: ['users.view', 'hosts.manage', 'collections.manage', 'actions.manage', 'actions.run', 'hunts.run', 'hunts.export', 'shell.files', 'system.view'],
  },
];
db.seededRoles = Array.isArray(db.seededRoles) ? db.seededRoles : [];
for (const r of DEFAULT_ROLES) {
  if (db.seededRoles.includes(r.id)) continue;
  if (!db.roles.some((x) => x.id === r.id)) db.roles.push(r);
  db.seededRoles.push(r.id);
}
for (const u of db.users) if (!Array.isArray(u.roles)) u.roles = u.username === 'admin' ? ['admin'] : [];
save();

const fails = new Map(); // username -> { n, until }
const cookieOf = (req) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) return part.slice(i + 1).trim();
  }
  return '';
};

// The live session for a request, or null. Using a session keeps it alive.
function sessionFrom(req) {
  const token = cookieOf(req);
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const h = sha256(token), now = Date.now();
  const s = db.sessions.find((x) => x.h === h);
  if (!s) return null;
  if (now - s.lastSeen > IDLE_MS) { db.sessions = db.sessions.filter((x) => x !== s); save(); return null; }
  if (now - s.lastSeen > 60 * 1000) { s.lastSeen = now; save(); } // refreshed at most once a minute
  return { user: s.user };
}

// Returns the Set-Cookie header value for a new session, or throws with a message for the sign-in form.
async function login(username, password) {
  const name = String(username || '').trim().toLowerCase();
  const f = fails.get(name);
  if (f && f.until > Date.now()) throw Object.assign(new Error(`Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 1000)} seconds.`), { status: 429 });
  const user = db.users.find((u) => u.username.toLowerCase() === name);
  // The same work is done whether or not the user exists, so timing does not reveal valid usernames.
  const ok = user ? checkPassword(user, password) : (scrypt(password, Buffer.alloc(16)), false);
  if (!ok) {
    const lockEnded = f && f.until && f.until <= Date.now(); // a finished lockout starts the count again
    const n = (lockEnded ? 0 : f?.n || 0) + 1;
    fails.set(name, { n, until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
    await new Promise((r) => setTimeout(r, 400));
    throw Object.assign(new Error('Incorrect username or password'), { status: 401 });
  }
  fails.delete(name);
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => now - s.lastSeen <= IDLE_MS); // drop expired ones while we are here
  db.sessions.push({ h: sha256(token), user: user.username, created: new Date().toISOString(), lastSeen: now });
  save();
  return { user: user.username, cookie: `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${IDLE_MS / 1000}` };
}

function logout(req) {
  const token = cookieOf(req);
  if (token) { const h = sha256(token); db.sessions = db.sessions.filter((s) => s.h !== h); save(); }
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// Signs a user out everywhere (used when the account is deleted).
function endSessions(username) {
  db.sessions = db.sessions.filter((s) => s.user !== username);
  save();
}

module.exports = { sessionFrom, login, logout, makeUser, endSessions };
