// ---- Burrow: Respond ----
// The same page as Hunt, for actions instead of collections: previous responses on top, the one you click below, and a New Response
// dialog (Who / Actions / Name) with Rerun past response. An action changes the hosts it runs on, so the dialog asks you to confirm,
// and the values you type for an action's parameters are used for that run only (never stored or logged).
// Shares helpers with app.js: api, esc, $, toast, go, isActive, metaIcons, VERIFIED, highlight, bbFmt, huntStatus, huntElapsed, huntName.
const br = { runs: [], sel: null, tab: 'details' };
const BR_HINT = '<p class="dim" style="margin:0">Select a response to see its files, errors and downloads.</p>';
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
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td><td class="dim">${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</td><td class="dim">${esc(huntElapsed(r))}</td><td class="bh-del">${r.status === 'running' && !r.cancelRequested ? `<a class="dl bad" data-cancel="${esc(r.id)}" data-perm="actions.run" data-perm-what="cancel responses" title="Stop this run">Cancel</a> ` : ''}<a class="dl bad" data-del="${esc(r.id)}" data-perm="actions.run" data-perm-what="delete responses" title="Delete this response and its output folder">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No responses yet. Use New Response to run actions on your hosts.</p>';
}
async function showResponse(id) {
  br.sel = id; renderRespList();
  const r = br.runs.find((x) => x.id === id), box = $('brDetail'); if (!r) return;
  let events, files, notebook = '';
  try { [events, files, notebook] = await Promise.all([api('GET', `/api/responses/${id}/events`), api('GET', `/api/responses/${id}/files`), br.tab === 'notebook' ? bdNotebook(`/api/responses/${id}/data`) : '']); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (br.sel !== id) return;
  const rank = (f) => (f.folder === '' ? 0 : 1);
  files.sort((a, b) => rank(a) - rank(b) || a.folder.localeCompare(b.folder, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const keep = box.querySelector('.bd-json')?.scrollTop;
  box.innerHTML = bdRender({ kind: 'response', r, events, files, tab: br.tab, notebook });
  if (keep) box.querySelector('.bd-json').scrollTop = keep;
}
$('brList').onclick = async (e) => {
  const can = e.target.closest('[data-cancel]');
  if (can) { const r = br.runs.find((x) => x.id === can.dataset.cancel); if (r && await cancelRunUi(r, false)) loadRespond(); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = br.runs.find((x) => x.id === del.dataset.del);
    if (r && await confirmDeleteRun(r, `/api/responses/${r.id}`, 'response')) { if (br.sel === r.id) { br.sel = null; $('brDetail').innerHTML = BR_HINT; } loadRespond(); }
    return;
  }
  const tr = e.target.closest('.bh-row'); if (tr) showResponse(tr.dataset.id);
};
$('brDetail').onclick = async (e) => {
  const can = e.target.closest('[data-cancel]');
  if (can) { const r = br.runs.find((x) => x.id === can.dataset.cancel); if (r && await cancelRunUi(r, false)) loadRespond(); return; }
  const t = e.target.closest('[data-bdtab]');
  if (t) { br.tab = t.dataset.bdtab; showResponse(br.sel); return; }
  const p = e.target.dataset.evidence; if (!p) return;
  go('browse', 'files');
  loadBrowse(p);
};

// ---- New response dialog ----
// Who (groups and hosts) / Actions (the View Actions list, detail on the right) / Name (parameters, name, recurring switch).
const rm = { actions: [], hosts: [], lists: [], selA: new Set(), selH: new Set(), selL: new Set(), matches: null, type: 'powershell', shown: null, recurring: false, params: {}, quick: null, setP: new Set(), pShown: null };
const rmParams = makeParamsPane({ root: 'respModal', p: 'rm', st: rm, noun: 'action', items: () => rm.actions.filter((a) => rm.selA.has(a.id)), onRemove: (id) => rmUnpick(id) });
const rmEl = (s) => $('rm' + s);
// A group counts as picked while every one of its hosts is picked: clicking a group picks all its hosts, and taking one host out of it
// (here or on the Overview tab) makes the group neutral again while the others stay picked. The ids go to the server as listIds.
function rmSyncGroups() {
  rm.selL = new Set(rm.lists.filter((l) => l.hostIds.length && l.hostIds.every((i) => rm.selH.has(i))).map((l) => l.id));
}
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
  rmParams.render(); // the Parameters tab follows what is picked
}
// The search box and filters are the same as View Actions (makeFilter). A search or tag/dependency filter is answered by the server
// (rm.matches holds the ids that matched); picked actions stay picked even when a filter hides them.
const rmF = makeFilter({ box: $('rmTagFilter'), chips: $('rmChips'), search: $('rmSearch'), url: '/api/actions', noun: 'action', favKind: 'actions', getType: () => rm.type, onChange: (server) => (server ? rmQuery() : rmRenderActions()) });
async function rmQuery() {
  const qs = rmF.qs(), mine = rm.qn = (rm.qn || 0) + 1;
  try {
    const [list] = await Promise.all([qs ? api('GET', `/api/actions?${qs}`) : null, rmF.loadMeta()]);
    if (mine !== rm.qn) return; // a newer search is in flight
    rm.matches = list ? new Map(list.map((c) => [c.id, c.match])) : null;
  } catch (e) { rmEl('Msg').textContent = e.message; rmEl('Msg').className = 'bad'; }
  rmRenderActions();
}
function rmRenderActions() {
  const keep = (c) => (!rm.matches || rm.matches.has(c.id)) && rmF.keep(c);
  const shown = rm.actions.filter((c) => c.type === rm.type && keep(c));
  const tag = (m) => !m ? '' : [m.name && 'name', m.script && 'script'].filter(Boolean).join(' + ');
  document.querySelectorAll('#rmToggle button').forEach((b) => {
    b.classList.toggle('on', b.dataset.type === rm.type);
    b.textContent = (b.dataset.type === 'bash' ? 'Linux' : 'PowerShell') + (rmF.active() ? ` (${rm.actions.filter((c) => c.type === b.dataset.type && keep(c)).length})` : '');
  });
  rmEl('Actions').innerHTML = shown.map((c) => { const m = rm.matches?.get(c.id); return `<div class="collection-item ${c.id === rm.shown ? 'on' : ''} ${rm.selA.has(c.id) ? 'sel' : ''} ${c.missingDependencies.length ? 'blocked' : ''}" data-view="${esc(c.id)}" ${c.missingDependencies.length ? `aria-disabled="true" title="Required binary missing: ${esc(c.missingDependencies.join(', '))}"` : ''}>
      <div class="ci-main">${c.verified ? VERIFIED : ''}${rmF.favs.has(c.id) ? '<span class="fav on" title="One of your favourites">★</span>' : ''}<div class="hn">${esc(c.name)} ${m ? `<span class="mtag">${tag(m)}</span>` : ''}</div><div class="hd" title="${esc(c.description)}">${esc(c.description)}</div>
      <div class="hmeta">${metaIcons(c)}</div>${m && !m.name && m.line ? `<div class="hl">${esc(m.line)}</div>` : ''}</div></div>`; }).join('')
    || `<p class="dim" style="margin:6px 10px">No ${rmF.active() ? 'actions match.' : 'actions.'}</p>`;
}
// the X on the Parameters and Overview tabs: take an action out of the response
function rmUnpick(id) {
  rm.selA.delete(id); delete rm.params[id]; rm.setP.delete(id);
  rmSummary(); rmRenderActions();
  if (document.querySelector('#rmTabs .on')?.dataset.pane === 'name') rmRenderTargetList();
}
async function rmShow(id) {
  rm.shown = id;
  rmRenderActions();
  try {
    const h = await api('GET', `/api/actions/${id}`);
    if (id !== rm.shown) return;
    rmEl('Detail').innerHTML = `<button type="button" class="fav-btn ${rmF.favs.has(h.id) ? 'on' : ''}" data-fav="${esc(h.id)}" title="${rmF.favs.has(h.id) ? 'Remove from your favourites' : 'Add to your favourites'}" aria-pressed="${rmF.favs.has(h.id)}">${rmF.favs.has(h.id) ? '★' : '☆'}</button><div class="hd-name">${esc(h.name)}</div><div class="hd-file">${esc(h.id)}</div>${metaIcons(h, true)}
      <div class="hd-label hd-label-desc">Description</div><div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}</div>
      <div class="hd-label hd-label-dep">Parameters</div><div class="hd-deps">${h.parameters.length ? h.parameters.map((p) => `<span class="dep have">${esc(p)}${h.optionalParameters.includes(p) ? ' (optional)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-dep">Dependencies</div><div class="hd-deps">${h.dependencies.length ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-tags">Tags</div><div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-code">Action</div><pre class="code">${highlight(h.body, h.type)}</pre>`;
  } catch (e) { rmEl('Detail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function rmRenderTargets() {
  rmSyncGroups();
  rmEl('Groups').innerHTML = rm.lists.map((l) => `<div class="pick pk ${rm.selL.has(l.id) ? 'sel' : ''}" data-l="${esc(l.id)}">
      <span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No groups yet.</p>';
  rmEl('Hosts').innerHTML = rm.hosts.map((h) => `<div class="pick pk ${rm.selH.has(h.id) ? 'sel' : ''}" data-h="${esc(h.id)}">
      <span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No saved hosts yet.</p>';
}
function rmTab(name) {
  document.querySelectorAll('#rmTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === name));
  document.querySelectorAll('#respModal .hsec').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  rmEl('Run').hidden = name !== 'name'; rmEl('Next').hidden = name === 'name'; // Run Response is only on the last tab
  if (name === 'params') rmParams.render();
  if (name === 'name') { rmRenderTargetList(); rmEl('Name').focus(); }
}
// The hosts the response will run against: the ticked hosts plus every member of the ticked groups, each once.
function rmRenderTargetList() {
  const ids = new Set(rm.selH);
  for (const l of rm.lists) if (rm.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  const list = rm.hosts.filter((h) => ids.has(h.id));
  rmEl('TargetsHead').textContent = `Will run against ${list.length} host${list.length === 1 ? '' : 's'}`;
  rmEl('Targets').innerHTML = list.map((h) => `<div class="pick"><span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span><span class="proto-${h.protocol === 'ssh' ? 'ssh' : 'winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><button type="button" class="unpick" data-unpick-host="${esc(h.id)}" title="Remove this host from the response" aria-label="Remove">×</button></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No hosts selected yet. Choose them on the Who tab.</p>';
  // and what will run on them
  const items = rm.actions.filter((a) => rm.selA.has(a.id));
  rmEl('ItemsHead').textContent = `${items.length} action${items.length === 1 ? '' : 's'} to run`;
  rmEl('Items').innerHTML = items.map((a) => `<div class="pick"><span class="pn" title="${esc(a.description)}">${esc(a.name)}</span>${metaIcons(a)}<span class="pt">${a.type === 'bash' ? 'Linux' : 'PowerShell'}</span><button type="button" class="unpick" data-unpick="${esc(a.id)}" title="Remove this action from the response" aria-label="Remove">×</button></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No actions selected yet. Choose them on the Actions tab.</p>';
}
const RM_ORDER = ['who', 'act', 'params', 'name'];
rmEl('Next').onclick = () => { const cur = document.querySelector('#rmTabs .on')?.dataset.pane; rmTab(RM_ORDER[Math.min(RM_ORDER.indexOf(cur) + 1, RM_ORDER.length - 1)]); };
function rmSetRecurring(on) {
  rm.recurring = on;
  rmEl('Recurring').setAttribute('aria-checked', on);
  rmEl('RecurringLabel').textContent = `Recurring response: ${on ? 'On' : 'Off'}`;
  recToggle('rm', on);
}
// Quick mode (from the Shell tab): the dialog is for one host, so it has no Who tab, no Rerun and no recurring switch.
function rmQuickUi(host) {
  rm.quick = host || null;
  const q = !!host;
  $('rmTitle').textContent = q ? `Quick response · ${host.name || host.hostname}` : 'New response';
  rmEl('TabWho').hidden = q; rmEl('Rerun').hidden = q;
  rmEl('TabAct').querySelector('.hnum').textContent = q ? '1' : '2';
  rmEl('TabParams').querySelector('.hnum').textContent = q ? '2' : '3';
  rmEl('TabName').querySelector('.hnum').textContent = q ? '3' : '4';
  rmEl('Recurring').closest('.sw-row').hidden = q;
  rmEl('Run').textContent = q ? 'Run Quick Response' : 'Run Response';
}
async function openRespModal(quickHost) {
  rm.selA.clear(); rm.selH.clear(); rm.selL.clear(); rmF.reset(); rm.matches = null; rm.type = 'powershell'; rmParams.reset();
  rmQuickUi(quickHost);
  if (quickHost) { rm.selH.add(quickHost.id); rm.type = quickHost.protocol === 'ssh' ? 'bash' : 'powershell'; } // open on the host's own kind of actions
  rm.shown = null; rmEl('Detail').innerHTML = '<p class="dim">Click an action to see what it does.</p>';
  rmEl('Name').value = quickHost ? (quickHost.hostname || quickHost.name) : ''; rmEl('Msg').textContent = '';
  rmEl('Msg').className = ''; rmSetRecurring(false);
  rmTab(quickHost ? 'act' : 'who');
  $('respModal').hidden = false;
  try {
    [rm.actions, rm.hosts, rm.lists] = await Promise.all([api('GET', '/api/actions'), api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  } catch (e) { rmEl('Msg').textContent = e.message; rmEl('Msg').className = 'bad'; }
  rmF.loadMeta().catch(() => {}); rmRenderActions(); rmRenderTargets(); rmSummary();
}
const closeRespModal = () => { $('respModal').hidden = true; };
$('brNew').onclick = () => openRespModal();
$('rmCancel').onclick = closeRespModal;
$('rmClose').onclick = closeRespModal;
$('respModal').onclick = (e) => { if (e.target.id === 'respModal') closeRespModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('respModal').hidden && $('rerunRespModal').hidden) closeRespModal(); });
$('rmTabs').onclick = (e) => { const b = e.target.closest('button[data-pane]'); if (b) rmTab(b.dataset.pane); };
$('rmToggle').onclick = (e) => { if (e.target.dataset.type) { rm.type = e.target.dataset.type; rmF.tags = []; rmQuery(); } }; // tags differ between PowerShell and Linux
recInit('rm');
rmEl('Recurring').onclick = () => rmSetRecurring(!rm.recurring);
// the star on an action's detail: your favourites are the same ones as in View Actions, and show in every list
rmEl('Detail').onclick = async (e) => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  try {
    const fv = await api('PUT', '/api/favourites/actions', { id: b.dataset.fav, on: !rmF.favs.has(b.dataset.fav) });
    rmF.favs = new Set(fv.actions || []);
    rmF.render(); rmRenderActions(); rmShow(b.dataset.fav);
  } catch (err) { toast(err.message, 'bad'); }
};
$('rmItems').onclick = (e) => { const u = e.target.closest('[data-unpick]'); if (u) rmUnpick(u.dataset.unpick); };
$('rmActions').onclick = (e) => {
  const row = e.target.closest('[data-view]'); if (!row) return;
  const id = row.dataset.view, a = rm.actions.find((x) => x.id === id); if (!a) return;
  if (a.missingDependencies.length) { showMissingBinary(a); return; }
  if (rm.selA.has(id)) rm.selA.delete(id); else rm.selA.add(id); // a click adds it to the response, another takes it out
  rmSummary(); rmShow(id);
};
$('rmGroups').onclick = (e) => {
  const row = e.target.closest('[data-l]'), l = row && rm.lists.find((x) => x.id === row.dataset.l); if (!l) return;
  const ids = l.hostIds.filter((i) => rm.hosts.some((h) => h.id === i)); if (!ids.length) return;
  if (rm.selL.has(l.id)) ids.forEach((i) => rm.selH.delete(i)); else ids.forEach((i) => rm.selH.add(i));
  rmRenderTargets(); rmSummary();
};
$('rmHosts').onclick = (e) => {
  const row = e.target.closest('[data-h]'); if (!row) return;
  if (rm.selH.has(row.dataset.h)) rm.selH.delete(row.dataset.h); else rm.selH.add(row.dataset.h);
  rmRenderTargets(); rmSummary();
};
// the X on a host in the Overview tab: it is no longer picked, which also makes any group it was in neutral on the Who tab
$('rmTargets').onclick = (e) => {
  const u = e.target.closest('[data-unpick-host]'); if (!u) return;
  rm.selH.delete(u.dataset.unpickHost); rmRenderTargets(); rmSummary(); rmRenderTargetList();
};

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
  rm.selA = new Set(aids.filter((a) => rm.actions.some((x) => x.id === a))); rmParams.reset();
  const lostH = hostIds.size - rm.selH.size, lostA = aids.length - rm.selA.size;
  rm.shown = null; rmEl('Detail').innerHTML = '<p class="dim">Click an action to see what it does.</p>';
  rmEl('Name').value = `${huntName(r)}_rerun`;
  rmRenderTargets(); rmRenderActions(); rmSummary(); rmSetRecurring(false);
  const gone = [lostH && `${lostH} host${lostH === 1 ? ' is' : 's are'}`, lostA && `${lostA} action${lostA === 1 ? ' is' : 's are'}`].filter(Boolean).join(' and ');
  const needs = rmParams.any(); // parameter values are never kept, so they are set again
  rmEl('Msg').textContent = [gone && `${gone} no longer available and left out.`, needs && 'Set the parameters again on the Parameters tab.'].filter(Boolean).join(' ');
  rmEl('Msg').className = gone ? 'bad' : '';
  closeRerunResp(); rmTab(needs ? 'params' : 'name');
};

rmEl('Run').onclick = async () => {
  const msg = (t, cls) => { rmEl('Msg').textContent = t; rmEl('Msg').className = cls; };
  if (!rmCount()) { rmTab('who'); return msg('Select at least one host or group.', 'bad'); }
  if (!rm.selA.size) { rmTab('act'); return msg('Select at least one action.', 'bad'); }
  if (!rmEl('Name').value.trim()) { rmTab('name'); return msg('Give the response a name.', 'bad'); }
  const unset = rmParams.problem();
  if (unset) { rmTab('params'); rmParams.show(unset.id); return msg(`${unset.name}: its parameters are not set. Fill them in and press Set parameters.`, 'bad'); }
  const params = rmParams.values();
  const a = rm.selA.size, h = rmCount();
  if (!confirm(`Run ${a} action${a === 1 ? '' : 's'} on ${h} host${h === 1 ? '' : 's'}?\n\nActions change the hosts they run on.`)) return;
  const rec = rm.recurring ? recRead('rm') : null;
  if (rec?.error) { rmTab('name'); return msg(rec.error, 'bad'); }
  rmEl('Run').disabled = true;
  try {
    const run = await api('POST', '/api/responses', {
      name: rmEl('Name').value.trim(), actionIds: [...rm.selA], hostIds: [...rm.selH], listIds: [...rm.selL], params, schedule: rec?.schedule, quick: !!rm.quick,
    });
    closeRespModal();
    toast(`Response "${run.name}" started${rec ? ` and scheduled: ${rec.text.replace(/^Runs now, then /, '')}` : `. Output goes to ${run.outputPath}`}`);
    br.sel = run.id;
    await loadRespond();
    showResponse(run.id);
  } catch (e) { msg(e.message, 'bad'); }
  rmEl('Run').disabled = false;
};

if (isActive('burrow/respond')) loadRespond();
