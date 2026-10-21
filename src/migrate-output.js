const fs = require('fs');
const path = require('path');
const { outputDir } = require('./config');
const { db, save } = require('./store');

// Runs made before the output/ layout (see src/output.js) lived in evidence/<date>-<name>/. At startup, evidence/ becomes output/,
// each of those folders moves under output/hunts/ or output/responses/, and the run's evidenceDir becomes outputPath. The files inside
// an old folder keep the layout they were written with.
function migrate() {
  const old = path.join(__dirname, '..', 'evidence');
  if (fs.existsSync(old) && !fs.existsSync(outputDir)) fs.renameSync(old, outputDir);
  fs.mkdirSync(path.join(outputDir, 'hunts'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'responses'), { recursive: true });
  let changed = false;
  for (const run of db.runs) {
    if (!('evidenceDir' in run)) continue;
    const dir = run.evidenceDir, group = run.kind === 'response' ? 'responses' : 'hunts';
    delete run.evidenceDir; changed = true;
    if (!dir || /[\\/]/.test(dir)) continue;
    const from = path.join(outputDir, dir), to = path.join(outputDir, group, dir);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.renameSync(from, to);
    if (fs.existsSync(to)) run.outputPath = `${group}/${dir}`;
  }
  if (changed) save();
}
module.exports = migrate;
