const express = require('express');
const config = require('./src/config');
const { db, save, id } = require('./src/store');
const { encrypt } = require('./src/crypto');
const scanner = require('./src/scanner');
const winrm = require('./src/remote/winrm');
const ssh = require('./src/remote/ssh');
const collections = require('./src/collections');
const binaries = require('./src/binaries');
const collectionFiles = require('./src/collection-files');
const audit = require('./src/audit');
const browse = require('./src/browse');
const authTest = require('./src/auth-test');
const huntRunner = require('./src/hunt-runner');
const shell = require('./src/shell');
const monitor = require('./src/monitor');
const auth = require('./src/auth');
const permissions = require('./src/permissions');
const routePerms = require('./src/route-perms');

const app = express();
app.use(express.json({ limit: '400kb' }));

// The app holds credentials and runs code on remote hosts, so it is localhost-only and rejects
// requests whose Host/Origin is not this server (blocks DNS rebinding and cross-site requests).
app.use((req, res, next) => {
  const allowed = new Set([`${config.host}:${config.port}`, `localhost:${config.port}`, `127.0.0.1:${config.port}`]);
  if (!allowed.has(req.headers.host)) return res.status(403).json({ error: 'Bad Host header' });
  const origin = req.headers.origin;
  if (origin && !allowed.has(new URL(origin).host)) return res.status(403).json({ error: 'Bad Origin' });
  next();
});

// A user's roles (ids) and the permissions they give together; `all` is true when one of the roles is full access.
const access = (u) => {
  const mine = db.roles.filter((r) => u.roles.includes(r.id));
  return { roles: mine.map((r) => r.id), roleNames: mine.map((r) => r.name), permissions: [...new Set(mine.flatMap((r) => permissions.expand(r)))], all: mine.some((r) => r.permissions.includes('*')) };
};

// ---- Sign-in ------------------------------------------------------------------------------
// Everything except the sign-in page (and the images and fonts it uses) needs a session. Pages redirect to /login.html;
// API calls and other files answer 401, which the app turns into a redirect to the sign-in page.
const PUBLIC_FILES = new Set(['/login.html', '/fonts.css', '/favicon.ico', '/logo.png', '/logo-sm.png', '/bg-kookaburrow.png']);
app.use((req, res, next) => {
  if (PUBLIC_FILES.has(req.path) || req.path.startsWith('/fonts/') || req.path === '/api/auth/login') return next();
  const s = auth.sessionFrom(req);
  if (s) { req.user = s.user; return next(); }
  if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) return res.redirect('/login.html');
  res.status(401).json({ error: 'Sign in required' });
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const r = await auth.login(req.body?.username, req.body?.password);
    res.set('Set-Cookie', r.cookie).json({ ok: true, username: r.user });
  } catch (e) { res.status(e.status || 400).json({ error: e.message }); }
});
app.post('/api/auth/logout', (req, res) => { res.set('Set-Cookie', auth.logout(req)).json({ ok: true }); });
// Who is signed in, with their roles and what those roles allow (the Home page shows this).
app.get('/api/auth/me', (req, res) => {
  const u = db.users.find((x) => x.username === req.user);
  res.json({ username: req.user, ...(u ? access(u) : { roles: [], permissions: [], all: false }) });
});

// ---- Permissions: every API route needs the permission listed in src/route-perms.js (admin has all of them) ----
const labelOf = Object.fromEntries(permissions.GROUPS.flatMap((g) => g.permissions).map((p) => [p.key, p.label]));
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const need = routePerms.required(req.method, req.path);
  if (need === 'open') return next();
  const u = db.users.find((x) => x.username === req.user);
  const a = u ? access(u) : { all: false, permissions: [] };
  if (need !== 'deny' && (a.all || need.some((p) => a.permissions.includes(p)))) return next();
  res.status(403).json({ error: 'Permission denied', permission: need === 'deny' ? null : need[0], needed: need === 'deny' ? [] : need.map((p) => labelOf[p]) });
});

// no-cache: the browser always checks for a newer copy, so an updated page or script is never served stale
app.use(express.static(config.publicDir, { setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// async so synchronous throws inside handlers also become JSON 400s instead of HTML stack traces
const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); } catch (e) { res.status(400).json({ error: firstLine(e.message) }); }
};
// PowerShell remoting errors are multi-line walls of text; the first paragraph is the useful part.
const firstLine = (m) => String(m).split(/\r?\n\s*At\s/)[0].replace(/\s*\r?\n\s*/g, ' ').trim();
const connector = (protocol) => (protocol === 'winrm' ? winrm : ssh);
const publicHost = ({ secret, password, ...h }) => h;

// ---- Scan -------------------------------------------------------------------------------
app.post('/api/scans', wrap((req, res) => res.json(scanner.startScan(req.body.cidr))));
app.get('/api/scans/:id', (req, res) => {
  const j = scanner.getScan(req.params.id);
  j ? res.json(j) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/scans/:id', (req, res) => res.json(scanner.cancelScan(req.params.id) || {}));

// ---- Credential profiles ----------------------------------------------------------------
const PROFILE_KINDS = ['Windows (domain)', 'Windows (standalone)', 'Linux (SSH)'];
const publicProfile = ({ secret, sudoSecret, ...p }) => ({ ...p, hasPassword: !!secret, hasSudo: !!sudoSecret });

app.get('/api/profiles', (req, res) => res.json(db.profiles.map(publicProfile)));

// Add or update, matched by name (case-insensitive). A blank password on update keeps the stored one.
app.post('/api/profiles', wrap((req, res) => {
  const b = req.body;
  const name = String(b.name || '').trim();
  const username = String(b.username || '').trim();
  if (!name) throw new Error('Profile name is required');
  if (!username) throw new Error('Username is required');
  if (!PROFILE_KINDS.includes(b.kind)) throw new Error('Invalid profile type');

  let p = db.profiles.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!p && !b.password) throw new Error('Password is required for a new profile');
  if (!p) { p = { id: id() }; db.profiles.push(p); }

  p.name = name;
  p.kind = b.kind;
  p.username = username;
  p.domain = b.kind === 'Windows (domain)' ? String(b.domain || '').trim() : '';
  if (b.password) p.secret = encrypt(String(b.password));
  if (b.kind === 'Linux (SSH)') { if (b.sudoPassword) p.sudoSecret = encrypt(String(b.sudoPassword)); }
  else delete p.sudoSecret;
  save();
  res.json(publicProfile(p));
}));

app.delete('/api/profiles/:id', (req, res) => {
  db.profiles = db.profiles.filter((p) => p.id !== req.params.id);
  for (const ip of Object.keys(db.assignments)) if (db.assignments[ip] === req.params.id) delete db.assignments[ip];
  save();
  res.json({ ok: true });
});

// Which profile is selected for each discovered host, keyed by IP. body: { ip, profileId|null }
app.get('/api/assignments', (req, res) => res.json(db.assignments));
app.put('/api/assignments', wrap((req, res) => {
  const ip = String(req.body.ip || '');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('Invalid IP');
  if (!req.body.profileId) delete db.assignments[ip];
  else if (db.profiles.some((p) => p.id === req.body.profileId)) db.assignments[ip] = req.body.profileId;
  else throw new Error('Unknown profile');
  save();
  res.json(db.assignments);
}));

// ---- Hosts ------------------------------------------------------------------------------
function profileFromBody(b) {
  const protocol = b.protocol === 'ssh' ? 'ssh' : 'winrm';
  if (!b.address || !b.username || !b.password) throw new Error('address, username and password are required');
  return {
    address: String(b.address).trim(),
    protocol,
    port: b.port ? Number(b.port) : undefined,
    username: String(b.username),
    password: String(b.password),
    auth: b.auth || 'Negotiate',
    useSsl: !!b.useSsl,
  };
}

// Connect and report hostname/OS without saving anything.
app.post('/api/hosts/verify', wrap(async (req, res) => {
  const p = profileFromBody(req.body);
  res.json(await connector(p.protocol).verify(p));
}));

// Saving requires a successful credentialed connection, so every stored host is verified.
app.post('/api/hosts', wrap(async (req, res) => {
  const p = profileFromBody(req.body);
  if (db.hosts.some((h) => h.address === p.address && h.protocol === p.protocol && h.username === p.username)) {
    throw new Error('A host with this address, protocol and username is already saved');
  }
  const facts = await connector(p.protocol).verify(p);
  const { password, ...rest } = p;
  const host = {
    id: id(), ...rest, ...facts,
    name: req.body.name || facts.hostname || p.address,
    secret: encrypt(password),
    verifiedAt: new Date().toISOString(),
  };
  db.hosts.push(host);
  save();
  res.json(publicHost(host));
}));

app.get('/api/hosts', (req, res) => res.json(db.hosts.map(publicHost)));
app.delete('/api/hosts/:id', (req, res) => {
  db.hosts = db.hosts.filter((h) => h.id !== req.params.id);
  db.lists.forEach((l) => { l.hostIds = l.hostIds.filter((x) => x !== req.params.id); });
  save();
  res.json({ ok: true });
});

// Tests the profile assigned to a discovered host. Always answers 200 with { state, protocol, reason }:
// authenticated | absent | rejected | error. A successful test saves the host (Host Management > View Hosts).
app.post('/api/auth/test', wrap(async (req, res) => {
  const ip = String(req.body.ip || '');
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('Invalid IP');
  res.json(await authTest.testHost(ip));
}));

// Manually Add: the credentials come from the form. Answers 200 with { state, protocol, reason, ... } like /api/auth/test;
// the host is saved only when the login works.
app.post('/api/hosts/manual', wrap(async (req, res) => res.json(await authTest.testManual(req.body || {}))));

// ---- Host lists -------------------------------------------------------------------------
app.get('/api/lists', (req, res) => res.json(db.lists));
app.post('/api/lists', wrap((req, res) => {
  if (!req.body.name) throw new Error('name is required');
  const known = new Set(db.hosts.map((h) => h.id));
  const list = { id: id(), name: String(req.body.name), hostIds: (req.body.hostIds || []).filter((x) => known.has(x)) };
  db.lists.push(list);
  save();
  res.json(list);
}));
app.put('/api/lists/:id', wrap((req, res) => {
  const list = db.lists.find((l) => l.id === req.params.id);
  if (!list) throw new Error('List not found');
  const known = new Set(db.hosts.map((h) => h.id));
  if (req.body.name) list.name = String(req.body.name);
  if (req.body.hostIds) list.hostIds = req.body.hostIds.filter((x) => known.has(x));
  save();
  res.json(list);
}));
app.delete('/api/lists/:id', (req, res) => {
  db.lists = db.lists.filter((l) => l.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---- Binaries ---------------------------------------------------------------------------
app.get('/api/binaries', wrap((req, res) => res.json(binaries.listBinaries())));
// Upload: the request body is the raw file; the :name slot decides what it is stored as.
app.put('/api/binaries/:name', express.raw({ type: '*/*', limit: binaries.MAX_BYTES }), wrap((req, res) => {
  binaries.saveBinary(req.params.name, req.body);
  res.json(binaries.listBinaries().find((b) => b.name === req.params.name));
}));
app.delete('/api/binaries/:name', wrap((req, res) => {
  binaries.removeBinary(req.params.name);
  res.json(binaries.listBinaries().find((b) => b.name === req.params.name) || { ok: true });
}));

// ---- Collections and runs ---------------------------------------------------------------------
// ?q=text searches names and scripts; ?tags=a,b keeps collections that have all of those tags;
// ?deps=1 keeps only collections that need at least one dependency (binary).
app.get('/api/collections', (req, res) => {
  const tags = String(req.query.tags || '').split(',');
  res.json(collections.listCollections(String(req.query.q || ''), tags, req.query.deps === '1'));
});
// User-written collections (Add Collections page). Shipped collections are never touched by these routes.
app.get('/api/collections/user', wrap((req, res) => res.json(collectionFiles.collections.listUser())));
app.post('/api/collections', wrap((req, res) => res.json(collectionFiles.collections.create(req.body))));
app.put('/api/collections/:type/:file', wrap((req, res) => res.json(collectionFiles.collections.update(req.params.type, req.params.file, req.body))));
app.delete('/api/collections/:type/:file', wrap((req, res) => { collectionFiles.collections.remove(req.params.type, req.params.file); res.json({ ok: true }); }));
app.get('/api/collections/tags', (req, res) => res.json(collections.listTags(req.query.type)));
// Script contents for the viewer. resolveCollection only matches ids from the directory listing.
app.get('/api/collections/:type/:file', (req, res) => {
  const h = collections.resolveCollection(`${req.params.type}/${req.params.file}`);
  if (!h) return res.status(404).json({ error: 'Not found' });
  const { file, text, ...pub } = h; // body = script without the header
  res.json(pub);
});

// Actions: scripts that change a host (kill a process, add a user, ...). Listed and viewed like collections;
// running them is not wired up yet.
app.get('/api/actions', (req, res) => {
  const tags = String(req.query.tags || '').split(',');
  res.json(collections.listActions(String(req.query.q || ''), tags, req.query.deps === '1'));
});
// User-written actions (Add Actions page); same rules as collections.
app.get('/api/actions/user', wrap((req, res) => res.json(collectionFiles.actions.listUser())));
app.post('/api/actions', wrap((req, res) => res.json(collectionFiles.actions.create(req.body))));
app.put('/api/actions/:type/:file', wrap((req, res) => res.json(collectionFiles.actions.update(req.params.type, req.params.file, req.body))));
app.delete('/api/actions/:type/:file', wrap((req, res) => { collectionFiles.actions.remove(req.params.type, req.params.file); res.json({ ok: true }); }));
app.get('/api/actions/tags', (req, res) => res.json(collections.listTags(req.query.type, collections.actionsDir)));
app.get('/api/actions/:type/:file', (req, res) => {
  const a = collections.resolveAction(`${req.params.type}/${req.params.file}`);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const { file, text, ...pub } = a;
  res.json(pub);
});

// body: { collectionId, hostIds?: [], listId?: string }
app.post('/api/runs', wrap((req, res) => {
  const collection = collections.resolveCollection(req.body.collectionId);
  if (!collection) throw new Error('Unknown collection');
  let hostIds = req.body.hostIds || [];
  if (req.body.listId) {
    const list = db.lists.find((l) => l.id === req.body.listId);
    if (!list) throw new Error('Unknown list');
    hostIds = [...hostIds, ...list.hostIds];
  }
  const targets = [...new Set(hostIds)].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
  if (!targets.length) throw new Error('No valid hosts selected');
  res.json(collections.startRun(collection, targets));
}));
// Listing omits per-host output; fetch a run for the full results.
app.get('/api/runs', (req, res) => res.json(db.runs.map(({ events, ...r }) => ({
  ...r, eventCount: audit.eventsFor({ events, ...r }).length, results: r.results.map(({ stdout, stderr, ...meta }) => meta),
}))));
// The data a hunt collected, as JSON: the contents of its All-Hosts CSVs as records (the hunt's own hunt.json, so what is
// shown here is what is in the evidence folder). Runs that have no hunt.json (older runs) fall back to the stored run.
app.get('/api/runs/:id/data', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (!r.evidenceDir) return res.json(r);
  const file = require('path').join(config.evidenceDir, r.evidenceDir, 'All-Hosts', 'hunt.json');
  if (!require('fs').existsSync(file)) {
    return res.json(r.status === 'running' ? { status: 'running', message: 'This hunt is still running. Its data appears here when it finishes.' } : r);
  }
  res.type('application/json').send(require('fs').readFileSync(file, 'utf8'));
});
// The activity log of one hunt (see src/audit.js), as JSON for Output > Log or as a CSV download.
app.get('/api/runs/:id/events', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  r ? res.json(audit.eventsFor(r)) : res.status(404).json({ error: 'Not found' });
});
app.get('/api/runs/:id/log.csv', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${String(r.name || r.collectionName || 'hunt').replace(/[^A-Za-z0-9_-]+/g, '-')}-log.csv"` });
  res.send(audit.toCsv(audit.eventsFor(r)));
});
app.get('/api/runs/:id', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/runs/:id', (req, res) => {
  db.runs = db.runs.filter((r) => r.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---- Users, roles and permissions (read-only for now; Settings > System > User Management) ----
app.get('/api/permissions', (req, res) => res.json(permissions.GROUPS));
const roleView = (r) => ({
  id: r.id, name: r.name, description: r.description, builtin: !!r.builtin, all: r.permissions.includes('*'),
  permissions: permissions.expand(r), members: db.users.filter((u) => u.roles.includes(r.id)).map((u) => u.username),
});
const userView = (u) => ({ id: u.id, username: u.username, createdAt: u.createdAt, ...access(u) });
app.get('/api/roles', (req, res) => res.json(db.roles.map(roleView)));
app.get('/api/users', (req, res) => res.json(db.users.map(userView)));

// Creating and changing users and roles. Nobody can hand out more than they have: the permissions of the roles you grant
// or create must all be ones you hold yourself (admin holds everything).
const caller = (req) => db.users.find((u) => u.username === req.user);
function checkGrantable(req, perms) {
  const a = access(caller(req));
  if (a.all) return;
  const missing = perms.filter((p) => !a.permissions.includes(p));
  if (missing.length) throw new Error(`You can't grant permissions you don't have: ${[...new Set(missing)].map((p) => labelOf[p]).join(', ')}`);
}
const rolesFromBody = (v) => {
  const ids = [...new Set(Array.isArray(v) ? v.map(String) : [])];
  for (const id of ids) if (!db.roles.some((r) => r.id === id)) throw new Error(`Unknown role: ${id}`);
  return ids;
};
const permsOf = (roleIds) => [...new Set(db.roles.filter((r) => roleIds.includes(r.id)).flatMap((r) => permissions.expand(r)))];
// The permissions chosen for a role, with everything each one includes added, in the standard order.
const permsFromBody = (v) => {
  const keys = Array.isArray(v) ? v.map(String) : [];
  for (const k of keys) if (!permissions.ALL.includes(k)) throw new Error(`Unknown permission: ${k}`);
  const set = new Set(permissions.withIncluded(keys));
  return permissions.ALL.filter((k) => set.has(k));
};

app.post('/api/users', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  if (!/^[A-Za-z0-9._-]{2,32}$/.test(username)) throw new Error('A username is 2 to 32 letters, numbers, dots, dashes or underscores');
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('That username is already taken');
  const password = String(req.body.password ?? '');
  if (password.length < 8) throw new Error('The password must be at least 8 characters');
  const roles = rolesFromBody(req.body.roles);
  checkGrantable(req, permsOf(roles));
  const user = { ...auth.makeUser(username, password), roles };
  db.users.push(user);
  save();
  res.json(userView(user));
}));
app.put('/api/users/:id', wrap((req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) throw new Error('User not found');
  if (access(u).all) throw new Error("An admin's roles can't be changed here");
  const roles = rolesFromBody(req.body.roles);
  checkGrantable(req, permsOf(roles));
  u.roles = roles;
  save();
  res.json(userView(u));
}));
app.delete('/api/users/:id', wrap((req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) throw new Error('User not found');
  if (u.username === req.user) throw new Error("You can't delete the account you are signed in with");
  if (access(u).all) throw new Error("An admin can't be deleted here");
  db.users = db.users.filter((x) => x !== u);
  auth.endSessions(u.username);
  save();
  res.json({ ok: true });
}));

app.post('/api/roles', wrap((req, res) => {
  const name = String(req.body.name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,30}[A-Za-z0-9]$/.test(name)) throw new Error('A role name is 2 to 32 letters, numbers, spaces, dots, dashes or underscores');
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (db.roles.some((r) => r.id === id || r.name.toLowerCase() === name.toLowerCase())) throw new Error('A role with that name already exists');
  const perms = permsFromBody(req.body.permissions);
  if (!perms.length) throw new Error('Tick at least one permission');
  checkGrantable(req, perms);
  const role = { id, name, description: String(req.body.description || '').trim().slice(0, 200) || 'No description.', builtin: false, permissions: perms };
  db.roles.push(role);
  save();
  res.json(roleView(role));
}));
app.put('/api/roles/:id', wrap((req, res) => {
  const r = db.roles.find((x) => x.id === req.params.id);
  if (!r) throw new Error('Role not found');
  if (r.builtin) throw new Error("The built-in role can't be changed");
  const perms = permsFromBody(req.body.permissions);
  if (!perms.length) throw new Error('Tick at least one permission');
  checkGrantable(req, perms);
  r.permissions = perms;
  if (req.body.description !== undefined) r.description = String(req.body.description).trim().slice(0, 200) || 'No description.';
  save();
  res.json(roleView(r));
}));
app.delete('/api/roles/:id', wrap((req, res) => {
  const r = db.roles.find((x) => x.id === req.params.id);
  if (!r) throw new Error('Role not found');
  if (r.builtin) throw new Error("The built-in role can't be deleted");
  const members = db.users.filter((u) => u.roles.includes(r.id));
  if (members.length) throw new Error(`Remove this role from ${members.map((u) => u.username).join(', ')} first`);
  db.roles = db.roles.filter((x) => x !== r);
  save();
  res.json({ ok: true });
}));

// Server facts for the home page. Nothing secret: no keys, paths outside the app, or credentials.
app.get('/api/about', (req, res) => {
  const os = require('os');
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  res.json({
    version: require('./package.json').version, node: process.version,
    hostname: os.hostname(), dnsDomain: process.env.USERDNSDOMAIN || '',
    bind: `${config.host}:${config.port}`, addresses,
    os: `${os.version()} ${os.release()} (${os.arch()})`,
    uptimeSec: Math.round(process.uptime()), started: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    collections: collections.listCollections().length, actions: collections.listActions().length,
    hosts: db.hosts.length, profiles: db.profiles.length, runs: db.runs.length,
  });
});

// ---- Hunts: run collections on hosts/groups and collect the data as CSV under evidence/ ----------
// body: { name, collectionIds: [], hostIds?: [], listIds?: [] }
app.post('/api/hunts', wrap((req, res) => {
  const b = req.body;
  let hostIds = Array.isArray(b.hostIds) ? [...b.hostIds] : [];
  for (const lid of Array.isArray(b.listIds) ? b.listIds : []) {
    const list = db.lists.find((l) => l.id === lid);
    if (!list) throw new Error('Unknown group');
    hostIds.push(...list.hostIds);
  }
  const hosts = [...new Set(hostIds)].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
  res.json(huntRunner.startHunt({ name: b.name, collectionIds: Array.isArray(b.collectionIds) ? b.collectionIds : [], hosts }));
}));

// ---- Shell: interactive sessions on authenticated hosts (output streams out by SSE, input comes in by POST) ----
const shellWrap = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(e.status || 400).json({ error: firstLine(e.message) }); }
};
app.get('/api/shell', (req, res) => res.json(shell.open()));
app.get('/api/shell/config', (req, res) => res.json(shell.config())); // what the Shell page needs from Shell Settings
app.post('/api/shell', shellWrap((req, res) => res.json(shell.create(String(req.body.hostId || ''), { cols: Number(req.body.cols) || 100, rows: Number(req.body.rows) || 30 }))));
app.get('/api/shell/:id/stream', shellWrap((req, res) => shell.stream(req.params.id, res)));
app.post('/api/shell/:id/input', shellWrap((req, res) => { shell.write(req.params.id, req.body.data); res.json({ ok: true }); }));
app.post('/api/shell/:id/resize', shellWrap((req, res) => { shell.resize(req.params.id, Number(req.body.cols), Number(req.body.rows)); res.json({ ok: true }); }));
// Files: list a folder on the host, pull a file into evidence/Pulled-Files, or send an uploaded file to the shell's current folder
app.post('/api/shell/:id/ls', wrap(async (req, res) => res.json(await shell.list(req.params.id, req.body.path))));
app.post('/api/shell/:id/pull', wrap(async (req, res) => res.json(await shell.pull(req.params.id, req.body.path))));
app.put('/api/shell/:id/send', wrap(async (req, res) => {
  const MAX = 512 * 1024 * 1024;
  try { shell.sendTarget(req.params.id); } catch (e) { req.resume(); throw e; } // fail before taking the upload if the folder is unknown
  const tmp = require('path').join(require('os').tmpdir(), `kb-up-${require('crypto').randomBytes(6).toString('hex')}`);
  try {
    await new Promise((resolve, reject) => {
      let size = 0; const out = require('fs').createWriteStream(tmp);
      req.on('data', (c) => { size += c.length; if (size > MAX) { req.destroy(); out.destroy(); reject(new Error('File too large (max 512 MB)')); } });
      req.on('error', reject); out.on('error', reject); out.on('finish', resolve);
      req.pipe(out);
    });
    res.json(await shell.send(req.params.id, String(req.query.path || ''), tmp));
  } finally { require('fs').promises.unlink(tmp).catch(() => {}); }
}));
app.delete('/api/shell/:id', shellWrap((req, res) => { shell.close(req.params.id); res.json({ ok: true }); }));

// ---- Browse: read-only view of collections, actions, binaries and collected evidence --------
const browseWrap = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(e.status || 400).json({ error: firstLine(e.message) }); }
};
app.get('/api/browse', browseWrap((req, res) => res.json(browse.list(String(req.query.path || '/')))));
app.get('/api/browse/file', browseWrap((req, res) => res.json(browse.preview(String(req.query.path || '')))));
app.get('/api/browse/download', browseWrap((req, res) => {
  const src = browse.source(String(req.query.path || ''));
  res.setHeader('Content-Disposition', `attachment; filename="${src.name.replace(/[^\w. -]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type('application/octet-stream');
  if (src.buffer) res.send(src.buffer); else res.sendFile(src.file);
}));

// Last-resort handler: malformed JSON bodies etc. return JSON, never a stack trace.
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.status ? 'Bad request' : 'Internal error' });
});

// ---- Health Settings: how often hosts are checked and which hosts are checked (Settings > System > Health Settings) ----
// The GET carries the host list too, so the page works for anyone who may view the system, not only those who may list hosts.
app.get('/api/settings/health', (req, res) => res.json({
  settings: monitor.settings(), defaults: monitor.DEFAULTS, limits: monitor.LIMITS,
  hosts: db.hosts.map((h) => ({ id: h.id, name: h.name || h.hostname || h.address, address: h.address, protocol: h.protocol, os: h.os || null })),
}));
app.put('/api/settings/health', wrap((req, res) => { monitor.setSettings(req.body || {}); res.json({ settings: monitor.settings() }); }));

// ---- Shell Settings: shell access on or off, which hosts, how many at once and the idle timeout (Settings > System > Shell Settings) ----
app.get('/api/settings/shell', (req, res) => res.json({
  settings: shell.settings(), defaults: shell.DEFAULTS, limits: shell.LIMITS, active: shell.config().active,
  hosts: db.hosts.map((h) => ({ id: h.id, name: h.name || h.hostname || h.address, address: h.address, protocol: h.protocol, os: h.os || null })),
}));
app.put('/api/settings/shell', wrap((req, res) => { shell.setSettings(req.body || {}); res.json({ settings: shell.settings() }); }));

// ---- Health monitor: ping every minute and the WinRM/SSH port every 5 minutes, for every saved host ----
app.get('/api/monitor', (req, res) => res.json(monitor.snapshot()));
app.post('/api/monitor/check', (req, res) => { monitor.checkNow(); res.json(monitor.snapshot()); });

const server = app.listen(config.port, config.host, () => {
  console.log(`Kookaburrow running at http://${config.host}:${config.port}`);
  monitor.start();
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use (set KB_PORT to change it).` : e.message);
  process.exit(1);
});
