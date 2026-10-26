// Builds the bundled WinRM engine in vendor/winrm-runtime: a private Python with pypsrp (the same library KingfishIR uses), so
// Kookaburrow can talk WinRM to any host with no setup on this server or on the targets (NTLM over HTTP 5985 with message encryption).
//   Windows   downloads the official embeddable Python for Windows (no install, nothing outside this folder is touched)
//   Linux/Mac creates a virtual environment with the Python 3 already on the machine
// Run it with: npm run setup-winrm      (it also runs after npm install; add --force to rebuild)
// If it cannot run (no internet, no Python on Linux) Kookaburrow falls back to PowerShell remoting on this server.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..', 'vendor', 'winrm-runtime');
const PY_VERSION = '3.12.8';
const PACKAGES = ['pypsrp==0.9.1'];
const quiet = process.argv.includes('--quiet'), force = process.argv.includes('--force');
const log = (m) => { if (!quiet) console.log(`[setup-winrm] ${m}`); };

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const get = (u, hops = 0) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) { res.resume(); return get(new URL(res.headers.location, u).href, hops + 1); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${u}: HTTP ${res.statusCode}`)); }
      res.pipe(fs.createWriteStream(dest)).on('finish', resolve).on('error', reject);
    }).on('error', reject);
    get(url);
  });
}

async function windows() {
  const exe = path.join(root, 'python.exe');
  fs.mkdirSync(root, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-winrm-'));
  try {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    log(`downloading Python ${PY_VERSION} (embeddable, ${arch})`);
    const zip = path.join(tmp, 'python.zip');
    await download(`https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-${arch}.zip`, zip);
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${root}' -Force`], { stdio: 'pipe' });
    const mm = PY_VERSION.split('.').slice(0, 2).join('');
    // the embeddable Python ignores site-packages unless its ._pth file lists it
    fs.writeFileSync(path.join(root, `python${mm}._pth`), `python${mm}.zip\n.\nLib\\site-packages\nimport site\n`);
    log('installing pip');
    const getPip = path.join(tmp, 'get-pip.py');
    await download('https://bootstrap.pypa.io/get-pip.py', getPip);
    execFileSync(exe, [getPip, '--no-warn-script-location', '--disable-pip-version-check'], { stdio: 'pipe' });
    log(`installing ${PACKAGES.join(' ')} and its dependencies`);
    execFileSync(exe, ['-m', 'pip', 'install', '--no-warn-script-location', '--disable-pip-version-check', ...PACKAGES], { stdio: 'pipe' });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  return exe;
}

function unix() {
  const py = ['python3', 'python'].find((c) => { try { execFileSync(c, ['-c', 'import venv'], { stdio: 'pipe' }); return true; } catch { return false; } });
  if (!py) throw new Error('Python 3 with the venv module was not found (on Debian/Ubuntu: apt install python3 python3-venv)');
  log(`creating a virtual environment with ${py}`);
  execFileSync(py, ['-m', 'venv', root], { stdio: 'pipe' });
  const exe = path.join(root, 'bin', 'python');
  log(`installing ${PACKAGES.join(' ')} and its dependencies`);
  execFileSync(exe, ['-m', 'pip', 'install', '--disable-pip-version-check', ...PACKAGES], { stdio: 'pipe' });
  return exe;
}

(async () => {
  const { check } = require('../src/remote/pyruntime');
  if (!force && check().ok) { log(`already installed: ${check().version}`); return; }
  if (force) fs.rmSync(root, { recursive: true, force: true });
  try {
    if (process.platform === 'win32') await windows(); else unix();
    const c = check(true);
    if (!c.ok) throw new Error(`the engine was built but does not start: ${c.error}`);
    log(`done: ${c.version} in ${path.relative(process.cwd(), root) || root}`);
  } catch (e) {
    fs.rmSync(root, { recursive: true, force: true });
    console.error(`[setup-winrm] could not build the bundled WinRM engine: ${e.message}`);
    console.error('[setup-winrm] Kookaburrow will use PowerShell remoting on this server instead. Run "npm run setup-winrm" to try again.');
    process.exitCode = process.argv.includes('--quiet') ? 0 : 1;
  }
})();
