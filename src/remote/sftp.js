// SFTP pulls from Linux hosts (see src/large-transfer.js): one SSH connection for the folder listing and the downloads.
const { Client } = require('ssh2');
const { decrypt } = require('../crypto');
const { copyStream } = require('./copy');

function open(profile) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => conn.sftp((err, sftp) => {
      if (err) { conn.end(); reject(err); } else resolve({ conn, sftp });
    }));
    conn.on('error', reject);
    conn.connect({ host: profile.address, port: profile.port || 22, username: profile.username, password: profile.password ?? decrypt(profile.secret), readyTimeout: 15000 });
  });
}

// Every regular file under dir, as { path (relative, with /), size }.
async function list({ sftp }, dir) {
  const out = [];
  const readdir = (d) => new Promise((resolve, reject) => sftp.readdir(d, (e, l) => (e ? reject(e) : resolve(l))));
  const walk = async (d, rel) => {
    for (const e of await readdir(d)) {
      const r = rel ? `${rel}/${e.filename}` : e.filename;
      if (e.attrs.isDirectory()) await walk(`${d}/${e.filename}`, r);
      else if (e.attrs.isFile()) out.push({ path: r, size: e.attrs.size });
    }
  };
  await walk(dir, '');
  return out;
}

const fetch = ({ sftp }, remotePath, dest, onBytes) => copyStream(sftp.createReadStream(remotePath, { highWaterMark: 1024 * 1024 }), dest, onBytes);
const close = ({ conn }) => { try { conn.end(); } catch { /* closed */ } };

module.exports = { open, list, fetch, close };
