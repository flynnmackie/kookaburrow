const fs = require('fs');
const crypto = require('crypto');
const { largeTimeoutMs, smbWaitMs } = require('./config');
const collections = require('./collections');
const winrm = require('./remote/winrm');
const ssh = require('./remote/ssh');
const smb = require('./remote/smb');
const sftp = require('./remote/sftp');
const { localPath } = require('./remote/copy');

// Collections marked $Transfer = 'large' write files (possibly GBs: a KAPE collection, exported event logs) to a folder on the host
// that the script is given as $OutDir (PowerShell) or $OUT_DIR (bash). Afterwards the server pulls that folder back and removes it.
//
//   Windows hosts (WinRM): over SMB, which is not normally reachable, so it is opened just for this and closed again:
//     1. smb-open   starts the Server service and turns on the SMB firewall rule if they are off (limited to this server's address),
//                   remembers what they were, and creates the folder. Then the server waits for port 445 and connects to \\host\C$.
//     2. the collection runs with $OutDir set.
//     3. smb-list   names every file with its size and SHA-256 on the host; each is copied and its hash compared.
//     4. smb-close  removes the folder (only when every file arrived intact) and restores the service and rule as they were; the
//                   server then checks that port 445 really is closed again. If SMB was already on, it is left as it was found.
//   Linux hosts (SSH): over SFTP on the existing SSH port, nothing to open. Folder: /var/tmp/kb-out-<id> (not /tmp, which is often RAM).
//
// Every step is written to the hunt's log. Files land in <host folder>/raw/<collection>/.

const mb = (n) => `${(n / 1048576).toFixed(n >= 1e8 ? 0 : 1)} MB`;

// Copies the files one after another, checking each against the hash the host gave. Resolves { ok, bytes, files }.
async function pullAll({ files, host, destDir, copyOne, ctx, via }) {
  const total = files.reduce((n, f) => n + f.size, 0);
  fs.mkdirSync(destDir, { recursive: true });
  let free = Infinity;
  try { const st = fs.statfsSync(destDir); free = st.bavail * st.bsize; } catch { /* not supported here: skip the check */ }
  if (total > free * 0.98) throw new Error(`Not enough free disk space on the server: ${mb(total)} to pull, ${mb(free)} free`);
  ctx.audit.log({ kind: 'evidence', host: host.address, action: 'transfer started', artefact: ctx.name, size: total, detail: `${files.length} file${files.length === 1 ? '' : 's'}, ${mb(total)}, over ${via}` });

  let done = 0, last = 0, ok = true;
  const out = [];
  for (const f of files) {
    const rec = { path: f.path, size: f.size, sha256: '', ok: false, error: '' };
    out.push(rec);
    try {
      const got = await copyOne(f, localPath(destDir, f.path), (n) => {
        done += n;
        if (ctx.onProgress && Date.now() - last > 1000) { last = Date.now(); ctx.onProgress({ bytes: done, total, file: f.path }); }
      });
      rec.sha256 = got.sha256; rec.size = got.size;
      if (got.size !== f.size) throw new Error(`size differs: the host has ${f.size} bytes, ${got.size} arrived`);
      if (f.sha256 && got.sha256 !== f.sha256) throw new Error('SHA-256 differs from the host\'s, so the copy is corrupt');
      rec.ok = true;
      ctx.audit.log({ kind: 'evidence', host: host.address, action: 'file received', artefact: f.path, size: got.size, sourceHash: f.sha256, receivedHash: got.sha256,
        outcome: f.sha256 ? 'ok' : 'ok (host hash unavailable)', detail: `via ${via}` });
    } catch (e) {
      ok = false; rec.error = e.message;
      ctx.audit.log({ kind: 'error', host: host.address, action: 'file received', artefact: f.path, size: f.size, sourceHash: f.sha256, receivedHash: rec.sha256, outcome: 'error', detail: e.message });
    }
  }
  if (ctx.onProgress) ctx.onProgress({ bytes: done, total, file: '' });
  return { ok, bytes: out.filter((r) => r.ok).reduce((n, r) => n + r.size, 0), files: out };
}

// What a run hands back to the hunt: the collection's own result, plus the files and how the transfer went.
function result(script, problem, pulled, extra) {
  const bad = pulled.files.filter((f) => !f.ok);
  const why = problem || (bad.length ? `${bad.length} file${bad.length === 1 ? '' : 's'} could not be pulled intact: ${bad[0].path}: ${bad[0].error}` : '');
  return {
    ...script,
    exitCode: script.exitCode === 0 && why ? -1 : script.exitCode,
    stderr: script.exitCode === 0 && why ? why : (script.stderr || why),
    files: pulled.files, transferBytes: pulled.bytes, ...extra,
  };
}

async function runWindows(host, c, ctx) {
  const A = host.address;
  const log = (action, detail, outcome = 'ok', kind = 'session') => ctx.audit.log({ kind, host: A, action, artefact: c.name, outcome, detail });
  let script = { exitCode: -1, stdout: '', stderr: '', truncated: false, durationMs: 0 };
  let pulled = { ok: false, bytes: 0, files: [] }, problem = '', opened = null, conn = null, smbClosed = null, ran = false;
  try {
    const clientIp = await smb.clientIpFor(A);
    log('SMB enabling', `SMB (port 445) is being enabled on the host for this collection only; the server connects from ${clientIp}`);
    opened = await winrm.smbOpen(host, clientIp);
    if (!opened.ok) throw new Error(`could not enable SMB on the host: ${opened.error}`);
    const change = [opened.state.serviceRunning ? '' : 'Server service started', opened.state.ruleChanged ? 'SMB firewall rule turned on' : '', opened.state.createdRule ? 'temporary firewall rule added' : ''].filter(Boolean);
    log('SMB enabled', (change.length ? change.join('; ') : 'SMB was already on, nothing was changed') + (change.length && opened.allowed.length ? `; allowed from ${[].concat(opened.allowed).join(', ')} only` : ''));
    if (!(await smb.waitPort(A, 445, true, smbWaitMs))) throw new Error(`SMB did not answer on port 445 within ${smbWaitMs / 1000} s`);
    log('SMB port answering', 'port 445 is open');
    const drive = /^([A-Za-z]):\\/.exec(opened.outDir);
    if (!drive) throw new Error(`unexpected output folder on the host: ${opened.outDir}`);
    conn = await smb.connect(host, `${drive[1].toUpperCase()}$`);
    log('SMB connection established', `\\\\${A}\\${conn.share} with the host's saved credentials`);

    ran = true;
    script = await collections.executeOnHost(host, c, { csv: ctx.csv, outDir: opened.outDir, timeoutMs: largeTimeoutMs });
    const list = await winrm.smbList(host, opened.outDir, largeTimeoutMs);
    pulled = await pullAll({ files: [].concat(list), host, destDir: ctx.rawDir, ctx: { ...ctx, name: c.name }, via: 'SMB',
      copyOne: (f, dest, onBytes) => smb.fetch(conn, `${opened.outDir}\\${f.path}`, dest, onBytes) });
  } catch (e) {
    problem = e.message;
    log('transfer failed', problem, 'error', 'error');
  } finally {
    if (conn) { try { await smb.disconnect(conn); } catch { /* the close below does not need it */ } }
    if (opened) {
      const intact = (!problem && pulled.ok) || !ran; // a folder the collection never wrote to holds nothing worth keeping
      try {
        const r = await winrm.smbClose(host, opened.ok ? opened.outDir : '', opened.state, intact);
        if (opened.ok && intact) log('host folder removed', r.outDirRemoved ? 'the temporary folder on the host was removed' : 'the temporary folder on the host could not be removed; delete it by hand', r.outDirRemoved ? 'ok' : 'warning', r.outDirRemoved ? 'session' : 'warn');
        else if (opened.ok) log('host folder kept', `files were left on the host in ${opened.outDir} because they were not all pulled intact`, 'warning', 'warn');
        const changed = opened.state.ruleChanged || opened.state.createdRule || !opened.state.serviceRunning;
        if (r.errors && r.errors.length) log('SMB restore problem', [].concat(r.errors).join('; '), 'warning', 'warn');
        if (!changed) {
          log('SMB left as found', 'SMB was already on before this collection, so it was not switched off');
        } else if (await smb.waitPort(A, 445, false, smbWaitMs)) {
          smbClosed = true;
          log('SMB closed', 'port 445 no longer answers: confirmed closed', 'ok');
        } else {
          smbClosed = false;
          log('SMB STILL OPEN', `port 445 still answers ${smbWaitMs / 1000} s after SMB was closed; check the host`, 'warning', 'warn');
        }
      } catch (e) {
        smbClosed = false;
        log('SMB STILL OPEN', `closing SMB on the host failed (${e.message}); check the host`, 'warning', 'warn');
      }
    }
  }
  return result(script, problem, pulled, { method: 'SMB', smbClosed, ...(smbClosed === false ? { warning: 'SMB may still be open on this host; check it' } : {}) });
}

const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`; // bash single quotes

async function runSftp(host, c, ctx) {
  const A = host.address;
  const log = (action, detail, outcome = 'ok', kind = 'session') => ctx.audit.log({ kind, host: A, action, artefact: c.name, outcome, detail });
  const outDir = `/var/tmp/kb-out-${crypto.randomBytes(8).toString('hex')}`;
  let script = { exitCode: -1, stdout: '', stderr: '', truncated: false, durationMs: 0 };
  let pulled = { ok: false, bytes: 0, files: [] }, problem = '', session = null, made = false, ran = false;
  try {
    log('SFTP transfer', `files are pulled over the SSH connection (SFTP); nothing is opened on the host. Folder on the host: ${outDir}`);
    const mk = await ssh.exec(host, `mkdir -m 700 -p ${q(outDir)}`);
    if (mk.exitCode !== 0) throw new Error(`could not create ${outDir} on the host: ${(mk.stderr || mk.stdout).trim().split(/\r?\n/)[0]}`);
    made = true;
    ran = true;
    script = await collections.executeOnHost(host, c, { csv: ctx.csv, outDir, timeoutMs: largeTimeoutMs });
    session = await sftp.open(host);
    const list = await sftp.list(session, outDir);
    const hr = await ssh.exec(host, `cd ${q(outDir)} && find . -type f -exec sha256sum {} +`, undefined, largeTimeoutMs);
    const sums = new Map();
    for (const line of hr.stdout.split('\n')) { const m = /^([0-9a-f]{64}) [ *](.*)$/.exec(line); if (m) sums.set(m[2].replace(/^\.\//, ''), m[1]); }
    pulled = await pullAll({ files: list.map((f) => ({ ...f, sha256: sums.get(f.path) || '' })), host, destDir: ctx.rawDir, ctx: { ...ctx, name: c.name }, via: 'SFTP',
      copyOne: (f, dest, onBytes) => sftp.fetch(session, `${outDir}/${f.path}`, dest, onBytes) });
  } catch (e) {
    problem = e.message;
    log('transfer failed', problem, 'error', 'error');
  } finally {
    if (session) sftp.close(session);
    if (made) {
      if ((!problem && pulled.ok) || !ran) {
        const rm = await ssh.exec(host, `rm -rf ${q(outDir)}; test ! -e ${q(outDir)}`);
        log('host folder removed', rm.exitCode === 0 ? `${outDir} was removed from the host` : `${outDir} could not be removed from the host; delete it by hand`, rm.exitCode === 0 ? 'ok' : 'warning', rm.exitCode === 0 ? 'session' : 'warn');
      } else {
        log('host folder kept', `files were left on the host in ${outDir} because they were not all pulled intact`, 'warning', 'warn');
      }
    }
  }
  return result(script, problem, pulled, { method: 'SFTP' });
}

// ctx: { csv, audit, rawDir (absolute folder for the pulled files), onProgress({ bytes, total, file }) }
function runLarge(host, c, ctx) {
  // a collection that cannot run on this kind of host must not cause SMB to be switched on for nothing
  if (c.type === 'bash' && host.protocol === 'winrm') return Promise.resolve({ exitCode: -1, stdout: '', stderr: 'bash collections cannot run over winrm', truncated: false, durationMs: 0, files: [] });
  if (host.protocol === 'winrm') return runWindows(host, c, ctx);
  if (host.protocol === 'ssh' && host.platform !== 'windows') return runSftp(host, c, ctx);
  return Promise.resolve({ exitCode: -1, stdout: '', stderr: `Large transfers are not supported for ${host.protocol}${host.platform === 'windows' ? ' on Windows' : ''} hosts`, truncated: false, durationMs: 0, files: [] });
}

module.exports = { runLarge };
