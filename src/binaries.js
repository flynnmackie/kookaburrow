// Hunter-provided binaries live in binaries/. Each collection declares the ones it needs in
// $Dependencies; those names are the "slots" the UI shows. A slot is filled by uploading any
// file, which is stored under the slot's name.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { binariesDir } = require('./config');
const collections = require('./collections');

const MAX_BYTES = 500 * 1024 * 1024;

// Bare file names only: no separators, no leading dot, no traversal.
const isSafeName = (n) => typeof n === 'string' && n.length <= 100 && /^[A-Za-z0-9_][A-Za-z0-9_. -]*$/.test(n) && n === path.basename(n);

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// Every declared dependency (even if not uploaded yet) plus any stray files already in the folder.
function listBinaries() {
  const usedBy = new Map();
  for (const h of collections.listCollections()) {
    for (const dep of h.dependencies) {
      if (!usedBy.has(dep)) usedBy.set(dep, []);
      usedBy.get(dep).push({ id: h.id, name: h.name });
    }
  }
  fs.mkdirSync(binariesDir, { recursive: true });
  const onDisk = fs.readdirSync(binariesDir).filter((n) => isSafeName(n) && fs.statSync(path.join(binariesDir, n)).isFile());
  const names = [...new Set([...usedBy.keys(), ...onDisk])].sort((a, b) => a.localeCompare(b));
  return names.map((name) => {
    const file = path.join(binariesDir, name);
    const present = isSafeName(name) && fs.existsSync(file);
    const st = present ? fs.statSync(file) : null;
    return {
      name,
      usedBy: usedBy.get(name) || [],
      present,
      size: st?.size ?? null,
      modifiedAt: st?.mtime.toISOString() ?? null,
      sha256: present ? sha256(file) : null,
    };
  });
}

// Only names a collection asks for can be uploaded, so the folder cannot be filled with arbitrary files.
function saveBinary(name, data) {
  if (!isSafeName(name)) throw new Error('Invalid binary name');
  if (!collections.listCollections().some((h) => h.dependencies.includes(name))) throw new Error(`No collection requires "${name}"`);
  if (!Buffer.isBuffer(data) || !data.length) throw new Error('No file received');
  if (data.length > MAX_BYTES) throw new Error(`File is too large (the limit is ${MAX_BYTES / 1024 / 1024} MB)`);
  if (/\.(exe|dll|sys)$/i.test(name) && data.subarray(0, 2).toString('latin1') !== 'MZ') {
    throw new Error('That does not look like a Windows executable (missing MZ header)');
  }
  fs.mkdirSync(binariesDir, { recursive: true });
  const dest = path.join(binariesDir, name);
  const tmp = `${dest}.upload`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dest);
}

function removeBinary(name) {
  if (!isSafeName(name)) throw new Error('Invalid binary name');
  const file = path.join(binariesDir, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

// How many of the binaries the collections ask for have been uploaded (a count only: nothing is hashed, so it is cheap enough for the Home page).
function summary() {
  const declared = new Set(collections.listCollections().flatMap((h) => h.dependencies));
  const have = (n) => isSafeName(n) && fs.existsSync(path.join(binariesDir, n));
  const uploaded = [...declared].filter(have).length;
  return { uploaded, missing: declared.size - uploaded };
}

module.exports = { summary, listBinaries, saveBinary, removeBinary, MAX_BYTES };
