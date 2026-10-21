const path = require('path');

module.exports = {
  host: process.env.KB_HOST || '127.0.0.1',
  port: Number(process.env.KB_PORT || 46200),
  dataDir: path.join(__dirname, '..', 'data'),
  collectionsDir: path.join(__dirname, '..', 'collections'),
  actionsDir: path.join(__dirname, '..', 'actions'),
  outputDir: path.join(__dirname, '..', 'output'), // what hunts and responses bring back (output/hunts, output/responses; see src/output.js)
  binariesDir: path.join(__dirname, '..', 'binaries'), // hunter-provided tools, staged on targets per run
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
