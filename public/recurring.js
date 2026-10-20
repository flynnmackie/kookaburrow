// ---- Burrow: Recurring ----
// Two areas, recurring hunts and recurring responses. Each schedule is a dropdown: the header shows how many times it has run, when it
// last ran and a live countdown to the next run; open it for the details. Delete stops it (the runs it already made are kept).
// Shares helpers with app.js: api, esc, $, toast, isActive.
const rc = { list: [], skew: 0, open: new Set() };
let rcPoll;

async function loadRecurring() {
  let r;
  try { r = await api('GET', '/api/schedules'); } catch (e) { $('rcHunts').innerHTML = `<p class="bad">${esc(e.message)}</p>`; $('rcResps').innerHTML = ''; return; }
  rc.skew = Date.parse(r.now) - Date.now(); // the server's clock decides when a run is due
  rc.list = r.schedules;
  renderRecurring();
  clearTimeout(rcPoll);
  if (isActive('burrow/recurring')) rcPoll = setTimeout(loadRecurring, 10000);
}
const rcCountdown = (iso) => {
  const ms = Date.parse(iso) - (Date.now() + rc.skew);
  if (ms <= 0) return 'due now';
  const s = Math.ceil(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, z = (n) => String(n).padStart(2, '0');
  return d ? `${d}d ${h}h ${z(m)}m` : h ? `${h}h ${z(m)}m ${z(x)}s` : `${m}m ${z(x)}s`;
};
const rcEvery = (n) => (n % 1440 === 0 ? `${n / 1440} day${n === 1440 ? '' : 's'}` : n % 60 === 0 ? `${n / 60} hour${n === 60 ? '' : 's'}` : `${n} minute${n === 1 ? '' : 's'}`);
function rcItem(s) {
  const open = rc.open.has(s.id), active = s.status === 'active', noun = s.kind === 'hunt' ? 'Collections' : 'Actions';
  const until = s.until.type === 'forever' ? 'Indefinitely, until it is deleted' : new Date(s.until.at).toLocaleString();
  const total = s.until.type === 'forever' ? 'Runs indefinitely' : `${s.totalRuns} run${s.totalRuns === 1 ? '' : 's'}`;
  const body = !open ? '' : `<div class="lg-body rc-body">
      <div class="bd-facts"><div><span>Runs every</span>${esc(rcEvery(s.everyMinutes))}</div><div><span>Until</span>${esc(until)}</div><div><span>Planned runs</span>${esc(total)}</div>
        <div><span>Ran so far</span>${s.runCount}</div><div><span>Created by</span>${s.createdBy ? esc(s.createdBy) : '-'}</div><div><span>Created</span>${esc(new Date(s.createdAt).toLocaleString())}</div></div>
      ${s.lastError ? `<div class="hd-warn" style="margin-top:8px">${esc(s.lastError)}</div>` : ''}
      <div class="hd-label">${noun}</div>
      <div class="rc-items">${s.items.map((i) => `<div class="rc-item"><b>${esc(i.name)}</b>${i.type ? `<span class="dim">${i.type === 'bash' ? 'Linux' : 'PowerShell'}</span>` : ''}${i.parameters.length ? `<span class="dim">parameters: ${esc(i.parameters.join(', '))}</span>` : ''}<div class="dim">${esc(i.description)}</div></div>`).join('')}</div>
      <div class="hd-label">Hosts</div>
      <div class="hd-deps">${s.groups.map((g) => `<span class="dep have">${esc(g.name)} (group, ${g.hosts} host${g.hosts === 1 ? '' : 's'})</span>`).join('')}${s.hosts.map((h) => `<span class="dep have">${esc(h.name)} · ${esc(h.address)}</span>`).join('') || (s.groups.length ? '' : '<span class="dim">None</span>')}</div>
      <div class="hd-label">Latest runs</div>
      ${s.runs.length ? `<table class="bh"><thead><tr><th>Started</th><th>Finished</th><th>Status</th></tr></thead><tbody>${s.runs.map((r) => `<tr><td>${esc(new Date(r.startedAt).toLocaleString())}</td><td class="dim">${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</td><td>${huntStatus(r)}</td></tr>`).join('')}</tbody></table>` : '<p class="dim" style="margin:0">None of its runs are left (they were deleted).</p>'}
    </div>`;
  return `<div class="lg-hunt ${open ? 'open' : ''}">
    <div class="lg-head rc-head" data-toggle="${esc(s.id)}" role="button" tabindex="0" aria-expanded="${open}"><span class="chev">${open ? '▾' : '▸'}</span>
      <span class="lg-name">${esc(s.name)}</span><span class="badge ${active ? 'green' : 'grey'}">${active ? 'Active' : 'Finished'}</span>
      <span class="dim">Ran <b>${s.runCount}</b> time${s.runCount === 1 ? '' : 's'}</span><span class="dim">Last ran <b>${s.lastRun ? esc(new Date(s.lastRun).toLocaleString()) : 'never'}</b></span>
      <span class="dim">${active && s.nextRun ? `Next run in <b data-next="${esc(s.nextRun)}">${esc(rcCountdown(s.nextRun))}</b>` : 'No more runs'}</span>
      <span class="lg-btns"><a data-del="${esc(s.id)}" data-stop="1" class="bad" data-perm="${s.kind === 'hunt' ? 'hunts.run' : 'actions.run'}" data-perm-what="delete recurring ${s.kind === 'hunt' ? 'hunts' : 'responses'}" title="Stop and delete this recurring ${s.kind === 'hunt' ? 'hunt' : 'response'}">Delete</a></span></div>${body}</div>`;
}
function renderRecurring() {
  const area = (kind, none) => rc.list.filter((s) => s.kind === kind).map(rcItem).join('') || `<p class="dim" style="margin:0">${none}</p>`;
  $('rcHunts').innerHTML = area('hunt', 'No recurring hunts. Turn on Recurring in the New Hunt dialog to make one.');
  $('rcResps').innerHTML = area('response', 'No recurring responses. Turn on Recurring in the New Response dialog to make one.');
}
const rcClick = async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const s = rc.list.find((x) => x.id === del.dataset.del); if (!s) return;
    if (!confirm(`Delete the recurring ${s.kind} "${s.name}"?\n\nIt stops running. The runs it has already made are kept.`)) return;
    try { await api('DELETE', `/api/schedules/${s.id}`); rc.open.delete(s.id); loadRecurring(); } catch (err) { toast(err.message); }
    return;
  }
  const head = e.target.closest('[data-toggle]'); if (!head) return;
  const id = head.dataset.toggle;
  if (rc.open.has(id)) rc.open.delete(id); else rc.open.add(id);
  renderRecurring();
};
$('rcHunts').onclick = $('rcResps').onclick = rcClick;
$('rcHunts').onkeydown = $('rcResps').onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-toggle]')) { e.preventDefault(); e.target.click(); } };
// the countdowns tick every second without redrawing the page
setInterval(() => {
  if (!isActive('burrow/recurring')) return;
  document.querySelectorAll('[data-next]').forEach((b) => { b.textContent = rcCountdown(b.dataset.next); });
}, 1000);

if (isActive('burrow/recurring')) loadRecurring();
