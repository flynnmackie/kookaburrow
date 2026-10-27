const path = require('path');

// KB_HOME moves everything the server writes (database, keys, results, uploaded tools) out of the program folder. The Windows installer
// sets it to C:ProgramDataKookaburrow so upgrades and uninstalls never touch collected data.
const home = process.env.KB_HOME ? path.resolve(process.env.KB_HOME) : path.join(__dirname, '..');

module.exports = {
  home,
  host: process.env.KB_HOST || '127.0.0.1',
  port: Number(process.env.KB_PORT || 46200),
  dataDir: path.join(home, 'data'),
  collectionsDir: path.join(__dirname, '..', 'collections'),
  actionsDir: path.join(__dirname, '..', 'actions'),
  outputDir: path.join(home, 'output'), // what hunts and responses bring back (output/hunts, output/responses; see src/output.js)
  binariesDir: path.join(home, 'binaries'), // hunter-provided tools, staged on targets per run
  publicDir: path.join(__dirname, '..', 'public'),
  scan: {
    ports: [22, 135, 445, 3389, 5985, 5986],
    timeoutMs: 800,
    concurrency: 256,
    maxHosts: 4096,
  },
  runConcurrency: 4,
  maxOutputBytes: 5 * 1024 * 1024,
  hostTimeoutMs: 10 * 60 * 1000,
  // Large-transfer collections (SMB / SFTP file pulls): how long one step may take, and how long to wait for SMB to come up or go down on a host.
  largeTimeoutMs: 6 * 60 * 60 * 1000,
  smbWaitMs: 45 * 1000,
};
