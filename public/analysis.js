// ---- Results > Analysis: Cross-host comparison, YARA scan and Baseline ----
// (Diff is in browse.js and IOC in iocs.js; they share this group in the side menu.)
// Shares helpers with app.js: api, esc, $, toast, can, bbFmt, decorateLocks; browse.js: bbCellClass.

// ---- Cross-host comparison ----
// Pick a hunt: every collection that ran on two or more hosts is listed with how much it differs between them, the most interesting first.
// Open one for three views (src/compare.js):
//   Differences  items (a service, a task, a user) with what is true of them on how many hosts: "Spooler: Running on 38, Stopped on 2"
//   Hosts        every host ranked by how far it is from the rest
//   Rows         every distinct row and how many hosts have it
// Times and counters that differ on every host are left out of the matching (they can be put back).
const cp = { runs: [], ov: null, run: '', key: '', res: null, tab: 'diff', filter: 'all', q: '', host: '', match: null, keyCols: null, openItems: new Set(), openRows: new Set(), label: '' };
const cpWhen = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
async function loadCompare() {
  try { cp.runs = await api('GET', '/api/compare/runs'); } catch (e) { $('cpOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const opt = (r) => `<option value="${esc(r.path)}">${esc(r.name)} · ${esc(cpWhen(r.startedAt))}</option>`;
  const group = (kind, label) => { const l = cp.runs.filter((r) => r.kind === kind); return l.length ? `<optgroup label="${label}">${l.map(opt).join('')}</optgroup>` : ''; };
  const keep = $('cpRun').value;
  $('cpRun').innerHTML = `<option value="">Choose a hunt…</option>${group('hunt', 'Hunts')}${group('response', 'Responses')}`;
  if (keep) $('cpRun').value = keep;
  if (!cp.run) $('cpOut').innerHTML = cp.runs.length ? '<p class="dim" style="margin:0">Choose a hunt that ran on two or more hosts. Its collections are listed with how much they differ between hosts, the most interesting first.</p>' : '<p class="dim" style="margin:0">No run has results from two or more hosts yet.</p>';
}
$('cpRun').onchange = () => { cp.run = $('cpRun').value; cp.key = ''; cp.res = null; if (cp.run) cpOverview(); else loadCompare(); };
async function cpOverview() {
  $('cpOut').innerHTML = '<p class="dim" style="margin:0">Reading every host…</p>';
  try { cp.ov = await api('POST', '/api/compare/overview', { path: cp.run }); } catch (e) { $('cpOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  cp.key = ''; cp.res = null;
  const cols = cp.ov.collections;
  if (!cols.length) { $('cpOut').innerHTML = '<p class="dim" style="margin:0">Nothing in this run came from more than one host.</p>'; return; }
  const num = (n, cls) => (n ? `<b class="${cls}">${n.toLocaleString()}</b>` : '<span class="dim">0</span>');
  $('cpOut').innerHTML = `<div class="df-sum"><div><b>${cols.length}</b> collection${cols.length === 1 ? '' : 's'} on <b>${cp.ov.hosts}</b> host${cp.ov.hosts === 1 ? '' : 's'}</div><div class="dim">Open one to see what differs. The first ones differ the most.</div></div>
    <div class="bb-tablewrap"><table class="bh cp-ov"><thead><tr><th>Collection</th><th class="num">Hosts</th><th class="num">Rows</th><th class="num" title="Items that are different on different hosts">Differ</th><th class="num" title="Items some hosts do not have">Missing on some</th><th class="num" title="Rows only one host has">On one host</th><th>Odd one out</th></tr></thead><tbody>${cols.map((c) => `<tr class="bh-row" data-cpopen="${esc(c.key)}"><td class="bh-name">${esc(c.label || c.key)}${c.label ? '' : ''}</td><td class="num">${c.hosts}</td><td class="num dim">${c.rows == null ? '-' : c.rows.toLocaleString()}</td><td class="num">${num(c.differs, 'mod')}</td><td class="num">${num(c.partial, 'warn')}</td><td class="num">${num(c.onOneHost, 'rem')}</td><td>${c.oddHost ? `${esc(c.oddHost.host)} <span class="dim">(${c.oddHost.score})</span>` : '<span class="dim">-</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
async function cpOpen(key, keepMatch) {
  if (!keepMatch) { cp.match = null; cp.keyCols = null; cp.openItems.clear(); cp.openRows.clear(); cp.q = ''; cp.host = ''; cp.filter = 'all'; }
  cp.key = key;
  $('cpOut').innerHTML = '<p class="dim" style="margin:0">Comparing…</p>';
  try { cp.res = await api('POST', '/api/compare', { path: cp.run, key, columns: cp.match, keyColumns: cp.keyCols }); } catch (e) { cp.res = null; $('cpOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (!cp.match) cp.match = cp.res.matchOn.slice();
  if (!cp.keyCols) cp.keyCols = cp.res.keyColumns.slice();
  cp.label = (cp.ov?.collections.find((c) => c.key === key) || {}).label || key;
  if (!keepMatch) cp.tab = cp.res.keyColumns.length ? 'diff' : 'rows';
  cpRender();
}
const cpHostChips = (hosts, max = 8) => `${hosts.slice(0, max).map((h) => `<span class="tagchip on cp-h" data-cphost="${esc(h)}">${esc(h)}</span>`).join(' ')}${hosts.length > max ? ` <span class="dim">+${hosts.length - max} more</span>` : ''}`;
const cpMatchQ = (vals, hosts) => { const q = cp.q.trim().toLowerCase(); return !q || vals.some((v) => String(v).toLowerCase().includes(q)) || hosts.some((h) => h.toLowerCase().includes(q)); };
function cpRender() {
  const r = cp.res; if (!r) return;
  const n = r.hostsWith;
  const tabBtn = (id, label, count) => `<button type="button" data-cptab="${id}" class="${cp.tab === id ? 'on' : ''}">${label}${count != null ? ` <span class="dim">${count}</span>` : ''}</button>`;
  const chipRow = (cols, set, attr, hint) => `<div class="cp-match"><span class="dim">${hint}</span> ${cols.map((c) => `<button type="button" class="tagchip ${set.includes(c) ? 'on' : ''} ${r.volatileColumns.includes(c) || r.timeColumns.includes(c) ? 'cp-quiet' : ''}" data-${attr}="${esc(c)}" title="${r.volatileColumns.includes(c) ? 'Changes between hosts for no reason: left out unless you add it' : r.timeColumns.includes(c) ? 'A time: left out unless you add it' : ''}">${esc(c)}</button>`).join('')}</div>`;
  const head = `<div class="cp-top"><a data-cpback>← All collections</a><b class="cp-title">${esc(cp.label)}</b><span class="dim">on ${n} of ${r.hostsTotal} host${r.hostsTotal === 1 ? '' : 's'} · ${r.totalRows.toLocaleString()} distinct rows${r.itemCounts ? ` · ${r.itemCounts.differs} differ · ${r.itemCounts.partial} missing on some` : ''}</span></div>
    <div class="toggle cp-tabs">${tabBtn('diff', 'Differences', r.keyColumns.length ? r.itemCounts.differs + r.itemCounts.partial : null)}${tabBtn('hosts', 'Hosts', null)}${tabBtn('rows', 'Rows', r.totalRows)}</div>
    <details class="df-adv cp-cols"><summary>Columns: what identifies an item, and what makes two rows the same</summary>
      ${chipRow(r.columns, cp.keyCols, 'cpkey', 'An item is identified by:')}${chipRow(r.columns, cp.match, 'cpcol', 'Two rows are the same when these match:')}<button type="button" class="act sec" id="cpApply" hidden>Apply</button></details>`;
  let body = '';
  if (cp.tab === 'diff') body = cpDiffHtml(r, n);
  else if (cp.tab === 'hosts') body = cpHostsHtml(r);
  else body = cpRowsHtml(r, n);
  $('cpOut').innerHTML = head + body;
  const q = $('cpQ'); if (q && cp.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); cp.focusQ = false; }
}
function cpFilterBar(chips) { return `<div class="df-chips cp-fbar">${chips}${cp.host ? `<button type="button" class="df-chip on same" data-cpclearhost>Host: ${esc(cp.host)} ✕</button>` : ''}<input type="search" id="cpQ" class="cp-q" placeholder="Filter items, values or hosts" value="${esc(cp.q)}" autocomplete="off"><a data-cpexport>Export CSV</a></div>`; }
function cpDiffHtml(r, n) {
  if (!r.keyColumns.length) return '<p class="dim" style="margin:10px 0 0">No column was found that tells the items apart, so there is nothing to group. Open <b>Columns</b> above and pick what identifies an item (for example Name), or use the Rows view.</p>';
  const c = r.itemCounts, f = cp.filter;
  const items = r.items.filter((it) => (f === 'all' || it.kind === f) && (!cp.host || it.variants.some((v) => v.hosts.includes(cp.host)) || it.lacking.includes(cp.host)) && cpMatchQ([...it.key, ...it.variants.flatMap((v) => v.values)], it.variants.flatMap((v) => v.hosts)));
  const chip = (id, label, k) => `<button type="button" class="df-chip ${f === id ? 'on same' : ''}" data-cpf="${id}">${label} <b>${k}</b></button>`;
  const rest = r.restColumns;
  return `${cpFilterBar(chip('all', 'All', c.differs + c.partial) + chip('differs', 'Differ between hosts', c.differs) + chip('partial', 'Missing on some hosts', c.partial))}
    <p class="dim" style="margin:6px 0">${c.same.toLocaleString()} item${c.same === 1 ? ' is' : 's are'} identical on every host and not listed.${c.truncated ? ' Only the first 2,000 are shown.' : ''}</p>
    <div class="cp-items">${items.slice(0, 500).map((it, i) => {
      const id = `${it.key.join('\u0001')}`, open = cp.openItems.has(id), total = it.hostsWith;
      return `<div class="cp-item ${it.kind}"><div class="cp-ihead" data-cpitem="${esc(id)}" role="button" tabindex="0"><span class="chev">${open ? '▾' : '▸'}</span><b class="cp-ikey" title="${esc(it.key.join(' · '))}">${esc(it.key.join(' · ') || '(item)')}</b>
        <span class="ch-tag ${it.kind}">${it.kind === 'differs' ? `${it.variants.length} variants` : `on ${total} of ${n}`}</span>
        <span class="cp-isum">${it.variants.map((v) => `<span class="cp-var" title="${esc(v.values.join(' · '))}">${esc(rest.length ? v.values.filter((x) => x !== '').slice(0, 3).join(' · ') || '(empty)' : 'present')} <b>${v.count}</b></span>`).join('')}</span></div>
        ${open ? `<div class="cp-ibody">${it.variants.map((v) => `<div class="cp-vrow"><div class="cp-vcount"><b>${v.count}</b> / ${n}</div><div class="cp-vvals">${rest.map((h, j) => `<span class="ch-field"><span class="ch-fk">${esc(h)}</span><span>${esc(v.values[j] ?? '')}</span></span>`).join('') || '<span class="dim">no other columns</span>'}</div><div class="cp-vhosts">${cpHostChips(v.hosts, 40)}</div></div>`).join('')}${it.lacking.length ? `<div class="cp-vrow lacking"><div class="cp-vcount"><b>${it.lacking.length}</b> / ${n}</div><div class="cp-vvals"><span class="dim">do not have it</span></div><div class="cp-vhosts">${cpHostChips(it.lacking, 40)}</div></div>` : ''}</div>` : ''}</div>`;
    }).join('') || '<p class="dim" style="margin:8px 0 0">Nothing matches these filters.</p>'}</div>${items.length > 500 ? `<p class="dim">Showing 500 of ${items.length.toLocaleString()}. Use the filters to narrow it.</p>` : ''}`;
}
function cpHostsHtml(r) {
  const max = Math.max(1, ...r.hostScores.map((h) => h.score));
  return `<p class="dim" style="margin:8px 0">Each host scored by how far it is from the rest: rows no other host has, items it has in a state few others do, and items most hosts have that it lacks. Click a host to see only its differences.</p>
    <div class="bb-tablewrap"><table class="bh cp-hosts-tbl"><thead><tr><th>Host</th><th class="num">Rows</th><th class="num">Only it has</th><th class="num">Unusual state</th><th class="num">Lacks</th><th>Distance from the others</th></tr></thead><tbody>${r.hostScores.map((h) => `<tr class="bh-row ${cp.host === h.host ? 'on' : ''}" data-cphost="${esc(h.host)}"><td class="bh-name">${esc(h.host)}</td><td class="num dim">${h.rows.toLocaleString()}</td><td class="num">${h.rare || '<span class="dim">0</span>'}</td><td class="num">${h.minority || '<span class="dim">0</span>'}</td><td class="num">${h.missing || '<span class="dim">0</span>'}</td><td><span class="cp-bar wide"><i style="width:${Math.round((h.score / max) * 100)}%"></i></span> <b>${h.score}</b></td></tr>`).join('')}</tbody></table></div>`;
}
function cpRowsHtml(r, n) {
  const pass = (x) => { const c = x.count; if (cp.filter === 'one' && !(c === 1 && n > 1)) return false; if (cp.filter === 'rare' && !(c / n <= 0.1 && c < n)) return false; if (cp.filter === 'all-hosts' && c !== n) return false; if (cp.host && !x.hosts.includes(cp.host)) return false; return cpMatchQ(x.values, x.hosts); };
  const cnt = (f) => { const was = cp.filter; cp.filter = f; const k = r.rows.filter(pass).length; cp.filter = was; return k; };
  const chip = (id, label) => `<button type="button" class="df-chip ${cp.filter === id ? 'on same' : ''}" data-cpf="${id}">${label} <b>${cnt(id)}</b></button>`;
  const rows = r.rows.filter(pass), cap = 1500;
  cp.view = rows;
  return `${cpFilterBar(chip('all', 'All rows') + chip('one', 'On one host only') + chip('rare', 'Rare (10% of hosts or fewer)') + chip('all-hosts', 'On every host'))}
    <div class="bb-tablewrap cp-wrap"><table class="bb-tbl cp-tbl"><thead><tr><th class="cp-hc">Hosts</th>${r.columns.map((c) => `<th class="${cp.match.includes(c) ? '' : 'cp-off'}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, cap).map((x, i) => {
      const pct = x.count / n, cls = n > 2 && x.count === 1 ? 'one' : pct <= 0.1 && x.count < n ? 'rare' : x.count === n ? 'all' : '';
      const open = cp.openRows.has(`${i}|${x.values.join('\u0001')}`);
      return `<tr class="cp-row ${cls}" data-cprow="${i}"><td class="cp-hc"><span class="cp-bar"><i style="width:${Math.max(4, Math.round(pct * 100))}%"></i></span><b>${x.count}</b> / ${n}</td>${r.columns.map((_, j) => `<td class="${bbCellClass(x.values[j])}" title="${esc(x.values[j] ?? '')}">${esc(x.values[j] ?? '')}</td>`).join('')}</tr>${open ? `<tr class="cp-hosts"><td colspan="${r.columns.length + 1}"><span class="dim">On:</span> ${cpHostChips(x.hosts, 200)}</td></tr>` : ''}`;
    }).join('') || `<tr><td colspan="${r.columns.length + 1}" class="dim">No rows match.</td></tr>`}</tbody></table></div>${rows.length > cap ? `<p class="dim" style="margin:4px 0">Showing the first ${cap.toLocaleString()} of ${rows.length.toLocaleString()} rows. Use the filters to narrow it.</p>` : ''}${r.truncated ? '<p class="dim">Only the 5,000 rarest rows are kept.</p>' : ''}`;
}
function cpExport() {
  const r = cp.res, out = [];
  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  if (cp.tab === 'diff') {
    out.push(['Item', 'Kind', 'Hosts', 'Count', ...r.restColumns, 'Hosts having it']);
    for (const it of r.items) for (const v of it.variants) out.push([it.key.join(' · '), it.kind, it.hostsWith, v.count, ...r.restColumns.map((_, j) => v.values[j] ?? ''), v.hosts.join('; ')]);
  } else { out.push(['Hosts', ...r.columns, 'Host names']); for (const x of r.rows) out.push([x.count, ...r.columns.map((_, j) => x.values[j] ?? ''), x.hosts.join('; ')]); }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out.map((l) => l.map(cell).join(',')).join('\r\n')], { type: 'text/csv' })); a.download = 'cross-host.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('cpOut').onclick = (e) => {
  const open = e.target.closest('[data-cpopen]'); if (open) { cpOpen(open.dataset.cpopen); return; }
  if (e.target.closest('[data-cpback]')) { cpOverview(); return; }
  const tab = e.target.closest('[data-cptab]'); if (tab) { cp.tab = tab.dataset.cptab; cp.filter = 'all'; cpRender(); return; }
  const f = e.target.closest('[data-cpf]'); if (f) { cp.filter = f.dataset.cpf; cpRender(); return; }
  const host = e.target.closest('[data-cphost]'); if (host) { cp.host = cp.host === host.dataset.cphost ? '' : host.dataset.cphost; if (cp.tab === 'hosts') cp.tab = cp.res.keyColumns.length ? 'diff' : 'rows'; cpRender(); return; }
  if (e.target.closest('[data-cpclearhost]')) { cp.host = ''; cpRender(); return; }
  if (e.target.closest('[data-cpexport]')) { cpExport(); return; }
  const key = e.target.closest('[data-cpkey]'), col = e.target.closest('[data-cpcol]');
  if (key || col) {
    const set = key ? cp.keyCols : cp.match, c = (key || col).dataset[key ? 'cpkey' : 'cpcol'], i = set.indexOf(c);
    if (i >= 0) { if (set.length > 1 || key) set.splice(i, 1); } else set.push(c);
    if (key && !cp.match.includes(c) && set.includes(c)) cp.match.push(c);
    (key || col).classList.toggle('on', set.includes(c)); $('cpApply').hidden = false; return;
  }
  if (e.target.closest('#cpApply')) { cpOpen(cp.key, true); return; }
  const it = e.target.closest('[data-cpitem]'); if (it) { const k = it.dataset.cpitem; if (cp.openItems.has(k)) cp.openItems.delete(k); else cp.openItems.add(k); cpRender(); return; }
  const tr = e.target.closest('.cp-row');
  if (tr && cp.view) { const x = cp.view[Number(tr.dataset.cprow)], k = `${tr.dataset.cprow}|${x.values.join('\u0001')}`; if (cp.openRows.has(k)) cp.openRows.delete(k); else cp.openRows.add(k); cpRender(); }
};
$('cpOut').oninput = (e) => { if (e.target.id === 'cpQ') { cp.q = e.target.value; cp.focusQ = true; cpRender(); } };

// ---- YARA scan ----
// Scans the output of chosen runs on the server with chosen rule files (src/yara-scan.js). One scan at a time; the list polls while
// one is running. Each scan opens to its matches, which can be filtered by rule and opened in Browse.
const ys = { runs: [], ruleFiles: [], scans: [], compiler: null, pick: new Set(), rules: null, q: '', open: new Set(), rule: new Map() };
let ysPoll;
async function loadYaraScan(first = true) {
  let r;
  try { r = await api('GET', '/api/yara-scans'); if (first) ys.runs = (await api('GET', '/api/diff/runs')).filter((x) => x.kind !== 'baseline'); } catch (e) { $('ysList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  Object.assign(ys, { scans: r.scans, compiler: r.compiler, ruleFiles: r.ruleFiles });
  if (!ys.rules) ys.rules = new Set(ys.ruleFiles.filter((f) => f.enabled).map((f) => f.id)); // the enabled files to start with
  if (first) { renderYsPick(); if (ys.scans[0]) ys.open.add(ys.scans[0].id); }
  renderYsList();
  clearTimeout(ysPoll);
  if (ys.scans.some((s) => s.status === 'running') && isActive('output/yara-scan')) ysPoll = setTimeout(() => loadYaraScan(false), 2000);
}
window.loadYaraScan = loadYaraScan;
function renderYsPick() {
  $('ysSetup').innerHTML = ys.compiler ? `<div class="dim">Scanned with ${esc(ys.compiler)}.</div>` : `<div class="bad">No YARA on this server yet: upload <code>yara64.exe</code> on <a href="#settings/binaries">Binaries</a> (a Linux server needs <code>yara</code> installed).</div>`;
  const q = ys.q.toLowerCase(), when = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const shown = ys.runs.filter((r) => !q || r.name.toLowerCase().includes(q) || r.folder.toLowerCase().includes(q));
  $('ysRuns').innerHTML = shown.map((r) => `<label class="ys-row"><input type="checkbox" data-ysrun="${esc(r.path)}" ${ys.pick.has(r.path) ? 'checked' : ''}><span>${esc(r.name)}</span><span class="dim">${r.kind === 'response' ? 'response · ' : ''}${esc(when(r.startedAt))}</span></label>`).join('') || '<p class="dim" style="margin:6px">No runs.</p>';
  $('ysRunCount').textContent = ys.pick.size ? `${ys.pick.size} chosen` : '';
  $('ysRules').innerHTML = ys.ruleFiles.map((f) => `<label class="ys-row ${f.ok === false ? 'yr-off' : ''}"><input type="checkbox" data-ysrule="${esc(f.id)}" ${ys.rules.has(f.id) ? 'checked' : ''} ${f.ok === false ? 'disabled title="Does not compile"' : ''}><span>${esc(f.name)}</span><span class="dim">${f.rules} rule${f.rules === 1 ? '' : 's'}${f.enabled ? '' : ' · disabled for hunts'}${f.ok === false ? ' · does not compile' : ''}</span></label>`).join('') || '<p class="dim" style="margin:6px">No rule files yet. Add some on <a href="#settings/yara">YARA Rules</a>.</p>';
}
const ysWhen = (t) => (t ? new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
function renderYsList() {
  if (!ys.scans.length) { $('ysList').innerHTML = '<p class="dim" style="margin:6px 0 0">No scans yet.</p>'; return; }
  const badge = (s) => ({ running: '<span class="badge orange">scanning</span>', done: '<span class="badge green">done</span>', failed: '<span class="badge red">failed</span>', cancelled: '<span class="badge grey">cancelled</span>' }[s.status] || '');
  $('ysList').innerHTML = ys.scans.map((s) => {
    const open = ys.open.has(s.id), n = s.matches.length, done = s.runs.filter((r) => ['done', 'error', 'cancelled'].includes(r.status)).length;
    const total = s.runs.reduce((a, r) => a + r.matches, 0);
    const head = `<div class="lg-head" data-ysopen="${esc(s.id)}" role="button" tabindex="0"><span class="chev">${open ? '▾' : '▸'}</span>${badge(s)}
      <span class="lg-name">${total ? `<b class="bad">${total.toLocaleString()} match${total === 1 ? '' : 'es'}</b>` : s.status === 'running' ? 'no matches yet' : 'no matches'}</span>
      <span class="dim">${s.runs.length} run${s.runs.length === 1 ? '' : 's'}${s.status === 'running' ? ` (${done} scanned)` : ''} · ${s.rules} rule${s.rules === 1 ? '' : 's'} from ${esc(s.ruleFiles.map((f) => f.name).join(', '))}</span>
      <span class="dim">${esc(s.by || '')} · ${esc(ysWhen(s.startedAt))}</span>
      <span class="lg-btns">${s.status === 'running' ? `<a data-yscancel="${esc(s.id)}" class="bad" data-perm="hunts.run">Cancel</a>` : `${n ? `<a href="/api/yara-scans/${esc(s.id)}/csv" data-perm="hunts.export" data-perm-what="export YARA matches">CSV</a>` : ''}<a data-ysdel="${esc(s.id)}" class="bad" data-perm="hunts.run">Delete</a>`}</span></div>`;
    if (!open) return `<div class="lg-hunt">${head}</div>`;
    const counts = new Map(); for (const m of s.matches) counts.set(m.rule, (counts.get(m.rule) || 0) + 1);
    const pickRule = ys.rule.get(s.id) || '', rows = s.matches.filter((m) => !pickRule || m.rule === pickRule);
    const chips = [...counts].sort((a, b) => b[1] - a[1]).map(([r, c]) => `<button type="button" class="df-chip ${pickRule === r ? 'on same' : ''}" data-ysrulef="${esc(s.id)}" data-r="${esc(r)}">${esc(r)} <b>${c}</b></button>`).join('');
    return `<div class="lg-hunt open">${head}<div class="lg-body">
      ${s.error ? `<div class="hd-warn">${esc(s.error)}</div>` : ''}
      <div class="ys-runs">${s.runs.map((r) => `<span class="dep ${r.status === 'error' ? 'miss' : 'have'}" title="${esc(r.error || r.status)}">${esc(r.name)} · ${r.status === 'scanning' ? 'scanning…' : r.status === 'queued' ? 'waiting' : r.status === 'error' ? 'failed' : `${r.matches} match${r.matches === 1 ? '' : 'es'}`}</span>`).join('')}</div>
      ${s.errors ? `<p class="dim" style="margin:4px 0">${s.errors} file${s.errors === 1 ? '' : 's'} could not be read by YARA (locked or unreadable); the rest were scanned.</p>` : ''}
      ${n ? `<div class="df-chips" style="margin-top:8px"><button type="button" class="df-chip ${pickRule ? '' : 'on same'}" data-ysrulef="${esc(s.id)}" data-r="">All rules <b>${n}</b></button>${chips}</div>
      <div class="bb-tablewrap"><table class="bb-tbl"><thead><tr><th>Rule</th><th>Run</th><th>Host</th><th>File</th><th></th></tr></thead><tbody>${rows.slice(0, 1000).map((m) => `<tr><td><b>${esc(m.rule)}</b></td><td>${esc(m.runName)}</td><td>${esc(m.host || '-')}</td><td title="${esc(m.rel)}">${esc(m.rel)}</td><td><a data-ysbrowse="${esc(`${m.run}/${m.rel}`)}">Browse</a></td></tr>`).join('')}</tbody></table></div>
      ${rows.length > 1000 ? `<p class="dim">Showing 1,000 of ${rows.length.toLocaleString()}; the CSV has them all.</p>` : ''}${s.truncated ? '<p class="dim">Only the first 5,000 matches were kept.</p>' : ''}`
        : `<p class="dim" style="margin:6px 0 0">${s.status === 'running' ? 'Nothing has matched yet.' : 'No rule matched any file.'}</p>`}</div></div>`;
  }).join('');
  decorateLocks($('ysList'));
}
$('ysRunQ').oninput = () => { ys.q = $('ysRunQ').value; renderYsPick(); };
$('ysRuns').onchange = (e) => { const c = e.target.closest('[data-ysrun]'); if (!c) return; if (c.checked) ys.pick.add(c.dataset.ysrun); else ys.pick.delete(c.dataset.ysrun); $('ysRunCount').textContent = ys.pick.size ? `${ys.pick.size} chosen` : ''; };
$('ysRules').onchange = (e) => { const c = e.target.closest('[data-ysrule]'); if (!c) return; if (c.checked) ys.rules.add(c.dataset.ysrule); else ys.rules.delete(c.dataset.ysrule); };
$('ysGo').onclick = async () => {
  const say = (t, cls = 'bad') => { $('ysMsg').textContent = t; $('ysMsg').className = `um-msg ${cls}`; };
  if (!ys.pick.size) return say('Choose at least one run');
  if (!ys.rules.size) return say('Choose at least one rule file');
  say('Starting…', 'dim');
  try { const s = await api('POST', '/api/yara-scans', { paths: [...ys.pick], ruleFileIds: [...ys.rules] }); ys.open.clear(); ys.open.add(s.id); say(''); } catch (e) { return say(e.message); }
  loadYaraScan(false);
};
$('ysList').onclick = async (e) => {
  const t = e.target;
  const c = t.closest('[data-yscancel]'); if (c) { try { await api('POST', `/api/yara-scans/${c.dataset.yscancel}/cancel`); } catch (err) { toast(err.message, 'bad'); } loadYaraScan(false); return; }
  const d = t.closest('[data-ysdel]'); if (d) { e.stopPropagation(); try { await api('DELETE', `/api/yara-scans/${d.dataset.ysdel}`); } catch (err) { toast(err.message, 'bad'); } loadYaraScan(false); return; }
  const f = t.closest('[data-ysrulef]'); if (f) { ys.rule.set(f.dataset.ysrulef, f.dataset.r); renderYsList(); return; }
  const b = t.closest('[data-ysbrowse]'); if (b) { const p = b.dataset.ysbrowse; window.openInBrowse?.(p.slice(0, p.lastIndexOf('/')) || p); return; }
  if (t.closest('a[href]')) return;
  const h = t.closest('[data-ysopen]'); if (h) { const sid = h.dataset.ysopen; if (ys.open.has(sid)) ys.open.delete(sid); else ys.open.add(sid); renderYsList(); }
};

// ---- Baseline ----
// Known-good states (src/baselines.js): made from a finished run, or uploaded (a zip exported from another Kookaburrow, a zip of a run
// folder, or one CSV). Each has an operating system, and one baseline per system can be the STANDARD: the reference that newer baselines
// and runs are compared with. The list shows what changed in each baseline against the standard and against the one before it; click a
// number, or a baseline, to see exactly what changed below (the same report as Results > Diff). Under it, the expected changes
// (src/expected.js): rows marked in a report that are not reported again.
const bl = { list: [], expected: [], mode: 'run', runs: [], os: 'all', sel: null, chg: new Map(), rep: null, edit: null, runsLoaded: false };
const blWhen = (t) => new Date(t).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const blOsName = { windows: 'Windows', linux: 'Linux', other: 'Other' };
const blPath = (id) => `baseline:${id}`;
async function loadBaselines() {
  if (!bl.rep) bl.rep = chNew($('blReport'), { onChange: () => { loadExpectedOnly(); } });
  try { [bl.list, bl.expected] = await Promise.all([api('GET', '/api/baselines'), api('GET', '/api/expected')]); } catch (e) { $('blList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (!bl.runsLoaded) { try { bl.runs = (await api('GET', '/api/diff/runs')).filter((r) => r.kind !== 'baseline' && r.id && r.status !== 'running'); bl.runsLoaded = true; } catch { bl.runs = []; } }
  renderBaselines();
  renderBlCompare();
  renderExpected();
  blLoadChanges();
}
async function loadExpectedOnly() { try { bl.expected = await api('GET', '/api/expected'); renderExpected(); } catch { /* shown on the next load */ } }
const blByOs = (os) => bl.list.filter((b) => b.os === os).sort((a, b) => String(a.at).localeCompare(String(b.at)));
const blStandard = (os) => bl.list.find((b) => b.os === os && b.standard) || null;
const blPrevious = (b) => { const l = blByOs(b.os), i = l.findIndex((x) => x.id === b.id); return i > 0 ? l[i - 1] : null; };

// what to show next to each baseline: against the standard and against the one before
function blPairs(b) { const s = blStandard(b.os); return [['standard', s && s.id !== b.id ? s : null], ['previous', blPrevious(b)]]; }
const blKey = (a, b) => `${a}|${b}`;
// fetches the summaries one after another (each one compares two sets of CSVs), then redraws
let blBusy = false;
async function blLoadChanges() {
  if (blBusy) return;
  blBusy = true;
  try {
    for (const b of bl.list) for (const [, ref] of blPairs(b)) {
      if (!ref) continue;
      const k = blKey(ref.id, b.id);
      if (bl.chg.has(k)) continue;
      bl.chg.set(k, 'loading');
      try { bl.chg.set(k, await api('GET', `/api/baselines/changes?a=${encodeURIComponent(blPath(ref.id))}&b=${encodeURIComponent(blPath(b.id))}`)); } catch (e) { bl.chg.set(k, { error: e.message }); }
      if (isActive('output/baseline')) renderBaselines();
    }
  } finally { blBusy = false; }
}
function blChip(ref, b, label) {
  if (!ref) return '<span class="dim">-</span>';
  const c = bl.chg.get(blKey(ref.id, b.id));
  if (!c || c === 'loading') return '<span class="dim">…</span>';
  if (c.error) return `<span class="dim" title="${esc(c.error)}">could not compare</span>`;
  const none = !c.added && !c.removed && !c.modified;
  return `<a class="bl-chg ${none ? 'none' : ''}" data-blcmp="${esc(ref.id)}|${esc(b.id)}" title="${esc(label)}: ${esc(ref.name)} → ${esc(b.name)}${c.noise ? `\n${c.noise} items differ only in a time and are not counted` : ''}">${none ? '<span class="dim">no changes</span>' : `<span class="add">+${c.added.toLocaleString()}</span> <span class="rem">−${c.removed.toLocaleString()}</span> <span class="mod">~${c.modified.toLocaleString()}</span> <span class="dim">in ${c.collections.length} collection${c.collections.length === 1 ? '' : 's'}</span>`}</a>`;
}
function renderBaselines() {
  const counts = { all: bl.list.length, windows: 0, linux: 0, other: 0 };
  for (const b of bl.list) counts[b.os] = (counts[b.os] || 0) + 1;
  document.querySelectorAll('#blOs button').forEach((x) => { x.classList.toggle('on', x.dataset.os === bl.os); const n = counts[x.dataset.os]; x.querySelector('.dim').textContent = n ? ` ${n}` : ''; });
  const shown = bl.list.filter((b) => bl.os === 'all' || b.os === bl.os).sort((a, b) => a.os.localeCompare(b.os) || String(b.at).localeCompare(String(a.at)));
  const source = (b) => (b.source === 'run' ? `From <b>${esc(b.runName || b.filename)}</b>` : `Uploaded <span class="dim">${esc(b.filename)}</span>`);
  $('blList').innerHTML = shown.length ? `<table class="bh bl-tbl"><thead><tr><th>Baseline</th><th>System</th><th class="num">Hosts</th><th class="num">Collections</th><th class="num">Rows</th><th>Added</th><th>Changed since the standard</th><th>Changed since the one before</th><th></th></tr></thead><tbody>${shown.map((b) => {
      const [std, prev] = blPairs(b);
      return `<tr class="bh-row ${bl.sel === b.id ? 'on' : ''}" data-blsel="${esc(b.id)}"><td><b>${b.standard ? '<span class="bl-star" title="The standard for ' + esc(blOsName[b.os]) + '">★</span> ' : ''}${esc(b.name)}</b>${b.standard ? ' <span class="badge green">standard</span>' : ''}<div class="dim" style="font-size:11.5px">${source(b)}${b.note ? ` · ${esc(b.note)}` : ''}</div></td>
        <td><span class="bl-os ${esc(b.os)}">${esc(blOsName[b.os] || b.os)}</span></td><td class="num dim">${b.profile ? b.profile.hosts : ''}</td><td class="num dim">${b.profile ? b.profile.collections.length : ''}</td><td class="num dim">${b.profile ? b.profile.rows.toLocaleString() : ''}</td>
        <td class="dim nw">${esc(b.uploadedBy || '')} · ${esc(blWhen(b.at))}</td><td>${b.standard ? '<span class="dim">this is the standard</span>' : blChip(std[1], b, 'Against the standard')}</td><td>${blChip(prev[1], b, 'Against the one before')}</td>
        <td class="bh-del nw"><a data-blstd="${esc(b.id)}" data-perm="hunts.run" data-perm-what="change the standard baseline">${b.standard ? 'Not the standard' : 'Make standard'}</a> <a data-bledit="${esc(b.id)}" data-perm="hunts.run" data-perm-what="edit baselines">Edit</a> <a href="/api/baselines/${esc(b.id)}/download" data-perm="hunts.export" data-perm-what="download baselines" title="A zip another Kookaburrow can take in with Upload">Download</a> <a class="bad" data-bldel="${esc(b.id)}" data-perm="hunts.run" data-perm-what="delete baselines">Delete</a></td></tr>`;
    }).join('')}</tbody></table>`
    : `<p class="dim" style="margin:10px 0 0">${bl.list.length ? 'No baselines for this system.' : 'No baselines yet. Press Add baseline to make one from a run, or upload one (for example a standard baseline exported from another Kookaburrow).'}</p>`;
  decorateLocks($('blList'));
}

// ---- the compare card ----
function renderBlCompare() {
  const opt = (v, text, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(text)}</option>`;
  const baseOpts = bl.list.slice().sort((a, b) => a.os.localeCompare(b.os) || String(b.at).localeCompare(String(a.at))).map((b) => opt(blPath(b.id), `${b.standard ? '★ ' : ''}${b.name} · ${blOsName[b.os]} · ${blWhen(b.at)}`)).join('');
  const runOpts = (k, label) => { const l = bl.runs.filter((r) => r.kind === k); return l.length ? `<optgroup label="${label}">${l.map((r) => opt(r.path, `${r.name} · ${blWhen(r.startedAt)}`)).join('')}</optgroup>` : ''; };
  const a = $('blCmpA').value, b = $('blCmpB').value;
  $('blCmpA').innerHTML = `<option value="">Choose a baseline…</option>${baseOpts}`;
  $('blCmpB').innerHTML = `<option value="">Choose a baseline or a run…</option><optgroup label="Baselines">${baseOpts}</optgroup>${runOpts('hunt', 'Hunts')}${runOpts('response', 'Responses')}`;
  if (a) $('blCmpA').value = a; if (b) $('blCmpB').value = b;
  // quick comparisons: the newest baseline of each system against its standard, and against the one before
  const q = [];
  for (const os of ['windows', 'linux', 'other']) {
    const l = blByOs(os), newest = l[l.length - 1], std = blStandard(os);
    if (newest && std && std.id !== newest.id) q.push([std, newest, `${blOsName[os]}: newest vs standard`]);
    if (newest && l.length > 1 && !(std && l[l.length - 2].id === std.id && q.length && q[q.length - 1][2].startsWith(blOsName[os]))) q.push([l[l.length - 2], newest, `${blOsName[os]}: newest vs previous`]);
  }
  $('blQuick').innerHTML = q.map(([x, y, label]) => `<button type="button" class="df-chip same" data-blcmp="${esc(x.id)}|${esc(y.id)}" title="${esc(x.name)} → ${esc(y.name)}">${esc(label)}</button>`).join('');
  $('blQuickWrap').hidden = !q.length;
  const withStd = bl.runs.length && bl.list.some((x) => x.standard);
  $('blRunCheck').hidden = !withStd;
  if (withStd) {
    const keep = $('blCheckRun').value;
    $('blCheckRun').innerHTML = `<option value="">Choose a run…</option>${runOpts('hunt', 'Hunts')}${runOpts('response', 'Responses')}`;
    if (keep) $('blCheckRun').value = keep;
  }
}
async function blCompare(aPath, bPath, nameA, nameB) {
  $('blCmpA').value = aPath; if ([...$('blCmpB').options].some((o) => o.value === bPath)) $('blCmpB').value = bPath;
  $('blReportWrap').hidden = false;
  await chLoad(bl.rep, aPath, bPath, { [aPath]: nameA, [bPath]: nameB });
  if (bl.rep.res) chOpenAll(bl.rep);
  $('blReportWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const blName = (path) => { const m = /^baseline:(.+)$/.exec(path); const b = m && bl.list.find((x) => x.id === m[1]); if (b) return `${b.standard ? '★ ' : ''}${b.name}`; const r = bl.runs.find((x) => x.path === path); return r ? `${r.name} · ${blWhen(r.startedAt)}` : path; };
$('blCmpGo').onclick = () => { const a = $('blCmpA').value, b = $('blCmpB').value; if (!a || !b) return toast('Choose both sides', 'bad'); if (a === b) return toast('Choose two different ones', 'bad'); blCompare(a, b, blName(a), blName(b)); };
$('blCmpSwap').onclick = () => { const a = $('blCmpA').value, b = $('blCmpB').value; if ([...$('blCmpA').options].some((o) => o.value === b)) $('blCmpA').value = b; if ([...$('blCmpB').options].some((o) => o.value === a)) $('blCmpB').value = a; };
// a run against the standard of its operating system
$('blCheckGo').onclick = () => {
  const run = $('blCheckRun').value; if (!run) return toast('Choose a run', 'bad');
  const r = bl.runs.find((x) => x.path === run), std = (r && r.os && blStandard(r.os)) || (!(r && r.os) && bl.list.find((x) => x.standard));
  if (!std) return toast(r && r.os ? `No ${blOsName[r.os]} baseline is marked as the standard yet` : 'No baseline is marked as the standard yet', 'bad');
  blCompare(blPath(std.id), run, blName(blPath(std.id)), blName(run));
};

$('blList').onclick = async (e) => {
  const c = e.target.closest('[data-blcmp]');
  if (c) { e.stopPropagation(); const [x, y] = c.dataset.blcmp.split('|'); blCompare(blPath(x), blPath(y), blName(blPath(x)), blName(blPath(y))); return; }
  const std = e.target.closest('[data-blstd]');
  if (std) { e.stopPropagation(); const b = bl.list.find((x) => x.id === std.dataset.blstd); try { await api('PUT', `/api/baselines/${b.id}`, { standard: !b.standard }); toast(b.standard ? 'No longer the standard' : `${b.name} is now the standard for ${blOsName[b.os]}`); } catch (err) { toast(err.message, 'bad'); return; } bl.chg.clear(); loadBaselines(); return; }
  const ed = e.target.closest('[data-bledit]'); if (ed) { e.stopPropagation(); blOpenEdit(bl.list.find((x) => x.id === ed.dataset.bledit)); return; }
  if (e.target.closest('a[href]')) return;
  const d = e.target.closest('[data-bldel]');
  if (d) {
    e.stopPropagation();
    const b = bl.list.find((x) => x.id === d.dataset.bldel);
    if (!confirm(`Delete the baseline "${b?.name}"? Its stored files are removed, and recurring hunts that compare with it go back to comparing with the previous run.`)) return;
    try { await api('DELETE', `/api/baselines/${d.dataset.bldel}`); toast('Baseline deleted'); } catch (err) { toast(err.message, 'bad'); return; }
    bl.chg.clear(); if (bl.sel === d.dataset.bldel) { bl.sel = null; $('blReportWrap').hidden = true; } loadBaselines();
    return;
  }
  // a click on a baseline compares it with its standard (or, for the standard itself, with the one before)
  const row = e.target.closest('[data-blsel]');
  if (row) {
    const b = bl.list.find((x) => x.id === row.dataset.blsel); bl.sel = b.id; renderBaselines();
    const std = blStandard(b.os), ref = std && std.id !== b.id ? std : blPrevious(b);
    if (ref) blCompare(blPath(ref.id), blPath(b.id), blName(blPath(ref.id)), blName(blPath(b.id)));
    else toast(`${b.name} has nothing to be compared with yet: add another ${blOsName[b.os]} baseline`, 'ok');
  }
};
$('blOs').onclick = (e) => { const b = e.target.closest('button[data-os]'); if (b) { bl.os = b.dataset.os; renderBaselines(); } };

// ---- expected changes ----
// One expected row: its scope (the collection's file name or workflow output) and its values as column=value.
function renderExpected() {
  const e = bl.expected;
  $('exCount').textContent = e.length ? `${e.length} row${e.length === 1 ? '' : 's'}` : '';
  const cells = (x) => (x.header.length ? x.header.map((h, i) => `<span class="ex-cell"><span class="dim">${esc(h)}</span> ${esc(x.row[i] ?? '')}</span>`).join('') : esc(x.row.join(' ')));
  $('exList').innerHTML = e.length ? `<table class="bh"><thead><tr><th>Collection</th><th>Row</th><th>Note</th><th>Marked</th><th></th></tr></thead><tbody>${[...e].reverse().map((x) => `<tr><td class="nw"><code>${esc(x.scope)}</code></td><td class="ex-row">${cells(x)}</td><td class="dim">${esc(x.note || '')}</td><td class="dim nw">${esc(x.by || '')} · ${esc(blWhen(x.at))}</td><td class="bh-del"><a class="bad" data-exdel="${esc(x.id)}" data-perm="hunts.run" data-perm-what="remove expected changes">Remove</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:10px 0 0">None yet.</p>';
  decorateLocks($('exList'));
}
$('exList').onclick = async (e) => {
  const d = e.target.closest('[data-exdel]'); if (!d) return;
  try { await api('DELETE', `/api/expected/${d.dataset.exdel}`); toast('It is reported as new, gone or changed again'); } catch (err) { toast(err.message, 'bad'); return; }
  bl.chg.clear(); loadBaselines();
};

// ---- add, upload and edit ----
const blSay = (t, cls = 'bad') => { $('blMsg').textContent = t; $('blMsg').className = `um-msg ${cls}`; };
function blSetMode(m) {
  bl.mode = m;
  document.querySelectorAll('#blMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  $('blMode').hidden = m === 'edit';
  $('blFromRun').hidden = m !== 'run'; $('blFromFile').hidden = m !== 'file';
  $('blSave').textContent = m === 'run' ? 'Save baseline' : m === 'file' ? 'Upload' : 'Save';
  $('blTitle').textContent = m === 'edit' ? 'Edit baseline' : 'Add baseline';
}
$('blMode').onclick = (e) => { const b = e.target.closest('button[data-mode]'); if (b) blSetMode(b.dataset.mode); };
$('blRun').onchange = () => { const r = bl.runs.find((x) => x.id === $('blRun').value); if (r && !$('blName').value.trim()) $('blName').value = `${r.name} ${blWhen(r.startedAt).split(',')[0]}`; };
function blOpenEdit(b) {
  bl.edit = b; $('blName').value = b.name; $('blNote').value = b.note || ''; $('blOsSel').value = b.os; $('blStd').checked = !!b.standard; $('blFile').value = ''; blSay(''); $('blSave').disabled = false;
  blSetMode('edit'); $('blModal').hidden = false; $('blName').focus();
}
$('blAdd').onclick = () => {
  bl.edit = null; $('blName').value = $('blNote').value = ''; $('blFile').value = ''; $('blFileName').textContent = 'A baseline zip (from Download), a zip of a run folder, or one CSV (up to 200 MB)'; blSay(''); $('blSave').disabled = false;
  $('blOsSel').value = ''; $('blStd').checked = !bl.list.some((b) => b.standard);
  blSetMode('run'); $('blModal').hidden = false; $('blName').focus();
  const opt = (r) => `<option value="${esc(r.id)}">${esc(r.name)} · ${esc(blWhen(r.startedAt))}</option>`;
  const group = (k, label) => { const l = bl.runs.filter((r) => r.kind === k); return l.length ? `<optgroup label="${label}">${l.map(opt).join('')}</optgroup>` : ''; };
  $('blRun').innerHTML = bl.runs.length ? `<option value="">Choose a run…</option>${group('hunt', 'Hunts')}${group('response', 'Responses')}` : '<option value="">No finished runs yet</option>';
};
const closeBl = () => { $('blModal').hidden = true; };
$('blX').onclick = $('blCancel').onclick = closeBl;
$('blModal').onclick = (e) => { if (e.target.id === 'blModal') closeBl(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('blModal').hidden) closeBl(); });
$('blFile').onchange = () => {
  const f = $('blFile').files[0]; if (!f) return;
  $('blFileName').textContent = `${f.name} (${bbFmt(f.size)})`;
  if (!$('blName').value.trim()) $('blName').value = f.name.replace(/^baseline_/, '').replace(/\.[^.]+$/, '');
  blSay(f.size > 200 * 1024 * 1024 ? 'That file is over 200 MB' : '');
};
$('blSave').onclick = async () => {
  const f = $('blFile').files[0], os = $('blOsSel').value, std = $('blStd').checked;
  if (!$('blName').value.trim()) return blSay('Give the baseline a name');
  const done = (t) => { closeBl(); toast(t); bl.chg.clear(); loadBaselines(); };
  if (bl.mode === 'edit') {
    $('blSave').disabled = true;
    try { await api('PUT', `/api/baselines/${bl.edit.id}`, { name: $('blName').value.trim(), note: $('blNote').value, os: os || bl.edit.os, standard: std }); done('Baseline saved'); } catch (e) { blSay(e.message); } finally { $('blSave').disabled = false; }
    return;
  }
  if (bl.mode === 'run') {
    if (!$('blRun').value) return blSay('Choose the run');
    blSay('Copying the run…', 'dim'); $('blSave').disabled = true;
    try { const j = await api('POST', '/api/baselines/from-run', { runId: $('blRun').value, name: $('blName').value.trim(), note: $('blNote').value, os: os || undefined, standard: std || undefined }); done(`Baseline ${j.name} saved (${j.files} files)`); } catch (e) { blSay(e.message); } finally { $('blSave').disabled = false; }
    return;
  }
  if (!f) return blSay('Choose the baseline file');
  if (f.size > 200 * 1024 * 1024) return blSay('That file is over 200 MB');
  blSay('Uploading…', 'dim'); $('blSave').disabled = true;
  try {
    const q = new URLSearchParams({ name: $('blName').value.trim(), note: $('blNote').value, filename: f.name });
    if (os) q.set('os', os); if (std) q.set('standard', '1');
    const r = await fetch(`/api/baselines?${q}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = '/login.html'; return; }
    if (!r.ok) throw new Error(j.error || `Upload failed (${r.status})`);
    done(`Baseline ${j.name} uploaded`);
  } catch (e) { blSay(e.message); } finally { $('blSave').disabled = false; }
};
