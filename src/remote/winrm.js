// WinRM via the host's built-in PowerShell remoting (Invoke-Command). Windows-only for now.
const { spawn } = require('child_process');
const path = require('path');
const { decrypt } = require('../crypto');
const { maxOutputBytes, hostTimeoutMs } = require('../config');

const wrapper = path.join(__dirname, 'winrm-run.ps1');

function run(profile, { mode, scriptPath, binaries = [], csv = false, outDir = '', arg = null, timeoutMs = hostTimeoutMs }) {
  return new Promise((resolve) => {
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
    };
    const ps = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', wrapper],
      { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '', stderr = '', truncated = false;
    const take = (buf, cur) => {
      if (cur.length + buf.length > maxOutputBytes) { truncated = true; return cur; }
      return cur + buf;
    };
    ps.stdout.on('data', (d) => { stdout = take(d.toString(), stdout); });
    ps.stderr.on('data', (d) => { stderr = take(d.toString(), stderr); });
    const timer = setTimeout(() => { stderr += '\nTimed out'; ps.kill(); }, timeoutMs);
    ps.on('error', (e) => { clearTimeout(timer); resolve({ exitCode: -1, stdout, stderr: e.message, truncated }); });
    ps.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: code, stdout, stderr, truncated }); });
  });
}

async function verify(profile) {
  const r = await run(profile, { mode: 'probe' });
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || 'WinRM connection failed').trim());
  const info = JSON.parse(r.stdout.trim());
  return { hostname: info.hostname, os: `${info.os} (${info.version})`, platform: 'windows' };
}

const runScript = (profile, scriptPath, binaries, opts = {}) => run(profile, { mode: 'script', scriptPath, binaries, csv: !!opts.csv, outDir: opts.outDir || '', timeoutMs: opts.timeoutMs });

// The steps of a large transfer (see src/large-transfer.js). Each runs the matching mode of winrm-run.ps1 and returns its JSON.
async function step(profile, mode, arg, timeoutMs) {
  const r = await run(profile, { mode, arg, timeoutMs });
  if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout || `${mode} failed`).trim().split(/\r?\n/)[0]);
  try { return JSON.parse(r.stdout.trim()); } catch { throw new Error(`${mode}: unexpected reply from the host`); }
}
const smbOpen = (profile, clientIp) => step(profile, 'smb-open', { clientIp, winrmPort: profile.port || (profile.useSsl ? 5986 : 5985) });
const smbList = (profile, outDir, timeoutMs) => step(profile, 'smb-list', { outDir }, timeoutMs);
const smbClose = (profile, outDir, state, removeDir) => step(profile, 'smb-close', { outDir, state, removeDir });

module.exports = { verify, runScript, smbOpen, smbList, smbClose };
