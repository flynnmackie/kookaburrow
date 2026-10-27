const { db, save, id } = require('./store');
const collections = require('./collections');
const processors = require('./processors');

// Workflows (Burrow > Workflow): a saved recipe that follows a hunt. Collect artefacts, run server-side processors on them, send the
// results on. A workflow is attached to a hunt ("Workflow" on the Automation tab of the New Hunt dialog); when the hunt has collected everything,
// src/workflow-runner.js runs the steps.
//   id, name, description, createdBy, createdAt, builtin
//   collectionIds   the collections it is meant for (picked for you when the workflow is chosen on a hunt)
//   steps           [{ processor: 'hayabusa', params: { MinLevel: 'low' } }]   see processors/*.json
//   (where results go is decided per hunt, "Send results to Elastic" in the New Hunt dialog)
// Shipped workflows (builtin) are read-only; copy one to change it.
const err = (m, status = 400) => Object.assign(new Error(m), { status });

const DEFAULT_WORKFLOWS = [
  {
    id: 'hayabusa-timeline', name: 'Event Logs - Hayabusa Timeline', builtin: true,
    description: 'Exports the event logs and runs Hayabusa over them on the server. The hunt sends the detections to Elastic when it is set to.',
    collectionIds: ['powershell/event-logs-export.ps1'],
    steps: [{ processor: 'hayabusa', params: { MinLevel: 'informational' } }],
  },
  {
    id: 'evtxecmd-events', name: 'Event Logs - EvtxECmd Parse', builtin: true,
    description: 'Exports the event logs and parses them with EvtxECmd (Eric Zimmerman) into one CSV of normalised events. Needs EvtxECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/event-logs-export.ps1'],
    steps: [{ processor: 'evtxecmd', params: {} }],
  },
  {
    id: 'pecmd-prefetch', name: 'Prefetch - PECmd Parse', builtin: true,
    description: 'Collects the Prefetch files and parses them with PECmd (Eric Zimmerman): what ran, how often and when, plus a run timeline. Needs PECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/prefetch-collect.ps1'],
    steps: [{ processor: 'pecmd', params: {} }],
  },
  {
    id: 'recmd-registry', name: 'Registry - RECmd Kroll Batch', builtin: true,
    description: 'Collects the registry hives and parses them with RECmd (Eric Zimmerman) using the Kroll batch file: execution, persistence, user activity and system info. Needs RECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/registry-hives-collect.ps1'],
    steps: [{ processor: 'recmd', params: { Batch: 'Kroll_Batch.reb' } }],
  },
  {
    id: 'ez-triage', name: 'Triage - Eric Zimmerman Tools', builtin: true,
    description: 'Runs the core Windows triage collection, then parses the event logs (EvtxECmd), Prefetch (PECmd) and registry hives (RECmd). Needs EvtxECmd.zip, PECmd.zip, RECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/triage-windows-core.ps1'],
    steps: [{ processor: 'evtxecmd', params: {} }, { processor: 'pecmd', params: {} }, { processor: 'recmd', params: { Batch: 'Kroll_Batch.reb' } }],
  },
  {
    id: 'chainsaw-hunt', name: 'Event Logs - Chainsaw Hunt', builtin: true,
    description: 'Exports the event logs and hunts through them with Chainsaw (Sigma and Chainsaw rules). Needs chainsaw.zip.',
    collectionIds: ['powershell/event-logs-export.ps1'],
    steps: [{ processor: 'chainsaw', params: {} }],
  },
  {
    id: 'zircolite-sigma', name: 'Event Logs - Zircolite Sigma', builtin: true,
    description: 'Exports the event logs and matches Sigma rules with Zircolite into a CSV timeline. Needs zircolite.zip (Windows server) or zircolite-linux.zip.',
    collectionIds: ['powershell/event-logs-export.ps1'],
    steps: [{ processor: 'zircolite', params: {} }],
  },
  {
    id: 'jlecmd-jumplists', name: 'Jump Lists - JLECmd Parse', builtin: true,
    description: 'Collects the Jump List files and parses them with JLECmd (Eric Zimmerman). Needs JLECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/jumplists-collect.ps1'],
    steps: [{ processor: 'jlecmd', params: {} }],
  },
  {
    id: 'lecmd-lnk', name: 'Recent Files - LECmd Parse', builtin: true,
    description: 'Collects the Recent shortcut (.lnk) files and parses them with LECmd (Eric Zimmerman). Needs LECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/lnk-collect.ps1'],
    steps: [{ processor: 'lecmd', params: {} }],
  },
  {
    id: 'rbcmd-recyclebin', name: 'Recycle Bin - RBCmd Parse', builtin: true,
    description: 'Collects the Recycle Bin $I files and parses them with RBCmd (Eric Zimmerman). Needs RBCmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/recyclebin-collect.ps1'],
    steps: [{ processor: 'rbcmd', params: {} }],
  },
  {
    id: 'srumecmd-srum', name: 'SRUM - SrumECmd Parse', builtin: true,
    description: 'Collects SRUDB.dat and the SOFTWARE hive and parses them with SrumECmd (Eric Zimmerman). Needs SrumECmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/srum-collect.ps1'],
    steps: [{ processor: 'srumecmd', params: {} }],
  },
  {
    id: 'wxtcmd-timeline', name: 'Windows Timeline - WxTCmd Parse', builtin: true,
    description: 'Collects ActivitiesCache.db for every user and parses it with WxTCmd (Eric Zimmerman). Needs WxTCmd.zip and the .NET 10 runtime.',
    collectionIds: ['powershell/timeline-collect.ps1'],
    steps: [{ processor: 'wxtcmd', params: {} }],
  },
  {
    id: 'ez-execution', name: 'Execution - Amcache, Shimcache and ShellBags', builtin: true,
    description: 'Collects the registry hives and parses Amcache (AmcacheParser), Shimcache (AppCompatCacheParser) and ShellBags (SBECmd). Needs those three zips and the .NET 10 runtime.',
    collectionIds: ['powershell/registry-hives-collect.ps1'],
    steps: [{ processor: 'amcacheparser', params: {} }, { processor: 'appcompatcacheparser', params: {} }, { processor: 'sbecmd', params: {} }],
  },
  {
    id: 'ez-mft', name: 'Filesystem - MFT and USN Journal (KAPE)', builtin: true,
    description: 'Runs KAPE on the host (SANS Triage) and parses the collected $MFT and $J on the server with MFTECmd. Needs kape.zip, MFTECmd.zip and the .NET 10 runtime. The CSV is large.',
    collectionIds: ['powershell/kape-sans-triage.ps1'],
    steps: [{ processor: 'mftecmd', params: {} }],
  },
  {
    id: 'zeek-pcap', name: 'Network - Zeek on Packet Capture', builtin: true,
    description: 'Captures network traffic on the host and analyses it on the server with Zeek (conn, dns, http, ssl and more). Zeek must be installed on a Linux server.',
    collectionIds: ['powershell/network-packet-capture.ps1', 'bash/network-packet-capture.sh'],
    steps: [{ processor: 'zeek', params: {} }],
  },
];
// Shipped workflows are kept up to date from here on every start.
const shippedIds = new Set(DEFAULT_WORKFLOWS.map((d) => d.id));
const mine = db.workflows.filter((w) => !shippedIds.has(w.id));
db.workflows = [...DEFAULT_WORKFLOWS.map((d) => {
  const old = db.workflows.find((w) => w.id === d.id);
  return { ...d, stages: [], createdBy: null, createdAt: old ? old.createdAt : new Date().toISOString() };
}), ...mine];
save();

// Checks and normalises what the editor sends.
function clean(b, existingId) {
  const name = String(b.name || '').trim();
  if (!name) throw err('Give the workflow a name');
  if (name.length > 80) throw err('The name is too long (80 characters at most)');
  if (db.workflows.some((w) => w.id !== existingId && w.name.toLowerCase() === name.toLowerCase())) throw err('A workflow with that name already exists');
  const collectionIds = [...new Set(Array.isArray(b.collectionIds) ? b.collectionIds.map(String) : [])];
  const colls = collectionIds.map((cid) => { const c = collections.resolveCollection(cid); if (!c) throw err(`Unknown collection: ${cid}`); return c; });
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((s, i) => {
    const p = processors.get(String(s.processor || ''));
    if (!p) throw err(`Step ${i + 1}: unknown processor`);
    if (colls.length && !colls.some((c) => (c.produces || []).some((k) => p.accepts.includes(k)))) throw err(`Step ${i + 1}: ${p.name} reads ${p.accepts.join(', ')} files, which none of the chosen collections produce`);
    return { processor: p.id, params: processors.resolveParams(p, s.params || {}) };
  });
  return { name, description: String(b.description || '').trim().slice(0, 500), collectionIds, steps };
}

// What stops a workflow from running: a step's processor that is gone, has no tool for this server, or whose tool is not uploaded.
function problems(w) {
  const out = [];
  for (const s of w.steps || []) {
    const p = processors.get(s.processor);
    if (!p) { out.push(`${s.processor} is not installed`); continue; }
    const v = processors.view(p);
    if (!v.supported) out.push(`${p.name} has no tool for this server's operating system`);
    else {
      for (const m of v.missing) out.push(`${m} is not uploaded (Settings > External > Binaries)`);
      for (const m of v.missingSystem) out.push(`${m} is not installed on the server (Settings > External > Dependencies)`);
    }
  }
  return [...new Set(out)];
}
// Throws when the workflow cannot run, with the reasons, so a hunt is refused before it starts instead of failing afterwards.
function assertReady(w) {
  const p = problems(w);
  if (p.length) throw err(`The workflow "${w.name}" cannot run: ${p.join('; ')}`);
}

const view = (w) => ({
  id: w.id, name: w.name, description: w.description || '', builtin: !!w.builtin, collectionIds: w.collectionIds || [],
  collectionNames: (w.collectionIds || []).map((cid) => collections.resolveCollection(cid)?.name || cid),
  steps: (w.steps || []).map((s) => ({ processor: s.processor, name: processors.get(s.processor)?.name || s.processor, params: s.params || {} })),
  problems: problems(w), createdBy: w.createdBy || null, createdAt: w.createdAt,
});
const list = () => db.workflows.map(view);
const find = (wid) => db.workflows.find((w) => w.id === wid) || null;

function create(b, createdBy) {
  const w = { id: id(), ...clean(b), createdBy: createdBy || null, createdAt: new Date().toISOString() };
  db.workflows.push(w);
  save();
  return view(w);
}
function update(wid, b) {
  const w = find(wid);
  if (!w) throw err('Workflow not found', 404);
  if (w.builtin) throw err('This workflow ships with Kookaburrow and cannot be changed. Make a copy to change it.');
  Object.assign(w, clean(b, wid));
  save();
  return view(w);
}
function remove(wid) {
  const w = find(wid);
  if (!w) throw err('Workflow not found', 404);
  if (w.builtin) throw err('This workflow ships with Kookaburrow and cannot be deleted.');
  db.workflows = db.workflows.filter((x) => x.id !== wid);
  save();
}

module.exports = { list, find, create, update, remove, view, problems, assertReady };
