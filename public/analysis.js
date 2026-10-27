// ---- Results > Analysis: Cross-host comparison and Baseline ----
// (Diff is in browse.js and IOC in iocs.js; they share this group in the side menu.)
// Shares helpers with app.js: api, esc, $, toast, can, bbFmt, decorateLocks; browse.js: bbCellClass.

// ---- Cross-host comparison ----
// One CSV of a hunt across all its hosts. Every distinct row shows how many hosts have it; the least common rows come first.
const cp = { runs: [], files: [], res: null, filter: 'all', q: '', match: null, open: new Set() };
async function loadCompare() {
  try { cp.runs = await api('GET', '/api/compare/runs'); } catch (e) { $('cpOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const opt = (r) => `<option value="${esc(r.path)}">${esc(r.name)} · ${esc(new Date(r.startedAt).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}</option>`;
  const group = (kind, label) => { const l = cp.runs.filter((r) => r.kind === kind); return l.length ? `<optgroup label="${label}">${l.map(opt).join('')}</optgroup>` : ''; };
  const keep = $('cpRun').value;
  $('cpRun').innerHTML = `<option value="">Choose a run…</option>${group('hunt', 'Hunts')}${group('response', 'Responses')}`;
  if (keep) $('cpRun').value = keep;
  if (!cp.res) $('cpOut').innerHTML = cp.runs.length ? '<p class="dim" style="margin:0">Choose a run and a CSV (runs with 2+ hosts), then Compare. Rows with the fewest hosts come first.</p>' : '<p class="dim" style="margin:0">No run has results from two or more hosts yet.</p>';
}
$('cpRun').onchange = async () => {
  const run = $('cpRun').value;
  $('cpFile').innerHTML = '<option value="">Choose a CSV…</option>';
  if (!run) return;
  try { const r = await api('POST', '/api/compare/files', { path: run }); cp.files = r.files; $('cpFile').innerHTML = `<option value="">${r.files.length ? 'Choose a CSV…' : 'No CSV here came from more than one host'}</option>${r.files.map((f) => `<option value="${esc(f.key)}">${esc(f.key)} · ${f.hosts} of ${r.hosts} host${r.hosts === 1 ? '' : 's'}</option>`).join('')}`; } catch (e) { toast(e.message, 'bad'); }
};
async function cpCompare(keepMatch) {
  const path = $('cpRun').value, key = $('cpFile').value;
  if (!path || !key) { toast('Choose a run and a CSV', 'bad'); return; }
  $('cpOut').innerHTML = '<p class="dim" style="margin:0">Comparing…</p>';
  if (!keepMatch) { cp.match = null; cp.open.clear(); }
  try { cp.res = await api('POST', '/api/compare', { path, key, columns: cp.match }); } catch (e) { cp.res = null; $('cpOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (!cp.match) cp.match = cp.res.matchOn.slice();
  renderCompare();
}
const cpPass = (r, res) => {
  const n = res.hostsWith, c = r.count;
  if (cp.filter === 'one' && !(c === 1 && n > 1)) return false;
  if (cp.filter === 'rare' && !(c / n <= 0.1 && c < n)) return false;
  if (cp.filter === 'all-hosts' && c !== n) return false;
  if (cp.q && !r.values.some((v) => String(v).toLowerCase().includes(cp.q.toLowerCase())) && !r.hosts.some((h) => h.toLowerCase().includes(cp.q.toLowerCase()))) return false;
  return true;
};
function renderCompare() {
  const r = cp.res; if (!r) return;
  const n = r.hostsWith, count = (f) => r.rows.filter((x) => { const was = cp.filter; cp.filter = f; const ok = cpPass(x, r); cp.filter = was; return ok; }).length;
  const chip = (id, label) => `<button type="button" class="df-chip ${cp.filter === id ? 'on same' : ''}" data-cpf="${id}">${label} <b>${count(id)}</b></button>`;
  const rows = r.rows.filter((x) => cpPass(x, r)), cap = 1500;
  $('cpOut').innerHTML = `<div class="df-sum"><div><b>${esc(r.key)}</b> across <b>${n}</b> host${n === 1 ? '' : 's'}${r.hostsTotal > n ? ` <span class="dim">(${r.hostsTotal - n} of the run's ${r.hostsTotal} hosts have no such file)</span>` : ''}</div><div class="dim">${r.totalRows.toLocaleString()} distinct row${r.totalRows === 1 ? '' : 's'}${r.truncated ? ', the rarest 5,000 shown' : ''}</div></div>
    <div class="cp-match"><span class="dim">A row is the same when these columns match:</span> ${r.columns.map((c) => `<button type="button" class="tagchip ${cp.match.includes(c) ? 'on' : ''}" data-cpcol="${esc(c)}">${esc(c)}</button>`).join('')}<button type="button" class="act sec" id="cpApply" hidden>Apply</button></div>
    <div class="df-chips">${chip('all', 'All rows')}${chip('one', 'On one host only')}${chip('rare', 'Rare (10% of hosts or fewer)')}${chip('all-hosts', 'On every host')}<input type="search" id="cpQ" class="cp-q" placeholder="Filter rows or hosts" value="${esc(cp.q)}" autocomplete="off"></div>
    <div class="bb-tablewrap cp-wrap"><table class="bb-tbl cp-tbl"><thead><tr><th class="cp-hc">Hosts</th>${r.columns.map((c) => `<th class="${cp.match.includes(c) ? '' : 'cp-off'}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, cap).map((x, i) => {
      const pct = x.count / n, cls = n > 2 && x.count === 1 ? 'one' : pct <= 0.1 && x.count < n ? 'rare' : x.count === n ? 'all' : '';
      const open = cp.open.has(`${i}|${x.values.join('\u0001')}`);
      return `<tr class="cp-row ${cls}" data-cprow="${i}"><td class="cp-hc"><span class="cp-bar"><i style="width:${Math.max(4, Math.round(pct * 100))}%"></i></span><b>${x.count}</b> / ${n}</td>${r.columns.map((_, j) => `<td class="${bbCellClass(x.values[j])}" title="${esc(x.values[j] ?? '')}">${esc(x.values[j] ?? '')}</td>`).join('')}</tr>${open ? `<tr class="cp-hosts"><td colspan="${r.columns.length + 1}"><span class="dim">On:</span> ${x.hosts.map((h) => `<span class="tagchip on">${esc(h)}</span>`).join(' ')}</td></tr>` : ''}`;
    }).join('') || `<tr><td colspan="${r.columns.length + 1}" class="dim">No rows match.</td></tr>`}</tbody></table></div>${rows.length > cap ? `<p class="dim" style="margin:4px 0">Showing the first ${cap.toLocaleString()} of ${rows.length.toLocaleString()} rows. Use the filters to narrow it.</p>` : ''}`;
  cp.view = rows;
  const q = $('cpQ'); if (q && cp.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); cp.focusQ = false; }
}
$('cpOut').onclick = (e) => {
  const f = e.target.closest('[data-cpf]'); if (f) { cp.filter = f.dataset.cpf; renderCompare(); return; }
  const col = e.target.closest('[data-cpcol]');
  if (col) {
    const c = col.dataset.cpcol, i = cp.match.indexOf(c);
    if (i >= 0) { if (cp.match.length > 1) cp.match.splice(i, 1); } else cp.match.push(c);
    col.classList.toggle('on', cp.match.includes(c)); $('cpApply').hidden = false; return;
  }
  if (e.target.closest('#cpApply')) { cpCompare(true); return; }
  const tr = e.target.closest('.cp-row');
  if (tr && cp.view) { const x = cp.view[Number(tr.dataset.cprow)], k = `${tr.dataset.cprow}|${x.values.join('\u0001')}`; if (cp.open.has(k)) cp.open.delete(k); else cp.open.add(k); renderCompare(); }
};
$('cpOut').oninput = (e) => { if (e.target.id === 'cpQ') { cp.q = e.target.value; cp.focusQ = true; renderCompare(); } };
$('cpGo').onclick = () => cpCompare(false);

// ---- Baseline ----
// An initial scan the user uploads and keeps. Stored only for now; nothing compares against it yet.
const bl = { list: [] };
async function loadBaselines() {
  try { bl.list = await api('GET', '/api/baselines'); } catch (e) { $('blList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderBaselines();
}
function renderBaselines() {
  $('blList').innerHTML = bl.list.length ? `<table class="bh"><thead><tr><th>Name</th><th>File</th><th class="num">Size</th><th>SHA-256</th><th>Uploaded</th><th></th></tr></thead><tbody>${bl.list.map((b) => `<tr><td><b>${esc(b.name)}</b>${b.note ? `<div class="dim" style="font-size:11.5px">${esc(b.note)}</div>` : ''}</td><td class="dim">${esc(b.filename)}</td><td class="num dim">${bbFmt(b.size)}</td><td class="dim" title="${esc(b.sha256)}"><code>${esc(b.sha256.slice(0, 12))}…</code></td><td class="dim nw">${esc(b.uploadedBy || '')} · ${esc(new Date(b.at).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td><td class="bh-del"><a class="bad" data-bldel="${esc(b.id)}" data-perm="hunts.run" data-perm-what="delete baselines">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:10px 0 0">No baselines yet. Press Upload baseline to add the first one.</p>';
  decorateLocks($('blList'));
}
$('blList').onclick = async (e) => {
  const d = e.target.closest('[data-bldel]'); if (!d) return;
  const b = bl.list.find((x) => x.id === d.dataset.bldel);
  if (!confirm(`Delete the baseline "${b?.name}"? The stored file is removed.`)) return;
  try { await api('DELETE', `/api/baselines/${d.dataset.bldel}`); toast('Baseline deleted'); } catch (err) { toast(err.message, 'bad'); return; }
  loadBaselines();
};
const blSay = (t, cls = 'bad') => { $('blMsg').textContent = t; $('blMsg').className = `um-msg ${cls}`; };
$('blAdd').onclick = () => { $('blName').value = $('blNote').value = ''; $('blFile').value = ''; $('blFileName').textContent = 'A CSV, JSON or zip of the baseline scan (up to 200 MB)'; blSay(''); $('blSave').disabled = false; $('blModal').hidden = false; $('blName').focus(); };
const closeBl = () => { $('blModal').hidden = true; };
$('blX').onclick = $('blCancel').onclick = closeBl;
$('blModal').onclick = (e) => { if (e.target.id === 'blModal') closeBl(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('blModal').hidden) closeBl(); });
$('blFile').onchange = () => {
  const f = $('blFile').files[0]; if (!f) return;
  $('blFileName').textContent = `${f.name} (${bbFmt(f.size)})`;
  if (!$('blName').value.trim()) $('blName').value = f.name.replace(/\.[^.]+$/, '');
  blSay(f.size > 200 * 1024 * 1024 ? 'That file is over 200 MB' : '');
};
$('blSave').onclick = async () => {
  const f = $('blFile').files[0];
  if (!$('blName').value.trim()) return blSay('Give the baseline a name');
  if (!f) return blSay('Choose the scan file');
  if (f.size > 200 * 1024 * 1024) return blSay('That file is over 200 MB');
  blSay('Uploading…', 'dim'); $('blSave').disabled = true;
  try {
    const q = new URLSearchParams({ name: $('blName').value.trim(), note: $('blNote').value, filename: f.name });
    const r = await fetch(`/api/baselines?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/login.html'; return; }
    if (!r.ok) throw new Error(j.error || `Upload failed (${r.status})`);
    closeBl(); toast(`Baseline ${j.name} uploaded`); loadBaselines();
  } catch (e) { blSay(e.message); } finally { $('blSave').disabled = false; }
};
