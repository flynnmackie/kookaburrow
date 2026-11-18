// ---- Monitor > Continuous: Watches and Events ----
// A watch repeats a few light collections every few minutes on its hosts and records only what changed (src/watch.js): a new listening
// port, a new service, a user that appeared, a process that stopped. It is a snapshot taken often, not an event stream, so something that
// starts and stops between two runs is missed. Events lists what was found, newest first.
// Shares helpers with app.js: api, esc, $, toast, can, decorateLocks, isActive, go.
const wc = { watches: [], presets: [], collections: [], every: [], max: 10, sel: null, hosts: [], lists: [], form: null };
let wcPoll;
const wcWhen = (t) => (t ? new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');
const wcAgo = (t) => { if (!t) return 'never'; const s = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 1000)); return s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };
const wcEvery = (n) => (n >= 1440 ? `${n / 1440} day` : n >= 60 ? `${n / 60} hour${n === 60 ? '' : 's'}` : `${n} minute${n === 1 ? '' : 's'}`);
const wcKind = { new: ['green', 'New'], gone: ['red', 'Gone'], changed: ['orange', 'Changed'], bulk: ['grey', 'Many'], unreachable: ['red', 'Unreachable'], recovered: ['green', 'Recovered'] };
const wcBadge = (k) => `<span class="badge ${wcKind[k][0]}">${wcKind[k][1]}</span>`;

// the number of events nobody has looked at, next to Monitor and Events in the menus
let wcUnseen = 0;
function paintWatchBadge() {
  const mark = (el) => { if (!el) return; el.querySelector(':scope > .nbadge.w')?.remove(); if (wcUnseen > 0) el.insertAdjacentHTML('beforeend', `<span class="nbadge w" title="${wcUnseen} event${wcUnseen === 1 ? '' : 's'} not looked at">${wcUnseen > 99 ? '99+' : wcUnseen}</span>`); };
  mark(document.querySelector('#topnav button[data-tab="health"]'));
  mark(document.querySelector('#sidenav button[data-tab="health"][data-page="events"]'));
}
async function pollWatch() {
  if (!can('hunts.view,system.view')) return;
  try { wcUnseen = (await api('GET', '/api/watch/count')).unseen; } catch { return; }
  paintWatchBadge();
}
setInterval(pollWatch, 30000); setTimeout(pollWatch, 2000);
window.paintWatchBadge = paintWatchBadge;

// ---- Watches ----
async function loadWatches() {
  let r;
  try { r = await api('GET', '/api/watch'); } catch (e) { $('wcList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  Object.assign(wc, { watches: r.watches, presets: r.presets, collections: r.collections, every: r.every, max: r.maxCollections }); wcUnseen = r.unseen; paintWatchBadge();
  if (wc.sel && !wc.watches.some((w) => w.id === wc.sel)) { wc.sel = null; $('wcDetail').innerHTML = WC_HINT; }
  renderWatches();
  if (wc.sel) renderWatchDetail();
  clearTimeout(wcPoll);
  if (isActive('health/watches')) wcPoll = setTimeout(loadWatches, wc.watches.some((w) => w.running) ? 2500 : 10000);
}
window.loadWatches = loadWatches;
const WC_HINT = '<p class="dim" style="margin:0">Select a watch to see its hosts, what it collects and what it has found.</p>';
function renderWatches() {
  const on = wc.watches.filter((w) => w.enabled).length;
  $('wcSum').innerHTML = wc.watches.length ? `<span>${on} running</span>${wcUnseen ? `<span class="rc-unseen">${wcUnseen} new event${wcUnseen === 1 ? '' : 's'}</span>` : ''}` : '';
  $('wcList').innerHTML = wc.watches.length ? `<table class="bh"><thead><tr><th>Watch</th><th>Hosts</th><th>Collects</th><th>Every</th><th>Status</th><th>Last run</th><th>Next run</th><th class="num">Events (24 h)</th><th></th></tr></thead><tbody>${wc.watches.map((w) => `<tr class="bh-row ${w.id === wc.sel ? 'on' : ''}" data-wcid="${esc(w.id)}">
      <td class="bh-name">${esc(w.name)}</td><td>${w.hosts.length}${w.groups.length ? ` <span class="dim">(${esc(w.groups.join(', '))})</span>` : ''}</td><td class="dim" title="${esc(w.collections.map((c) => c.name).join(', '))}">${w.collections.length} collection${w.collections.length === 1 ? '' : 's'}</td>
      <td>${esc(wcEvery(w.everyMinutes))}</td><td>${w.status === 'running' ? '<span class="badge orange">running</span>' : w.status === 'paused' ? '<span class="badge grey">paused</span>' : '<span class="badge green">watching</span>'}</td>
      <td class="dim">${esc(wcAgo(w.lastRun))}</td><td class="dim">${w.status === 'active' && w.nextRun ? esc(wcAgo(w.nextRun).replace(' ago', '')) : '-'}</td>
      <td class="num">${w.events24h ? `<b class="${w.unseen ? 'warn' : ''}">${w.events24h}</b>${w.unseen ? ` <span class="dim">(${w.unseen} new)</span>` : ''}` : '<span class="dim">0</span>'}</td>
      <td class="bh-del nw"><a data-wcrun="${esc(w.id)}" data-perm="hunts.run" data-perm-what="run watches" title="Collect now">Run now</a> <a data-wctoggle="${esc(w.id)}" data-perm="hunts.run" data-perm-what="pause watches">${w.enabled ? 'Pause' : 'Resume'}</a> <a data-wcedit="${esc(w.id)}" data-perm="hunts.run" data-perm-what="edit watches">Edit</a> <a class="bad" data-wcdel="${esc(w.id)}" data-perm="hunts.run" data-perm-what="delete watches">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:6px 0 0">No watches yet. Press <b>New Watch</b>, choose hosts and what to watch (processes, network, persistence, accounts), and it reports only what changes.</p>';
  decorateLocks($('wcList'));
}
async function renderWatchDetail() {
  const w = wc.watches.find((x) => x.id === wc.sel); if (!w) return;
  let ev = [];
  try { ev = (await api('GET', `/api/watch/events?watch=${w.id}&limit=25`)).events; } catch { /* shown empty */ }
  const hostHtml = w.hosts.map((h) => `<div class="wc-host ${h.status}"><div class="wc-hhead"><b>${esc(h.name)}</b> <span class="dim">${esc(h.address)} · ${h.os === 'linux' ? 'Linux' : 'Windows'}</span>${h.status === 'error' ? `<span class="badge red" title="${esc(h.error)}">not answering</span>` : h.status === 'waiting' ? '<span class="badge grey">waiting for the first run</span>' : '<span class="badge green">ok</span>'}<span class="dim" style="margin-left:auto">${esc(wcAgo(h.lastRun))}</span></div>
      ${h.error ? `<div class="wc-err">${esc(h.error)}</div>` : ''}
      <div class="wc-colls">${h.collections.map((c) => `<span class="dep ${c.error ? 'miss' : 'have'}" title="${esc(c.error || (c.baseline ? 'Baseline taken on the first run' : ''))}">${esc(c.name)}${c.rows != null ? ` · ${c.rows} rows` : ''}${c.error ? ' · failed' : ''}</span>`).join('') || '<span class="dim">Nothing chosen applies to this host</span>'}</div></div>`).join('');
  $('wcDetail').innerHTML = `<div class="bd-head"><h2 style="margin:0">${esc(w.name)}</h2><span class="dim">${w.description ? esc(w.description) : ''}</span></div>
    <div class="bd-facts"><div><span>Runs every</span>${esc(wcEvery(w.everyMinutes))}</div><div><span>Last run</span>${esc(wcWhen(w.lastRun))}</div><div><span>Next run</span>${w.status === 'active' && w.nextRun ? esc(wcWhen(w.nextRun)) : '-'}</div><div><span>Created by</span>${w.createdBy ? esc(w.createdBy) : '-'}</div></div>
    ${w.lastError ? `<div class="hd-warn" style="margin-top:8px">${esc(w.lastError)}</div>` : ''}
    <div class="hd-label">Hosts</div>${hostHtml || '<p class="dim">None of its hosts exist any more.</p>'}
    <div class="hd-label">Latest events</div>${ev.length ? wcEventTable(ev, false) : '<p class="dim" style="margin:0">Nothing has changed since the first run (which only takes the baseline).</p>'}`;
}
$('wcList').onclick = async (e) => {
  const run = e.target.closest('[data-wcrun]');
  if (run) { e.stopPropagation(); try { await api('POST', `/api/watch/${run.dataset.wcrun}/run`); toast('Collecting now'); } catch (err) { toast(err.message, 'bad'); } loadWatches(); return; }
  const tg = e.target.closest('[data-wctoggle]');
  if (tg) { e.stopPropagation(); const w = wc.watches.find((x) => x.id === tg.dataset.wctoggle); try { await api('PUT', `/api/watch/${w.id}`, { enabled: !w.enabled }); toast(w.enabled ? 'Paused' : 'Watching again'); } catch (err) { toast(err.message, 'bad'); } loadWatches(); return; }
  const ed = e.target.closest('[data-wcedit]'); if (ed) { e.stopPropagation(); wcOpenForm(wc.watches.find((x) => x.id === ed.dataset.wcedit)); return; }
  const del = e.target.closest('[data-wcdel]');
  if (del) { e.stopPropagation(); const w = wc.watches.find((x) => x.id === del.dataset.wcdel); if (!confirm(`Delete the watch "${w.name}"? Its events and snapshots are removed.`)) return; try { await api('DELETE', `/api/watch/${w.id}`); toast('Watch deleted'); } catch (err) { toast(err.message, 'bad'); } if (wc.sel === w.id) { wc.sel = null; $('wcDetail').innerHTML = WC_HINT; } loadWatches(); return; }
  const tr = e.target.closest('.bh-row'); if (tr) { wc.sel = tr.dataset.wcid; renderWatches(); renderWatchDetail(); }
};
$('wcNew').onclick = () => wcOpenForm(null);

// ---- New / edit watch ----
async function wcOpenForm(w) {
  if (!wc.hosts.length || !wc.lists.length) { try { [wc.hosts, wc.lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]); } catch { wc.hosts = wc.hosts || []; } }
  wc.form = { id: w ? w.id : null, hostIds: new Set(w ? w.hostIds : []), listIds: new Set(w ? w.listIds : []), colls: new Set(w ? w.collectionIds : []), q: '' };
  $('wcTitle').textContent = w ? 'Edit watch' : 'New watch';
  $('wcName').value = w ? w.name : ''; $('wcDesc').value = w ? w.description : '';
  $('wcEvery').innerHTML = wc.every.map((n) => `<option value="${n}" ${n === (w ? w.everyMinutes : 5) ? 'selected' : ''}>${esc(wcEvery(n))}</option>`).join('');
  $('wcMsg').textContent = ''; $('wcSave').disabled = false; $('wcQ').value = '';
  wcRenderForm(); $('wcModal').hidden = false; $('wcName').focus();
}
function wcRenderForm() {
  const f = wc.form, q = f.q.toLowerCase();
  $('wcHosts').innerHTML = wc.lists.map((l) => `<label class="hs-host"><input type="checkbox" data-wclist="${esc(l.id)}" ${f.listIds.has(l.id) ? 'checked' : ''}><span class="hs-name">${esc(l.name)}</span><span class="hs-addr">group · ${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></label>`).join('')
    + wc.hosts.map((h) => `<label class="hs-host"><input type="checkbox" data-wchost="${esc(h.id)}" ${f.hostIds.has(h.id) ? 'checked' : ''}><span class="hs-name">${esc(h.name || h.hostname || h.address)}</span><span class="hs-addr">${esc(h.address)}</span><span class="${h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span></label>`).join('') || '<p class="dim" style="margin:8px 10px">No saved hosts yet.</p>';
  $('wcPresets').innerHTML = wc.presets.map((p) => { const on = p.collections.every((c) => f.colls.has(c)); return `<button type="button" class="df-chip ${on ? 'on same' : ''}" data-wcpreset="${esc(p.id)}" title="${esc(p.description)}">${esc(p.name)}</button>`; }).join('');
  const list = wc.collections.filter((c) => !q || `${c.name} ${c.tags.join(' ')}`.toLowerCase().includes(q));
  const grp = (type, label) => { const l = list.filter((c) => c.type === type); return l.length ? `<div class="wc-gh">${label}</div>${l.map((c) => `<label class="hs-host" title="${esc(c.description)}"><input type="checkbox" data-wccoll="${esc(c.id)}" ${f.colls.has(c.id) ? 'checked' : ''}><span class="hs-name">${esc(c.name)}</span><span class="hs-addr">${esc(c.tags.slice(0, 3).join(', '))}</span></label>`).join('')}` : ''; };
  $('wcColls').innerHTML = grp('powershell', 'Windows (PowerShell)') + grp('bash', 'Linux (bash)') || '<p class="dim" style="margin:8px 10px">Nothing matches.</p>';
  $('wcCount').textContent = `${f.colls.size} of ${wc.max} chosen · ${f.hostIds.size + f.listIds.size ? `${f.hostIds.size} host${f.hostIds.size === 1 ? '' : 's'}${f.listIds.size ? ` and ${f.listIds.size} group${f.listIds.size === 1 ? '' : 's'}` : ''}` : 'no hosts chosen'}`;
}
$('wcHosts').onchange = (e) => { const f = wc.form, h = e.target.dataset.wchost, l = e.target.dataset.wclist; if (h) (e.target.checked ? f.hostIds.add(h) : f.hostIds.delete(h)); if (l) (e.target.checked ? f.listIds.add(l) : f.listIds.delete(l)); wcRenderForm(); };
$('wcColls').onchange = (e) => { const c = e.target.dataset.wccoll; if (c) (e.target.checked ? wc.form.colls.add(c) : wc.form.colls.delete(c)); wcRenderForm(); };
$('wcPresets').onclick = (e) => { const b = e.target.closest('[data-wcpreset]'); if (!b) return; const p = wc.presets.find((x) => x.id === b.dataset.wcpreset), f = wc.form, on = p.collections.every((c) => f.colls.has(c)); for (const c of p.collections) (on ? f.colls.delete(c) : f.colls.add(c)); wcRenderForm(); };
$('wcQ').oninput = () => { wc.form.q = $('wcQ').value; wcRenderForm(); };
const wcClose = () => { $('wcModal').hidden = true; };
$('wcX').onclick = $('wcCancel').onclick = wcClose;
$('wcModal').onclick = (e) => { if (e.target.id === 'wcModal') wcClose(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('wcModal').hidden) wcClose(); });
$('wcSave').onclick = async () => {
  const f = wc.form, say = (t) => { $('wcMsg').textContent = t; $('wcMsg').className = 'um-msg bad'; };
  const body = { name: $('wcName').value.trim(), description: $('wcDesc').value.trim(), hostIds: [...f.hostIds], listIds: [...f.listIds], collectionIds: [...f.colls], everyMinutes: Number($('wcEvery').value) };
  if (!body.name) return say('Give the watch a name');
  $('wcSave').disabled = true;
  try { const w = f.id ? await api('PUT', `/api/watch/${f.id}`, body) : await api('POST', '/api/watch', body); wcClose(); toast(f.id ? 'Watch saved' : 'Watching. The first run takes a baseline; changes are reported from the second'); wc.sel = w.id; loadWatches(); }
  catch (e) { say(e.message); $('wcSave').disabled = false; }
};

// ---- Events ----
const we = { events: [], total: 0, kind: '', q: '', watch: '', since: '86400', unseen: false, open: new Set(), watches: [] };
let weTimer;
async function loadEvents() {
  try { we.watches = (await api('GET', '/api/watch')).watches; } catch { we.watches = []; }
  $('weWatch').innerHTML = `<option value="">All watches</option>${we.watches.map((w) => `<option value="${esc(w.id)}" ${we.watch === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}`;
  await weFetch();
  clearTimeout(weTimer);
  if (isActive('health/events')) weTimer = setTimeout(loadEvents, 15000);
}
window.loadEvents = loadEvents;
async function weFetch() {
  const since = we.since ? new Date(Date.now() - Number(we.since) * 1000).toISOString() : '';
  const p = new URLSearchParams({ limit: '500' }); if (we.kind) p.set('kind', we.kind); if (we.q) p.set('q', we.q); if (we.watch) p.set('watch', we.watch); if (since) p.set('since', since); if (we.unseen) p.set('unseen', '1');
  try { const r = await api('GET', `/api/watch/events?${p}`); we.events = r.events; we.total = r.total; } catch (e) { $('weList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderEvents();
}
function wcEventTable(list, withWatch = true) {
  return `<table class="bh we-tbl"><thead><tr><th>When</th><th></th><th>Host</th><th>What</th><th>Collection</th>${withWatch ? '<th>Watch</th>' : ''}</tr></thead><tbody>${list.map((e) => {
    const open = we.open.has(e.id), has = (e.changes && e.changes.length) || (e.fields && Object.keys(e.fields).length);
    const detail = open && has ? `<tr class="we-detail"><td colspan="${withWatch ? 6 : 5}">${e.changes && e.changes.length ? `<div class="we-changes">${e.changes.map((c) => `<span class="ch-field"><span class="ch-fk">${esc(c.col)}</span><span class="rem">${esc(c.a || '(empty)')}</span><span class="ch-to">→</span><span class="add">${esc(c.b || '(empty)')}</span></span>`).join('')}</div>` : ''}<div class="we-fields">${Object.entries(e.fields || {}).map(([k, v]) => `<span class="ex-cell"><span class="dim">${esc(k)}</span> ${esc(v)}</span>`).join('')}</div></td></tr>` : '';
    return `<tr class="bh-row we-row ${e.seen ? 'seen' : 'unseen'}" data-weid="${esc(e.id)}"><td class="dim nw">${esc(wcWhen(e.at))}</td><td>${wcBadge(e.kind)}</td><td class="nw">${esc(e.host)}</td><td class="we-title" title="${esc(e.title)}">${has ? `<span class="chev">${open ? '▾' : '▸'}</span> ` : ''}${esc(e.title)}</td><td class="dim">${esc(e.collection)}</td>${withWatch ? `<td class="dim">${esc(e.watchName)}</td>` : ''}</tr>${detail}`;
  }).join('')}</tbody></table>`;
}
function renderEvents() {
  document.querySelectorAll('#weKind button').forEach((b) => b.classList.toggle('on', b.dataset.k === we.kind));
  $('weCount').textContent = we.total ? `${we.total.toLocaleString()} event${we.total === 1 ? '' : 's'}${we.total > we.events.length ? `, newest ${we.events.length} shown` : ''}` : '';
  $('weList').innerHTML = we.events.length ? wcEventTable(we.events) : `<p class="dim" style="margin:8px 0 0">${we.watches.length ? 'Nothing has changed in this time. Events appear here as watches find differences between runs.' : 'No watches yet. Create one under <a href="#health/watches">Watches</a>.'}</p>`;
}
$('weList').onclick = (e) => { const tr = e.target.closest('.we-row'); if (!tr) return; const id = tr.dataset.weid; if (we.open.has(id)) we.open.delete(id); else we.open.add(id); const ev = we.events.find((x) => x.id === id); if (ev && !ev.seen) { ev.seen = true; api('POST', '/api/watch/events/seen', { ids: [id] }).then(pollWatch).catch(() => {}); } renderEvents(); };
$('weKind').onclick = (e) => { const b = e.target.closest('button[data-k]'); if (b) { we.kind = b.dataset.k; weFetch(); } };
$('weSearch').oninput = () => { we.q = $('weSearch').value; clearTimeout(we.t); we.t = setTimeout(weFetch, 250); };
$('weWatch').onchange = () => { we.watch = $('weWatch').value; weFetch(); };
$('weSince').onchange = () => { we.since = $('weSince').value; weFetch(); };
$('weUnseen').onchange = () => { we.unseen = $('weUnseen').checked; weFetch(); };
$('weSeen').onclick = async () => { try { await api('POST', '/api/watch/events/seen', { all: true, watch: we.watch || undefined }); } catch (e) { toast(e.message, 'bad'); return; } pollWatch(); weFetch(); };
$('weExport').onclick = () => {
  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const out = [['Time', 'Kind', 'Host', 'Address', 'What', 'Collection', 'Watch', 'Changes', 'Values'], ...we.events.map((e) => [e.at, e.kind, e.host, e.address, e.title, e.collection, e.watchName, (e.changes || []).map((c) => `${c.col}: ${c.a} -> ${c.b}`).join('; '), Object.entries(e.fields || {}).map(([k, v]) => `${k}=${v}`).join('; ')])];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv' })); a.download = 'continuous-events.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};
