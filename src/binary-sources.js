const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { id } = require('./store');
const binaries = require('./binaries');
const sftp = require('./remote/sftp');
const smb = require('./remote/smb');

// Upload binaries > "Upload from server": the server looks through an external location (a folder, an SMB share, Nextcloud / WebDAV or
// SFTP) for the binaries the collections need and copies the ones the user picks into the binaries folder.
// A source is { type, ...fields }. Each one is opened as a connector with the same few operations:
//   list(ref)  the entries of one folder: { name, isDir, size, modified, ref }       read(ref)  a readable stream of one file       close()
// Nothing about a source is remembered: the credentials sit in memory for a few minutes while the user picks what to import.
const LIMITS = { depth: 10, entries: 100000, ms: 120000 };
const SESSION_MS = 10 * 60 * 1000;
const sessions = new Map(); // id -> { source, found: Map('binary|path' -> { ref }), expires }

const text = (v, label, { max = 1000, required = true } = {}) => {
  const s = String(v ?? '').trim();
  if (required && !s) throw new Error(`${label} is required`);
  if (s.length > max || /[\u0000-\u001f]/.test(s)) throw new Error(`${label} is not valid`);
  return s;
};

// A server fetching from addresses on its own machine or the cloud metadata service would be a way into things the user cannot reach.
async function assertHostAllowed(host) {
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); } catch { throw new Error(`Cannot find the server "${host}"`); }
  for (const { address } of addrs) {
    if (/^127\./.test(address) || address === '::1' || /^169\.254\./.test(address) || /^fe80:/i.test(address) || address === '0.0.0.0' || address === '::') {
      throw new Error(`${host} resolves to ${address}, which is not allowed here (this machine or a link-local address)`);
    }
  }
}

// ---- Folder on the server (also a mounted share, NFS, or a UNC path the server can already open) ----
async function openFolder(s) {
  const root = path.resolve(text(s.path, 'The folder'));
  let st; try { st = await fs.promises.stat(root); } catch { throw new Error(`Cannot open ${root}`); }
  if (!st.isDirectory()) throw new Error(`${root} is not a folder`);
  return {
    root,
    async list(dir) {
      const out = [];
      for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue; // never follow links: they can loop or leave the folder
        out.push({ name: e.name, isDir: e.isDirectory(), ref: path.join(dir, e.name) });
      }
      return out;
    },
    async info(e) { const st2 = await fs.promises.stat(e.ref); return { size: st2.size, modified: st2.mtime.toISOString() }; },
    async read(ref) { return fs.createReadStream(ref, { highWaterMark: 1024 * 1024 }); },
    close() {},
  };
}

// The folder picker of "Folder on the server": the sub-folders of one folder of THIS machine (drives first on Windows). Folders only,
// read-only. The page shows them in a list, so it works from any browser, whatever the server's operating system is.
const MAX_BROWSE = 2000;
async function browse(p) {
  const win = process.platform === 'win32';
  let dir = String(p ?? '').trim();
  if (/[\u0000-\u001f]/.test(dir)) throw new Error('That folder is not valid');
  if (!dir && win) {
    const letters = [];
    await Promise.all('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (l) => { try { await fs.promises.access(`${l}:\\`); letters.push(l); } catch { /* no such drive */ } }));
    return { path: '', parent: null, entries: letters.sort().map((l) => ({ name: `${l}:\\`, path: `${l}:\\` })), truncated: false };
  }
  dir = path.resolve(dir || '/');
  let list;
  try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { throw new Error(e.code === 'ENOENT' ? `${dir} does not exist` : e.code === 'ENOTDIR' ? `${dir} is not a folder` : `Cannot open ${dir} (${e.code || e.message})`); }
  const dirs = list.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const up = path.dirname(dir);
  return { path: dir, parent: up !== dir ? up : (win ? '' : null), entries: dirs.slice(0, MAX_BROWSE).map((n) => ({ name: n, path: path.join(dir, n) })), truncated: dirs.length > MAX_BROWSE };
}

// ---- SFTP ----
async function openSftp(s) {
  const host = text(s.host, 'The server', { max: 255 });
  await assertHostAllowed(host);
  const port = Number(s.port || 22);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('The port is not valid');
  const c = await sftp.open({ address: host, port, username: text(s.username, 'The username', { max: 200 }), password: String(s.password ?? '') }).catch((e) => { throw new Error(`SFTP connection to ${host} failed: ${e.message}`); });
  const readdir = (d) => new Promise((resolve, reject) => c.sftp.readdir(d, (e, l) => (e ? reject(e) : resolve(l))));
  return {
    root: text(s.path || '/', 'The folder'),
    async list(dir) {
      const out = [];
      for (const e of await readdir(dir)) {
        const dirOrFile = e.attrs.isDirectory() ? true : e.attrs.isFile() ? false : null;
        if (dirOrFile === null) continue;
        out.push({ name: e.filename, isDir: dirOrFile, size: e.attrs.size, modified: e.attrs.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null, ref: `${dir.replace(/\/$/, '')}/${e.filename}` });
      }
      return out;
    },
    async read(ref) { return c.sftp.createReadStream(ref, { highWaterMark: 1024 * 1024 }); },
    close() { sftp.close(c); },
  };
}

// ---- SMB share ----
// \\server\share\folder, //server/share/folder or smb://server/share/folder. Windows server: the share is connected for this session and read
// as a UNC path. Linux server: the smbclient program (not tested yet).
function parseSmbPath(p) {
  const m = /^(?:\\\\|\/\/|smb:\/\/)([^\\/]+)[\\/]+([^\\/]+)(?:[\\/]+(.*))?$/i.exec(String(p).trim());
  if (!m) throw new Error('Write the share as \\\\server\\share\\folder');
  return { server: m[1], share: m[2], sub: (m[3] || '').split(/[\\/]+/).filter(Boolean) };
}
function smbclient(args) {
  return new Promise((resolve) => {
    const p = spawn('smbclient', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ code: -1, out, err: e.message }));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}
async function openSmb(s) {
  const { server, share, sub } = parseSmbPath(text(s.path, 'The share'));
  await assertHostAllowed(server);
  const login = { address: server, username: text(s.username, 'The username', { max: 200 }), password: String(s.password ?? '') };
  const conn = await smb.connect(login, share);
  if (process.platform === 'win32') {
    const root = `\\\\${server}\\${share}${sub.length ? `\\${sub.join('\\')}` : ''}`;
    return {
      root,
      async list(dir) {
        const out = [];
        for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
          if (e.isSymbolicLink()) continue;
          out.push({ name: e.name, isDir: e.isDirectory(), ref: `${dir.replace(/\\$/, '')}\\${e.name}` });
        }
        return out;
      },
      async info(e) { const st = await fs.promises.stat(e.ref); return { size: st.size, modified: st.mtime.toISOString() }; },
      async read(ref) { return fs.createReadStream(ref, { highWaterMark: 4 * 1024 * 1024 }); },
      close() { smb.disconnect(conn).catch(() => {}); },
    };
  }
  // smbclient lists everything below the folder in one go
  const base = ['//' + server + '/' + share, '-A', conn.auth, '-m', 'SMB3'];
  return {
    root: sub.join('/'),
    async walk(onFile) {
      const r = await smbclient([...base, ...(sub.length ? ['-D', sub.join('/')] : []), '-c', 'recurse ON; ls']);
      if (r.code !== 0 || /NT_STATUS/.test(r.out + r.err)) throw new Error((r.err || r.out).trim().split(/\r?\n/)[0] || 'smbclient failed');
      let dir = '';
      for (const line of r.out.split(/\r?\n/)) {
        const d = /^\\(.*)$/.exec(line);
        if (d) { dir = d[1].replace(/\\/g, '/').replace(/^\//, ''); continue; }
        const f = /^\s{2}(.+?)\s{2,}([A-Za-z]*)\s+(\d+)\s{2}(\w{3} \w{3}\s+\d{1,2} \d\d:\d\d:\d\d \d{4})$/.exec(line);
        if (!f || f[2].includes('D')) continue;
        onFile({ name: f[1], path: dir ? `${dir}/${f[1]}` : f[1], size: Number(f[3]), modified: new Date(f[4]).toISOString(), ref: dir ? `${dir}/${f[1]}` : f[1] });
      }
    },
    async read(ref) {
      if (/["';\r\n]/.test(ref)) throw new Error(`cannot fetch a file with that name over smbclient: ${ref}`);
      const tmp = path.join(os.tmpdir(), `kb-src-${id()}`);
      const r = await smbclient([...base, ...(sub.length ? ['-D', sub.join('/')] : []), '-c', `get "${ref}" "${tmp}"`]);
      if (r.code !== 0 || /NT_STATUS/.test(r.out + r.err)) throw new Error((r.err || r.out).trim().split(/\r?\n/)[0] || 'smbclient failed');
      const rs = fs.createReadStream(tmp);
      rs.on('close', () => fs.rm(tmp, { force: true }, () => {}));
      return rs;
    },
    close() { smb.disconnect(conn).catch(() => {}); },
  };
}

// ---- Nextcloud / ownCloud / WebDAV ----
// Accepts a WebDAV folder URL (https://cloud.example.com/remote.php/dav/files/USER/Tools), the address of the folder in the Nextcloud web
// page (.../apps/files/?dir=/Tools) or a public share link (.../s/TOKEN; the token is the user name and the share password is the password).
function davTarget(input, username) {
  let u;
  try { u = new URL(input); } catch { throw new Error('The address is not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('The address must start with https:// (or http://)');
  const share = /^(.*)\/s\/([A-Za-z0-9]+)\/?$/.exec(u.pathname);
  if (share && !/\/(remote\.php|public\.php)\//.test(u.pathname)) return { url: `${u.origin}${share[1]}/public.php/webdav/`, username: share[2] };
  const apps = /^(.*)\/apps\/files(?:\/.*)?$/.exec(u.pathname);
  if (apps && !/\/remote\.php\//.test(u.pathname)) {
    if (!username) throw new Error('Enter the username (it goes into the WebDAV address)');
    const dir = (u.searchParams.get('dir') || '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return { url: `${u.origin}${apps[1]}/remote.php/dav/files/${encodeURIComponent(username)}/${dir}`, username };
  }
  return { url: u.toString(), username };
}
function davRequest(url, { method, headers, body, insecure }) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method, headers, rejectUnauthorized: !insecure, timeout: 20000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('The server did not answer in time')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const readBody = (res, max = 8 * 1024 * 1024) => new Promise((resolve, reject) => {
  const parts = []; let n = 0;
  res.on('data', (d) => { n += d.length; if (n > max) res.destroy(new Error('The listing is too large')); else parts.push(d); });
  res.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
  res.on('error', reject);
});
const unxml = (v) => String(v).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const PROPFIND = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>';
async function openWebdav(s) {
  const t = davTarget(text(s.url, 'The address'), String(s.username ?? '').trim());
  const host = new URL(t.url).hostname;
  await assertHostAllowed(host);
  const auth = `Basic ${Buffer.from(`${t.username}:${String(s.password ?? '')}`).toString('base64')}`;
  const insecure = !!s.insecure;
  const failure = (res) => (res.statusCode === 401 ? 'Sign-in refused (check the username and password; Nextcloud needs an app password when two-factor is on)'
    : res.statusCode === 404 ? 'That folder was not found' : res.statusCode === 403 ? 'Access to that folder is forbidden' : `The server answered ${res.statusCode} ${res.statusMessage || ''}`.trim());
  const root = t.url.replace(/([^/])$/, '$1/');
  return {
    root,
    async list(dir) {
      const res = await davRequest(dir, { method: 'PROPFIND', headers: { Authorization: auth, Depth: '1', 'Content-Type': 'application/xml' }, body: PROPFIND, insecure });
      if (res.statusCode !== 207 && res.statusCode !== 200) { res.resume(); throw new Error(failure(res)); }
      const xml = await readBody(res), self = new URL(dir).pathname.replace(/\/+$/, '');
      const out = [];
      for (const m of xml.matchAll(/<(?:\w+:)?response[ >][\s\S]*?<\/(?:\w+:)?response>/g)) {
        const b = m[0], href = /<(?:\w+:)?href>([\s\S]*?)<\/(?:\w+:)?href>/.exec(b);
        if (!href) continue;
        const ref = new URL(unxml(href[1]), dir), p = ref.pathname.replace(/\/+$/, '');
        if (p === self) continue;
        const isDir = /<(?:\w+:)?collection\s*\/?>/.test(b);
        const name = decodeURIComponent(p.split('/').pop() || '');
        const size = /<(?:\w+:)?getcontentlength>(\d+)</.exec(b), mod = /<(?:\w+:)?getlastmodified>([^<]+)</.exec(b);
        out.push({ name, isDir, size: size ? Number(size[1]) : null, modified: mod && !isNaN(Date.parse(mod[1])) ? new Date(mod[1]).toISOString() : null, ref: isDir ? `${ref.origin}${ref.pathname.replace(/\/*$/, '/')}` : ref.toString() });
      }
      return out;
    },
    async read(ref) {
      const res = await davRequest(ref, { method: 'GET', headers: { Authorization: auth }, insecure });
      if (res.statusCode !== 200) { res.resume(); throw new Error(failure(res)); }
      return res;
    },
    close() {},
  };
}

// ---- Nextcloud with "Sign in with Nextcloud" (Login Flow v2) ----
// The user only gives the web address. The server asks Nextcloud for a sign-in link, the user opens it in their browser and signs in the
// way they always do (single sign-on included) and approves access, and Nextcloud hands the server an app password for that one purpose.
// The app password stays in server memory (the page only ever gets an id), is used for the search and the import, and is revoked in
// Nextcloud again when the popup is closed or the time is up.
const NC_WAIT_MS = 20 * 60 * 1000, NC_KEEP_MS = 10 * 60 * 1000;
const ncCreds = new Map(); // id -> { base, insecure, poll: { token, endpoint }, user, pass, expires, state: 'waiting'|'done' }
function ncBase(input) {
  let u;
  try { u = new URL(String(input ?? '').trim()); } catch { throw new Error('Enter the web address of your Nextcloud, for example https://cloud.example.com'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('The address must start with https:// (or http://)');
  const prefix = u.pathname.replace(/\/(index\.php|apps|login|remote\.php|s|settings|f)(\/.*)?$/, '').replace(/\/+$/, '');
  return `${u.origin}${prefix}`;
}
async function ncJson(base, insecure, method, url, { form, auth } = {}) {
  const headers = { 'User-Agent': 'Kookaburrow', 'OCS-APIRequest': 'true', Accept: 'application/json' };
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (auth) headers.Authorization = auth;
  const res = await davRequest(url, { method, headers, body: form, insecure });
  const body = await readBody(res, 1024 * 1024);
  let json = null; try { json = JSON.parse(body); } catch { /* not JSON */ }
  return { status: res.statusCode, json, body };
}
// Step 1: ask Nextcloud for a sign-in link. Returns the id to poll and the link for the user's browser.
async function ncStart(addr, insecure) {
  const base = ncBase(addr);
  await assertHostAllowed(new URL(base).hostname);
  let r;
  try { r = await ncJson(base, insecure, 'POST', `${base}/index.php/login/v2`); } catch (e) { throw new Error(`Cannot reach Nextcloud at ${base}: ${e.message}`); }
  if (r.status !== 200 || !r.json?.poll?.token || !r.json?.login) throw new Error(r.status === 404 ? `${base} does not look like a Nextcloud (or it is older than version 16)` : `Nextcloud answered ${r.status} instead of a sign-in link`);
  const login = new URL(r.json.login);
  if (!/^https?:$/.test(login.protocol)) throw new Error('Nextcloud gave a sign-in link that is not a web address');
  const sid = id();
  // the poll address is rebuilt on the address the user gave, so Nextcloud cannot send this server somewhere else
  const pollPath = new URL(r.json.poll.endpoint, base).pathname;
  ncCreds.set(sid, { base, insecure: !!insecure, poll: { token: r.json.poll.token, endpoint: `${new URL(base).origin}${pollPath}` }, state: 'waiting', expires: Date.now() + NC_WAIT_MS });
  return { id: sid, loginUrl: login.toString() };
}
// Step 2 (called every couple of seconds by the page): has the user finished signing in?
async function ncStatus(sid) {
  const c = ncCreds.get(sid);
  if (!c || c.expires < Date.now()) { await ncForget(sid); return { status: 'expired' }; }
  if (c.state === 'done') { c.expires = Date.now() + NC_KEEP_MS; return { status: 'done', user: c.user }; }
  let r;
  try { r = await ncJson(c.base, c.insecure, 'POST', c.poll.endpoint, { form: `token=${encodeURIComponent(c.poll.token)}` }); } catch { return { status: 'waiting' }; }
  if (r.status === 200 && r.json?.appPassword && r.json?.loginName) {
    Object.assign(c, { state: 'done', user: String(r.json.loginName), pass: String(r.json.appPassword), expires: Date.now() + NC_KEEP_MS });
    return { status: 'done', user: c.user };
  }
  return { status: 'waiting' }; // 404 until the user has approved
}
// Forgets the credential and, when there was one, revokes the app password in Nextcloud so nothing is left behind there.
async function ncForget(sid) {
  const c = ncCreds.get(sid); ncCreds.delete(sid);
  if (c?.pass) {
    try { await ncJson(c.base, c.insecure, 'DELETE', `${c.base}/ocs/v2.php/core/apppassword?format=json`, { auth: `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString('base64')}` }); } catch { /* it can be removed under Settings > Security */ }
  }
}
async function openNextcloud(s) {
  const c = ncCreds.get(String(s.credential ?? ''));
  if (!c || c.state !== 'done' || c.expires < Date.now()) throw new Error('Sign in with Nextcloud first (the sign-in may have timed out)');
  c.expires = Date.now() + NC_KEEP_MS;
  const folder = String(s.folder ?? '').split('/').map((p) => p.trim()).filter(Boolean);
  if (folder.some((p) => p === '..' || /[\u0000-\u001f]/.test(p))) throw new Error('The folder is not valid');
  const filesRoot = `${c.base}/remote.php/dav/files/${encodeURIComponent(c.user)}`;
  const dav = await openWebdav({ url: `${filesRoot}/${folder.map(encodeURIComponent).join('/')}`, username: c.user, password: c.pass, insecure: c.insecure });
  const auth = `Basic ${Buffer.from(`${c.user}:${c.pass}`).toString('base64')}`;
  // Nextcloud can search by file name on the server, which is far faster than opening every folder. Used first; the folder walk is the fallback.
  dav.find = async (names) => {
    const scope = `/files/${encodeURIComponent(c.user)}${folder.length ? `/${folder.map(encodeURIComponent).join('/')}` : ''}`;
    const esc2 = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = `<?xml version="1.0" encoding="UTF-8"?><d:searchrequest xmlns:d="DAV:"><d:basicsearch><d:select><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:select><d:from><d:scope><d:href>${scope}</d:href><d:depth>infinity</d:depth></d:scope></d:from><d:where><d:or>${names.map((n) => `<d:like><d:prop><d:displayname/></d:prop><d:literal>${esc2(n)}</d:literal></d:like>`).join('')}</d:or></d:where><d:orderby/><d:limit><d:nresults>1000</d:nresults></d:limit></d:basicsearch></d:searchrequest>`;
    const res = await davRequest(`${c.base}/remote.php/dav/`, { method: 'SEARCH', headers: { Authorization: auth, 'Content-Type': 'text/xml', 'User-Agent': 'Kookaburrow' }, body, insecure: c.insecure });
    if (res.statusCode !== 207) { res.resume(); throw new Error(`search answered ${res.statusCode}`); }
    const xml = await readBody(res), want = new Set(names.map((n) => n.toLowerCase())), out = [];
    const prefix = new URL(`${filesRoot}/`).pathname;
    for (const m of xml.matchAll(/<(?:\w+:)?response[ >][\s\S]*?<\/(?:\w+:)?response>/g)) {
      const b = m[0], href = /<(?:\w+:)?href>([\s\S]*?)<\/(?:\w+:)?href>/.exec(b);
      if (!href || /<(?:\w+:)?collection\s*\/?>/.test(b)) continue;
      const ref = new URL(unxml(href[1]), c.base), p = decodeURIComponent(ref.pathname), name = p.split('/').pop();
      if (!want.has(name.toLowerCase()) || !p.startsWith(decodeURIComponent(prefix))) continue;
      const size = /<(?:\w+:)?getcontentlength>(\d+)</.exec(b), mod = /<(?:\w+:)?getlastmodified>([^<]+)</.exec(b);
      out.push({ name, path: p.slice(decodeURIComponent(prefix).length), size: size ? Number(size[1]) : null, modified: mod && !isNaN(Date.parse(mod[1])) ? new Date(mod[1]).toISOString() : null, ref: ref.toString() });
    }
    return out;
  };
  return dav;
}

const OPENERS = { folder: openFolder, sftp: openSftp, smb: openSmb, webdav: openWebdav, nextcloud: openNextcloud };
async function open(source) {
  const fn = OPENERS[source?.type];
  if (!fn) throw new Error('Choose where to look: a folder, an SMB share, Nextcloud / WebDAV or SFTP');
  return fn(source);
}

// Walks the source breadth-first within the limits, calling onFile({ name, path (below the starting folder), size, modified, ref }) for every file.
async function crawl(c, onFile, st) {
  st.deadline = Date.now() + LIMITS.ms;
  if (c.walk) return c.walk((f) => { st.scanned++; onFile(f); });
  const queue = [{ ref: c.root, depth: 0, rel: '' }];
  while (queue.length) {
    if (Date.now() > st.deadline) { st.truncated = true; return; }
    const { ref, depth, rel } = queue.shift();
    let entries;
    try { entries = await c.list(ref); } catch (e) { if (depth === 0) throw e; st.unreadable++; continue; }
    for (const e of entries) {
      if (++st.scanned > LIMITS.entries) { st.truncated = true; return; }
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDir) { if (depth < LIMITS.depth) queue.push({ ref: e.ref, depth: depth + 1, rel: p }); else st.truncated = true; }
      else await onFile({ ...e, path: p });
    }
  }
}

// Looks for the binaries the collections need (by exact file name, any case). Returns what was found and a session id for importing it.
async function search(source) {
  const slots = binaries.listBinaries().filter((b) => b.usedBy.length);
  const wanted = new Map(slots.map((b) => [b.name.toLowerCase(), b]));
  const found = new Map(), refs = new Map(), st = { scanned: 0, truncated: false, unreadable: 0 };
  const t0 = Date.now();
  const c = await open(source);
  try {
    const add = (f) => {
      const slot = wanted.get(f.name.toLowerCase()); if (!slot) return;
      if (!found.has(slot.name)) found.set(slot.name, []);
      found.get(slot.name).push({ path: f.path, size: f.size ?? null, modifiedAt: f.modified ?? null });
      refs.set(`${slot.name}|${f.path}`, f.ref);
    };
    let hits = null;
    if (c.find) { try { hits = await c.find([...wanted.values()].map((b) => b.name)); } catch { hits = null; } }
    if (hits && hits.length) { hits.forEach(add); st.method = 'search by name on the server'; }
    else await crawl(c, async (f) => {
      const slot = wanted.get(f.name.toLowerCase()); if (!slot) return;
      let size = f.size, modified = f.modified;
      if (size == null && c.info) { try { ({ size, modified } = await c.info(f)); } catch { /* shown without a size */ } }
      if (!found.has(slot.name)) found.set(slot.name, []);
      found.get(slot.name).push({ path: f.path, size: size ?? null, modifiedAt: modified ?? null });
      refs.set(`${slot.name}|${f.path}`, f.ref);
    }, st);
  } finally { c.close(); }
  for (const list of found.values()) list.sort((a, b) => String(b.modifiedAt || '').localeCompare(String(a.modifiedAt || ''))); // newest first
  const sid = id();
  sessions.set(sid, { source, refs, expires: Date.now() + SESSION_MS });
  gc();
  return {
    session: sid,
    found: slots.filter((b) => found.has(b.name)).map((b) => ({ binary: b.name, present: b.present, copies: found.get(b.name) })),
    missing: slots.filter((b) => !found.has(b.name)).map((b) => b.name),
    stats: { method: st.method || 'folder walk', scanned: st.scanned, truncated: st.truncated, unreadable: st.unreadable, seconds: Math.round((Date.now() - t0) / 100) / 10 },
  };
}

// items: [{ binary, path, sha256? }] from a search; an optional expected SHA-256 makes the import refuse a file that does not match.
async function importItems(sid, items, overwrite) {
  const s = sessions.get(sid);
  if (!s || s.expires < Date.now()) { sessions.delete(sid); throw new Error('That search has expired. Search again.'); }
  s.expires = Date.now() + SESSION_MS;
  if (!Array.isArray(items) || !items.length) throw new Error('Choose at least one binary to import');
  const c = await open(s.source);
  const results = [];
  try {
    for (const it of items) {
      const binary = String(it?.binary ?? ''), ref = s.refs.get(`${binary}|${it?.path}`);
      if (!ref) { results.push({ binary, status: 'error', message: 'That file was not in the search results' }); continue; }
      try {
        const r = await binaries.importStream(binary, await c.read(ref), { overwrite: !!overwrite, expectedSha256: it.sha256 });
        results.push(r.skipped ? { binary, status: 'skipped', message: 'Already uploaded (tick "Overwrite" to replace it)' } : { binary, status: 'imported', size: r.size, sha256: r.sha256 });
      } catch (e) { results.push({ binary, status: 'error', message: e.message }); }
    }
  } finally { c.close(); }
  return results;
}

const end = (sid) => sessions.delete(sid);
const endNextcloud = (sid) => ncForget(sid);
function gc() {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expires < now) sessions.delete(k);
  for (const [k, v] of ncCreds) if (v.expires < now) ncForget(k);
}
setInterval(gc, 60000).unref();

module.exports = { browse, search, importItems, end, ncStart, ncStatus, endNextcloud, ncBase, davTarget, parseSmbPath };
