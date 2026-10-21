// ---- Results: Report ----
// Generate an HTML report of any hunt or response (every host together). The reports already made are listed here to view in a new tab,
// download, make again (after more data came in) or delete. Shares helpers with app.js: api, esc, $, toast, isActive, huntName, huntStatus, bbFmt.
const rp = { reports: [], runs: [], sel: null };

async function loadReports() {
  try { rp.reports = await api('GET', '/api/reports'); } catch (e) { $('rpList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  $('rpList').innerHTML = rp.reports.length
    ? `<table class="bh"><thead><tr><th>Report</th><th>Type</th><th>Run by</th><th>Run started</th><th>Hosts</th><th>Generated</th><th class="num">Size</th><th></th></tr></thead><tbody>${rp.reports.map((r) => `<tr>
        <td class="bh-name">${esc(r.name)}</td><td>${r.kind === 'response' ? 'Response' : 'Hunt'}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td>
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td><td>${r.hosts}</td><td class="dim">${esc(new Date(r.generatedAt).toLocaleString())}</td><td class="num dim">${bbFmt(r.size)}</td>
        <td class="bh-del"><a class="dl" href="/api/runs/${esc(r.runId)}/report" target="_blank" rel="noopener" data-perm="hunts.export" data-perm-what="view reports">View</a> ·
          <a class="dl" href="/api/runs/${esc(r.runId)}/report?download=1" download data-perm="hunts.export" data-perm-what="download reports">Download</a> ·
          <a class="dl" data-regen="${esc(r.runId)}" data-perm="hunts.export" data-perm-what="generate reports" title="Make the report again from the run's current data">Regenerate</a> ·
          <a class="dl bad" data-delrep="${esc(r.runId)}" data-perm="hunts.run" data-perm-what="delete reports">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No reports yet. Use Generate report to make one from a hunt or response.</p>';
}
$('rpList').onclick = async (e) => {
  const regen = e.target.closest('[data-regen]'), del = e.target.closest('[data-delrep]');
  try {
    if (regen) { toast('Generating the report…'); await api('POST', `/api/runs/${regen.dataset.regen}/report`); toast('Report regenerated'); loadReports(); }
    else if (del) {
      const r = rp.reports.find((x) => x.runId === del.dataset.delrep);
      if (r && confirm(`Delete the report for "${r.name}"? The hunt or response and its other files are not affected.`)) { await api('DELETE', `/api/runs/${r.runId}/report`); loadReports(); }
    }
  } catch (err) { toast(err.message); }
};

// ---- Generate report: pick any hunt or response ----
const closeReportModal = () => { $('reportModal').hidden = true; };
function rpRender() {
  $('rpRuns').innerHTML = rp.runs.length
    ? `<table class="bh"><thead><tr><th>Name</th><th>Type</th><th>Run by</th><th>Status</th><th>Started</th><th>Hosts</th><th>What ran</th></tr></thead><tbody>${rp.runs.map((r) => {
      const running = r.status === 'running';
      return `<tr data-id="${esc(r.id)}" class="${r.id === rp.sel ? 'on' : ''} ${running ? 'rp-off' : ''}" title="${running ? 'Still running. Generate the report when it has finished.' : ''}">
        <td class="bh-name">${esc(huntName(r))}${schedTag(r)}</td><td>${r.kind === 'response' ? 'Response' : 'Hunt'}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td><td>${huntStatus(r)}</td>
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td><td>${new Set(r.results.map((x) => x.address)).size}</td><td>${esc((r.kind === 'response' ? r.actionNames : r.collectionNames || [r.collectionName]).join(', '))}</td></tr>`;
    }).join('')}</tbody></table>`
    : '<p class="dim">No hunts or responses have been run yet.</p>';
  $('rpMake').disabled = !rp.sel;
}
$('rpNew').onclick = async () => {
  rp.sel = null; $('rpMsg').textContent = ''; $('rpRuns').innerHTML = '<p class="dim">Loading…</p>'; $('reportModal').hidden = false;
  try { rp.runs = await api('GET', '/api/runs'); } catch (e) { $('rpRuns').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  rpRender();
};
$('rpRuns').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !tr.classList.contains('rp-off')) { rp.sel = tr.dataset.id; rpRender(); } };
$('rpRuns').ondblclick = (e) => { if (e.target.closest('tr[data-id]:not(.rp-off)')) $('rpMake').click(); };
$('rpClose').onclick = $('rpCancel').onclick = closeReportModal;
$('reportModal').onclick = (e) => { if (e.target.id === 'reportModal') closeReportModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('reportModal').hidden) closeReportModal(); });
$('rpMake').onclick = async () => {
  if (!rp.sel) return;
  $('rpMake').disabled = true; $('rpMsg').textContent = 'Generating…'; $('rpMsg').className = 'dim';
  try {
    await api('POST', `/api/runs/${rp.sel}/report`);
    closeReportModal(); toast('Report generated'); loadReports();
  } catch (e) { $('rpMsg').textContent = e.message; $('rpMsg').className = 'bad'; }
  $('rpMake').disabled = false;
};

if (isActive('output/report')) loadReports();
