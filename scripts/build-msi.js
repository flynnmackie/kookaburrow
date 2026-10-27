// Builds the offline Windows installer:  node scripts/build-msi.js     ->  build/Kookaburrow-<version>-x64.msi
// Signing (optional, see scripts/sign-msi.ps1):  --sign-self | --sign-pfx=<file> (password in KB_SIGN_PFX_PASSWORD) | --sign-thumbprint=<hash>
// Needs Windows, Node.js and the .NET Framework compiler that ships with Windows. The WiX Toolset 3 binaries are downloaded once into
// build/tools/wix. The installer carries everything it needs: this Node.js (runtime/node.exe), the production node_modules, and the
// bundled WinRM engine (vendor/winrm-runtime, built first with `npm run setup-winrm` when missing).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const build = path.join(root, 'build');
const stage = path.join(build, 'stage');
const wix = path.join(build, 'tools', 'wix');
const version = require('../package.json').version;
const WIX_URL = 'https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip';
const FRAMEWORK = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319');

const run = (exe, args, opts = {}) => {
  try { return execFileSync(exe, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts }).toString(); }
  catch (e) { throw new Error(`${path.basename(exe)} failed:\n${e.stdout || ''}${e.stderr || ''}`); }
};
const step = (m) => console.log(`\n== ${m}`);
const exists = (p) => fs.existsSync(p);

async function ensureWix() {
  if (exists(path.join(wix, 'candle.exe'))) return;
  step('Downloading the WiX Toolset 3 (one time)');
  fs.mkdirSync(wix, { recursive: true });
  const zip = path.join(build, 'tools', 'wix.zip');
  const res = await fetch(WIX_URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  run('tar', ['-xf', zip, '-C', wix]);
}

function copyTree(from, to, skip = () => false) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !skip(path.basename(src), src) });
}

(async () => {
  if (process.platform !== 'win32') throw new Error('The installer is built on Windows.');
  await ensureWix();

  step('Staging the program files');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const f of ['server.js', 'package.json', 'package-lock.json', 'README.md']) fs.copyFileSync(path.join(root, f), path.join(stage, f));
  for (const d of ['src', 'public', 'collections', 'actions', 'processors']) copyTree(path.join(root, d), path.join(stage, d));
  fs.mkdirSync(path.join(stage, 'scripts'));
  for (const f of ['install-setup.js', 'verify-collections.js']) fs.copyFileSync(path.join(root, 'scripts', f), path.join(stage, 'scripts', f));

  step('Installing production dependencies');
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: stage, shell: true });

  step('Adding Node.js');
  fs.mkdirSync(path.join(stage, 'runtime'));
  fs.copyFileSync(process.execPath, path.join(stage, 'runtime', 'node.exe'));

  step('Adding the WinRM engine');
  const engine = path.join(root, 'vendor', 'winrm-runtime');
  if (!exists(path.join(engine, 'python.exe'))) { console.log('(building it first)'); run(process.execPath, [path.join(root, 'scripts', 'setup-winrm.js')]); }
  copyTree(engine, path.join(stage, 'vendor', 'winrm-runtime'), (name) => name === '__pycache__');

  step('Compiling the service wrapper and installer actions');
  const csc = path.join(FRAMEWORK, 'csc.exe');
  if (!exists(csc)) throw new Error('csc.exe (.NET Framework 4) not found at ' + csc);
  const out = path.join(build, 'obj');
  fs.mkdirSync(out, { recursive: true });
  const svc = path.join(out, 'KookaburrowService.exe');
  run(csc, ['/nologo', '/target:exe', '/optimize+', `/win32icon:${path.join(root, 'installer', 'kookaburrow.ico')}`, `/out:${svc}`, '/r:System.ServiceProcess.dll', path.join(root, 'installer', 'KookaburrowService.cs')]);
  const sdk = path.join(wix, 'sdk');
  const caRaw = path.join(out, 'KbCustomActions.dll');
  run(csc, ['/nologo', '/target:library', '/optimize+', `/out:${caRaw}`, `/r:${path.join(sdk, 'Microsoft.Deployment.WindowsInstaller.dll')}`, path.join(root, 'installer', 'KbCustomActions.cs')]);
  const caPacked = path.join(out, 'KbCustomActions.CA.dll');
  run(path.join(sdk, 'MakeSfxCA.exe'), [caPacked, path.join(sdk, 'x86', 'sfxca.dll'), caRaw, path.join(sdk, 'Microsoft.Deployment.WindowsInstaller.dll'), path.join(root, 'installer', 'CustomAction.config')]);

  step('Building the .msi');
  const files = path.join(out, 'files.wxs');
  run(path.join(wix, 'heat.exe'), ['dir', stage, '-nologo', '-cg', 'AppFiles', '-dr', 'INSTALLFOLDER', '-gg', '-sfrag', '-srd', '-sreg', '-scom', '-var', 'var.StageDir', '-out', files]);
  const ext = ['-ext', 'WixFirewallExtension', '-ext', 'WixUtilExtension'];
  run(path.join(wix, 'candle.exe'), ['-nologo', '-arch', 'x64', ...ext, `-dVersion=${version}`, `-dCaDll=${caPacked}`, `-dSvcExe=${svc}`, `-dStageDir=${stage}`,
    '-out', out + path.sep, path.join(root, 'installer', 'Kookaburrow.wxs'), files]);
  const msi = path.join(build, `Kookaburrow-${version}-x64.msi`);
  run(path.join(wix, 'light.exe'), ['-nologo', '-sval', '-spdb', ...ext, '-ext', 'WixUIExtension', '-cultures:en-us', '-out', msi, path.join(out, 'Kookaburrow.wixobj'), path.join(out, 'files.wixobj')]);
  const arg = (n) => { const a = process.argv.find((x) => x === n || x.startsWith(n + '=')); return a === undefined ? null : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
  const sign = arg('--sign-self') ? ['-SelfSigned'] : arg('--sign-pfx') ? ['-Pfx', arg('--sign-pfx')] : arg('--sign-thumbprint') ? ['-Thumbprint', arg('--sign-thumbprint')] : null;
  if (sign) {
    step('Signing the .msi');
    console.log(run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', path.join(root, 'scripts', 'sign-msi.ps1'), '-Msi', msi, ...sign]).trim());
    const cer = path.join(build, 'signing', 'Kookaburrow-signing.cer');
    if (arg('--sign-self') && exists(cer)) { fs.copyFileSync(cer, path.join(build, 'Kookaburrow-signing.cer')); console.log('Public certificate for the machines that should trust it: ' + path.join(build, 'Kookaburrow-signing.cer')); }
  } else console.log('\n(not signed: add --sign-self, --sign-pfx=<file> or --sign-thumbprint=<hash>)');
  console.log(`\nBuilt ${msi} (${(fs.statSync(msi).size / 1048576).toFixed(1)} MB)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
