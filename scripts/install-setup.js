// First-time set-up, run by the Windows installer (and usable by hand):
//   node scripts/install-setup.js --host=x0.0.0.0x --port=x46200x --allow=x10.0.0.0/24, 192.168.1.5x --user=xadminx --pass=xsecretx
// It writes the admin account and the Server Settings (listen address, port, allowed client addresses) into the database under KB_HOME.
// Every value is wrapped in one extra character on each side (here "x") which is removed again: the installer passes them on a command
// line, where a value that ends in a backslash or is empty would otherwise be mangled.
// Never run it while the server is running; the server would overwrite the database again.
const net = require('net');

const arg = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z]+)=(.*)$/s.exec(a);
  if (m) arg[m[1]] = m[2].length >= 2 ? m[2].slice(1, -1) : '';
}
const fail = (m) => { console.error('Kookaburrow set-up: ' + m); process.exit(1); };

const host = (arg.host || '127.0.0.1').trim();
const port = Number(arg.port || 46200);
const allowFrom = String(arg.allow || '').split(/[\s,;]+/).filter(Boolean);
const username = (arg.user || '').trim();
const password = arg.pass || '';

if (host !== '0.0.0.0' && net.isIPv4(host) === false) fail(`"${host}" is not an IPv4 address`);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`"${arg.port}" is not a port number`);
if (!/^[A-Za-z0-9._@-]{1,64}$/.test(username)) fail('the admin user name may only use letters, digits and . _ @ -');
if (password.length < 8) fail('the admin password must be at least 8 characters');

const { db, save } = require('../src/store');
const auth = require('../src/auth'); // creates the built-in admin / admin account when there are no users

const ranges = [];
for (const a of allowFrom) {
  if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(a)) fail(`"${a}" is not an IPv4 address or range`);
  ranges.push(a);
}

const existing = db.users.find((u) => u.defaultPassword) || db.users[0];
const made = auth.makeUser(username, password);
if (existing && existing.defaultPassword) {
  Object.assign(existing, { username, salt: made.salt, hash: made.hash, roles: ['admin'] });
  delete existing.defaultPassword;
} else if (db.users.some((u) => u.username === username)) {
  const u = db.users.find((x) => x.username === username);
  Object.assign(u, { salt: made.salt, hash: made.hash });
  if (!u.roles.includes('admin')) u.roles.push('admin');
} else {
  db.users.push({ ...made, roles: ['admin'] });
}
db.sessions = [];
db.settings = { ...(db.settings || {}), server: { host, port, allowFrom: ranges } };
save();
setTimeout(() => {
  console.log(`Kookaburrow set-up: admin "${username}", listening on ${host}:${port}${ranges.length ? `, allowed from ${ranges.join(', ')}` : ''}`);
  process.exit(0);
}, 400);
