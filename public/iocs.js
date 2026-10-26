// ---- Burrow: IOC ----
// Upload indicators of compromise; every list is a header on this page. Under it are the hunts whose output contains one of its
// indicators: the run, and the individual files that returned the indicator (click one to open it in Browse with the indicator highlighted).
// Shares helpers with app.js: api, esc, $, toast, can, go, isActive; browse.js: openInBrowse, pinPath, isPinned.
const ic = { lists: [], matches: new Map(), items: new Map(), open: new Set(), seen: new Set(), allItems: new Set() };
const IOC_TYPES = { ip: 'IP', domain: 'Domain', md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', url: 'URL', email: 'Email', path: 'Path', file: 'File name', string: 'Text' };

async function loadIocs() {
  try { ic.lists = await api('GET', '/api/iocs'); } catch (e) { $('iocLists').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  for (const l of ic.lists) if (!ic.seen.has(l.id)) { ic.seen.add(l.id); ic.open.add(l.id); }
  renderIocs();
  for (const l of ic.lists) iocScan(l.id);
}
async function iocScan(id) {
  ic.matches.set(id, 'scanning'); iocSummary(id);
  try { ic.matches.set(id, await api('GET', `/api/iocs/${id}/matches`)); } catch (e) { ic.matches.set(id, { error: e.message }); }
  renderIocs();
}
const iocWhen = (iso) => (iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
function iocBadge(l) {
  const m = ic.matches.get(l.id);
  if (m === 'scanning' || m === undefined) return '<span class="ioc-b dim">Scanning hunts…</span>';
  if (m.error) return `<span class="ioc-b bad" title="${esc(m.error)}">Scan failed</span>`;
  if (!m.length) return '<span class="ioc-b ok">No matches</span>';
  const files = m.reduce((n, r) => n + r.files.length, 0);
  return `<span class="ioc-b hit">${m.length} hunt${m.length === 1 ? '' : 's'} · ${files} file${files === 1 ? '' : 's'}</span>`;
}
function iocSummary(id) { const b = document.querySelector(`[data-iochead="${id}"] .ioc-badge`); const l = ic.lists.find((x) => x.id === id); if (b && l) b.innerHTML = iocBadge(l); }
function renderIocs() {
  $('iocLists').innerHTML = ic.lists.map((l) => {
    const open = ic.open.has(l.id), m = ic.matches.get(l.id);
    const types = Object.entries(l.types).map(([t, n]) => `${n} ${IOC_TYPES[t] || t}`).join(' · ');
    return `<div class="ioc-list ${open ? '' : 'folded'}">
      <div class="ioc-head" data-iochead="${esc(l.id)}"><button type="button" class="ioc-tog" data-ioctog="${esc(l.id)}" aria-expanded="${open}"><span class="chev">${open ? '▾' : '▸'}</span><span class="ioc-name">${esc(l.name)}</span><span class="grp-count">${l.count}</span></button>
        <span class="ioc-badge">${iocBadge(l)}</span><span class="ioc-meta dim">${esc(types)}</span><span class="ioc-by dim">${esc(l.createdBy || '')} · ${esc(iocWhen(l.createdAt))}</span>
        <span class="ioc-acts"><a data-iocscan="${esc(l.id)}" title="Look through the hunt output again">Rescan</a><a class="bad" data-iocdel="${esc(l.id)}" data-perm="hunts.run" data-perm-what="delete IOC lists">Delete</a></span></div>
      ${open ? `<div class="ioc-body">${l.note ? `<div class="dim" style="margin-bottom:6px">${esc(l.note)}</div>` : ''}${iocItems(l)}${iocMatches(l, m)}</div>` : ''}</div>`;
  }).join('') || '<p class="dim" style="margin:6px 0 0">No IOC lists yet. Press Add IOC list to upload one.</p>';
  decorateLocks($('iocLists'));
}
function iocItems(l) {
  const shown = ic.allItems.has(l.id), items = ic.items.get(l.id);
  if (!shown) return `<div class="ioc-sub"><a data-iocitems="${esc(l.id)}">Show the ${l.count} indicator${l.count === 1 ? '' : 's'}</a></div>`;
  if (!items) return '<div class="ioc-sub dim">Loading…</div>';
  return `<div class="ioc-sub"><a data-iocitems="${esc(l.id)}">Hide the indicators</a></div><div class="ioc-chips">${items.slice(0, 600).map((i) => `<span class="ioc-chip" title="${esc(IOC_TYPES[i.type] || i.type)}"><i>${esc(IOC_TYPES[i.type] || i.type)}</i>${esc(i.value)}</span>`).join('')}${items.length > 600 ? `<span class="dim">and ${items.length - 600} more</span>` : ''}</div>`;
}
function iocMatches(l, m) {
  if (m === 'scanning' || m === undefined) return '<div class="ioc-sub dim">Looking through the hunt output…</div>';
  if (m.error) return `<div class="ioc-sub bad">${esc(m.error)}</div>`;
  if (!m.length) return '<div class="ioc-sub ok">No hunt has returned any of these indicators.</div>';
  return `<div class="ioc-sub ioc-hh">Hunts that returned these indicators</div>${m.map((r) => {
    const pinned = window.isPinned?.(r.path);
    return `<div class="ioc-run"><div class="ioc-runhead"><a class="ioc-runname" data-iocgo="${esc(r.path)}" title="Open this hunt's folder in Browse">${esc(r.name)}</a><span class="dim">${esc(iocWhen(r.startedAt))}</span>
        <span class="ioc-b hit">${r.indicators} indicator${r.indicators === 1 ? '' : 's'} in ${r.files.length} file${r.files.length === 1 ? '' : 's'}</span><a class="ioc-pin" data-iocpin="${esc(r.path)}" title="${pinned ? 'Unpin' : 'Pin this hunt'}">${pinned ? '★ Pinned' : '☆ Pin'}</a></div>
      <div class="ioc-files">${r.files.map((f) => `<div class="ioc-file-row"><a data-iocgo="${esc(f.path)}" data-find="${esc(f.matches[0].value)}" title="Open in Browse with ${esc(f.matches[0].value)} highlighted">${esc(f.rel)}</a>
        <span class="ioc-vals">${f.matches.slice(0, 8).map((x) => `<a class="ioc-val" data-iocgo="${esc(f.path)}" data-find="${esc(x.value)}" title="Highlight ${esc(x.value)}">${esc(x.value)}<b>${x.count}</b></a>`).join('')}${f.matches.length > 8 ? `<span class="dim">+${f.matches.length - 8}</span>` : ''}</span></div>`).join('')}</div></div>`;
  }).join('')}`;
}
$('iocLists').onclick = async (e) => {
  const t = e.target;
  const tog = t.closest('[data-ioctog]');
  if (tog) { const id = tog.dataset.ioctog; if (ic.open.has(id)) ic.open.delete(id); else ic.open.add(id); renderIocs(); return; }
  const scan = t.closest('[data-iocscan]'); if (scan) { iocScan(scan.dataset.iocscan); return; }
  const del = t.closest('[data-iocdel]');
  if (del) {
    const l = ic.lists.find((x) => x.id === del.dataset.iocdel);
    if (!confirm(`Delete the list "${l?.name}" and its ${l?.count} indicators? The hunt output is not touched.`)) return;
    try { await api('DELETE', `/api/iocs/${del.dataset.iocdel}`); toast('List deleted'); } catch (err) { toast(err.message, 'bad'); return; }
    loadIocs(); return;
  }
  const items = t.closest('[data-iocitems]');
  if (items) {
    const id = items.dataset.iocitems;
    if (ic.allItems.has(id)) { ic.allItems.delete(id); renderIocs(); return; }
    ic.allItems.add(id); renderIocs();
    if (!ic.items.has(id)) { try { ic.items.set(id, (await api('GET', `/api/iocs/${id}`)).items); } catch (err) { ic.allItems.delete(id); toast(err.message, 'bad'); } renderIocs(); }
    return;
  }
  const pin = t.closest('[data-iocpin]'); if (pin) { await window.pinPath(pin.dataset.iocpin); renderIocs(); return; }
  const go2 = t.closest('[data-iocgo]'); if (go2) window.openInBrowse(go2.dataset.iocgo, go2.dataset.find || '');
};

// ---- Add IOC list ----
const iocSay = (t, cls = 'bad') => { $('iocMsg').textContent = t; $('iocMsg').className = `um-msg ${cls}`; };
function openIocModal() { $('iocName').value = $('iocText').value = $('iocNote').value = ''; $('iocFile').value = ''; $('iocFileName').textContent = '.txt or .csv, one indicator per line'; iocSay(''); $('iocModal').hidden = false; $('iocName').focus(); }
const closeIocModal = () => { $('iocModal').hidden = true; };
$('iocAdd').onclick = openIocModal;
$('iocX').onclick = $('iocCancel').onclick = closeIocModal;
$('iocModal').onclick = (e) => { if (e.target.id === 'iocModal') closeIocModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('iocModal').hidden) closeIocModal(); });
$('iocFile').onchange = async () => {
  const f = $('iocFile').files[0]; if (!f) return;
  if (f.size > 5 * 1024 * 1024) { iocSay('That file is over 5 MB'); return; }
  $('iocText').value = await f.text();
  $('iocFileName').textContent = `${f.name} (${(f.size / 1024).toFixed(1)} KB)`;
  if (!$('iocName').value.trim()) $('iocName').value = f.name.replace(/\.[^.]+$/, '');
  iocSay('');
};
$('iocSave').onclick = async () => {
  iocSay('');
  try {
    const l = await api('POST', '/api/iocs', { name: $('iocName').value, text: $('iocText').value, note: $('iocNote').value });
    closeIocModal(); toast(`Added ${l.name}: ${l.count} indicator${l.count === 1 ? '' : 's'}`);
    ic.open.add(l.id); ic.seen.add(l.id);
    loadIocs();
  } catch (e) { iocSay(e.message); }
};
