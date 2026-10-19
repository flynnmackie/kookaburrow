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
const browse = require('./src/browse');
const authTest = require('./src/auth-test');

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
app.use(express.static(config.publicDir));

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
app.get('/api/runs', (req, res) => res.json(db.runs.map((r) => ({
  ...r, results: r.results.map(({ stdout, stderr, ...meta }) => meta),
}))));
app.get('/api/runs/:id', (req, res) => {
  const r = db.runs.find((x) => x.id === req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Not found' });
});
app.delete('/api/runs/:id', (req, res) => {
  db.runs = db.runs.filter((r) => r.id !== req.params.id);
  save();
  res.json({ ok: true });
});

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

const server = app.listen(config.port, config.host, () => {
  console.log(`Kookaburrow running at http://${config.host}:${config.port}`);
});
server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use (set KB_PORT to change it).` : e.message);
  process.exit(1);
});
