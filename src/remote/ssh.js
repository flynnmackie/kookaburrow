// SSH via ssh2. The hunt script is streamed to PowerShell's stdin on the target, so nothing
// is written to the remote disk. Target needs pwsh (Linux/macOS) or powershell/pwsh (Windows).
const { Client } = require('ssh2');
const { decrypt } = require('../crypto');
const { maxOutputBytes, hostTimeoutMs } = require('../config');

function exec(profile, command, stdin) {
  return new Promise((resolve) => {
    const conn = new Client();
    let stdout = '', stderr = '', truncated = false;
    const take = (buf, cur) => {
      if (cur.length + buf.length > maxOutputBytes) { truncated = true; return cur; }
      return cur + buf;
    };
    let settled = false;
    const finish = (exitCode, extraErr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { conn.end(); } catch { /* ignore */ }
      resolve({ exitCode, stdout, stderr: extraErr ? `${stderr}${extraErr}` : stderr, truncated });
    };
    const timer = setTimeout(() => finish(-1, 'Timed out'), hostTimeoutMs);

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) return finish(-1, err.message);
        stream.on('data', (d) => { stdout = take(d.toString(), stdout); });
        stream.stderr.on('data', (d) => { stderr = take(d.toString(), stderr); });
        stream.on('close', (code) => finish(code ?? 0));
        stream.end(stdin || undefined);
      });
    });
    conn.on('error', (e) => finish(-1, e.message));
    conn.connect({
      host: profile.address,
      port: profile.port || 22,
      username: profile.username,
      password: profile.password ?? decrypt(profile.secret),
      readyTimeout: 15000,
      // TODO: host key pinning (trust on first use) before this leaves the lab.
    });
  });
}

async function verify(profile) {
  // Linux/macOS shells, and Windows OpenSSH when its default shell can run uname (rare).
  const r = await exec(profile, 'uname -sr && hostname');
  if (r.exitCode === 0 && r.stdout.trim()) {
    const [os, hostname] = r.stdout.trim().split(/\r?\n/);
    return { hostname: hostname?.trim(), os: os.trim(), platform: 'unix' };
  }
  const probe = '$o=Get-CimInstance Win32_OperatingSystem; "$($env:COMPUTERNAME)|$($o.Caption) ($($o.Version))"';
  const w = await exec(profile, 'powershell -NoProfile -NonInteractive -Command -', probe);
  if (w.exitCode === 0 && w.stdout.includes('|')) {
    const [hostname, os] = w.stdout.trim().split('|');
    return { hostname, os, platform: 'windows' };
  }
  throw new Error((r.stderr || w.stderr || 'SSH connection failed').trim());
}

// type 'bash' pipes the script to `bash -s`; 'powershell' pipes it to pwsh/powershell.
function runScript(profile, scriptText, type = 'powershell') {
  if (type === 'bash') return exec(profile, 'bash -s', scriptText);
  const shell = profile.platform === 'windows' ? 'powershell' : 'pwsh';
  return exec(profile, `${shell} -NoProfile -NonInteractive -Command -`, scriptText);
}

module.exports = { verify, runScript };
