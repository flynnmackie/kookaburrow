const fs = require('fs');
const path = require('path');
const { id, save } = require('./store');
const collections = require('./collections');
const processors = require('./processors');
const elastic = require('./elastic');

// Post-processing for a hunt that has a workflow attached (src/workflows.js). It runs after the hunt has collected everything:
// for each host and each step, the step's processor runs over the raw artefacts the hunt pulled back that the processor accepts (a
// collection's $Produces), writes into <host folder>/processed/<processor>/, and, when the hunt sends to Elastic, sends the
// output on. The run keeps the state of every stage in run.workflow so the Hunt page can show it. A failed stage is recorded and
// logged; it never fails the hunt, and the other stages carry on.
const stamp = () => new Date().toISOString();

// The stages a hunt will have: one per host, step and matching collection that left raw files.
function plan(run, workflow) {
  const stages = [];
  workflow.steps.forEach((step, si) => {
    const proc = processors.get(step.processor);
    if (!proc) return;
    for (const r of run.results) {
      if (r.status !== 'ok' || !r.rawPath || !r.rawFiles) continue;
      const c = collections.resolveCollection(r.collectionId);
      if (!c || !(c.produces || []).some((k) => proc.accepts.includes(k))) continue;
      stages.push({ id: id(), step: si, processorId: proc.id, processor: proc.name, hostId: r.hostId, host: r.hostLabel, address: r.address, collection: r.collectionName, rawPath: r.rawPath, status: 'queued' });
    }
  });
  return stages;
}

async function postProcess({ run, folder, workflow, audit, signal, hostBase, hosts }) {
  const stages = plan(run, workflow);
  run.workflow = { id: workflow.id, name: workflow.name, status: 'running', stages: stages.map(({ rawPath, ...s }) => s), startedAt: stamp() };
  const state = (s) => run.workflow.stages.find((x) => x.id === s.id);
  save();
  audit.log({ kind: 'session', host: 'All hosts', action: 'Workflow started', artefact: workflow.name, outcome: 'ok', detail: stages.length ? `${stages.length} stage${stages.length === 1 ? '' : 's'} to run` : 'nothing the hunt collected matches a step, so there is nothing to process' });
  if (!stages.length) { Object.assign(run.workflow, { status: 'done', finishedAt: stamp(), note: 'Nothing to process: the hunt returned no files the steps accept.' }); save(); return; }

  let failed = 0;
  for (const s of stages) {
    const st = state(s), step = workflow.steps[s.step], proc = processors.get(s.processorId);
    if (signal.aborted) { st.status = 'cancelled'; continue; }
    Object.assign(st, { status: 'running', startedAt: stamp() }); save();
    const rawDir = path.join(folder.abs, ...s.rawPath.split('/'));
    const outRel = `${s.rawPath.split('/')[0]}/processed/${proc.id}`;
    const outputDir = path.join(folder.abs, ...outRel.split('/'));
    const unpackDir = path.join(folder.abs, s.rawPath.split('/')[0], 'processed', '_unpacked', s.id);
    audit.log({ kind: 'session', host: s.address, action: 'process', artefact: proc.name, outcome: 'started', detail: `input ${s.rawPath}` });
    try {
      const unpacked = await processors.unpackArchives(rawDir, unpackDir); // a collection that returns a .zip (KAPE)
      const r = await processors.run(proc, { inputDir: unpacked || rawDir, outputDir, params: step.params, signal });
      Object.assign(st, { status: 'ok', finishedAt: stamp(), seconds: r.seconds, note: r.note || '', files: r.files.map((f) => ({ name: f.name, size: f.size, rows: f.rows, path: `${outRel}/${f.name}` })), rows: r.files.reduce((n, f) => n + (f.rows || 0), 0) });
      audit.log({ kind: 'collect', host: s.address, action: 'processed', artefact: proc.name, outcome: st.rows ? 'ok' : 'ok (empty)', detail: `${st.rows} row${st.rows === 1 ? '' : 's'} in ${r.seconds}s → ${outRel}${r.note ? `; ${r.note}` : ''}` });
      if (run.sendElastic) {
        let queued = 0;
        const skipped = new Set();
        for (const f of r.files.filter((x) => x.format === 'csv' || x.format === 'zeek')) {
          // each Zeek log is its own index (conn, dns, http ...); everything else uses one index per processor
          const base = path.basename(f.name).replace(/\.[^.]+$/, '');
          const name = f.format === 'zeek' ? `${proc.name} ${base}` : proc.name;
          try {
            const sent = elastic.forwardFile({ run, collection: { id: `processor/${proc.id}`, name }, host: { hostLabel: s.host, address: s.address }, file: path.join(outputDir, ...f.name.split('/')), relName: `${outRel}/${f.name}`, timeColumn: f.timeColumn, timeUtc: f.timeUtc, timeEpoch: f.timeEpoch, format: f.format, workflow: { name: workflow.name, processor: proc.id } });
            if (sent.skipped) { skipped.add(sent.skipped); audit.log({ kind: 'warn', host: s.address, action: 'send to Elastic', artefact: proc.name, outcome: 'skipped', detail: `${f.name}: ${sent.skipped}` }); }
            else queued += sent.queued;
          } catch (e) { skipped.add(e.message); }
        }
        if (queued) { st.destination = `${queued.toLocaleString()} rows queued for Elastic${skipped.size ? `; not sent: ${[...skipped].join('; ')}` : ''}`; audit.log({ kind: 'evidence', host: s.address, action: 'send to Elastic', artefact: proc.name, outcome: 'queued', detail: st.destination }); }
        else if (skipped.size) st.destination = `not sent: ${[...skipped].join('; ')}`;
      }
    } catch (e) {
      if (e.cancelled) { st.status = 'cancelled'; st.finishedAt = stamp(); }
      else { failed++; Object.assign(st, { status: 'error', finishedAt: stamp(), error: String(e.message).slice(0, 300) }); audit.log({ kind: 'error', host: s.address, action: 'process', artefact: proc.name, outcome: 'error', detail: st.error }); }
    } finally {
      fs.rmSync(unpackDir, { recursive: true, force: true });
    }
    save();
  }
  Object.assign(run.workflow, { status: signal.aborted ? 'cancelled' : failed ? 'completed_with_errors' : 'done', finishedAt: stamp() });
  audit.log({ kind: 'session', host: 'All hosts', action: 'Workflow finished', artefact: workflow.name, outcome: failed ? 'errors' : signal.aborted ? 'cancelled' : 'ok', detail: `${run.workflow.stages.filter((x) => x.status === 'ok').length} of ${stages.length} stages ok` });
  save();
}

module.exports = { postProcess, plan };
