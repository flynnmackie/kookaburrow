// ---- Burrow: Workflow ----
// Skeleton: save, list and delete workflows. Steps (collect, process, send) come later.
// Shares helpers with app.js: api, esc, $, toast, can.
let wfData = [];

async function loadWorkflows() {
  try { wfData = (await api('GET', '/api/workflows')).workflows; } catch (e) { $('wfList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderWorkflows();
}
function renderWorkflows() {
  $('wfList').innerHTML = wfData.length ? wfData.map((w) => `<div class="lg-hunt"><div class="lg-head rc-head">
      <span class="lg-name">${esc(w.name)}</span><span class="dim">${w.stages.length ? `${w.stages.length} step${w.stages.length === 1 ? '' : 's'}` : 'no steps yet'}</span>
      ${w.description ? `<span class="dim">${esc(w.description)}</span>` : ''}
      <span class="dim">${w.createdBy ? `by ${esc(w.createdBy)}, ` : ''}${esc(new Date(w.createdAt).toLocaleDateString())}</span>
      <span class="lg-btns"><a class="bad" data-wf-del="${esc(w.id)}" data-perm="workflows.manage" data-perm-what="delete workflows">Delete</a></span></div></div>`).join('')
    : '<p class="dim" style="margin:0">No workflows yet. Press New Workflow to create one.</p>';
}
$('wfList').onclick = async (e) => {
  const d = e.target.closest('[data-wf-del]'); if (!d) return;
  const w = wfData.find((x) => x.id === d.dataset.wfDel); if (!w) return;
  if (!confirm(`Delete the workflow "${w.name}"?`)) return;
  try { await api('DELETE', `/api/workflows/${w.id}`); loadWorkflows(); } catch (err) { toast(err.message, 'bad'); }
};
const wfClose = () => { $('wfModal').hidden = true; };
$('wfNew').onclick = () => { $('wfName').value = ''; $('wfDesc').value = ''; $('wfMsg').textContent = ''; $('wfModal').hidden = false; $('wfName').focus(); };
$('wfX').onclick = $('wfCancel').onclick = wfClose;
$('wfModal').onclick = (e) => { if (e.target.id === 'wfModal') wfClose(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('wfModal').hidden) wfClose(); });
$('wfModal').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('wfSave').click(); } };
$('wfSave').onclick = async () => {
  $('wfMsg').className = 'um-msg dim'; $('wfMsg').textContent = 'Saving\u2026';
  try { await api('POST', '/api/workflows', { name: $('wfName').value, description: $('wfDesc').value }); } catch (e) { $('wfMsg').className = 'um-msg bad'; $('wfMsg').textContent = e.message; return; }
  wfClose(); loadWorkflows();
};

if (isActive('burrow/workflow')) loadWorkflows();
