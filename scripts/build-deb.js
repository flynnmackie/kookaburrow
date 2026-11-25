// Builds the Debian/Ubuntu package:  node scripts/build-deb.js   ->  build/kookaburrow_<version>_amd64.deb
// Needs Linux with dpkg-deb and Node.js. The package carries the app and its production node_modules; Node.js, Python 3 (with venv)
// and smbclient come from the distribution (Depends). The WinRM engine is built on the server by the postinst, so it matches that Python.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const build = path.join(root, 'build');
const pkg = path.join(build, 'deb');
const app = path.join(pkg, 'opt', 'kookaburrow');
const version = require('../package.json').version;
const arch = process.env.DEB_ARCH || 'amd64';
const run = (exe, args, opts = {}) => execFileSync(exe, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], ...opts });
const step = (m) => console.log(`\n== ${m}`);

if (process.platform !== 'linux') throw new Error('The .deb is built on Linux.');

step('Staging the program files');
fs.rmSync(pkg, { recursive: true, force: true });
fs.mkdirSync(app, { recursive: true });
for (const f of ['server.js', 'package.json', 'package-lock.json', 'README.md']) fs.copyFileSync(path.join(root, f), path.join(app, f));
for (const d of ['src', 'public', 'collections', 'actions', 'processors', 'docs', 'elastic', 'yara-rules']) if (fs.existsSync(path.join(root, d))) fs.cpSync(path.join(root, d), path.join(app, d), { recursive: true });
fs.mkdirSync(path.join(app, 'scripts'));
for (const f of ['install-setup.js', 'verify-collections.js', 'setup-winrm.js']) fs.copyFileSync(path.join(root, 'scripts', f), path.join(app, 'scripts', f));

step('Installing production dependencies');
run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: app });

step('Adding the service and package scripts');
const unitDir = path.join(pkg, 'lib', 'systemd', 'system');
fs.mkdirSync(unitDir, { recursive: true });
fs.copyFileSync(path.join(root, 'installer', 'linux', 'kookaburrow.service'), path.join(unitDir, 'kookaburrow.service'));
const ctl = path.join(pkg, 'DEBIAN');
fs.mkdirSync(ctl);
for (const f of ['postinst', 'prerm', 'postrm']) { fs.copyFileSync(path.join(root, 'installer', 'linux', f), path.join(ctl, f)); fs.chmodSync(path.join(ctl, f), 0o755); }
const kb = Math.ceil(Number(execFileSync('du', ['-sk', pkg]).toString().split(/\s/)[0]));
fs.writeFileSync(path.join(ctl, 'control'), [
  'Package: kookaburrow',
  `Version: ${version}`,
  'Section: admin',
  'Priority: optional',
  `Architecture: ${arch}`,
  'Maintainer: Kookaburrow <noreply@localhost>',
  'Depends: nodejs (>= 20), python3, python3-venv, smbclient, systemd',
  'Recommends: ca-certificates',
  `Installed-Size: ${kb}`,
  'Description: Kookaburrow threat hunting platform',
  ' Runs hunts and response actions on Windows (WinRM) and Linux (SSH) hosts,',
  ' stores the results and lets you compare, baseline and report on them.',
  ' smbclient is needed to pull large files from Windows hosts over SMB.',
  '',
].join('\n'));
// fix modes: directories 755, files 644 (scripts keep their bit), owned by root
run('find', [pkg, '-type', 'd', '-exec', 'chmod', '0755', '{}', '+']);
run('find', [pkg, '-type', 'f', '-not', '-path', '*/DEBIAN/*', '-not', '-name', '*.sh', '-exec', 'chmod', 'a-x,u+w,go-w', '{}', '+']);

step('Building the .deb');
const out = path.join(build, `kookaburrow_${version}_${arch}.deb`);
run('fakeroot', ['dpkg-deb', '--build', '--root-owner-group', '-Zxz', pkg, out]);
console.log(`\nBuilt ${out}`);
