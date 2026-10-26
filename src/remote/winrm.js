// WinRM. The main engine is the bundled pypsrp helper (src/remote/winrm_helper.py, run by the Python in vendor/winrm-runtime): it speaks the
// protocol itself (NTLM with message encryption over HTTP 5985), so nothing needs configuring on this server or the targets. When the bundled
// engine is not installed (npm run setup-winrm), or KB_ENGINE=powershell is set, it falls back to PowerShell remoting on this server
// (winrm-run.ps1 with Invoke-Command, Windows only), which needs the host in TrustedHosts for IP targets.
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { decrypt } = require('../crypto');
const { maxOutputBytes, hostTimeoutMs } = require('../config');

const wrapper = path.join(__dirname, 'winrm-run.ps1');
const pyruntime = require('./pyruntime');
// the engine a call will use: the bundled helper unless it is missing or forced off
const helper = () => (process.env.KB_ENGINE === 'powershell' ? null : pyruntime.command());
const engine = () => (helper() ? `pypsrp (bundled, ${pyruntime.check().version})` : 'PowerShell remoting (fallback)');

function run(profile, { mode, scriptPath, binaries = [], csv = false, outDir = '', arg = null, timeoutMs = hostTimeoutMs, signal = null, stage = '' }) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ exitCode: -2, stdout: '', stderr: 'Cancelled', truncated: false });
    const env = {
      ...process.env,
      KB_HOST: profile.address,
      KB_PORT: String(profile.port || (profile.useSsl ? 5986 : 5985)),
      KB_USER: profile.username,
      KB_PASS: profile.password ?? decrypt(profile.secret),
      KB_AUTH: profile.auth || 'Negotiate',
      KB_SSL: profile.useSsl ? '1' : '0',
      KB_MODE: mode,
      KB_CSV: csv ? '1' : '0', // hunts: return the result as CSV
      KB_SCRIPT: scriptPath || '',
      KB_BINS: binaries.length ? JSON.stringify(binaries) : '', // local files to stage on the target
      KB_OUTDIR: outDir, // large-transfer collections: the folder on the target the script writes to ($OutDir)
      KB_ARG: arg ? JSON.stringify(arg) : '', // input of the smb-* modes
      KB_STAGE: stage, // name of the temporary folder staged binaries go in on the target (so a cancelled run can remove it)
    };
    const py = helper();
    const ps = py
      ? spawn(py.exe, py.args, { env: { ...env, ...py.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '', stderr = '', truncated = false;
    const take = (buf, cur) => {
      if (cur.length + buf.length > maxOutputBytes) { truncated = true; return cur; }
      return cur + buf;
    };
    ps.stdout.on('data', (d) => { stdout = take(d.toString(), stdout); });
    ps.stderr.on('data', (d) => { stderr = take(d.toString(), stderr); });
    const timer = setTimeout(() => { stderr += '\nTimed out'; ps.kill(); }, timeoutMs);
    let cancelled = false;
    const onAbort = () => { cancelled = true; ps.kill(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const done = (r) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(cancelled ? { ...r, exitCode: -2, stderr: 'Cancelled' } : r); };
    ps.on('error', (e) => done({ exitCode: -1, stdout, stderr: e.message, truncated }));
    ps.on('close', (code) => done({ exitCode: code, stdout, stderr, truncated }));
  });
}

async function verify(profile) {
  const r = await run(profile, { mode: 'probe' });
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'WinRM connection failed').trim());
  const info = JSON.parse(r.stdout.trim());
  return { hostname: info.hostname, os: `${info.os} (${info.version})`, platform: 'windows' };
}

// A run that stages binaries names the temporary folder itself, so that if it is cancelled (the local PowerShell is killed before it can clean up)
// the folder can still be removed.
async function runScript(profile, scriptPath, binaries, opts = {}) {
  const stage = binaries.length ? `kb-${crypto.randomBytes(8).toString('hex')}` : '';
  const r = await run(profile, { mode: 'script', scriptPath, binaries, csv: !!opts.csv, outDir: opts.outDir || '', timeoutMs: opts.timeoutMs, signal: opts.signal, stage });
  if (r.exitCode === -2 && stage) {
    const c = await run(profile, { mode: 'stage-clean', arg: { name: stage }, timeoutMs: 60000 });
    r.stderr = `Cancelled${c.exitCode === 0 ? '' : ' (the temporary folder on the host could not be removed)'}`;
  }
  return r;
}

// The steps of a large transfer (see src/large-transfer.js). Each runs the matching mode of winrm-run.ps1 and returns its JSON.
async function step(profile, mode, arg, timeoutMs) {
  const r = await run(profile, { mode, arg, timeoutMs });
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || `${mode} failed`).trim().split(/\r?\n/)[0]);
  try { return JSON.parse(r.stdout.trim()); } catch { throw new Error(`${mode}: unexpected reply from the host`); }
}
const smbOpen = (profile, clientIp) => step(profile, 'smb-open', { clientIp, winrmPort: profile.port || (profile.useSsl ? 5986 : 5985) });
const smbList = (profile, outDir, timeoutMs) => step(profile, 'smb-list', { outDir }, timeoutMs);
const smbClose = (profile, outDir, state, removeDir) => step(profile, 'smb-close', { outDir, state, removeDir });

module.exports = { engine, verify, runScript, smbOpen, smbList, smbClose };
