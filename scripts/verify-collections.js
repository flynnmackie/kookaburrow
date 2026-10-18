// Marks every collection and action currently on disk as verified by writing verified.json in
// collections/ and actions/. Run only for scripts you have reviewed: node scripts/verify-collections.js
const fs = require('fs');
const path = require('path');
const { collectionsDir, actionsDir } = require('../src/config');
const { hashText } = require('../src/collections');

for (const root of [collectionsDir, actionsDir]) {
  const out = {};
  for (const [type, ext] of [['powershell', '.ps1'], ['bash', '.sh']]) {
    const dir = path.join(root, type);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(ext)).sort()) {
      out[`${type}/${f}`] = hashText(fs.readFileSync(path.join(dir, f), 'utf8'));
    }
  }
  fs.writeFileSync(path.join(root, 'verified.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`Verified ${Object.keys(out).length} scripts in ${path.basename(root)}/`);
}
