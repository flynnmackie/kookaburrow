const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

// Server dependencies: software that must be installed on THIS server (not uploaded) for some processors to run, for example the .NET
// runtime that Eric Zimmerman's tools need. A processor lists what it needs in "requires" (ids from CATALOG below). Kookaburrow only
// detects: installing needs administrator or root rights and usually the internet, so the page shows the command instead.
// Add an entry to CATALOG to gate a new kind of tool; nothing else needs to change.
const WIN = process.platform === 'win32';
const home = os.homedir();

const DOTNET_CANDIDATES = WIN
  ? [process.env.DOTNET_ROOT && path.join(process.env.DOTNET_ROOT, 'dotnet.exe'), 'dotnet.exe', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'dotnet', 'dotnet.exe'), path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'dotnet', 'dotnet.exe')]
  : [process.env.DOTNET_ROOT && path.join(process.env.DOTNET_ROOT, 'dotnet'), 'dotnet', '/usr/share/dotnet/dotnet', '/usr/lib/dotnet/dotnet', '/usr/lib64/dotnet/dotnet', '/usr/local/share/dotnet/dotnet', '/opt/dotnet/dotnet', path.join(home, '.dotnet', 'dotnet')];

const run = (exe, args) => new Promise((resolve) => {
  execFile(exe, args, { timeout: 15000, windowsHide: true, maxBuffer: 1 << 20, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' } }, (e, so) => resolve(e ? null : String(so)));
});

// Finds an installed .NET runtime of at least the wanted major version. Resolves { found, version, exe, root, tried }.
async function findDotnet(minMajor) {
  const tried = [];
  for (const exe of [...new Set(DOTNET_CANDIDATES.filter(Boolean))]) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    tried.push(exe);
    const out = await run(exe, ['--list-runtimes']);
    if (!out) continue;
    let best = null;
    for (const line of out.split(/\r?\n/)) {
      const m = /^Microsoft\.NETCore\.App (\d+)\.(\d+)\.(\d+)\S* \[(.+)\]$/.exec(line.trim());
      if (m && +m[1] >= minMajor && (!best || +m[1] > best.major || (+m[1] === best.major && (+m[2] > best.minor || (+m[2] === best.minor && +m[3] > best.patch))))) {
        best = { major: +m[1], minor: +m[2], patch: +m[3], version: `${m[1]}.${m[2]}.${m[3]}`, dir: m[4] };
      }
    }
    if (best) {
      // …/dotnet/shared/Microsoft.NETCore.App  ->  the folder holding the dotnet program is DOTNET_ROOT
      const root = path.resolve(best.dir, '..', '..');
      return { found: true, version: best.version, exe: path.isAbsolute(exe) ? exe : (fs.existsSync(path.join(root, WIN ? 'dotnet.exe' : 'dotnet')) ? path.join(root, WIN ? 'dotnet.exe' : 'dotnet') : exe), root, tried };
    }
  }
  return { found: false, tried };
}

// Zeek (network analysis for packet captures): Linux only. Installed under /opt/zeek by the official packages, so that folder is checked as well as the PATH.
const ZEEK_CANDIDATES = WIN ? [] : [process.env.ZEEK_BIN, 'zeek', '/opt/zeek/bin/zeek', '/usr/local/zeek/bin/zeek', '/usr/bin/zeek', '/usr/local/bin/zeek'];
async function findZeek() {
  for (const exe of [...new Set(ZEEK_CANDIDATES.filter(Boolean))]) {
    if (path.isAbsolute(exe) && !fs.existsSync(exe)) continue;
    const out = await run(exe, ['--version']);
    const m = out && /zeek version (\S+)/i.exec(out);
    if (m) return { found: true, version: m[1], exe };
  }
  return { found: false };
}

const CATALOG = [
  {
    id: 'dotnet10', name: '.NET 10 runtime', needed: 'Eric Zimmerman tools (EvtxECmd, MFTECmd, PECmd and others)',
    detect: () => findDotnet(10),
    install: WIN
      ? ['winget install Microsoft.DotNet.Runtime.10', 'Or download the .NET 10 Runtime installer (x64) from https://dotnet.microsoft.com/download/dotnet/10.0 and run it on this server.']
      : ['Ubuntu / Debian: sudo apt install dotnet-runtime-10.0 (the package name and source depend on the distribution version)', 'Any Linux: download the .NET 10 Runtime tarball from https://dotnet.microsoft.com/download/dotnet/10.0 and extract it to /usr/share/dotnet, or run Microsoft\'s dotnet-install script with --runtime dotnet --channel 10.0'],
    after: 'Install it, then press Re-check. The service picks up the new PATH only after it restarts (Restart-Service Kookaburrow); the usual install folders are found without that.',
  },
  {
    id: 'zeek', name: 'Zeek', needed: 'Zeek network analysis of collected packet captures (.pcap, .pcapng)',
    detect: () => findZeek(),
    install: WIN
      ? ['Zeek has no native Windows build. Run Kookaburrow on a Linux server to use the Zeek workflow.']
      : ['Ubuntu 24.04 (other versions and distributions: https://zeek.org/get-zeek/):',
        'echo "deb http://download.opensuse.org/repositories/security:/zeek/xUbuntu_24.04/ /" | sudo tee /etc/apt/sources.list.d/security:zeek.list',
        'curl -fsSL https://download.opensuse.org/repositories/security:zeek/xUbuntu_24.04/Release.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/security_zeek.gpg > /dev/null',
        'sudo apt update && sudo apt install zeek'],
    after: 'Install it, then press Re-check. The packages install under /opt/zeek, which is found without changing the PATH.',
  },
];

let cache = new Map();
async function check(id) {
  const d = CATALOG.find((x) => x.id === id);
  if (!d) return null;
  const r = await d.detect();
  const out = { id: d.id, name: d.name, needed: d.needed, found: !!r.found, version: r.version || '', path: r.exe || '', root: r.root || '', install: d.install, after: d.after, checkedAt: new Date().toISOString() };
  cache.set(id, out);
  return out;
}
// Runs every check (Re-check on the page, and startup).
async function checkAll() { cache = new Map(); return Promise.all(CATALOG.map((d) => check(d.id))); }
// Cached result, running the check the first time it is needed.
async function status(id) { return cache.get(id) || check(id); }
const known = (id) => CATALOG.some((d) => d.id === id);
const name = (id) => CATALOG.find((d) => d.id === id)?.name || id;
// Synchronous view of the last check, for the places that build lists (workflow readiness). Unchecked counts as missing until checkAll ran.
const lastKnown = (id) => cache.get(id) || null;

// Which of the given ids are not installed (by the last check), as readable names.
const unmet = (ids = []) => ids.filter((id) => !lastKnown(id)?.found).map(name);
// The environment a dependency-needing tool is started with (e.g. DOTNET_ROOT for .NET tools).
function envFor(ids = []) {
  const env = {};
  for (const id of ids) {
    const s = lastKnown(id);
    if (id.startsWith('dotnet') && s?.root) { env.DOTNET_ROOT = s.root; env.DOTNET_SYSTEM_GLOBALIZATION_INVARIANT = '1'; env.DOTNET_ROLL_FORWARD = 'Major'; env.DOTNET_CLI_TELEMETRY_OPTOUT = '1'; env.DOTNET_NOLOGO = '1'; }
  }
  return env;
}
const dotnetExe = () => lastKnown('dotnet10')?.path || null;

module.exports = { CATALOG, check, checkAll, status, known, name, unmet, envFor, dotnetExe, lastKnown };
