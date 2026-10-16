const path = require('path');

module.exports = {
  host: process.env.KB_HOST || '127.0.0.1',
  port: Number(process.env.KB_PORT || 46200),
  dataDir: path.join(__dirname, '..', 'data'),
  huntsDir: path.join(__dirname, '..', 'hunts'),
  actionsDir: path.join(__dirname, '..', 'actions'),
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
};
