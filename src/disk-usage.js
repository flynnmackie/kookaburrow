const fs = require('fs');
const path = require('path');
const { home } = require('./config');

// How much disk Kookaburrow itself uses, for the Home page: the size of its root folder (everything under it), not of the whole drive.
// The root is the program folder; when the data home (KB_HOME, for example C:\ProgramData\Kookaburrow in the installed version) is a
// different folder, that is counted as well, and a folder inside another is not counted twice. Links are not followed.
// Measuring walks every file, which takes a few seconds on a big output folder, so it runs in the background: bytes() answers at once
// with the last figure (null before the first one is ready) and starts a new measurement when that one is over MAX_AGE_MS old.
const MAX_AGE_MS = 60 * 1000;
const inside = (p, root) => p === root || p.startsWith(root + path.sep);
function roots() {
  const app = path.resolve(__dirname, '..'), data = path.resolve(home);
  if (inside(data, app)) return [app];
  if (inside(app, data)) return [data];
  return [app, data];
}
async function size(dir) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
  const parts = await Promise.all(entries.map(async (e) => {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) return 0;
    if (e.isDirectory()) return size(p);
    if (!e.isFile()) return 0;
    try { return (await fs.promises.stat(p)).size; } catch { return 0; }
  }));
  return parts.reduce((a, b) => a + b, 0);
}

let last = { bytes: null, at: 0 }, running = false;
function refresh() {
  if (running) return;
  running = true;
  Promise.all(roots().map(size)).then((s) => { last = { bytes: s.reduce((a, b) => a + b, 0), at: Date.now() }; }).catch(() => {}).finally(() => { running = false; });
}
function bytes() {
  if (!running && Date.now() - last.at > MAX_AGE_MS) refresh();
  return last.bytes;
}

module.exports = { bytes, roots };
