// ---- Burrow: Respond ----
// The same page as Hunt, for actions instead of collections: previous responses on top, the one you click below, and a New Response
// dialog (Who / Actions / Name) with Rerun past response. An action changes the hosts it runs on, so the dialog asks you to confirm,
// and the values you type for an action's parameters are used for that run only (never stored or logged).
// Shares helpers with app.js: api, esc, $, toast, go, isActive, metaIcons, VERIFIED, highlight, bbFmt, huntStatus, huntElapsed, huntName.
const br = { runs: [], sel: null };
const BR_HINT = '<p class="dim" style="margin:0">Click a response above to see what it ran, its output files, any errors, and to download the results.</p>';
let respPoll;

async function loadRespond() {
  let runs = [];
  try { runs = await api('GET', '/api/responses'); } catch (e) { $('brList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  br.runs = runs;
  if (br.sel && !runs.some((r) => r.id === br.sel)) { br.sel = null; $('brDetail').innerHTML = BR_HINT; }
  renderRespList();
  clearTimeout(respPoll);
  if (br.sel && runs.find((r) => r.id === br.sel)?.status === 'running') showResponse(br.sel);
  if (runs.some((r) => r.status === 'running') && isActive('burrow/respond')) respPoll = setTimeout(loadRespond, 2000);
}
function renderRespList() {
  $('brList').innerHTML = br.runs.length
    ? `<table class="bh"><thead><tr><th>Response</th><th>Run by</th><th>Status</th><th>Started</th><th>Finished</th><th>Elapsed</th><th></th></tr></thead><tbody>${br.runs.map((r) => `<tr class="bh-row ${r.id === br.sel ? 'on' : ''}" data-id="${esc(r.id)}">
        <td class="bh-name">${esc(huntName(r))}${schedTag(r)}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td><td>${huntStatus(r)}</td>
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td><td class="dim">${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</td><td class="dim">${esc(huntElapsed(r))}</td><td class="bh-del"><a class="dl bad" data-del="${esc(r.id)}" data-perm="actions.run" data-perm-what="delete responses" title="Delete this response and its evidence folder">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No responses yet. Use New Response to run actions on your hosts.</p>';
}
async function showResponse(id) {
  br.sel = id; renderRespList();
  const r = br.runs.find((x) => x.id === id), box = $('brDetail'); if (!r) return;
  let events, files;
  try { [events, files] = await Promise.all([api('GET', `/api/responses/${id}/events`), api('GET', `/api/responses/${id}/files`)]); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (br.sel !== id) return;
  const rank = (f) => (f.folder === '' ? 0 : 1);
  files.sort((a, b) => rank(a) - rank(b) || a.folder.localeCompare(b.folder, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const hosts = new Set(r.results.map((x) => x.hostId)).size;
  const acts = [...new Map(r.results.map((x) => [x.actionId, x.actionName])).entries()].map(([aid, name]) => {
    const mine = r.results.filter((x) => x.actionId === aid), ok = mine.filter((x) => x.status === 'ok').length, bad = mine.filter((x) => x.status === 'error').length;
    const ps = (r.parameterNames || {})[aid] || [];
    return `<tr><td>${esc(name)}</td><td class="dim">${ps.length ? esc(ps.join(', ')) : '-'}</td><td>${ok} of ${mine.length}</td><td class="${bad ? 'bad' : 'dim'}">${bad}</td></tr>`;
  }).join('');
  const problems = events.filter((e) => e.kind === 'error' || e.kind === 'warn' || /^(error|warning|unconfirmed)/.test(e.outcome || ''));
  const dl = (path, text, cls = 'act sec') => `<a class="${cls}" href="/api/browse/download?path=${encodeURIComponent(path)}" download data-perm="hunts.export" data-perm-what="download response results">${text}</a>`;
  const json = files.find((f) => f.folder === '' && f.name === 'response.json');
  box.innerHTML = `<div class="bd-head"><div><div class="hd-name">${esc(huntName(r))}${schedTag(r)}</div><div class="hd-file">${esc(r.evidenceDir ? `evidence/${r.evidenceDir}` : 'No evidence folder')}</div></div>
      <div class="bd-btns">${r.evidenceDir ? `<a class="act" href="/api/runs/${esc(r.id)}/download" download data-perm="hunts.export" data-perm-what="download response results" title="The whole response folder as one zip file">Download all (zip)</a>` : ''}<a class="act sec" href="/api/runs/${esc(r.id)}/log.csv" download data-perm="hunts.export" data-perm-what="export logs">Download log (CSV)</a>${json ? dl(json.path, 'Download response.json') : ''}${r.evidenceDir ? `<a class="act sec" data-evidence="/evidence/${esc(r.evidenceDir)}">Open in Browse</a>` : ''}</div></div>
    <div class="bd-facts"><div><span>Status</span>${huntStatus(r)}</div><div><span>Run by</span>${r.startedBy ? esc(r.startedBy) : '-'}</div><div><span>Started</span>${esc(new Date(r.startedAt).toLocaleString())}</div>
      <div><span>Finished</span>${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</div><div><span>Elapsed</span>${esc(huntElapsed(r))}</div><div><span>Hosts</span>${hosts}</div></div>
    ${r.error ? `<div class="hd-unmet">${esc(r.error)}</div>` : ''}
    <div class="hd-label">Actions run</div>
    <table class="bh"><thead><tr><th>Action</th><th>Parameters</th><th>Hosts ok</th><th>Failed</th></tr></thead><tbody>${acts || '<tr><td colspan="4" class="dim">None</td></tr>'}</tbody></table>
    <div class="hd-label">Files pulled back <span class="dim">(${files.length})</span></div>
    ${files.length ? `<table class="bh"><thead><tr><th>Folder</th><th>File</th><th class="num">Size</th><th></th></tr></thead><tbody>${files.map((f) => `<tr><td class="dim">${esc(f.folder || '/')}</td><td>${esc(f.name)}</td><td class="num dim">${bbFmt(f.size)}</td><td class="num">${dl(f.path, 'Download', 'dl')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="dim" style="margin:0">${r.status === 'running' ? 'Nothing yet. Files appear as hosts finish.' : 'No files were saved.'}</p>`}
    <div class="hd-label">Error log <span class="dim">(${problems.length})</span></div>
    ${problems.length ? `<table class="bh"><thead><tr><th>Time</th><th>Host</th><th>Step</th><th>Action</th><th>Detail</th></tr></thead><tbody>${problems.map((e) => `<tr class="${e.kind === 'warn' ? 'st-warn' : 'bad'}"><td class="dim">${esc(new Date(e.t).toLocaleTimeString())}</td><td>${esc(e.host)}</td><td>${esc(e.action)}</td><td>${esc(e.artefact)}</td><td class="bh-wrap">${esc(e.detail)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="ok" style="margin:0">No errors.</p>'}`;
}
$('brList').onclick = async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = br.runs.find((x) => x.id === del.dataset.del);
    if (r && await confirmDeleteRun(r, `/api/responses/${r.id}`, 'response')) { if (br.sel === r.id) { br.sel = null; $('brDetail').innerHTML = BR_HINT; } loadRespond(); }
    return;
  }
  const tr = e.target.closest('.bh-row'); if (tr) showResponse(tr.dataset.id);
};
$('brDetail').onclick = (e) => {
  const p = e.target.dataset.evidence; if (!p) return;
  go('browse', 'files');
  loadBrowse(p);
};

// ---- New response dialog ----
// Who (groups and hosts) / Actions (the View Actions list, detail on the right) / Name (parameters, name, recurring switch).
const rm = { actions: [], hosts: [], lists: [], selA: new Set(), selH: new Set(), selL: new Set(), q: '', type: 'powershell', shown: null, recurring: false, params: {} };
const rmEl = (s) => $('rm' + s);
function rmCount() {
  const ids = new Set(rm.selH);
  for (const l of rm.lists) if (rm.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  return ids.size;
}
function rmSummary() {
  const a = rm.selA.size, h = rmCount();
  rmEl('Summary').textContent = `${a} action${a === 1 ? '' : 's'} · ${h} host${h === 1 ? '' : 's'}`;
  rmEl('TabWho').lastChild.textContent = h ? `Who (${h})` : 'Who';
  rmEl('TabAct').lastChild.textContent = a ? `Actions (${a})` : 'Actions';
}
function rmRenderActions() {
  const q = rm.q.toLowerCase(), inType = rm.actions.filter((c) => c.type === rm.type);
  const shown = inType.filter((c) => !q || [c.name, c.file, c.description, ...c.tags].some((s) => String(s).toLowerCase().includes(q)));
  document.querySelectorAll('#rmToggle button').forEach((b) => b.classList.toggle('on', b.dataset.type === rm.type));
  rmEl('Actions').innerHTML = shown.map((c) => `<div class="collection-item ${c.id === rm.shown ? 'on' : ''}" data-view="${esc(c.id)}">
      <input type="checkbox" data-a="${esc(c.id)}" ${rm.selA.has(c.id) ? 'checked' : ''} aria-label="Include ${esc(c.name)}">
      <div class="ci-main">${c.verified ? VERIFIED : ''}${metaIcons(c)}<div class="hn">${esc(c.name)}</div><div class="hd" title="${esc(c.description)}">${esc(c.description)}</div>
      ${c.tags.length ? `<div class="htags">${c.tags.map((t) => `<span class="htag">${esc(t)}</span>`).join('')}</div>` : ''}</div></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No actions match.</p>';
}
async function rmShow(id) {
  rm.shown = id;
  rmRenderActions();
  try {
    const h = await api('GET', `/api/actions/${id}`);
    if (id !== rm.shown) return;
    rmEl('Detail').innerHTML = `<div class="hd-name">${esc(h.name)}</div><div class="hd-file">${esc(h.id)}</div>${metaIcons(h, true)}
      <div class="hd-label hd-label-desc">Description</div><div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}</div>
      <div class="hd-label hd-label-dep">Parameters</div><div class="hd-deps">${h.parameters.length ? h.parameters.map((p) => `<span class="dep have">${esc(p)}${h.optionalParameters.includes(p) ? ' (optional)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-dep">Dependencies</div><div class="hd-deps">${h.dependencies.length ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-tags">Tags</div><div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-code">Action</div><pre class="code">${highlight(h.body, h.type)}</pre>`;
  } catch (e) { rmEl('Detail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function rmRenderTargets() {
  rmEl('Groups').innerHTML = rm.lists.map((l) => `<label class="pick"><input type="checkbox" data-l="${esc(l.id)}" ${rm.selL.has(l.id) ? 'checked' : ''}>
      <span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></label>`).join('')
    || '<p class="dim" style="margin:6px 10px">No groups yet.</p>';
  rmEl('Hosts').innerHTML = rm.hosts.map((h) => `<label class="pick"><input type="checkbox" data-h="${esc(h.id)}" ${rm.selH.has(h.id) ? 'checked' : ''}>
      <span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span></label>`).join('')
    || '<p class="dim" style="margin:6px 10px">No saved hosts yet.</p>';
}
// One input per parameter of each chosen action. Typed values live in rm.params while the dialog is open.
function rmRenderParams() {
  const chosen = rm.actions.filter((a) => rm.selA.has(a.id) && a.parameters.length);
  rmEl('Params').innerHTML = chosen.length
    ? `<span class="fl">Parameters</span>${chosen.map((a) => `<div class="rm-pa"><div class="rm-pn">${esc(a.name)}</div>${a.parameters.map((p) => `<label class="rm-prow"><span>${esc(p)}${a.optionalParameters.includes(p) ? ' <i class="dim">(optional)</i>' : ''}</span><input type="${/pass|secret|token|key/i.test(p) ? 'password' : 'text'}" data-pa="${esc(a.id)}" data-pp="${esc(p)}" value="${esc((rm.params[a.id] || {})[p] || '')}" autocomplete="off" spellcheck="false"></label>`).join('')}</div>`).join('')}`
    : '';
}
function rmTab(name) {
  document.querySelectorAll('#rmTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === name));
  document.querySelectorAll('#respModal .hsec').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === 'name') { rmRenderParams(); (rmEl('Params').querySelector('input') || rmEl('Name')).focus(); }
}
function rmSetRecurring(on) {
  rm.recurring = on;
  rmEl('Recurring').setAttribute('aria-checked', on);
  rmEl('RecurringLabel').textContent = `Recurring response: ${on ? 'On' : 'Off'}`;
  recToggle('rm', on);
}
async function openRespModal() {
  rm.selA.clear(); rm.selH.clear(); rm.selL.clear(); rm.q = ''; rm.type = 'powershell'; rm.params = {};
  rm.shown = null; rmEl('Detail').innerHTML = '<p class="dim">Click an action to see what it does.</p>';
  rmEl('Name').value = ''; rmEl('Search').value = ''; rmEl('Msg').textContent = '';
  rmEl('Msg').className = ''; rmSetRecurring(false);
  rmTab('who');
  $('respModal').hidden = false;
  try {
    [rm.actions, rm.hosts, rm.lists] = await Promise.all([api('GET', '/api/actions'), api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  } catch (e) { rmEl('Msg').textContent = e.message; rmEl('Msg').className = 'bad'; }
  rmRenderActions(); rmRenderTargets(); rmSummary();
}
const closeRespModal = () => { $('respModal').hidden = true; };
$('brNew').onclick = openRespModal;
$('rmCancel').onclick = closeRespModal;
$('rmClose').onclick = closeRespModal;
$('respModal').onclick = (e) => { if (e.target.id === 'respModal') closeRespModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('respModal').hidden && $('rerunRespModal').hidden) closeRespModal(); });
$('rmTabs').onclick = (e) => { const b = e.target.closest('button[data-pane]'); if (b) rmTab(b.dataset.pane); };
$('rmToggle').onclick = (e) => { if (e.target.dataset.type) { rm.type = e.target.dataset.type; rmRenderActions(); } };
recInit('rm');
rmEl('Recurring').onclick = () => rmSetRecurring(!rm.recurring);
$('rmActions').onclick = (e) => {
  const row = e.target.closest('[data-view]');
  if (row && !e.target.matches('input')) rmShow(row.dataset.view);
};
rmEl('Search').oninput = () => { rm.q = rmEl('Search').value.trim(); rmRenderActions(); };
$('respModal').onchange = (e) => {
  const d = e.target.dataset;
  if (d.pa) { (rm.params[d.pa] ||= {})[d.pp] = e.target.value; return; }
  const set = d.a ? [rm.selA, d.a] : d.h ? [rm.selH, d.h] : d.l ? [rm.selL, d.l] : null;
  if (!set) return;
  if (e.target.checked) set[0].add(set[1]); else set[0].delete(set[1]);
  rmSummary();
};
$('respModal').oninput = (e) => { const d = e.target.dataset; if (d.pa) (rm.params[d.pa] ||= {})[d.pp] = e.target.value; };

// Rerun past response: pick an earlier response and its hosts and actions are ticked and the name becomes "<name>_rerun". Parameter
// values are not kept anywhere, so they are typed again on the Name tab. Nothing runs until Run Response is pressed.
const rx = { runs: [], sel: null };
const closeRerunResp = () => { $('rerunRespModal').hidden = true; };
function rxRender() {
  $('rxList').innerHTML = rx.runs.length
    ? `<table class="bh"><thead><tr><th>Response</th><th>Run by</th><th>Status</th><th>Started</th><th>Hosts</th><th>Actions</th></tr></thead><tbody>${rx.runs.map((r) => `<tr data-id="${esc(r.id)}" class="${r.id === rx.sel ? 'on' : ''}">
        <td class="bh-name">${esc(huntName(r))}${schedTag(r)}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td><td>${huntStatus(r)}</td><td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td>
        <td>${new Set(r.results.map((x) => x.hostId)).size}</td><td>${esc((r.actionNames || [r.collectionName]).join(', '))}</td></tr>`).join('')}</tbody></table>`
    : '<p class="dim">No previous responses.</p>';
  $('rxUse').disabled = !rx.sel;
}
rmEl('Rerun').onclick = async () => {
  rx.sel = null; $('rxMsg').textContent = ''; $('rxList').innerHTML = '<p class="dim">Loading…</p>'; $('rerunRespModal').hidden = false;
  try { rx.runs = await api('GET', '/api/responses'); } catch (e) { $('rxList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  rxRender();
};
$('rxList').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { rx.sel = tr.dataset.id; rxRender(); } };
$('rxList').ondblclick = (e) => { if (e.target.closest('tr[data-id]')) $('rxUse').click(); };
$('rxClose').onclick = $('rxCancel').onclick = closeRerunResp;
$('rerunRespModal').onclick = (e) => { if (e.target.id === 'rerunRespModal') closeRerunResp(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('rerunRespModal').hidden) { e.stopImmediatePropagation(); closeRerunResp(); } }, true);
$('rxUse').onclick = () => {
  const r = rx.runs.find((x) => x.id === rx.sel); if (!r) return;
  const hostIds = new Set(r.results.map((x) => x.hostId)), aids = r.actionIds || [];
  rm.selH = new Set(rm.hosts.filter((h) => hostIds.has(h.id)).map((h) => h.id)); rm.selL.clear();
  rm.selA = new Set(aids.filter((a) => rm.actions.some((x) => x.id === a))); rm.params = {};
  const lostH = hostIds.size - rm.selH.size, lostA = aids.length - rm.selA.size;
  rm.shown = null; rmEl('Detail').innerHTML = '<p class="dim">Click an action to see what it does.</p>';
  rmEl('Name').value = `${huntName(r)}_rerun`;
  rmRenderTargets(); rmRenderActions(); rmSummary(); rmSetRecurring(false);
  const gone = [lostH && `${lostH} host${lostH === 1 ? ' is' : 's are'}`, lostA && `${lostA} action${lostA === 1 ? ' is' : 's are'}`].filter(Boolean).join(' and ');
  const needs = [...rm.selA].some((a) => rm.actions.find((x) => x.id === a)?.parameters.length);
  rmEl('Msg').textContent = [gone && `${gone} no longer available and left out.`, needs && 'Enter the parameter values again.'].filter(Boolean).join(' ');
  rmEl('Msg').className = gone ? 'bad' : '';
  closeRerunResp(); rmTab('name');
};

rmEl('Run').onclick = async () => {
  const msg = (t, cls) => { rmEl('Msg').textContent = t; rmEl('Msg').className = cls; };
  if (!rmCount()) { rmTab('who'); return msg('Select at least one host or group.', 'bad'); }
  if (!rm.selA.size) { rmTab('act'); return msg('Select at least one action.', 'bad'); }
  if (!rmEl('Name').value.trim()) { rmTab('name'); return msg('Give the response a name.', 'bad'); }
  const params = {};
  for (const a of rm.actions.filter((x) => rm.selA.has(x.id))) {
    for (const p of a.parameters) {
      const v = (rm.params[a.id] || {})[p];
      if (!v && !a.optionalParameters.includes(p)) { rmTab('name'); return msg(`${a.name}: enter a value for ${p}.`, 'bad'); }
      (params[a.id] ||= {})[p] = v || '';
    }
  }
  const a = rm.selA.size, h = rmCount();
  if (!confirm(`Run ${a} action${a === 1 ? '' : 's'} on ${h} host${h === 1 ? '' : 's'}?\n\nActions change the hosts they run on.`)) return;
  const rec = rm.recurring ? recRead('rm') : null;
  if (rec?.error) { rmTab('name'); return msg(rec.error, 'bad'); }
  rmEl('Run').disabled = true;
  try {
    const run = await api('POST', '/api/responses', {
      name: rmEl('Name').value.trim(), actionIds: [...rm.selA], hostIds: [...rm.selH], listIds: [...rm.selL], params, schedule: rec?.schedule,
    });
    closeRespModal();
    toast(`Response "${run.name}" started${rec ? ` and scheduled: ${rec.text.replace(/^Runs now, then /, '')}` : `. Output goes to ${run.evidenceDir}`}`);
    br.sel = run.id;
    await loadRespond();
    showResponse(run.id);
  } catch (e) { msg(e.message, 'bad'); }
  rmEl('Run').disabled = false;
};

if (isActive('burrow/respond')) loadRespond();
