// Finds the bundled WinRM engine (vendor/winrm-runtime, built by scripts/setup-winrm.js): a private Python with pypsrp.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..', '..', 'vendor', 'winrm-runtime');
const exe = process.platform === 'win32' ? path.join(root, 'python.exe') : path.join(root, 'bin', 'python');
const helper = path.join(__dirname, 'winrm_helper.py');
const env = { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' };

let cached = null;
// { ok, version, error }: does the bundled engine exist and import pypsrp? Cached after the first check unless force is true.
function check(force = false) {
  if (cached && !force) return cached;
  if (!fs.existsSync(exe)) return (cached = { ok: false, error: 'not installed (run: npm run setup-winrm)' });
  try {
    const v = execFileSync(exe, ['-c', 'import importlib.metadata as m, sys; print("pypsrp " + m.version("pypsrp") + ", Python " + sys.version.split()[0])'], { env: { ...process.env, ...env }, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return (cached = { ok: true, version: v });
  } catch (e) { return (cached = { ok: false, error: String(e.stderr || e.message).trim().split(/\r?\n/).pop() }); }
}
// How to start the helper, or null when the engine is not available.
const command = (args = []) => (check().ok ? { exe, args: ['-u', helper, ...args], env } : null);

module.exports = { check, command, root };
