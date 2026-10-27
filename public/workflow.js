// ---- Burrow: Workflow ----
// A workflow is a saved recipe that follows a hunt: the collections it is meant for, processing steps that run on the server over the files
// the hunt pulled back (Hayabusa and so on), (whether results go to Elastic is chosen per hunt). Attach one to a hunt with "Workflow" in New Hunt.
// Shipped workflows are read-only: Copy makes an editable one.
// Shares helpers with app.js: api, esc, $, toast, can, isActive, openHuntModal.
const wf = { workflows: [], processors: [], collections: null, open: new Set(), edit: null };

async function loadWorkflows() {
  try { const r = await api('GET', '/api/workflows'); wf.workflows = r.workflows; wf.processors = r.processors; } catch (e) { $('wfList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderWorkflows();
}
const wfParamText = (s) => Object.entries(s.params || {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(', ');

function renderProcessors() {
  $('wfProcs').innerHTML = wf.processors.length ? `<table class="bh"><thead><tr><th>Processor</th><th>Reads</th><th>Tool</th></tr></thead><tbody>${wf.processors.map((p) => `<tr>
      <td><b>${esc(p.name)}</b><div class="dim">${esc(p.description)}</div></td><td class="dim">${esc(p.accepts.join(', '))}</td>
      <td>${!p.supported ? '<span class="st-warn">Not available on this server</span>' : p.missing.length ? `<span class="st-warn">Needs ${p.missing.map(esc).join(', ')}</span> <a href="#settings/binaries">Upload</a>` : '<span class="ok">Ready</span>'}</td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No processors installed.</p>';
}
function wfItem(w) {
  const open = wf.open.has(w.id);
  const steps = w.steps.length ? `<ol class="wf-steps">${w.steps.map((s) => `<li><b>${esc(s.name)}</b>${wfParamText(s) ? ` <span class="dim">${wfParamText(s)}</span>` : ''}</li>`).join('')}</ol>` : '<p class="dim" style="margin:0">No steps.</p>';
  const body = !open ? '' : `<div class="lg-body rc-body">
      <div class="bd-facts"><div><span>Collects</span>${w.collectionNames.length ? w.collectionNames.map(esc).join(', ') : '<span class="dim">any collection you pick on the hunt</span>'}</div><div><span>Created by</span>${w.createdBy ? esc(w.createdBy) : w.builtin ? 'Kookaburrow' : '-'}</div></div>
      ${w.problems.length ? `<div class="hd-unmet">Cannot run:<ul class="wf-prob">${w.problems.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="hd-label">Steps</div>${steps}
      <div class="bd-btns" style="margin-top:8px"><button class="act" type="button" data-wf-run="${esc(w.id)}" data-perm="workflows.run" data-perm-what="run workflows">Run on a hunt</button>
        <button class="act sec" type="button" data-wf-copy="${esc(w.id)}" data-perm="workflows.manage" data-perm-what="copy workflows">Copy</button>
        ${w.builtin ? '' : `<button class="act sec" type="button" data-wf-edit="${esc(w.id)}" data-perm="workflows.manage" data-perm-what="edit workflows">Edit</button>`}</div>
    </div>`;
  return `<div class="lg-hunt ${open ? 'open' : ''}"><div class="lg-head wf-head" data-wf-toggle="${esc(w.id)}" role="button" tabindex="0" aria-expanded="${open}"><span class="chev">${open ? '▾' : '▸'}</span>
      <span class="lg-name">${esc(w.name)}</span><span class="badge grey wf-kind">${w.builtin ? 'Shipped' : 'Custom'}</span>
      <span class="dim wf-n">${w.steps.length} step${w.steps.length === 1 ? '' : 's'}</span>
      ${w.problems.length ? `<span class="st-warn wf-st" title="${esc(w.problems.join('; '))}">Cannot run</span>` : '<span class="ok wf-st">Ready</span>'}
      <span class="lg-btns wf-del">${w.builtin ? '' : `<a class="bad" data-wf-del="${esc(w.id)}" data-perm="workflows.manage" data-perm-what="delete workflows">Delete</a>`}</span>
      <span class="dim wf-desc" title="${esc(w.description || '')}">${esc(w.description || 'No description')}</span></div>${body}</div>`;
}
function renderWorkflows() {
  renderProcessors();
  $('wfList').innerHTML = wf.workflows.map(wfItem).join('') || '<p class="dim" style="margin:0">No workflows yet. Press New Workflow to create one.</p>';
}

$('wfList').onclick = async (e) => {
  const run = e.target.closest('[data-wf-run]'); if (run) { openHuntModal(null, run.dataset.wfRun); return; }
  const cp = e.target.closest('[data-wf-copy]'); if (cp) { const w = wf.workflows.find((x) => x.id === cp.dataset.wfCopy); if (w) wfOpenEditor({ ...w, id: null, name: `${w.name} (copy)`, builtin: false }); return; }
  const ed = e.target.closest('[data-wf-edit]'); if (ed) { const w = wf.workflows.find((x) => x.id === ed.dataset.wfEdit); if (w) wfOpenEditor(w); return; }
  const d = e.target.closest('[data-wf-del]');
  if (d) {
    const w = wf.workflows.find((x) => x.id === d.dataset.wfDel); if (!w) return;
    if (!confirm(`Delete the workflow "${w.name}"?`)) return;
    try { await api('DELETE', `/api/workflows/${w.id}`); loadWorkflows(); } catch (err) { toast(err.message, 'bad'); }
    return;
  }
  const head = e.target.closest('[data-wf-toggle]'); if (!head) return;
  const id = head.dataset.wfToggle;
  if (wf.open.has(id)) wf.open.delete(id); else wf.open.add(id);
  renderWorkflows();
};
$('wfList').onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-wf-toggle]')) { e.preventDefault(); e.target.click(); } };

// ---- the editor ----
const wfClose = () => { $('wfModal').hidden = true; };
const wfProc = (id) => wf.processors.find((p) => p.id === id);
function wfStepHtml(s, i) {
  const p = wfProc(s.processor);
  return `<div class="wf-step" data-i="${i}"><div class="hs-row"><select data-wf-proc>${wf.processors.map((x) => `<option value="${esc(x.id)}" ${x.id === s.processor ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <a class="bad" data-wf-rm="${i}">Remove</a></div>
    ${p ? p.parameters.map((d) => `<div class="hs-row"><span class="dim" style="min-width:150px">${esc(d.label)}</span>${d.options ? `<select data-wf-param="${esc(d.name)}">${d.options.map((o) => `<option ${((s.params || {})[d.name] ?? d.default) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input data-wf-param="${esc(d.name)}" type="text" value="${esc((s.params || {})[d.name] ?? d.default)}">`}</div>`).join('') : ''}</div>`;
}
function wfRenderEditor() {
  const e = wf.edit, producers = (wf.collections || []).filter((c) => (c.produces || []).length);
  const accepted = new Set(e.steps.flatMap((s) => wfProc(s.processor)?.accepts || []));
  $('wfColls').innerHTML = producers.length ? producers.map((c) => `<label class="wf-coll"><input type="checkbox" data-wf-coll="${esc(c.id)}" ${e.collectionIds.includes(c.id) ? 'checked' : ''}> ${esc(c.name)} <span class="dim">${esc(c.produces.join(', '))}${c.type === 'bash' ? ', Linux' : ''}</span></label>`).join('')
    : '<p class="dim" style="margin:0">No collection declares the files it produces.</p>';
  $('wfSteps').innerHTML = e.steps.map(wfStepHtml).join('') || '<p class="dim" style="margin:0">No steps yet. Add one to process what the hunt collects.</p>';
  const chosen = new Set(producers.filter((c) => e.collectionIds.includes(c.id)).flatMap((c) => c.produces));
  const warn = e.steps.length && chosen.size && ![...accepted].some((k) => chosen.has(k));
  $('wfWarn').innerHTML = warn ? '<div class="rs-adv warn">⚠ None of the chosen collections produce files these steps read.</div>' : '';
}
function wfOpenEditor(w) {
  wf.edit = w ? { id: w.id, name: w.name, description: w.description || '', collectionIds: [...w.collectionIds], steps: w.steps.map((s) => ({ processor: s.processor, params: { ...s.params } })) }
    : { id: null, name: '', description: '', collectionIds: [], steps: [] };
  $('wfTitle').textContent = wf.edit.id ? 'Edit workflow' : 'New workflow';
  $('wfName').value = wf.edit.name; $('wfDesc').value = wf.edit.description; $('wfMsg').textContent = '';
  $('wfSave').textContent = wf.edit.id ? 'Save' : 'Create';
  $('wfModal').hidden = false;
  (async () => {
    if (!wf.collections) { try { wf.collections = await api('GET', '/api/collections'); } catch { wf.collections = []; } }
    if (!wf.processors.length) { try { wf.processors = (await api('GET', '/api/workflows')).processors; } catch { /* shown empty */ } }
    wfRenderEditor();
  })();
  $('wfName').focus();
}
$('wfNew').onclick = () => wfOpenEditor(null);
$('wfX').onclick = $('wfCancel').onclick = wfClose;
$('wfModal').onclick = (e) => {
  if (e.target.id === 'wfModal') return wfClose();
  const rm = e.target.closest('[data-wf-rm]'); if (rm) { wf.edit.steps.splice(Number(rm.dataset.wfRm), 1); wfRenderEditor(); return; }
  if (e.target.id === 'wfAddStep') { const p = wf.processors[0]; if (!p) return; wf.edit.steps.push({ processor: p.id, params: Object.fromEntries(p.parameters.map((d) => [d.name, d.default])) }); wfRenderEditor(); }
};
$('wfModal').onchange = (e) => {
  const c = e.target.closest('[data-wf-coll]');
  if (c) { const s = new Set(wf.edit.collectionIds); if (c.checked) s.add(c.dataset.wfColl); else s.delete(c.dataset.wfColl); wf.edit.collectionIds = [...s]; wfRenderEditor(); return; }
  const step = e.target.closest('.wf-step');
  if (step) {
    const s = wf.edit.steps[Number(step.dataset.i)];
    if (e.target.matches('[data-wf-proc]')) { const p = wfProc(e.target.value); s.processor = p.id; s.params = Object.fromEntries(p.parameters.map((d) => [d.name, d.default])); wfRenderEditor(); }
    else if (e.target.matches('[data-wf-param]')) s.params[e.target.dataset.wfParam] = e.target.value;
    return;
  }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('wfModal').hidden) wfClose(); });
$('wfSave').onclick = async () => {
  const e = wf.edit; e.name = $('wfName').value; e.description = $('wfDesc').value;
  $('wfMsg').className = 'um-msg dim'; $('wfMsg').textContent = 'Saving…';
  try { await api(e.id ? 'PUT' : 'POST', e.id ? `/api/workflows/${e.id}` : '/api/workflows', { name: e.name, description: e.description, collectionIds: e.collectionIds, steps: e.steps }); }
  catch (err) { $('wfMsg').className = 'um-msg bad'; $('wfMsg').textContent = err.message; return; }
  wfClose(); loadWorkflows();
};

// ---- a hunt's workflow stages, shown in the hunt detail ----
function wfStagesHtml(r) {
  const w = r.workflow; if (!w) return '';
  const st = (s) => ({ queued: '<span class="dim">Waiting</span>', running: '<span class="st-run">Running</span>', ok: '<span class="ok">Done</span>', error: '<span class="bad">Failed</span>', cancelled: '<span class="st-warn">Cancelled</span>' }[s] || esc(s));
  return `<div class="hd-label">Workflow: ${esc(w.name)} <span class="dim">${esc({ running: 'running', done: 'done', completed_with_errors: 'done with errors', cancelled: 'cancelled', error: 'failed' }[w.status] || '')}</span></div>
    ${w.note ? `<p class="dim" style="margin:0">${esc(w.note)}</p>` : ''}${w.error ? `<div class="hd-unmet">${esc(w.error)}</div>` : ''}
    ${(w.stages || []).length ? `<table class="bh"><thead><tr><th>Host</th><th>Step</th><th>Input</th><th>Status</th><th class="num">Rows</th><th>Detail</th></tr></thead><tbody>${w.stages.map((s) => `<tr><td>${esc(s.host)} <span class="dim">${esc(s.address)}</span></td><td>${esc(s.processor)}</td><td class="dim">${esc(s.collection)}</td><td>${st(s.status)}</td><td class="num dim">${s.rows ?? ''}</td>
      <td class="dim">${s.error ? `<span class="bad">${esc(s.error)}</span>` : [s.files && s.files.length ? s.files.map((f) => `<span title="${esc(f.path)}">${esc(f.name)}</span>`).join(', ') : '', esc(s.note || ''), esc(s.destination || '')].filter(Boolean).join(' · ')}</td></tr>`).join('')}</tbody></table>` : ''}`;
}

if (isActive('burrow/workflow')) loadWorkflows();
