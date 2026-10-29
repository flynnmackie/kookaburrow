const { execFile } = require('child_process');
const serverSettings = require('./server-settings');

// Windows Firewall follows Server Settings. When the server listens on the network (not just on this PC) AND some computers are allowed to connect, one
// inbound allow rule for the port exists, limited to exactly those addresses. Otherwise there is no rule, and Windows' default (block inbound) applies.
// It is set when the server starts and every start after Server Settings are saved (saving restarts the server). The service runs as LocalSystem, so it
// may do this; run from source without administrator rights it cannot, and says so. Linux: nothing is changed; the page shows the command for ufw.
// The rule is named NAME. Any rule whose name starts with it is replaced (the 1.0 installer made "Kookaburrow web interface (TCP <port>)").
const NAME = 'Kookaburrow web interface';
const WIN = process.platform === 'win32';
let last = null;           // the result of the last change
let cached = null;         // { at, value } the rules as Windows has them, for a few seconds

const ps = (script) => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 45000, windowsHide: true, maxBuffer: 1 << 20 }, (e, so, se) => {
    resolve({ ok: !e, out: String(so || '').trim(), err: String(se || (e && e.message) || '').trim() });
  });
});
const q = (s) => `'${String(s).replace(/'/g, "''")}'`; // a PowerShell string literal
const RANGE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;

// What the firewall should look like for the address and port the server is really listening on.
function wanted(running, saved = serverSettings.settings()) {
  const remote = (saved.allowFrom || []).filter((r) => RANGE.test(r));
  return { open: !serverSettings.isLoopbackHost(running.host) && remote.length > 0, port: running.port, remote };
}

async function apply(running) {
  const w = wanted(running);
  if (!WIN) return (last = { at: new Date().toISOString(), ok: true, action: 'none', note: 'Not Windows: the firewall is not changed.' });
  if (!Number.isInteger(w.port) || w.port < 1 || w.port > 65535) return (last = { at: new Date().toISOString(), ok: false, action: 'none', error: 'Invalid port' });
  const create = w.open
    ? `New-NetFirewallRule -DisplayName ${q(NAME)} -Description ${q('Opened by Kookaburrow for its web interface. It follows Settings > System > Server Settings.')} -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${w.port} -RemoteAddress ${w.remote.map(q).join(',')} -Profile Any | Out-Null`
    : '';
  const r = await ps(`$ErrorActionPreference = 'Stop'; Get-NetFirewallRule -DisplayName ${q(NAME + '*')} -ErrorAction SilentlyContinue | Remove-NetFirewallRule; ${create}`);
  cached = null;
  last = { at: new Date().toISOString(), ok: r.ok, action: w.open ? 'opened' : 'closed', port: w.port, remote: w.remote, ...(r.ok ? {} : { error: (r.err.split(/\r?\n/).find(Boolean) || 'failed').slice(0, 300) }) };
  if (r.ok) console.log(w.open ? `Windows Firewall: port ${w.port} open to ${w.remote.join(', ')}` : 'Windows Firewall: no rule (the server is not open to other computers)');
  else console.error(`Windows Firewall could not be updated: ${last.error}. ${w.open ? `Run: New-NetFirewallRule -DisplayName "${NAME}" -Direction Inbound -Protocol TCP -LocalPort ${w.port} -RemoteAddress ${w.remote.join(',')} -Action Allow` : ''}`);
  return last;
}

// The rules Windows has now, and what the settings call for.
async function status(running) {
  const w = wanted(running);
  const hint = w.open ? w.remote.map((r) => `sudo ufw allow from ${r} to any port ${w.port} proto tcp`) : [];
  if (!WIN) return { supported: false, wanted: w, hint, last };
  if (!cached || Date.now() - cached.at > 10000) {
    const r = await ps(`Get-NetFirewallRule -DisplayName ${q(NAME + '*')} -ErrorAction SilentlyContinue | ForEach-Object { $p = $_ | Get-NetFirewallPortFilter; $a = $_ | Get-NetFirewallAddressFilter; [pscustomobject]@{ name = $_.DisplayName; enabled = [string]$_.Enabled; action = [string]$_.Action; direction = [string]$_.Direction; port = [string]$p.LocalPort; remote = @($a.RemoteAddress) } } | ConvertTo-Json -Compress`);
    let rules = null, error = null;
    if (!r.ok) error = r.err.split(/\r?\n/).find(Boolean) || 'could not read the firewall';
    else { try { const j = r.out ? JSON.parse(r.out) : []; rules = Array.isArray(j) ? j : [j]; } catch { error = 'could not read the firewall'; } }
    cached = { at: Date.now(), value: { rules, error } };
  }
  return { supported: true, wanted: w, rules: cached.value.rules, readError: cached.value.error, last };
}

module.exports = { apply, status, wanted, NAME };
