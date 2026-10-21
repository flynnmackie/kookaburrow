// Shared by the SMB and SFTP file pulls: where a pulled file lands on the server, and copying a stream to disk while hashing it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

// A path from a host (any separator) becomes a path under dir; "..", empty parts and characters Windows cannot store are dropped or replaced.
function localPath(dir, rel) {
  const parts = String(rel).split(/[\\/]+/).filter((p) => p && p !== '.' && p !== '..').map((p) => p.replace(/[<>:"|?*\x00-\x1f]/g, '_'));
  if (!parts.length) throw new Error('empty file name');
  return path.join(dir, ...parts);
}

// Writes src to dest, returning its size and SHA-256 as read (so a corrupted copy is caught by comparing with the host's hash).
async function copyStream(src, dest, onBytes) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const hash = crypto.createHash('sha256');
  let size = 0;
  src.on('data', (d) => { hash.update(d); size += d.length; if (onBytes) onBytes(d.length); });
  await pipeline(src, fs.createWriteStream(dest));
  return { size, sha256: hash.digest('hex') };
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const d of fs.createReadStream(file)) { hash.update(d); size += d.length; }
  return { size, sha256: hash.digest('hex') };
}

module.exports = { localPath, copyStream, hashFile };
