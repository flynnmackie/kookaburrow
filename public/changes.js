// ---- The change report: what is new, gone and changed between two runs or baselines ----
// One component for Results > Diff and Results > Baseline (src/diff.js produces the data). The summary says how much changed, the list is
// grouped by collection (or by host) with what matters most first, and each file opens to its rows:
//   Changed   one item whose fields differ: only the fields that changed are shown, old -> new
//   New, Gone rows that exist on one side only (when hosts are pooled, with the hosts that have them)
// Items that differ only in a time or a counter are noise: counted, hidden, and listed on request.
// Shares helpers with app.js: api, esc, $, toast, can, bbFmt, decorateLocks.
const CH_TAG = { persistence: 'Persistence', accounts: 'Accounts', c2: 'Command and control', malware: 'Malware', 'defense-evasion': 'Defence evasion', 'privilege-escalation': 'Privilege escalation', execution: 'Execution', 'lateral-movement': 'Lateral movement' };
const chNum = (n) => Number(n || 0).toLocaleString();

// el: the element the report is drawn in. opts: { onChange() } called after a row is marked expected (so the page can refresh its own summary).
function chNew(el, opts = {}) {
  const r = { el, opts, res: null, detail: new Map(), open: new Set(), gopen: new Map(), show: new Set(['changed', 'added', 'removed']), q: '', group: 'collection', strict: false, pool: 'auto', timeOnly: false, wrap: false, labels: {}, a: '', b: '', loading: false };
  el.onclick = (e) => chClick(r, e);
  el.onchange = (e) => chChange(r, e);
  el.oninput = (e) => { if (e.target.dataset.chq !== undefined) { r.q = e.target.value; r.focus = true; chRender(r); } };
  return r;
}

// Compares a and b (Browse paths or "baseline:<id>") and draws the result. labels: { [path]: name } for the heading.
async function chLoad(r, a, b, labels = {}) {
  Object.assign(r, { a, b, labels });
  r.detail.clear(); r.open.clear(); r.gopen.clear(); r.loading = true;
  r.el.innerHTML = '<p class="dim" style="margin:0">Comparing…</p>';
  try { r.res = await api('POST', '/api/diff', { a, b, strict: r.strict, pool: r.pool === 'auto' ? 'auto' : r.pool === 'pool' }); }
  catch (e) { r.res = null; r.loading = false; r.el.innerHTML = `<p class="bad" style="margin:0">${esc(e.message)}</p>`; return null; }
  r.loading = false;
  chRender(r);
  const changed = r.res.files.filter(chCounted).filter((f) => f.status !== 'same' && !(f.binary && f.status === 'changed'));
  if (changed.length === 1) chToggle(r, changed[0].key); // one file: show its rows straight away
  return r.res;
}
const chCounted = (f) => f.kind !== 'record' && !f.hostMissing && f.kind !== 'combined';
const chName = (r, p) => r.labels[p] || (r.res && r.res.a.path === p ? r.res.a.name : r.res && r.res.b.path === p ? r.res.b.name : String(p).slice(String(p).lastIndexOf('/') + 1));

function chGroups(r) {
  const files = r.res.files.filter(chCounted).filter((f) => r.show.has(f.status));
  const q = r.q.trim().toLowerCase(), by = new Map();
  for (const f of files) {
    const data = f.kind === 'data';
    const gk = r.group === 'host' && f.host ? (f.hostName || f.host) : data ? (f.collection || f.rel) : 'Collected files';
    const gl = r.group === 'host' && f.host ? gk : data ? (f.label || f.rel) : 'Collected files';
    const g = by.get(gk) || { key: gk, label: gl, files: [], added: 0, removed: 0, modified: 0, attention: 0, tags: [] };
    g.files.push(f); g.added += f.status === 'added' ? (f.rows || 0) : f.added || 0; g.removed += f.status === 'removed' ? (f.rows || 0) : f.removed || 0; g.modified += f.modified || 0;
    g.attention = Math.max(g.attention, f.attention || 0); if (f.tags) for (const t of f.tags) if (!g.tags.includes(t)) g.tags.push(t);
    by.set(gk, g);
  }
  let out = [...by.values()];
  if (q) out = out.filter((g) => g.label.toLowerCase().includes(q) || g.files.some((f) => (f.hostName || f.host || '').toLowerCase().includes(q) || chDetailHas(r, f, q)));
  return out.sort((x, y) => y.attention - x.attention || (y.added + y.removed + y.modified) - (x.added + x.removed + x.modified) || x.label.localeCompare(y.label));
}
const chDetailHas = (r, f, q) => { const d = r.detail.get(f.key); if (!d || d.error || d.binary) return false; const has = (row) => (Array.isArray(row) ? row : [row]).some((c) => String(c ?? '').toLowerCase().includes(q)); return (d.addedItems || []).some((x) => has(x.row)) || (d.removedItems || []).some((x) => has(x.row)) || (d.modified || []).some((m) => has(m.b)); };

const chCounts = (f) => {
  if (f.binary && f.status === 'changed') return '<span class="dim">file differs</span>';
  if (f.status === 'changed') return `${f.added ? `<span class="add">+${chNum(f.added)}</span> ` : ''}${f.removed ? `<span class="rem">−${chNum(f.removed)}</span> ` : ''}${f.modified ? `<span class="mod">~${chNum(f.modified)}</span> ` : ''}${f.expected ? `<span class="dim" title="Marked as expected: not counted">${f.expected} expected</span>` : ''}`;
  if (f.status === 'added') return `<span class="add">${f.rows != null ? `+${chNum(f.rows)}` : 'new'}</span>`;
  if (f.status === 'removed') return `<span class="rem">${f.rows != null ? `−${chNum(f.rows)}` : 'gone'}</span>`;
  return f.bytesNotCompared ? '<span class="dim">in both</span>' : `<span class="dim">identical${f.noise ? ` · ${chNum(f.noise)} with a new time` : ''}</span>`;
};
const chSideTag = { changed: 'Changed', added: 'New', removed: 'Gone', same: 'Identical' };

function chRender(r) {
  const s = r.res; if (!s) return;
  const counted = s.files.filter(chCounted), t = (st) => counted.filter((f) => f.status === st).length;
  const rows = s.rows, none = !rows.added && !rows.removed && !rows.modified && !t('added') && !t('removed') && !t('changed');
  const chip = (st, label) => `<button type="button" class="df-chip ${st} ${r.show.has(st) ? 'on' : ''}" data-chshow="${st}">${label} <b>${t(st)}</b></button>`;
  const groups = chGroups(r);
  const tile = (cls, sign, n, label) => `<div class="ch-tile ${cls} ${n ? '' : 'zero'}"><b>${sign}${chNum(n)}</b><span>${label}</span></div>`;
  const hostsNote = [...s.hosts.onlyA.map((h) => [h, 'A']), ...s.hosts.onlyB.map((h) => [h, 'B'])].map(([h, side]) => `<b>${esc(h.replace(/^[_-]+/, '') || h)}</b> was only collected in ${side === 'A' ? 'the first' : 'the second'}`).join('; ');
  const changedFiles = counted.filter((f) => f.status === 'changed' || f.status === 'added' || f.status === 'removed');
  r.el.innerHTML = `<div class="ch-head"><div class="ch-sides"><span class="ch-side"><i>Before</i> ${esc(chName(r, s.a.path))}</span><span class="ch-arrow">→</span><span class="ch-side"><i>After</i> ${esc(chName(r, s.b.path))}</span></div>
      <div class="ch-tiles">${tile('add', '+', rows.added, 'new')}${tile('rem', '−', rows.removed, 'gone')}${tile('mod', '~', rows.modified, 'changed')}${s.hostCounts ? `<div class="ch-tile info"><b>${s.hostCounts.a}→${s.hostCounts.b}</b><span>hosts</span></div>` : ''}</div></div>
    ${s.pooled ? `<div class="df-note" title="Each collection is compared across all the hosts of each side. Rows say which hosts have them.">${esc(s.poolReason || 'Hosts are pooled.')}</div>` : ''}
    ${rows.noise && !r.strict ? `<div class="ch-noise"><span>${chNum(rows.noise)} item${rows.noise === 1 ? '' : 's'} differ only in a time or a counter and ${rows.noise === 1 ? 'is' : 'are'} not counted as changes.</span> <label><input type="checkbox" data-chopt="timeOnly" ${r.timeOnly ? 'checked' : ''}> list them</label></div>` : ''}
    <div class="ch-bar"><input type="search" data-chq placeholder="Search collections, hosts and opened rows" value="${esc(r.q)}" autocomplete="off">
      <div class="df-chips" style="margin:0">${chip('changed', 'Changed')}${chip('added', 'Only after')}${chip('removed', 'Only before')}${chip('same', 'Identical')}</div></div>
    <div class="ch-opts">${s.hostCounts && !s.pooled || r.group === 'host' ? `<span class="toggle ch-grp" data-chgroups><button type="button" data-chgroup="collection" class="${r.group === 'collection' ? 'on' : ''}">By collection</button><button type="button" data-chgroup="host" class="${r.group === 'host' ? 'on' : ''}">By host</button></span>` : ''}
      <label title="How the hosts of the two sides are lined up">Hosts <select data-chopt="pool"><option value="auto" ${r.pool === 'auto' ? 'selected' : ''}>matched by name (pooled if none match)</option><option value="match" ${r.pool === 'match' ? 'selected' : ''}>always matched by name</option><option value="pool" ${r.pool === 'pool' ? 'selected' : ''}>pooled: all hosts of each side together</option></select></label>
      <label title="Compare every column, including process IDs, times and other values that change on every run, and the bytes of collected files"><input type="checkbox" data-chopt="strict" ${r.strict ? 'checked' : ''}> every column</label>
      <label><input type="checkbox" data-chopt="wrap" ${r.wrap ? 'checked' : ''}> wrap long values</label>
      <span class="ch-spacer"></span>
      ${changedFiles.length ? `<a data-chexpand title="Open every collection that changed so the search covers their rows">Open all changes</a> <a data-chexport title="Every change as one CSV">Export CSV</a>` : ''}</div>
    ${hostsNote ? `<div class="df-note">${hostsNote}. ${s.pooled ? '' : 'Its files are not compared.'}</div>` : ''}
    <div class="ch-groups ${r.wrap ? 'wrap' : ''}">${groups.map((g) => chGroupHtml(r, g)).join('') || `<p class="dim" style="margin:10px 0 0">${none ? '<b>No changes.</b> Everything that was compared is the same on both sides.' : 'Nothing to show with these filters.'}</p>`}</div>
    ${s.files.some((f) => f.kind === 'record') ? '<p class="dim df-recs">Not compared: the run logs and summaries, which differ on every run.</p>' : ''}${s.truncated ? '<p class="dim">Only the first 3000 files of each side were compared.</p>' : ''}`;
  if (r.focus) { const q = r.el.querySelector('[data-chq]'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } r.focus = false; }
  decorateLocks?.(r.el);
}

function chGroupHtml(r, g) {
  const total = g.added + g.removed + g.modified;
  const open = r.gopen.has(g.key) ? r.gopen.get(g.key) : (total > 0 && r.res.files.length < 60) || g.files.some((f) => r.open.has(f.key));
  const tag = g.tags.find((x) => CH_TAG[x]);
  const counts = `${g.added ? `<span class="add">+${chNum(g.added)}</span> ` : ''}${g.removed ? `<span class="rem">−${chNum(g.removed)}</span> ` : ''}${g.modified ? `<span class="mod">~${chNum(g.modified)}</span>` : ''}${total ? '' : '<span class="dim">identical</span>'}`;
  const single = g.files.length === 1 && (!g.files[0].host || r.group !== 'collection');
  const head = `<div class="ch-ghead" data-chgroupopen="${esc(g.key)}" role="button" tabindex="0"><span class="chev">${open ? '▾' : '▸'}</span><span class="ch-gname">${esc(g.label)}</span>${tag ? `<span class="ch-tag" title="Collection tagged ${esc(tag)}">${esc(CH_TAG[tag])}</span>` : ''}<span class="ch-gn">${g.files.length > 1 ? `<span class="dim">${g.files.length} files</span> ` : ''}${counts}</span></div>`;
  if (!open) return `<div class="ch-group">${head}</div>`;
  return `<div class="ch-group open">${head}<div class="ch-gbody">${g.files.map((f) => chFileHtml(r, f, single)).join('')}</div></div>`;
}
function chFileHtml(r, f, single) {
  const open = r.open.has(f.key);
  const name = f.kind !== 'data' ? f.rel : r.group === 'host' ? (f.label || f.rel) : f.host ? (f.hostName || f.host) : f.hostsA != null ? `All hosts (${f.hostsA} → ${f.hostsB})` : (single ? 'This collection' : f.rel);
  return `<div class="ch-file ${f.status}"><div class="ch-fhead" data-chopen="${esc(f.key)}" role="button" tabindex="0"><span class="chev">${open ? '▾' : '▸'}</span><span class="df-tag ${f.status}">${chSideTag[f.status]}</span><span class="ch-fname" title="${esc(f.rel)}">${esc(name)}</span><span class="ch-fn">${chCounts(f)}</span></div>${open ? `<div class="ch-body">${chDetail(r, f)}</div>` : ''}</div>`;
}

// ---- the rows of one file ----
function chDetail(r, f) {
  const d = r.detail.get(f.key);
  if (f.binary && f.status === 'changed') return '<p class="dim" style="margin:6px 0">A binary file; its contents are not compared line by line.</p>';
  if (f.bytesNotCompared) return '<p class="dim" style="margin:6px 0">A collected file that is on both sides. Its contents are not compared (they change on every collection); tick <b>every column</b> to compare them.</p>';
  if (f.status === 'same' && !f.noise) return `<p class="dim" style="margin:6px 0">Identical.${f.ignored?.length ? ` Not compared: ${esc(f.ignored.join(', '))}.` : ''}</p>`;
  if (!d) return '<p class="dim" style="margin:6px 0">Loading…</p>';
  if (d.error) return `<p class="bad" style="margin:6px 0">${esc(d.error)}</p>`;
  if (d.binary) return '<p class="dim" style="margin:6px 0">A binary file or one too large to compare.</p>';
  const q = r.q.trim().toLowerCase(), hit = (row) => !q || (Array.isArray(row) ? row : [row]).some((c) => String(c ?? '').toLowerCase().includes(q));
  const key = new Set(d.keyColumns || []), ign = new Set(d.ignored || []), time = new Set(d.timeColumns || []);
  const mark = !!d.scope && can('hunts.run');
  const exBtn = (kind, i) => (mark ? `<td class="ch-mk"><button type="button" class="df-exp" data-chex="${kind}" data-f="${esc(f.key)}" data-i="${i}" title="Mark as expected: not reported again, on any host">Expected</button></td>` : '');
  const hostsCell = (x) => (d.pooled ? `<td class="ch-hosts">${(x.hosts || []).map((h) => `<span class="tagchip on">${esc(h)}</span>`).join(' ')}</td>` : '');
  const hostsHead = d.pooled ? '<th>Hosts</th>' : '';
  const rowsTable = (items, cls, kind) => {
    const list = items.map((x, i) => ({ x, i })).filter(({ x }) => hit(x.row));
    if (!list.length) return '';
    if (!d.csv) return `<div class="bb-tablewrap"><table class="bb-tbl df-ltbl ${cls}"><tbody>${list.map(({ x, i }) => `<tr>${exBtn(kind, i)}<td class="df-line">${esc(x.row)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="bb-tablewrap"><table class="bb-tbl ${cls}"><thead><tr>${mark ? '<th class="ch-mk"></th>' : ''}${hostsHead}${d.header.map((h) => `<th class="${ign.has(h) ? 'df-ign' : key.has(h) ? 'ch-keyc' : ''}" title="${ign.has(h) ? 'Not compared: changes on every run' : key.has(h) ? 'Identifies the item' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${list.map(({ x, i }) => `<tr>${exBtn(kind, i)}${hostsCell(x)}${d.header.map((h, j) => `<td class="${ign.has(h) ? 'df-ign' : key.has(h) ? 'ch-keyc' : ''}" title="${esc(x.row[j] ?? '')}">${esc(x.row[j] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const more = (n, total) => (total > n ? `<p class="dim" style="margin:4px 0">Showing ${n} of ${chNum(total)}.</p>` : '');
  const modified = () => {
    const list = d.modified.map((m, i) => ({ m, i })).filter(({ m }) => hit(m.b) || hit(m.a));
    if (!list.length) return '';
    const kc = d.csv ? d.header.filter((h) => key.has(h)) : [];
    const fieldHtml = (c) => `<span class="ch-field ${c.time ? 'time' : ''}"><span class="ch-fk">${esc(c.col)}</span><span class="rem">${esc(c.a === '' ? '(empty)' : c.a)}</span><span class="ch-to">→</span><span class="add">${esc(c.b === '' ? '(empty)' : c.b)}</span></span>`;
    return `<div class="bb-tablewrap"><table class="bb-tbl ch-mtbl"><thead><tr>${mark ? '<th class="ch-mk"></th>' : ''}${hostsHead}${(kc.length ? kc : ['Item']).map((h) => `<th class="ch-keyc">${esc(h)}</th>`).join('')}<th>What changed</th></tr></thead><tbody>${list.map(({ m, i }) => {
      const shown = m.changed.filter((c) => !c.time || r.timeOnly);
      const idv = kc.length ? kc.map((h) => `<td class="ch-keyc" title="${esc(m.b[d.header.indexOf(h)] ?? '')}">${esc(m.b[d.header.indexOf(h)] ?? '')}</td>`).join('') : `<td class="ch-keyc">${esc(m.b.slice(0, 2).join(' '))}</td>`;
      return `<tr>${exBtn('mod', i)}${hostsCell(m)}${idv}<td class="ch-changes">${shown.map(fieldHtml).join('') || '<span class="dim">only times changed</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  };
  const noiseList = () => (r.timeOnly && d.noise?.length ? `<div class="df-sec noise">Only a time or counter changed (${chNum(d.noiseRows)}) — not counted</div><div class="bb-tablewrap"><table class="bb-tbl ch-mtbl"><tbody>${d.noise.filter((n) => hit(n.b)).map((n) => `<tr><td class="ch-keyc">${esc(n.b.slice(0, 2).join(' '))}</td><td class="ch-changes">${n.changed.map((c) => `<span class="ch-field time"><span class="ch-fk">${esc(c.col)}</span><span class="rem">${esc(c.a)}</span><span class="ch-to">→</span><span class="add">${esc(c.b)}</span></span>`).join('')}</td></tr>`).join('')}</tbody></table></div>${d.noiseRows > d.noise.length ? `<p class="dim" style="margin:4px 0">Showing ${d.noise.length} of ${chNum(d.noiseRows)}.</p>` : ''}` : '');
  const m = d.modifiedTotal ? `<div class="df-sec mod">Changed (${chNum(d.modifiedTotal)})</div>${modified()}${more(d.modified.length, d.modifiedTotal)}` : '';
  const a = d.addedTotal ? `<div class="df-sec add">${d.pooled ? 'New in the second' : 'New'} (${chNum(d.addedTotal)})</div>${rowsTable(d.addedItems, 'add', 'add')}${more(d.addedItems.length, d.addedTotal)}` : '';
  const g = d.removedTotal ? `<div class="df-sec rem">${d.pooled ? 'Only in the first' : 'Gone'} (${chNum(d.removedTotal)})</div>${rowsTable(d.removedItems, 'rem', 'rem')}${more(d.removedItems.length, d.removedTotal)}` : '';
  const foot = `<p class="dim" style="margin:6px 0 2px">${chNum(d.same)} ${d.csv ? 'item' : 'line'}${d.same === 1 ? '' : 's'} identical.${d.expected ? ` ${d.expected} expected change${d.expected === 1 ? ' is' : 's are'} hidden (Results &gt; Baseline lists them).` : ''}${d.keyColumns?.length ? ` Items are told apart by ${esc(d.keyColumns.join(' + '))}.` : ''}${ign.size ? ` Not compared (they change on every run): ${esc([...ign].join(', '))}.` : ''}${time.size ? ` Times (${esc([...time].join(', '))}) alone do not make a change.` : ''}</p>`;
  return `${m}${a}${g}${noiseList()}${foot}`;
}

// ---- actions ----
async function chLoadDetail(r, key) {
  const f = r.res.files.find((x) => x.key === key);
  if (!f || f.status === 'same' && !f.noise || r.detail.has(key) && !(r.timeOnly && !r.detail.get(key).noiseLoaded) || f.binary && f.status === 'changed' || f.bytesNotCompared) return;
  try { const d = await api('POST', '/api/diff/file', { a: r.res.a.path, b: r.res.b.path, key, strict: r.strict, pool: r.pool === 'auto' ? 'auto' : r.pool === 'pool', noise: r.timeOnly }); d.noiseLoaded = r.timeOnly; r.detail.set(key, d); }
  catch (e) { r.detail.set(key, { error: e.message }); }
}
async function chToggle(r, key) {
  if (r.open.has(key)) { r.open.delete(key); chRender(r); return; }
  r.open.add(key);
  const f = r.res.files.find((x) => x.key === key);
  if (f) for (const g of chGroups(r)) if (g.files.includes(f)) r.gopen.set(g.key, true);
  chRender(r); await chLoadDetail(r, key); chRender(r);
}
async function chReload(r) { // after a setting changed or a row was marked: compare again, keeping what was open
  const open = [...r.open], g = new Map(r.gopen), keep = { q: r.q };
  await chLoad(r, r.a, r.b, r.labels);
  r.gopen = g; Object.assign(r, keep);
  for (const k of open) if (r.res?.files.some((x) => x.key === k)) { r.open.add(k); await chLoadDetail(r, k); }
  chRender(r);
  r.opts.onChange?.(r.res);
}
async function chOpenAll(r) {
  const files = r.res.files.filter(chCounted).filter((f) => f.status !== 'same' && !(f.binary && f.status === 'changed')).slice(0, 60);
  for (const f of files) r.open.add(f.key);
  for (const g of chGroups(r)) r.gopen.set(g.key, true);
  chRender(r);
  await Promise.all(files.map((f) => chLoadDetail(r, f.key)));
  chRender(r);
}
async function chExport(r) {
  await chOpenAll(r);
  const out = [['Collection', 'Host', 'Change', 'Item', 'Field', 'Before', 'After', 'Row']];
  const cell = (v) => (Array.isArray(v) ? v.join(' | ') : String(v ?? ''));
  for (const f of r.res.files.filter(chCounted)) {
    const d = r.detail.get(f.key); if (!d || d.error || d.binary) continue;
    const base = [f.label || f.rel, f.hostName || f.host || (f.hostsB != null ? 'pooled' : '')];
    const row = (x) => (d.csv ? d.header.map((h, i) => `${h}=${x.row[i] ?? ''}`).join('; ') : x.row);
    const key = (x) => (d.csv ? (d.keyColumns?.length ? d.keyColumns : d.header.slice(0, 2)).map((h) => x[d.header.indexOf(h)] ?? '').join(' ') : '');
    for (const x of d.addedItems) out.push([...base, 'New', key(x.row), '', '', '', row(x)]);
    for (const x of d.removedItems) out.push([...base, 'Gone', key(x.row), '', '', '', row(x)]);
    for (const m of d.modified) for (const c of m.changed.filter((c) => !c.time)) out.push([...base, 'Changed', key(m.b), c.col, c.a, c.b, '']);
  }
  const text = out.map((l) => l.map((c) => (/[",\r\n]/.test(cell(c)) ? `"${cell(c).replace(/"/g, '""')}"` : cell(c))).join(',')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'changes.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function chMark(r, btn) {
  const d = r.detail.get(btn.dataset.f), i = Number(btn.dataset.i), kind = btn.dataset.chex;
  if (!d?.scope) return;
  const note = prompt('Mark this as expected? It will no longer be reported as new, gone or changed, on any host.\n\nNote (optional):', '');
  if (note === null) return;
  const key = (kind === 'add' ? d.addedKeys : kind === 'rem' ? d.removedKeys : d.modifiedKeys)[i];
  const row = kind === 'add' ? d.addedItems[i].row : kind === 'rem' ? d.removedItems[i].row : d.modified[i].b;
  btn.disabled = true;
  try { await api('POST', '/api/expected', { scope: d.scope, key, header: d.csv ? d.header : [], row, note }); } catch (err) { toast(err.message, 'bad'); btn.disabled = false; return; }
  toast('Marked as expected');
  chReload(r);
}
function chClick(r, e) {
  const ex = e.target.closest('[data-chex]'); if (ex) { e.stopPropagation(); chMark(r, ex); return; }
  const show = e.target.closest('[data-chshow]'); if (show) { const s = show.dataset.chshow; if (r.show.has(s)) r.show.delete(s); else r.show.add(s); chRender(r); return; }
  const grp = e.target.closest('[data-chgroup]'); if (grp) { r.group = grp.dataset.chgroup; r.gopen.clear(); chRender(r); return; }
  const go = e.target.closest('[data-chgroupopen]');
  if (go) { const k = go.dataset.chgroupopen, g = chGroups(r).find((x) => x.key === k); const cur = r.gopen.has(k) ? r.gopen.get(k) : go.parentElement.classList.contains('open'); r.gopen.set(k, !cur); if (g && g.files.length === 1 && !cur) { chRender(r); chToggle(r, g.files[0].key); return; } chRender(r); return; }
  const f = e.target.closest('[data-chopen]'); if (f) { chToggle(r, f.dataset.chopen); return; }
  if (e.target.closest('[data-chexpand]')) { chOpenAll(r); return; }
  if (e.target.closest('[data-chexport]')) { chExport(r); }
}
function chChange(r, e) {
  const o = e.target.dataset.chopt; if (!o) return;
  if (o === 'wrap') { r.wrap = e.target.checked; chRender(r); }
  else if (o === 'timeOnly') { r.timeOnly = e.target.checked; r.detail.clear(); chRender(r); for (const k of r.open) chLoadDetail(r, k).then(() => chRender(r)); }
  else if (o === 'strict') { r.strict = e.target.checked; chReload(r); }
  else if (o === 'pool') { r.pool = e.target.value; chReload(r); }
}
