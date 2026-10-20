const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { StringDecoder } = require('string_decoder');
const { Client } = require('ssh2');
const { db } = require('./store');
const { decrypt } = require('./crypto');
const { evidenceDir } = require('./config');

// Interactive shells for the Shell page. One session per authenticated host:
//   SSH hosts    a real terminal (pty) through ssh2; keystrokes go straight to the host
//   WinRM hosts  a line-by-line shell: src/remote/winrm-shell.ps1 keeps one remote PowerShell session and runs
//                each line you enter in it (no pty, so full-screen programs do not work)
// Output reaches the browser as a server-sent event stream and input arrives by POST; the page only talks to this
// server, never to the host. Sessions close after 20 idle minutes or when the page ends them.
//
// The same session also serves the Send file / Pull file buttons: it reports its current folder through hidden
// markers in the output (ESC ] 7777 ; path BEL), which are stripped before the browser sees them, and lists,
// downloads and uploads files (WinRM: control lines to the PowerShell shell; SSH: SFTP on the same connection).
const MAX_SESSIONS = 8;
const IDLE_MS = 20 * 60 * 1000;
const BUFFER_CAP = 256 * 1024; // output kept so a reloaded page can show what it missed
const sessions = new Map();

const err = (m, status = 400) => { const e = new Error(m); e.status = status; return e; };
const sseSend = (res, event, data) => res.write(`${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`);

// Hidden markers in the output stream: 7777 = current folder, 7778 = answer to a control request (id;base64-json).
const MARK = /\x1b\](7777|7778);([^\x07]*)\x07/g;
// Cleans output on its way to the browser, remembering the folder and answering pending requests. Holds back
// the end of a chunk that may be the start of a marker. While s.muted (SSH setup), text is dropped.
function cleanOutput(s, text) {
  let data = s.carry + text; s.carry = '';
  const i = data.lastIndexOf('\x1b]777');
  if (i >= 0 && data.indexOf('\x07', i) < 0) { s.carry = data.slice(i); data = data.slice(0, i); }
  else { const m = /\x1b(\]7{0,3})?$/.exec(data); if (m) { s.carry = m[0]; data = data.slice(0, m.index); } }
  let out = '', last = 0, m;
  MARK.lastIndex = 0;
  while ((m = MARK.exec(data))) {
    if (!s.muted) out += data.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1] === '7777') {
      s.cwd = m[2];
      if (s.muted) { s.muted = false; out += '\r\x1b[K'; } // the setup line stays hidden; the new prompt replaces the old one
    } else answer(s, m[2]);
  }
  if (!s.muted) out += data.slice(last);
  return out;
}
function answer(s, body) {
  const [id, b64] = [body.slice(0, body.indexOf(';')), body.slice(body.indexOf(';') + 1)];
  const p = s.pending.get(id); if (!p) return;
  s.pending.delete(id); clearTimeout(p.timer);
  try {
    const r = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    r.ok ? p.resolve(r) : p.reject(err(r.error || 'The host reported an error'));
  } catch (e) { p.reject(err('Unreadable answer from the host')); }
}
// WinRM: send a control line to the PowerShell shell and wait for its marker answer.
function call(s, op, args, ms = 60000) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomBytes(6).toString('hex');
    const timer = setTimeout(() => { s.pending.delete(id); reject(err('The host took too long to answer')); }, ms);
    s.pending.set(id, { resolve, reject, timer });
    s.write(`\x01${op}\t${id}\t${Buffer.from(JSON.stringify(args)).toString('base64')}\n`);
  });
}

function create(hostId, { cols = 100, rows = 30 } = {}) {
  const host = db.hosts.find((h) => h.id === hostId);
  if (!host) throw err('Unknown host', 404);
  if (sessions.size >= MAX_SESSIONS) throw err(`Too many open shells (max ${MAX_SESSIONS}). Close one first.`);
  for (const s of sessions.values()) if (s.hostId === hostId) throw err('A shell is already open for this host', 409);

  const s = {
    id: crypto.randomBytes(12).toString('hex'), hostId, address: host.address, kind: host.protocol === 'ssh' ? 'ssh' : 'winrm',
    buffer: '', clients: new Set(), closed: false, last: Date.now(), cwd: '', carry: '', muted: false, pending: new Map(),
    write: () => {}, resize: () => {}, kill: () => {}, sftp: null,
  };
  const push = (raw) => {
    const text = cleanOutput(s, raw);
    if (!text) return;
    s.buffer = (s.buffer + text).slice(-BUFFER_CAP);
    for (const res of s.clients) sseSend(res, null, { d: text });
  };
  const notice = (text) => { // our own messages skip the marker filter
    s.buffer = (s.buffer + text).slice(-BUFFER_CAP);
    for (const res of s.clients) sseSend(res, null, { d: text });
  };
  const end = (reason) => {
    if (s.closed) return;
    s.closed = true;
    for (const p of s.pending.values()) { clearTimeout(p.timer); p.reject(err('The shell closed')); }
    s.pending.clear();
    for (const res of s.clients) { sseSend(res, 'end', { reason }); res.end(); }
    s.clients.clear();
    sessions.delete(s.id);
  };
  s.end = end;
  sessions.set(s.id, s);

  const password = decrypt(host.secret);
  if (s.kind === 'ssh') {
    const conn = new Client(), dec = new StringDecoder('utf8');
    s.conn = conn;
    notice(`Connecting to ${host.address} over SSH...\r\n`);
    conn.on('ready', () => {
      conn.shell({ term: 'xterm-256color', cols, rows }, (e, stream) => {
        if (e) { notice(`Could not start a shell: ${e.message}\r\n`); return end(e.message); }
        s.write = (d) => stream.write(d);
        s.resize = (c, r) => stream.setWindow(r, c, 0, 0);
        stream.on('data', (d) => push(dec.write(d)));
        stream.stderr.on('data', (d) => push(dec.write(d)));
        stream.on('close', () => { notice('\r\nConnection closed.\r\n'); conn.end(); end('closed'); });
        // Teach bash/zsh to report the current folder before every prompt. The line and its echo are hidden.
        setTimeout(() => {
          if (s.closed) return;
          s.muted = true;
          stream.write(` if [ -n "$BASH_VERSION" ]; then PROMPT_COMMAND='printf "\\033]7777;%s\\007" "$PWD"'\${PROMPT_COMMAND:+";$PROMPT_COMMAND"}; elif [ -n "$ZSH_VERSION" ]; then precmd() { printf "\\033]7777;%s\\007" "$PWD"; }; fi\n`);
          setTimeout(() => { s.muted = false; }, 4000).unref();
        }, 900);
      });
    });
    conn.on('error', (e) => { notice(`Connection failed: ${/authentication/i.test(e.message) ? 'the saved credentials were rejected.' : e.message}\r\n`); end(e.message); });
    s.kill = () => conn.end();
    conn.connect({ host: host.address, port: host.port || 22, username: host.username, password, readyTimeout: 15000 });
  } else {
    notice(`Connecting to ${host.address} over WinRM...\r\n`);
    const env = {
      ...process.env, KB_HOST: host.address, KB_PORT: String(host.port || (host.useSsl ? 5986 : 5985)),
      KB_USER: host.username, KB_PASS: password, KB_AUTH: host.auth || 'Negotiate', KB_SSL: host.useSsl ? '1' : '0',
    };
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'remote', 'winrm-shell.ps1')],
      { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const dec = new StringDecoder('utf8');
    ps.stdout.on('data', (d) => push(dec.write(d)));
    ps.stderr.on('data', (d) => push(dec.write(d)));
    ps.on('error', (e) => { notice(`Could not start PowerShell on this server: ${e.message}\r\n`); end(e.message); });
    ps.on('close', () => end('closed'));
    s.write = (d) => ps.stdin.write(d);
    s.kill = () => ps.kill();
  }
  return { id: s.id, kind: s.kind };
}

const get = (id) => { const s = sessions.get(id); if (!s) throw err('No such shell (it may have closed)', 404); return s; };

function stream(id, res) {
  const s = get(id);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (s.buffer) sseSend(res, null, { d: s.buffer });
  s.clients.add(res);
  const beat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
  res.on('close', () => { clearInterval(beat); s.clients.delete(res); });
}
function write(id, data) {
  const s = get(id);
  if (typeof data !== 'string' || data.length > 64 * 1024) throw err('Input too large');
  s.last = Date.now();
  s.write(data);
}
function resize(id, cols, rows) {
  const s = get(id);
  if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0 && cols < 1000 && rows < 500) s.resize(cols, rows);
}
function close(id) {
  const s = sessions.get(id);
  if (!s) return;
  s.kill();
  s.end('closed');
}
// Which hosts currently have a shell open (and the folder each is in), so the page can show it after a reload.
const open = () => [...sessions.values()].map((s) => ({ id: s.id, hostId: s.hostId, kind: s.kind, cwd: s.cwd }));

// ---- files: list, pull, send -------------------------------------------------------------------------------------
const sftpOf = (s) => new Promise((resolve, reject) => {
  if (s.sftp) return resolve(s.sftp);
  s.conn.sftp((e, f) => (e ? reject(err(`SFTP is not available on this host: ${e.message}`)) : resolve((s.sftp = f))));
});
const wrapSftp = (fn) => new Promise((resolve, reject) => fn((e, r) => (e ? reject(err(e.message)) : resolve(r))));
const P = (s) => (s.kind === 'ssh' ? path.posix : path.win32);

// One folder of the remote file system. path '' on Windows means "the drives".
async function list(id, p) {
  const s = get(id); s.last = Date.now();
  const remote = String(p ?? '');
  let entries;
  if (s.kind === 'winrm') {
    const r = await call(s, 'ls', { path: remote }, 30000);
    entries = (Array.isArray(r.entries) ? r.entries : r.entries ? [r.entries] : []).map((e) => ({ name: e.name, dir: !!e.dir, size: e.size ?? null, modified: e.modified || null }));
  } else {
    const sftp = await sftpOf(s);
    const dir = remote || s.cwd || '/';
    const l = await wrapSftp((cb) => sftp.readdir(dir, cb));
    entries = l.map((e) => ({ name: e.filename, dir: e.attrs.isDirectory(), size: e.attrs.isDirectory() ? null : e.attrs.size, modified: new Date(e.attrs.mtime * 1000).toISOString() }));
    p = dir;
  }
  entries.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const here = s.kind === 'ssh' ? (remote || s.cwd || '/') : remote;
  let parent = null;
  if (s.kind === 'ssh') parent = here === '/' ? null : path.posix.dirname(here);
  else if (here) parent = /^[A-Za-z]:\\?$/.test(here) ? '' : path.win32.dirname(here);
  return { path: here, parent, sep: s.kind === 'ssh' ? '/' : '\\', entries };
}

const safeName = (n) => String(n).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '_').slice(0, 120) || 'file';
const stamp = (d) => { const p2 = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; };
const csvCell = (v) => { const t = String(v ?? ''); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const copyOut = async (from, to) => { await fs.promises.copyFile(from, to); await fs.promises.unlink(from).catch(() => {}); };
const sha256 = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

// Copies one remote file into evidence/Pulled-Files/<address>/ with its SHA-256, and logs it in pulled-files.csv.
async function pull(id, remotePath) {
  const s = get(id); s.last = Date.now();
  const remote = String(remotePath || '');
  if (!remote) throw err('Choose a file to pull');
  const tmp = path.join(os.tmpdir(), `kb-pull-${crypto.randomBytes(6).toString('hex')}`);
  try {
    if (s.kind === 'winrm') await call(s, 'get', { remote, local: tmp }, 10 * 60 * 1000);
    else await wrapSftp((cb) => sftpOf(s).then((f) => f.fastGet(remote, tmp, cb), cb));
    const st = await fs.promises.stat(tmp);
    const digest = await sha256(tmp);
    const when = new Date();
    const base = P(s).basename(remote);
    const dirRel = path.join('Pulled-Files', safeName(s.address));
    fs.mkdirSync(path.join(evidenceDir, dirRel), { recursive: true });
    const name = `${stamp(when)}-${safeName(base)}`;
    await copyOut(tmp, path.join(evidenceDir, dirRel, name));
    const logFile = path.join(evidenceDir, 'Pulled-Files', 'pulled-files.csv');
    const head = fs.existsSync(logFile) ? '' : 'Time,Host,Address,RemotePath,File,Bytes,SHA256\r\n';
    fs.appendFileSync(logFile, head + [when.toISOString(), db.hosts.find((h) => h.id === s.hostId)?.hostname || '', s.address, remote, `${dirRel.replace(/\\/g, '/')}/${name}`, st.size, digest].map(csvCell).join(',') + '\r\n');
    return { name: base, size: st.size, sha256: digest, file: `${dirRel.replace(/\\/g, '/')}/${name}`, folder: `/evidence/${dirRel.replace(/\\/g, '/')}` };
  } finally { fs.promises.unlink(tmp).catch(() => {}); }
}

// Relative path from the browser (for example "MyFolder/sub/a.txt"): no empty parts, "..", drives or odd characters.
function cleanRel(rel) {
  const segs = String(rel || '').split('/');
  if (!segs.length || segs.length > 20) throw err('Invalid file path');
  for (const g of segs) if (!g || g === '.' || g === '..' || g.length > 255 || /[\\:*?"<>|\x00-\x1f]/.test(g)) throw err(`Invalid file name: ${g || '(empty)'}`);
  return segs;
}
async function mkdirp(sftp, dir) {
  const parts = dir.split('/').filter(Boolean); let cur = '';
  for (const part of parts) { cur += `/${part}`; await new Promise((resolve) => sftp.mkdir(cur, () => resolve())); }
}
// Where an upload will land: the folder the shell is in now.
const sendTarget = (id) => { const s = get(id); if (!s.cwd) throw err("Can't tell which folder the shell is in yet. Press Enter once in the shell, then try again."); return { s, cwd: s.cwd }; };

// Copies one local file (already on this server) to <shell folder>/<rel> on the host.
async function send(id, rel, localFile) {
  const { s, cwd } = sendTarget(id); s.last = Date.now();
  const segs = cleanRel(rel);
  const dest = P(s).join(cwd, ...segs);
  if (s.kind === 'winrm') await call(s, 'put', { local: localFile, remote: dest, remoteDir: path.win32.dirname(dest) }, 10 * 60 * 1000);
  else {
    const sftp = await sftpOf(s);
    await mkdirp(sftp, path.posix.dirname(dest));
    await wrapSftp((cb) => sftp.fastPut(localFile, dest, cb));
  }
  return { dest };
}

setInterval(() => { for (const s of [...sessions.values()]) if (Date.now() - s.last > IDLE_MS && !s.clients.size) close(s.id); }, 60 * 1000).unref();
process.on('exit', () => { for (const s of sessions.values()) { try { s.kill(); } catch { /* ignore */ } } });

module.exports = { create, stream, write, resize, close, open, list, pull, send, sendTarget };
