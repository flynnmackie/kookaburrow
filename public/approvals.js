// ---- Burrow: Approvals, and Settings > Approvals ----
// When an admin turns approvals on, "Run" on Respond sends a request instead of starting the response. Anyone with "Approve actions" sees every
// request here (others see their own), and approves or rejects it. Approving starts the response as the person who asked.
// Shares helpers with app.js: api, esc, $, toast, can, isActive, go, setSwitch.
const ap = { items: [], canApprove: false, sel: null, filter: 'pending', settings: null };
let apPoll;
const apWhen = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
const AP_STATUS = { pending: ['orange', 'Waiting'], approved: ['green', 'Approved'], rejected: ['red', 'Rejected'], cancelled: ['grey', 'Withdrawn'], expired: ['grey', 'Expired'] };
const apBadge = (s) => `<span class="badge ${AP_STATUS[s][0]}">${AP_STATUS[s][1]}</span>`;
const apEvery = (n) => (n % 1440 === 0 ? `${n / 1440} day${n === 1440 ? '' : 's'}` : n % 60 === 0 ? `${n / 60} hour${n === 60 ? '' : 's'}` : `${n} minute${n === 1 ? '' : 's'}`);

// The number of requests waiting, shown next to Burrow! and Approvals in the menus. Everyone who may run actions polls; approvers see all of them.
let apCount = 0;
function paintApprovalBadge() {
  const mark = (el) => { if (!el) return; el.querySelector(':scope > .nbadge')?.remove(); if (apCount > 0) el.insertAdjacentHTML('beforeend', `<span class="nbadge" title="${apCount} approval${apCount === 1 ? '' : 's'} waiting">${apCount}</span>`); };
  mark(document.querySelector('#topnav button[data-tab="burrow"]'));
  mark(document.querySelector('#sidenav button[data-tab="burrow"][data-page="approvals"]'));
}
async function pollApprovals() {
  if (!can('actions.approve,actions.run')) return;
  try { apCount = (await api('GET', '/api/approvals/count')).pending; } catch { return; }
  paintApprovalBadge();
}
setInterval(pollApprovals, 30000);
setTimeout(pollApprovals, 1500);

async function loadApprovals() {
  let r;
  try { r = await api('GET', '/api/approvals'); } catch (e) { $('apList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  ap.items = r.items; ap.canApprove = r.canApprove; ap.settings = r.settings;
  apCount = r.items.filter((a) => a.status === 'pending').length; paintApprovalBadge();
  $('apNote').innerHTML = !r.settings.enabled
    ? 'Approvals are <b>off</b>, so actions run straight away. Turn them on under <a href="#settings/approvals">Settings &gt; Approvals</a>.'
    : `${r.canApprove ? 'Every request to run an action is listed here.' : 'These are your own requests. You cannot approve them.'} ${r.settings.scope === 'all' ? 'Every action needs approval.' : `${r.settings.actionIds.length} action${r.settings.actionIds.length === 1 ? '' : 's'} need approval.`}`;
  if (ap.sel && !ap.items.some((a) => a.id === ap.sel)) { ap.sel = null; apDetailHint(); }
  apRenderList();
  if (ap.sel) apShow(ap.sel, true);
  clearTimeout(apPoll);
  if (isActive('burrow/approvals')) apPoll = setTimeout(loadApprovals, 10000);
}
const apDetailHint = () => { $('apDetail').innerHTML = '<p class="dim" style="margin:0">Click a request above to see what it will run, on which hosts, and to approve or reject it.</p>'; };
function apRenderList() {
  document.querySelectorAll('#apFilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === ap.filter));
  const rows = ap.items.filter((a) => ap.filter === 'all' || a.status === 'pending');
  $('apList').innerHTML = rows.length
    ? `<table class="bh"><thead><tr><th>Request</th><th>Asked by</th><th>Actions</th><th>Hosts</th><th>Asked</th><th>Status</th><th>${ap.filter === 'all' ? 'Decided by' : 'Expires'}</th></tr></thead><tbody>${rows.map((a) => `<tr class="bh-row ${a.id === ap.sel ? 'on' : ''}" data-id="${esc(a.id)}">
        <td class="bh-name">${esc(a.name)}${a.recurring ? ' <span class="badge grey">recurring</span>' : ''}</td><td>${a.requestedBy ? esc(a.requestedBy) : '<span class="dim">-</span>'}</td>
        <td>${esc(a.actions.map((x) => x.name).join(', '))}</td><td>${a.hosts.length}</td><td class="dim">${esc(apWhen(a.requestedAt))}</td><td>${apBadge(a.status)}</td>
        <td class="dim">${ap.filter === 'all' ? (a.decidedBy ? esc(a.decidedBy) : '-') : (a.expiresAt ? esc(apWhen(a.expiresAt)) : 'never')}</td></tr>`).join('')}</tbody></table>`
    : `<p class="dim" style="margin:0">${ap.filter === 'all' ? 'No requests yet.' : 'Nothing is waiting for approval.'}</p>`;
}
async function apShow(aid, quiet) {
  ap.sel = aid; if (!quiet) apRenderList();
  let a;
  try { a = await api('GET', `/api/approvals/${aid}`); } catch (e) { $('apDetail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (ap.sel !== aid) return;
  const note = $('apNoteBox')?.value || '';
  const mine = a.requestedBy === access.username, self = mine && !ap.settings?.selfApprove;
  const actions = a.actions.map((x) => {
    const vals = a.params?.[x.id];
    return `<div class="rc-item"><b>${esc(x.name)}</b><span class="dim">${x.type === 'bash' ? 'Linux' : 'PowerShell'} · footprint ${esc(x.footprint || '-')}</span><div class="dim">${esc(x.description)}</div>
      ${x.parameters.length ? `<div class="ap-params">${x.parameters.map((p) => `<span class="dep have">${esc(p)}${vals && p in vals ? ` = <b>${esc(vals[p])}</b>` : ''}</span>`).join('')}</div>` : ''}</div>`;
  }).join('');
  const decide = a.status === 'pending'
    ? `<div class="hd-label">Decision</div>
      ${ap.canApprove ? (self ? `<p class="dim" style="margin:0 0 8px">You asked for this yourself, so someone else has to approve it.</p>` : '') : '<p class="dim" style="margin:0 0 8px">Waiting for someone with <b>Approve actions</b>.</p>'}
      <div class="ap-decide">${ap.canApprove ? `<input id="apNoteBox" type="text" maxlength="300" placeholder="Note (optional, kept with the response)" autocomplete="off" value="${esc(note)}">
        <button class="act" type="button" data-ap="approve" ${self ? 'disabled title="You cannot approve your own request"' : ''}>Approve and run</button>
        <button class="act sec" type="button" data-ap="reject">Reject</button>` : ''}
        ${mine || ap.canApprove ? '<button class="act sec" type="button" data-ap="cancel">Withdraw</button>' : ''}</div>`
    : `<div class="hd-label">Decision</div><p style="margin:0">${apBadge(a.status)} ${a.decidedBy ? `by <b>${esc(a.decidedBy)}</b> ` : ''}${a.decidedAt ? `on ${esc(apWhen(a.decidedAt))}` : ''}${a.note ? ` · “${esc(a.note)}”` : ''}</p>
       ${a.runId ? `<p style="margin:8px 0 0"><a data-ap-run="${esc(a.runId)}" style="cursor:pointer">Open the response</a></p>` : ''}`;
  $('apDetail').innerHTML = `<div class="bd-head"><h2 style="margin:0">${esc(a.name)}</h2>${apBadge(a.status)}</div>
    <div class="bd-facts"><div><span>Asked by</span>${a.requestedBy ? esc(a.requestedBy) : '-'}</div><div><span>Asked</span>${esc(apWhen(a.requestedAt))}</div><div><span>Expires</span>${a.expiresAt ? esc(apWhen(a.expiresAt)) : 'never'}</div>
      <div><span>Hosts</span>${a.hosts.length}</div><div><span>Runs</span>${a.recurring ? `every ${esc(apEvery(a.recurring.everyMinutes))}, ${a.recurring.until.type === 'forever' ? 'until deleted' : `until ${esc(apWhen(a.recurring.until.at))}`}` : a.quick ? 'once (quick response)' : 'once'}</div></div>
    ${a.recurring ? '<div class="hd-warn" style="margin-top:8px">Approving this starts a recurring response. Its later runs do not ask again.</div>' : ''}
    <div class="hd-label">Actions (they change the hosts)</div><div class="rc-items">${actions}</div>
    <div class="hd-label">Hosts</div><div class="hd-deps">${a.groups.map((g) => `<span class="dep have">${esc(g)} (group)</span>`).join('')}${a.hosts.map((h) => `<span class="dep have">${esc(h.name)} · ${esc(h.address)}</span>`).join('')}</div>
    ${decide}<div class="um-msg" id="apMsg"></div>`;
}
$('apFilter').onclick = (e) => { const b = e.target.closest('button[data-f]'); if (!b) return; ap.filter = b.dataset.f; apRenderList(); };
$('apList').onclick = (e) => { const tr = e.target.closest('.bh-row'); if (tr) apShow(tr.dataset.id); };
$('apDetail').onclick = async (e) => {
  const run = e.target.closest('[data-ap-run]');
  if (run) { go('burrow', 'respond'); setTimeout(() => { br.sel = run.dataset.apRun; loadRespond().then(() => showResponse(br.sel)); }, 0); return; }
  const b = e.target.closest('[data-ap]'); if (!b || b.disabled) return;
  const verb = b.dataset.ap, note = $('apNoteBox')?.value.trim() || '';
  if (verb === 'approve' && !confirm('Approve and run this now? The actions change the hosts listed.')) return;
  if (verb === 'reject' && !confirm('Reject this request?')) return;
  b.disabled = true;
  try {
    const r = await api('POST', `/api/approvals/${ap.sel}/${verb}`, { note });
    toast(verb === 'approve' ? `Approved. "${r.run.name}" has started` : verb === 'reject' ? 'Request rejected' : 'Request withdrawn');
    await loadApprovals(); pollApprovals();
  } catch (err) { $('apMsg').textContent = err.message; $('apMsg').className = 'um-msg bad'; b.disabled = false; }
};

// ---- Settings > Approvals ----
const as = { settings: null, actions: [], chosen: new Set(), scope: 'all' };
function asRender() {
  const editable = can('system.manage'), s = as.settings;
  setSwitch('asEnabled', s.enabled);
  $('asEnabledLabel').textContent = `Approvals: ${s.enabled ? 'On' : 'Off'}`;
  $('asEnabledNote').textContent = s.enabled ? 'Running an action sends a request first' : 'Actions run as soon as they are started';
  $('asBody').classList.toggle('hs-off', !s.enabled);
  document.querySelectorAll('input[name=asScope]').forEach((r) => { r.checked = r.value === as.scope; r.disabled = !editable; });
  $('asActions').hidden = as.scope === 'all';
  $('asCount').hidden = $('asAll').hidden = $('asNone').hidden = as.scope === 'all';
  $('asCount').textContent = `${as.chosen.size} of ${as.actions.length} actions need approval`;
  $('asActions').innerHTML = as.actions.map((a) => `<label class="hs-host"><input type="checkbox" data-act="${esc(a.id)}" ${as.chosen.has(a.id) ? 'checked' : ''} ${editable ? '' : 'disabled'}><span class="hs-name">${esc(a.name)}</span><span class="hs-addr">${a.kind === 'bash' ? 'Linux' : 'PowerShell'}</span><span class="hs-os">${esc(a.footprint || '')}</span></label>`).join('');
  $('asSelf').disabled = $('asExpire').disabled = !editable;
  $('asExpireHint').textContent = Number($('asExpire').value) === 0 ? 'requests wait until someone decides' : 'hours, then an unanswered request expires';
}
async function loadApprovalSettings() {
  let r;
  try { [r, as.actions] = await Promise.all([api('GET', '/api/settings/approvals'), api('GET', '/api/actions')]); } catch (e) { $('asMsg').textContent = e.message; $('asMsg').className = 'um-msg bad'; return; }
  as.settings = r.settings; as.scope = r.settings.scope; as.chosen = new Set(r.settings.actionIds);
  as.actions = as.actions.slice().sort((a, b) => a.name.localeCompare(b.name));
  $('asSelf').checked = r.settings.selfApprove; $('asExpire').value = r.settings.expireHours;
  $('asMsg').textContent = ''; asRender();
}
const asGuard = () => (can('system.manage') ? true : (showDenied({ permission: 'system.manage', what: 'change approval settings' }), false));
const asSave = async (extra, done) => {
  try { await api('PUT', '/api/settings/approvals', { scope: as.scope, actionIds: [...as.chosen], selfApprove: $('asSelf').checked, expireHours: Number($('asExpire').value), ...extra }); toast(done); loadApprovalSettings(); }
  catch (e) { $('asMsg').textContent = e.message; $('asMsg').className = 'um-msg bad'; }
};
$('asEnabled').onclick = () => { if (asGuard()) asSave({ enabled: !as.settings.enabled }, `Approvals turned ${as.settings.enabled ? 'off' : 'on'}`); };
document.querySelectorAll('input[name=asScope]').forEach((r) => { r.onchange = () => { if (asGuard()) { as.scope = r.value; asRender(); } }; });
$('asActions').onchange = (e) => { const id = e.target.dataset.act; if (!id) return; e.target.checked ? as.chosen.add(id) : as.chosen.delete(id); asRender(); };
$('asAll').onclick = () => { if (asGuard()) { as.chosen = new Set(as.actions.map((a) => a.id)); asRender(); } };
$('asNone').onclick = () => { if (asGuard()) { as.chosen = new Set(); asRender(); } };
$('asExpire').oninput = asRender;
$('asSave').onclick = () => asSave({ enabled: as.settings.enabled }, 'Approval settings saved');

window.loadApprovals = loadApprovals;
window.loadApprovalSettings = loadApprovalSettings;
window.paintApprovalBadge = paintApprovalBadge;
