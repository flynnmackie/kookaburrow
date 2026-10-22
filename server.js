const express = require('express');
const config = require('./src/config');
const { db, save, id } = require('./src/store');
require('./src/migrate-output')(); // evidence/ from before the output/ layout becomes output/hunts and output/responses
const outputs = require('./src/output');
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
  res.json({ id: u?.id, username: req.user, ...(u ? access(u) : { roles: [], permissions: [], all: false }) });
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
// remoteCheck is the last WinRM/SSH port check { up, at }; a host that was verified but never checked counts as up at its verification time.
const publicHost = ({ secret, password, ...h }) => ({ ...h, remoteCheck: h.remoteCheck || { up: true, at: h.verifiedAt }, profileName: h.profileName || db.profiles.find((p) => p.id === h.profileId)?.name || null });

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
    profileName: 'Manual entry',
  };
  host.remoteCheck = { up: true, at: host.verifiedAt };
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
// The data a hunt collected, as JSON: the hunt's own <name>_All_Hosts.json (so what is shown here is what is in its output folder).
// Older runs keep the layout they were made with (All-Hosts/hunt.json); a run with no file falls back to the stored run.
const jsonFileOf = (r) => {
  const dir = outputs.runDir(r), fs = require('fs'), path = require('path');
  if (!dir || !fs.existsSync(dir)) return null;
  const top = fs.readdirSync(dir).find((n) => /_All_Hosts\.json$/.test(n));
  if (top) return path.join(dir, top);
  const old = ['All-Hosts/hunt.json', 'response.json'].map((p) => path.join(dir, p)).find((p) => fs.existsSync(p));
  return old || null;
};
app.get('/api/runs/:id/data', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  const file = jsonFileOf(r);
  if (!file) return res.json(r.status === 'running' ? { status: 'running', message: 'This is still running. Its data appears here when it finishes.' } : r);
  res.type('application/json').send(require('fs').readFileSync(file, 'utf8'));
});
// Every file in a run's output folder (the log, All_Hosts files, one folder per host and anything in its raw folder), for the Files tab.
const filesOf = (r) => {
  const fs = require('fs'), path = require('path'), out = [], root = outputs.runDir(r);
  const walk = (dir, rel) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name);
      else out.push({ folder: rel, name: e.name, size: fs.statSync(path.join(dir, e.name)).size, path: `/output/${r.outputPath}${rel ? `/${rel}` : ''}/${e.name}` });
    }
  };
  if (root) walk(root, '');
  return out;
};
app.get('/api/runs/:id/files', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  r ? res.json(filesOf(r)) : res.status(404).json({ error: 'Not found' });
});
// The activity log of one hunt (see src/audit.js), as JSON for Results > Log or as a CSV download.
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
// ---- Reports: an HTML report of one hunt or response, covering every host, saved as <name>_Report.html in output/reports ----
const reports = require('./src/report');
const hostsInfo = () => db.hosts.map((h) => ({ address: h.address, os: h.os, protocol: h.protocol }));
app.get('/api/reports', (req, res) => res.json(db.runs.filter((r) => outputs.runDir(r) && reports.reportFile(r)).map((r) => {
  const st = require('fs').statSync(reports.reportFile(r));
  return { runId: r.id, name: r.name || r.collectionName, kind: r.kind === 'response' ? 'response' : 'hunt', startedBy: r.startedBy || null, startedAt: r.startedAt, generatedAt: st.mtime.toISOString(), size: st.size, hosts: new Set(r.results.map((x) => x.address)).size };
})));
app.post('/api/runs/:id/report', wrap((req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  if (!r) throw new Error('Not found');
  if (r.status === 'running') throw new Error('It is still running. Generate the report when it has finished.');
  const file = reports.writeReport(r, hostsInfo());
  res.json({ name: require('path').basename(file), size: require('fs').statSync(file).size });
}));
// The report opens in the browser inside a sandbox (no scripts of the app, no cookies), or downloads with ?download=1.
app.get('/api/runs/:id/report', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id), file = r && reports.reportFile(r);
  if (!file) return res.status(404).json({ error: 'No report has been generated for this run yet' });
  res.set({ 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox allow-scripts allow-popups; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:" });
  if (req.query.download === '1') res.set('Content-Disposition', `attachment; filename="${require('path').basename(file).replace(/[^\w. -]/g, '_')}"`);
  res.send(require('fs').readFileSync(file));
});
app.delete('/api/runs/:id/report', wrap((req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id), file = r && reports.reportFile(r);
  if (!file) throw new Error('Not found');
  require('fs').rmSync(file, { force: true });
  res.json({ ok: true });
}));
// The run's whole output folder (every host, the All_Hosts files and the log) as one zip.
app.get('/api/runs/:id/download', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  const dir = r && outputs.runDir(r);
  if (!dir || !require('fs').existsSync(dir)) return res.status(404).json({ error: 'This run has no output folder' });
  const name = require('path').basename(dir);
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}.zip"` });
  res.send(require('./src/zip').zipFolder(dir, name));
});
app.get('/api/runs/:id', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});
// Deletes a run's output folder (only ever one folder directly inside output/hunts or output/responses).
function removeOutput(r) {
  const dir = outputs.runDir(r);
  const report = require('./src/report').reportFile(r); // a run's report goes with it
  if (report) require('fs').rmSync(report, { force: true });
  if (dir) require('fs').rmSync(dir, { recursive: true, force: true });
}
// ?output=1 also deletes the output folder (Burrow's delete buttons); the Log page's Delete keeps the folder.
app.delete('/api/runs/:id', wrap((req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  if (r && r.status === 'running') throw new Error('It is still running. Wait for it to finish.');
  if (r && req.query.output === '1') removeOutput(r);
  db.runs = db.runs.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
}));

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
// Changing a password. Your own needs the current password (so a left-open session can't be used to take the account).
// Someone else's needs Manage users, and you can't change the password of a user who has more access than you do, so
// only an admin can change an admin's. Everyone signed in as that user is signed out (apart from the session that made
// the change, when it is your own password).
app.put('/api/users/:id/password', async (req, res) => {
  try {
    const u = db.users.find((x) => x.id === req.params.id);
    if (!u) throw new Error('User not found');
    const password = String(req.body?.password ?? '');
    if (password.length < 8) throw new Error('The password must be at least 8 characters');
    if (u.username === req.user) {
      await auth.confirmPassword(u, req.body?.currentPassword);
      auth.setPassword(u, password, { keepSession: auth.sessionHash(req) });
    } else {
      const a = access(caller(req)), target = access(u);
      if (!a.all && !a.permissions.includes('users.manage')) {
        return res.status(403).json({ error: 'Permission denied', permission: 'users.manage', needed: [labelOf['users.manage']] });
      }
      if (!a.all && (target.all || target.permissions.some((p) => !a.permissions.includes(p)))) throw new Error("You can't change the password of a user who has more access than you");
      auth.setPassword(u, password);
    }
    res.json({ ok: true });
  } catch (e) { res.status(e.status || 400).json({ error: firstLine(e.message) }); }
});

app.delete('/api/users/:id', wrap((req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) throw new Error('User not found');
  if (u.username === req.user) throw new Error("You can't delete the account you are signed in with");
  // Admins can delete other admins, but only admins can (never yourself, so at least one admin always remains).
  if (access(u).all && !access(caller(req)).all) throw new Error('Only an admin can delete an admin');
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
    // the library: "standard" is a script that still matches the shipped, verified version; "custom" is anything added or edited
    ...(() => {
      const std = (l) => ({ standard: l.filter((x) => x.verified).length, custom: l.filter((x) => !x.verified).length });
      return { collections: std(collections.listCollections()), actions: std(collections.listActions()) };
    })(),
    binaries: binaries.summary(),
    users: db.users.length, roles: db.roles.length,
    hosts: db.hosts.length, profiles: db.profiles.length,
    huntsRan: db.runs.filter((r) => r.kind !== 'response').length, responsesRan: db.runs.filter((r) => r.kind === 'response').length,
    storage: (() => { // the drive that holds the output folder
      try { const st = require('fs').statfsSync(config.outputDir); const total = st.blocks * st.bsize, free = st.bavail * st.bsize; return { total, free, used: total - free }; } catch { return null; }
    })(),
    timezone: (() => { const o = -new Date().getTimezoneOffset(), a = Math.abs(o); return { name: Intl.DateTimeFormat().resolvedOptions().timeZone, offset: `UTC${o < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}` }; })(),
  });
});

// ---- Hunts: run collections on hosts/groups and collect the data as CSV under output/hunts/ ----------
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
  const collectionIds = Array.isArray(b.collectionIds) ? b.collectionIds : [];
  if (b.quick && (b.schedule || (b.listIds || []).length || hosts.length !== 1)) throw new Error('A quick hunt runs once, on exactly one host');
  const sched = b.schedule ? scheduler.prepare({ kind: 'hunt', name: b.name, hostIds: Array.isArray(b.hostIds) ? b.hostIds : [], listIds: Array.isArray(b.listIds) ? b.listIds : [], itemIds: collectionIds, params: b.params, schedule: b.schedule, createdBy: req.user }) : null;
  const run = huntRunner.startHunt({ name: b.name, collectionIds, hosts, params: b.params, startedBy: req.user, scheduleId: sched?.id, quick: !!b.quick });
  if (sched) scheduler.activate(sched, run);
  res.json(run);
}));

// ---- Responses: run actions (scripts that change a host) on hosts/groups; output is kept under output/responses/ ----
// body: { name, actionIds: [], hostIds?: [], listIds?: [], params?: { [actionId]: { [parameter]: value } } }
const responseRunner = require('./src/response-runner');
const scheduler = require('./src/scheduler');
app.post('/api/responses', wrap((req, res) => {
  const b = req.body;
  let hostIds = Array.isArray(b.hostIds) ? [...b.hostIds] : [];
  for (const lid of Array.isArray(b.listIds) ? b.listIds : []) {
    const list = db.lists.find((l) => l.id === lid);
    if (!list) throw new Error('Unknown group');
    hostIds.push(...list.hostIds);
  }
  const hosts = [...new Set(hostIds)].map((hid) => db.hosts.find((h) => h.id === hid)).filter(Boolean);
  const actionIds = Array.isArray(b.actionIds) ? b.actionIds : [];
  if (b.quick && (b.schedule || (b.listIds || []).length || hosts.length !== 1)) throw new Error('A quick response runs once, on exactly one host');
  const sched = b.schedule ? scheduler.prepare({ kind: 'response', name: b.name, hostIds: Array.isArray(b.hostIds) ? b.hostIds : [], listIds: Array.isArray(b.listIds) ? b.listIds : [], itemIds: actionIds, params: b.params, schedule: b.schedule, createdBy: req.user }) : null;
  const run = responseRunner.startResponse({ name: b.name, actionIds, hosts, params: b.params, startedBy: req.user, scheduleId: sched?.id, quick: !!b.quick });
  if (sched) scheduler.activate(sched, run);
  res.json(run);
}));
app.delete('/api/responses/:id', wrap((req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id && x.kind === 'response');
  if (!r) throw new Error('Not found');
  if (r.status === 'running') throw new Error('It is still running. Wait for it to finish.');
  removeOutput(r);
  db.runs = db.runs.filter((x) => x.id !== r.id);
  save();
  res.json({ ok: true });
}));
// Recurring hunts and responses: the list shows each kind only to people who may see that kind; deleting stops the schedule.
const mayFor = (req, kind, perm) => { const a = access(caller(req)); return a.all || a.permissions.includes(kind === 'hunt' ? `hunts.${perm}` : `actions.${perm}`); };
app.get('/api/schedules', (req, res) => res.json({ now: new Date().toISOString(), schedules: db.schedules.filter((s) => mayFor(req, s.kind, 'view')).map(scheduler.view) }));
app.delete('/api/schedules/:id', wrap((req, res) => {
  const s = db.schedules.find((x) => x.id === req.params.id);
  if (!s) throw new Error('Not found');
  if (!mayFor(req, s.kind, 'run')) return res.status(403).json({ error: 'Permission denied', needed: [s.kind === 'hunt' ? 'Run hunts' : 'Run actions'] });
  db.schedules = db.schedules.filter((x) => x.id !== s.id);
  save();
  res.json({ ok: true });
}));
app.get('/api/responses', (req, res) => res.json(db.runs.filter((r) => r.kind === 'response').map(({ events, ...r }) => ({
  ...r, results: r.results.map(({ stdout, stderr, ...meta }) => meta),
}))));
app.get('/api/responses/:id/events', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id && x.kind === 'response');
  r ? res.json(audit.eventsFor(r)) : res.status(404).json({ error: 'Not found' });
});
// The response's own JSON file (<name>_All_Hosts.json) for the Notebook tab, and every file in its output folder for the Files tab.
app.get('/api/responses/:id/data', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id && x.kind === 'response');
  if (!r) return res.status(404).json({ error: 'Not found' });
  const file = jsonFileOf(r);
  if (!file) return res.json(r.status === 'running' ? { status: 'running', message: 'This response is still running. Its data appears here when it finishes.' } : { message: 'No JSON file was saved for this response.' });
  res.type('application/json').send(require('fs').readFileSync(file, 'utf8'));
});
app.get('/api/responses/:id/files', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id && x.kind === 'response');
  r ? res.json(filesOf(r)) : res.status(404).json({ error: 'Not found' });
});

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
// Files: list a folder on the host, pull a file into output/Pulled-Files, or send an uploaded file to the shell's current folder
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

// ---- Browse: read-only view of collections, actions, binaries and what hunts and responses brought back --------
const browseWrap = (fn) => (req, res) => {
  try { fn(req, res); } catch (e) { res.status(e.status || 400).json({ error: firstLine(e.message) }); }
};
app.get('/api/browse', browseWrap((req, res) => res.json(browse.list(String(req.query.path || '/')))));
app.get('/api/browse/file', browseWrap((req, res) => res.json(browse.preview(String(req.query.path || '')))));
app.get('/api/browse/download', browseWrap((req, res) => {
  if (req.query.folder === '1') { // a folder, as a zip
    const d = browse.dirSource(String(req.query.path || ''));
    const zip = require('./src/zip').zipFolder(d.dir, d.name);
    res.setHeader('Content-Disposition', `attachment; filename="${d.name.replace(/[^\w. -]/g, '_')}.zip"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('application/zip');
    return res.send(zip);
  }
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
app.get('/api/monitor/log', (req, res) => res.json({ enabled: monitor.settings().enabled, entries: monitor.getLog(Math.min(Number(req.query.limit) || 500, 2000)) }));
app.post('/api/monitor/check', (req, res) => { monitor.checkNow(); res.json(monitor.snapshot()); });

const server = app.listen(config.port, config.host, () => {
  console.log(`Kookaburrow running at http://${config.host}:${config.port}`);
  monitor.start();
  scheduler.start();
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use (set KB_PORT to change it).` : e.message);
  process.exit(1);
});
