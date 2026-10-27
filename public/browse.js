// ---- Browse: Files and Diff ----
// Files is a view over collections, actions, binaries and what hunts and responses brought back: click a folder to open it, click a file to
// preview it. Search finds names and text inside files and highlights the text in the file you open, with Next / Previous. A file can be
// shown as plain text, a CSV table, a JSON tree, an XML tree or an event log (EVTX). Output can be deleted, and any file or folder pinned
// (with a note) to Browse > Pinned. Diff compares the output of two hunts or responses.
// Shares helpers with app.js: api, esc, $, toast, can, bbFmt, highlight, highlightJson, go, isActive.
const bb = { path: '/', entries: [], open: null, seq: 0, mode: 'auto', file: null, find: '', marks: [], at: -1, results: null, query: '', pins: [], editNote: null };
const bbPinsOpen = () => { try { return localStorage.getItem('kb.bbPinsOpen') !== '0'; } catch { return true; } };
const bbIcon = (dir) => dir
  ? '<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 3.5h4.2l1.3 1.5h7.5v7.5h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'
  : '<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
// More colouring for previews, using app.js's highlight(): the groups of each pattern map to the t-* classes in cls.
Object.assign(HL, {
  xml: { re: /(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>)|("[^"]*"|'[^']*')|(<\/?[\w:.-]+|\/?>|<\?[\w-]+|\?>)|(\b[\w:.-]+(?==))/g, cls: ['c', 's', 'k', 'p'] },
  ini: { re: /(^[ \t]*[;#].*$)|(^[ \t]*\[[^\]\r\n]+\])|(^[ \t]*[\w.\-@$ ]+?(?=[ \t]*[=:]))|("(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*')|(\b-?\d+(?:\.\d+)?\b)/gm, cls: ['c', 'k', 'v', 's', 'f'] },
  yaml: { re: /(#.*$)|(^[ \t]*-?[ \t]*["']?[\w.\-/ ]+["']?(?=:(?:\s|$)))|("(?:[^"\\\r\n]|\\.)*"|'[^'\r\n]*')|(\b(?:true|false|null|yes|no|on|off)\b)|(\b-?\d+(?:\.\d+)?\b)/gm, cls: ['c', 'v', 's', 'k', 'f'] },
  log: { re: /(\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\b\d{1,2}\/\d{1,2}\/\d{2,4},? \d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?)|(\b(?:ERROR|FATAL|CRITICAL|SEVERE|FAIL(?:ED|URE)?|DENIED|EXCEPTION)\b)|(\b(?:WARN(?:ING)?|ALERT)\b)|(\b(?:INFO|DEBUG|TRACE|SUCCESS)\b)|(\b(?:\d{1,3}\.){3}\d{1,3}\b)|(\b[a-fA-F0-9]{32,64}\b)|("(?:[^"\\\r\n]|\\.)*")/g, cls: ['v', 'e', 'f', 'k', 'p', 'h', 's'] },
  slash: { re: /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:function|return|if|else|for|while|switch|case|break|continue|const|let|var|class|new|try|catch|finally|throw|import|export|from|async|await|public|private|protected|static|void|int|string|bool|using|namespace|true|false|null|undefined|this)\b)|(\b-?\d+(?:\.\d+)?\b)/gm, cls: ['c', 's', 'k', 'f'] },
  py: { re: /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*')|(\b(?:def|return|if|elif|else|for|while|break|continue|class|import|from|try|except|finally|raise|with|as|in|is|not|and|or|lambda|pass|yield|None|True|False|self|end|do|puts|require)\b)|(\b-?\d+(?:\.\d+)?\b)/gm, cls: ['c', 's', 'k', 'f'] },
  bat: { re: /(^[ \t]*(?:rem\b|::).*$)|("[^"\r\n]*")|(%[\w~:*]+%|%%?\w)|(\b(?:echo|set|if|else|for|goto|call|exit|start|copy|del|move|mkdir|cd|dir|type|findstr|net|reg|sc|taskkill|tasklist|powershell|cmd)\b)/gim, cls: ['c', 's', 'v', 'k'] },
  sql: { re: /(--.*$|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|(\b(?:select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|drop|alter|join|left|right|inner|outer|on|group|by|order|having|limit|as|in|is|null|like|union)\b)|(\b\d+(?:\.\d+)?\b)/gim, cls: ['c', 's', 'k', 'f'] },
});
const BB_KIND = {
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell', sh: 'bash', bash: 'bash', json: 'json',
  xml: 'xml', html: 'xml', htm: 'xml', xsd: 'xml', xaml: 'xml', svg: 'xml', config: 'xml', manifest: 'xml', plist: 'xml', csproj: 'xml', nuspec: 'xml',
  ini: 'ini', conf: 'ini', cfg: 'ini', inf: 'ini', reg: 'ini', desktop: 'ini', service: 'ini', properties: 'ini', toml: 'ini', yaml: 'yaml', yml: 'yaml',
  log: 'log', txt: 'log', out: 'log', err: 'log', js: 'slash', mjs: 'slash', ts: 'slash', c: 'slash', h: 'slash', cpp: 'slash', cs: 'slash', java: 'slash', go: 'slash', rs: 'slash', php: 'slash', css: 'slash',
  py: 'py', rb: 'py', pl: 'py', bat: 'bat', cmd: 'bat', sql: 'sql',
};
const bbHighlightText = (ext, t) => { const k = BB_KIND[ext]; return !k ? esc(t) : k === 'json' ? highlightJson(t) : highlight(t, k); };
// What kind of value a table cell holds, for its colour: number, IP address, hash, date, path, true/false, or empty.
const bbCellClass = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return 'cv-e';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'cv-n';
  if (/^(true|false|yes|no)$/i.test(s)) return 'cv-b';
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(s)) return 'cv-ip';
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(s)) return 'cv-h';
  if (/^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) return 'cv-d';
  if (/^[A-Za-z]:\\|^\\\\|^\/[\w.-]/.test(s)) return 'cv-p';
  return '';
};
const bbJoin = (dir, name) => (dir === '/' ? '' : dir) + '/' + name;
const bbDirOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
// What can be deleted: a run's folder or anything inside it, a report, a pulled file (the server checks this too).
const bbDeletable = (p) => /^\/reports\/[^/]+/.test(p) || /^\/output\/[^/]+\/[^/]+/.test(p);
const bbPinFor = (p) => bb.pins.find((x) => x.path === p);

// ---- opening the page, folders ----
function bbEnter() { loadPins(); loadBrowse('/'); }
async function loadBrowse(path) {
  const seq = ++bb.seq;
  if (typeof path === 'string') { bb.path = path; bb.open = null; bb.file = null; }
  let r;
  try { r = await api('GET', `/api/browse?path=${encodeURIComponent(bb.path)}`); } catch (e) { if (seq === bb.seq) $('bbList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (seq !== bb.seq) return;
  bb.entries = r.entries;
  renderBrowse();
  if (!bb.open) $('bbPreview').innerHTML = '<p class="dim" style="margin:0">Select a file to preview it.</p>';
}
function renderBrowse() {
  const segs = bb.path.split('/').filter(Boolean);
  let acc = '';
  $('bbCrumbs').innerHTML = `<a data-path="/">Browse</a>` + segs.map((s) => { acc += '/' + s; return ` <span class="sep">/</span> <a data-path="${esc(acc)}">${esc(s)}</a>`; }).join('');
  const top = bb.path === '/';
  // The button at the top right downloads the folder being viewed as a zip (nothing at the top level, which is only the list of locations).
  const dlBtn = $('bbZip');
  dlBtn.hidden = top;
  dlBtn.href = `/api/browse/download?folder=1&path=${encodeURIComponent(bb.path)}`;
  const folderPinned = !top && bbPinFor(bb.path);
  $('bbPinFolder').hidden = top;
  $('bbPinFolder').textContent = folderPinned ? '★ Pinned' : '☆ Pin folder';
  $('bbDelFolder').hidden = top || !bbDeletable(bb.path);
  $('bbSearchScope').textContent = top ? 'Searching all locations (not Binaries)' : `Searching in ${bb.path}`;
  if (bb.results) { renderResults(); return; }
  const rows = bb.entries.map((e) => {
    const full = bbJoin(bb.path, e.name), pinned = !!bbPinFor(full);
    return `<tr class="bb-row" data-name="${esc(e.name)}" data-dir="${e.dir ? 1 : 0}">
      <td class="bb-name">${bbIcon(e.dir)}<span>${esc(e.label || e.name)}</span>${e.desc ? `<span class="bb-desc">${esc(e.desc)}</span>` : ''}</td>
      <td class="dim">${e.dir ? `${e.count} item${e.count === 1 ? '' : 's'}` : bbFmt(e.size)}</td>
      <td class="dim">${top || !e.modified ? '' : esc(new Date(e.modified).toLocaleString())}</td>
      <td class="bb-acts">${top ? '' : `<button type="button" class="bb-ic ${pinned ? 'on' : ''}" data-pin="${esc(full)}" title="${pinned ? 'Pinned. Click to unpin' : 'Pin this'}">${pinned ? '★' : '☆'}</button>${bbDeletable(full) ? `<button type="button" class="bb-ic del" data-del="${esc(full)}" data-isdir="${e.dir ? 1 : 0}" data-perm="hunts.run,actions.run" data-perm-what="delete output" title="Delete">✕</button>` : ''}`}</td></tr>`;
  }).join('');
  $('bbList').innerHTML = `<table><thead><tr><th>Name</th><th>${top ? 'Contents' : 'Size / items'}</th><th>${top ? '' : 'Modified'}</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="dim">This folder is empty.</td></tr>'}</tbody></table>`;
  document.querySelectorAll('#bbList .bb-row').forEach((tr) => tr.classList.toggle('on', tr.dataset.dir === '0' && tr.dataset.name === bb.open));
  decorateLocks($('bbList'));
}
$('bbCrumbs').onclick = (e) => { const p = e.target.dataset.path; if (p) { bbClearSearch(false); loadBrowse(p); } };

// ---- search ----
async function bbSearch() {
  const q = $('bbSearch').value.trim();
  if (q.length < 2) { toast('Type at least 2 characters to search', 'bad'); return; }
  $('bbList').innerHTML = '<p class="dim" style="margin:6px 0">Searching…</p>';
  $('bbSearchClear').hidden = false;
  try { bb.results = await api('GET', `/api/browse/search?q=${encodeURIComponent(q)}&path=${encodeURIComponent(bb.path)}`); } catch (e) { bb.results = null; $('bbList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  bb.query = q;
  renderResults();
}
function bbClearSearch(rerender = true) {
  bb.results = null; bb.query = ''; bb.find = ''; $('bbSearch').value = ''; $('bbSearchClear').hidden = true;
  if (rerender) renderBrowse();
}
const bbMark = (text, q) => {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<mark>${esc(text.slice(i, i + q.length))}</mark>${esc(text.slice(i + q.length))}`;
};
function renderResults() {
  const r = bb.results, q = bb.query;
  $('bbList').innerHTML = `<div class="bb-sum">${r.results.length} result${r.results.length === 1 ? '' : 's'} for <b>${esc(q)}</b> · ${r.scanned.toLocaleString()} files searched${r.truncated ? ' · stopped early, narrow the search by opening a folder first' : ''}</div>
    <div class="bb-res">${r.results.map((x) => `<div class="bb-hit" data-rp="${esc(x.path)}" data-dir="${x.dir ? 1 : 0}">
      <div class="bb-hit-top">${bbIcon(x.dir)}<b>${bbMark(x.name, q)}</b>${x.count ? `<span class="bb-n">${x.count} match${x.count === 1 ? '' : 'es'}</span>` : ''}${x.nameMatch && !x.dir && !x.count ? '<span class="bb-n alt">name</span>' : ''}</div>
      <div class="bb-hit-path">${esc(bbDirOf(x.path))}</div>${x.snippet ? `<div class="bb-snip">${bbMark(x.snippet, q)}</div>` : ''}</div>`).join('') || '<p class="dim">Nothing found.</p>'}</div>`;
}
$('bbSearchGo').onclick = bbSearch;
$('bbSearch').onkeydown = (e) => { if (e.key === 'Enter') bbSearch(); };
$('bbSearchClear').onclick = () => bbClearSearch();

// ---- clicks in the list ----
$('bbList').onclick = async (e) => {
  const pin = e.target.closest('[data-pin]');
  if (pin) { await bbTogglePin(pin.dataset.pin); renderBrowse(); return; }
  const del = e.target.closest('[data-del]');
  if (del) { bbDelete(del.dataset.del, del.dataset.isdir === '1'); return; }
  const hit = e.target.closest('.bb-hit');
  if (hit) {
    if (hit.dataset.dir === '1') { const p = hit.dataset.rp; bbClearSearch(false); loadBrowse(p); return; }
    bbOpenFile(hit.dataset.rp, bb.query, false); return;
  }
  const tr = e.target.closest('.bb-row'); if (!tr) return;
  const full = bbJoin(bb.path, tr.dataset.name);
  if (tr.dataset.dir === '1') { loadBrowse(full); return; }
  bbOpenFile(full, '', true);
};
// Opens a file in the preview. From the search results the list stays as it is; otherwise the list moves to the file's folder.
async function bbOpenFile(full, find, moveList) {
  const name = full.slice(full.lastIndexOf('/') + 1);
  if (moveList && bb.path !== bbDirOf(full)) { bb.path = bbDirOf(full); try { bb.entries = (await api('GET', `/api/browse?path=${encodeURIComponent(bb.path)}`)).entries; } catch { /* the preview still opens */ } }
  bb.open = name; bb.openPath = full; bb.find = find || ''; bb.mode = 'auto'; bb.at = -1;
  if (moveList || !bb.results) renderBrowse();
  else document.querySelectorAll('#bbList .bb-hit').forEach((h) => h.classList.toggle('on', h.dataset.rp === full));
  $('bbPreview').innerHTML = '<p class="dim" style="margin:0">Opening…</p>';
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  try {
    const f = await api('GET', `/api/browse/file?path=${encodeURIComponent(full)}`);
    if (bb.openPath !== full) return;
    bb.file = { ...f, ext, path: full };
  } catch (err) { if (bb.openPath === full) $('bbPreview').innerHTML = `<p class="bad">${esc(err.message)}</p>`; return; }
  bbRenderPreview();
}

// ---- preview ----
const BB_MODES = [['text', 'Text'], ['csv', 'CSV'], ['json', 'JSON'], ['xml', 'XML']];
const bbAutoMode = (f) => (f.ext === 'evtx' ? 'evtx' : f.ext === 'csv' || f.ext === 'tsv' ? 'csv' : f.ext === 'json' ? 'json' : /^(xml|config|manifest|xsd|xaml|plist|svg)$/.test(f.ext) ? 'xml' : 'text');
function bbRenderPreview() {
  const f = bb.file; if (!f) return;
  if (bb.mode === 'auto') bb.mode = bbAutoMode(f);
  const evtx = f.ext === 'evtx', modes = evtx ? [['evtx', 'Event log']] : f.binary ? [] : BB_MODES;
  const pinned = !!bbPinFor(f.path), canDel = bbDeletable(f.path);
  $('bbPreview').innerHTML = `<div class="bb-head"><div style="min-width:0"><div class="bb-title">${esc(f.name)}</div><div class="hd-file">${esc(f.path)} · ${bbFmt(f.size)} · ${esc(new Date(f.modified).toLocaleString())}</div></div>
      <div class="bb-btns"><button type="button" class="act sec" id="bbPinFile">${pinned ? '★ Pinned' : '☆ Pin'}</button>
        <a class="act sec" href="/api/browse/download?path=${encodeURIComponent(f.path)}" download data-perm="hunts.export" data-perm-what="download files">Download</a>
        ${canDel ? '<button type="button" class="del" id="bbDelFile" data-perm="hunts.run,actions.run" data-perm-what="delete output">Delete</button>' : ''}</div></div>
    <div class="bb-bar">${modes.length ? `<div class="toggle bb-modes" id="bbModes">${modes.map(([k, l]) => `<button type="button" data-mode="${k}" class="${bb.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
      ${f.binary && !evtx ? '' : `<div class="bb-find"><input type="text" id="bbFind" placeholder="Find in this file" value="${esc(bb.find)}" spellcheck="false" autocomplete="off"><span class="bb-count" id="bbCount"></span><button type="button" class="act sec" id="bbPrev" title="Previous (Shift+Enter)">◀</button><button type="button" class="act sec" id="bbNext" title="Next (Enter)">Next ▶</button></div>`}</div>
    <div id="bbBody" class="bb-body"></div>`;
  decorateLocks($('bbPreview'));
  bbRenderBody();
}
async function bbRenderBody() {
  const f = bb.file, box = $('bbBody'); if (!f || !box) return;
  const note = f.truncated && f.text ? `<p class="dim" style="margin-top:6px">Showing the first ${bbFmt(f.text.length)} of ${bbFmt(f.size)}. Download the file for the rest.</p>` : '';
  if (bb.mode === 'evtx') {
    box.innerHTML = '<p class="dim">Reading the event log…</p>';
    if (!f.evtx) { try { f.evtx = await api('GET', `/api/browse/evtx?path=${encodeURIComponent(f.path)}`); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; } }
    if (bb.file !== f) return;
    const ev = f.evtx;
    box.innerHTML = `<div class="dim bb-sum">${ev.shown.toLocaleString()} event${ev.shown === 1 ? '' : 's'}, newest first${ev.truncated ? ` (only the newest ${ev.shown.toLocaleString()} are shown; download the file for all of them)` : ''}</div>
      <div class="bb-tablewrap"><table class="bb-tbl"><thead><tr><th>Time</th><th>ID</th><th>Level</th><th>Provider</th><th>Computer</th><th>Data</th></tr></thead><tbody>${ev.events.map((x) => `<tr><td class="nw">${esc(new Date(x.time).toLocaleString())}</td><td>${x.id}</td><td>${esc(x.level)}</td><td>${esc(x.provider)}</td><td>${esc(x.computer)}</td><td class="wrap">${esc(x.data)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (f.binary) {
    box.innerHTML = `<p class="dim">Binary file (${bbFmt(f.size)}); no preview. Use Download to save it.</p>`;
  } else if (bb.mode === 'csv') {
    const rows = bbParseCsv(f.text, f.ext === 'tsv' ? '\t' : ',');
    if (rows.length < 1 || (rows[0].length < 2 && rows.length < 2 && f.ext !== 'csv')) { box.innerHTML = '<p class="dim">This does not look like a CSV. Try Text.</p>'; }
    else {
      const head = rows[0], body = rows.slice(1), cap = 3000;
      bb.csv = { head, body: body.slice(0, cap) };
      box.innerHTML = `<div class="dim bb-sum">${body.length.toLocaleString()} row${body.length === 1 ? '' : 's'}, ${head.length} column${head.length === 1 ? '' : 's'}${body.length > cap ? ` (the first ${cap.toLocaleString()} are shown)` : ''}. Hover a value to see its column, click a row to read it as a record, click a heading to sort.</div>
        <div class="bb-tablewrap"><table class="bb-tbl pretty" id="bbTbl"><thead><tr><th class="rn">#</th>${head.map((h, i) => `<th data-col="${i}" title="Column ${i + 1}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${bb.csv.body.map((r, n) => `<tr data-r="${n}"><td class="rn">${n + 1}</td>${head.map((_, i) => `<td class="${bbCellClass(r[i])}" title="${esc(r[i] ?? '')}">${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="bb-rec" id="bbRec" hidden></div>${note}`;
    }
  } else if (bb.mode === 'json') {
    let v; try { v = JSON.parse(f.text); } catch (e) { box.innerHTML = `<p class="bad">Not valid JSON${f.truncated ? ' (the preview is cut off, so the end is missing)' : ''}: ${esc(e.message)}</p><p class="dim">Switch to Text to read it.</p>`; return; }
    const count = { n: 0 };
    const html = bbJsonTree(v, undefined, 0, count);
    box.innerHTML = count.n > 40000 ? '<p class="dim">Too many items for the tree. Use Text.</p>' : `<div class="bb-tree"><div class="bb-treebtns"><a id="bbExpand">Expand all</a><a id="bbCollapse">Collapse all</a></div>${html}</div>${note}`;
  } else if (bb.mode === 'xml') {
    const doc = new DOMParser().parseFromString(f.text, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) { box.innerHTML = `<p class="bad">Not valid XML: ${esc(err.textContent.split('\n')[0].slice(0, 200))}</p><p class="dim">Switch to Text to read it.</p>`; return; }
    const count = { n: 0 };
    const html = bbXmlTree(doc.documentElement, 0, count);
    box.innerHTML = count.n > 40000 ? '<p class="dim">Too many items for the tree. Use Text.</p>' : `<div class="bb-tree"><div class="bb-treebtns"><a id="bbExpand">Expand all</a><a id="bbCollapse">Collapse all</a></div>${html}</div>${note}`;
  } else {
    const t = f.text, ext = f.ext;
    const plain = bb.find.trim().length > 0; // colouring is dropped while finding, so a match is never split across coloured pieces
    box.innerHTML = `<pre class="code">${plain ? esc(t) : bbHighlightText(ext, t)}</pre>${note}`;
  }
  bbApplyFind(true);
}
function bbParseCsv(text, d = ',') {
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
const bbLeaf = (v) => (v === null ? '<span class="jn">null</span>' : typeof v === 'string' ? `<span class="js">"${esc(v)}"</span>` : typeof v === 'number' ? `<span class="jnum">${v}</span>` : `<span class="jb2">${v}</span>`);
function bbJsonTree(v, key, depth, count) {
  count.n++;
  const k = key === undefined ? '' : `<span class="jk">${esc(key)}</span>: `;
  if (v && typeof v === 'object') {
    const arr = Array.isArray(v), keys = Object.keys(v);
    if (!keys.length) return `<div class="jl">${k}<span class="dim">${arr ? '[]' : '{}'}</span></div>`;
    if (count.n > 40000) return '';
    return `<details ${depth < 2 ? 'open' : ''}><summary>${k}<span class="dim">${arr ? '[' : '{'} ${keys.length} ${arr ? (keys.length === 1 ? 'item' : 'items') : (keys.length === 1 ? 'key' : 'keys')} ${arr ? ']' : '}'}</span></summary><div class="jc">${keys.map((x) => bbJsonTree(v[x], arr ? `[${x}]` : x, depth + 1, count)).join('')}</div></details>`;
  }
  return `<div class="jl">${k}${bbLeaf(v)}</div>`;
}
function bbXmlTree(el, depth, count) {
  count.n++;
  if (count.n > 40000) return '';
  const attrs = [...el.attributes].map((a) => ` <span class="jk">${esc(a.name)}</span>=<span class="js">"${esc(a.value)}"</span>`).join('');
  const kids = [...el.childNodes].filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()) || n.nodeType === 4);
  const open = `<span class="xt">&lt;${esc(el.nodeName)}</span>${attrs}<span class="xt">&gt;</span>`;
  if (!kids.length) return `<div class="jl">${open}<span class="xt">&lt;/${esc(el.nodeName)}&gt;</span></div>`;
  if (kids.length === 1 && kids[0].nodeType !== 1) return `<div class="jl">${open}<span class="jx">${esc(kids[0].textContent.trim())}</span><span class="xt">&lt;/${esc(el.nodeName)}&gt;</span></div>`;
  return `<details ${depth < 3 ? 'open' : ''}><summary>${open}</summary><div class="jc">${kids.map((n) => (n.nodeType === 1 ? bbXmlTree(n, depth + 1, count) : `<div class="jl"><span class="jx">${esc(n.textContent.trim())}</span></div>`)).join('')}</div></details>`;
}

// ---- find in the open file ----
// Wraps every occurrence of the text in a <mark>, whatever the view is (text, table, tree), opens any folded tree branches that hold one,
// and Next / Previous step through them.
function bbApplyFind(jump) {
  const box = $('bbBody'), q = bb.find.trim(), count = $('bbCount');
  bb.marks = []; bb.at = -1;
  if (!box) return;
  if (q.length >= 1) {
    const low = q.toLowerCase(), nodes = [], walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.toLowerCase().includes(low)) nodes.push(n);
    outer: for (const n of nodes) {
      const text = n.nodeValue, lower = text.toLowerCase(), frag = document.createDocumentFragment();
      let pos = 0, i = lower.indexOf(low);
      while (i >= 0) {
        if (i > pos) frag.append(text.slice(pos, i));
        const m = document.createElement('mark'); m.className = 'bb-find-hit'; m.textContent = text.slice(i, i + q.length); frag.append(m); bb.marks.push(m);
        pos = i + q.length; i = lower.indexOf(low, pos);
        if (bb.marks.length >= 5000) { frag.append(text.slice(pos)); n.parentNode.replaceChild(frag, n); break outer; }
      }
      if (pos < text.length) frag.append(text.slice(pos));
      n.parentNode.replaceChild(frag, n);
    }
  }
  if (count) count.textContent = q ? (bb.marks.length ? `0 of ${bb.marks.length}${bb.marks.length >= 5000 ? '+' : ''}` : 'No matches') : '';
  if (bb.marks.length && jump) bbStep(1);
}
function bbStep(dir) {
  if (!bb.marks.length) return;
  if (bb.marks[bb.at]) bb.marks[bb.at].classList.remove('cur');
  bb.at = (bb.at + dir + bb.marks.length) % bb.marks.length;
  const m = bb.marks[bb.at];
  m.classList.add('cur');
  for (let p = m.parentElement; p && p.id !== 'bbBody'; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
  m.scrollIntoView({ block: 'center', inline: 'nearest' });
  $('bbCount').textContent = `${bb.at + 1} of ${bb.marks.length}${bb.marks.length >= 5000 ? '+' : ''}`;
}
let bbFindTimer;
$('bbPreview').oninput = (e) => {
  if (e.target.id !== 'bbFind') return;
  bb.find = e.target.value;
  clearTimeout(bbFindTimer);
  bbFindTimer = setTimeout(() => { bbRenderBody(); }, 200); // redraws the view, then marks the matches (it jumps to the first)
};
$('bbPreview').onkeydown = (e) => { if (e.target.id === 'bbFind' && e.key === 'Enter') { e.preventDefault(); if (bb.marks.length) bbStep(e.shiftKey ? -1 : 1); } };
$('bbPreview').onclick = async (e) => {
  const t = e.target;
  if (t.closest('#bbNext')) { bbStep(1); return; }
  if (t.closest('#bbPrev')) { bbStep(-1); return; }
  const mode = t.closest('[data-mode]');
  if (mode) { bb.mode = mode.dataset.mode; bbRenderPreview(); return; }
  if (t.closest('#bbPinFile')) { await bbTogglePin(bb.file.path); bbRenderPreview(); renderBrowse(); return; }
  if (t.closest('#bbDelFile')) { bbDelete(bb.file.path, false); return; }
  if (t.closest('#bbExpand') || t.closest('#bbCollapse')) { const open = !!t.closest('#bbExpand'); document.querySelectorAll('#bbBody details').forEach((d) => { d.open = open; }); return; }
  const csvRow = t.closest('#bbTbl tbody tr');
  if (csvRow) { bbRecord(Number(csvRow.dataset.r)); return; }
  if (t.closest('#bbRecClose')) { $('bbRec').hidden = true; document.querySelectorAll('#bbTbl tr.sel').forEach((r) => r.classList.remove('sel')); return; }
  const th = t.closest('#bbTbl th[data-col]');
  if (th) { // sort by the column (numbers as numbers)
    const col = Number(th.dataset.col) + 1, asc = th.dataset.dir !== 'asc', tb = th.closest('table').tBodies[0];
    const rows = [...tb.rows], num = rows.every((r) => r.cells[col].textContent.trim() === '' || !isNaN(Number(r.cells[col].textContent)));
    rows.sort((a, b) => { const x = a.cells[col].textContent, y = b.cells[col].textContent; return (num ? Number(x) - Number(y) : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' })) * (asc ? 1 : -1); });
    th.closest('tr').querySelectorAll('th').forEach((h) => { delete h.dataset.dir; }); th.dataset.dir = asc ? 'asc' : 'desc';
    tb.append(...rows);
  }
};

// A row read as a record: every column name beside its value.
function bbRecord(n) {
  const c = bb.csv, box = $('bbRec'); if (!c || !c.body[n] || !box) return;
  document.querySelectorAll('#bbTbl tr.sel').forEach((r) => r.classList.remove('sel'));
  document.querySelector(`#bbTbl tbody tr[data-r="${n}"]`)?.classList.add('sel');
  box.innerHTML = `<div class="bb-rec-head"><b>Row ${n + 1}</b><a id="bbRecClose">Close</a></div><div class="bb-rec-grid">${c.head.map((h, i) => `<div class="k">${esc(h)}</div><div class="v ${bbCellClass(c.body[n][i])}">${esc(c.body[n][i] ?? '') || '<span class="dim">empty</span>'}</div>`).join('')}</div>`;
  box.hidden = false;
}
// The column under the pointer is shaded, so a value is easy to follow up to its heading.
document.addEventListener('mouseover', (e) => {
  const td = e.target.closest?.('#bbTbl td, #bbTbl th, .cp-tbl td, .cp-tbl th');
  const st = $('bbColStyle') || document.head.appendChild(Object.assign(document.createElement('style'), { id: 'bbColStyle' }));
  if (!td || td.classList.contains('rn') || td.classList.contains('cp-hc') || td.closest('.cp-hosts')) { st.textContent = ''; return; }
  const sel = td.closest('table').id === 'bbTbl' ? '#bbTbl' : '.cp-tbl', i = td.cellIndex + 1;
  st.textContent = `${sel} td:nth-child(${i}), ${sel} th:nth-child(${i}) { background:rgba(77,140,245,.10) !important; }`;
});
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest?.('#bbTbl, .cp-tbl')) { const st = $('bbColStyle'); if (st) st.textContent = ''; } });

// ---- delete ----
async function bbDelete(path, isDir) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const msg = isDir ? `Delete the folder "${name}" and everything in it?\n\nIf it is a hunt or response, it also disappears from Results. This cannot be undone.` : `Delete the file "${name}"? This cannot be undone.`;
  if (!confirm(msg)) return;
  try { await api('DELETE', `/api/browse?path=${encodeURIComponent(path)}`); } catch (e) { toast(e.message, 'bad'); return; }
  toast(`Deleted ${name}`);
  if (bb.open && (bb.openPath === path || bb.openPath.startsWith(path + '/'))) { bb.open = null; bb.file = null; $('bbPreview').innerHTML = '<p class="dim" style="margin:0">Select a file to preview it.</p>'; }
  if (bb.path === path || bb.path.startsWith(path + '/')) { bb.path = bbDirOf(path); }
  if (bb.results) { bb.results.results = bb.results.results.filter((x) => x.path !== path && !x.path.startsWith(path + '/')); }
  await loadBrowse();
  loadPins();
}
$('bbDelFolder').onclick = () => bbDelete(bb.path, true);

// ---- pins ----
async function loadPins() {
  try { bb.pins = await api('GET', '/api/pins'); } catch { bb.pins = []; }
  renderPins();
}
// Pins or unpins a Browse path. Used by the list, the preview, Diff and the IOC page.
async function bbTogglePin(path, { silent = false } = {}) {
  const p = bbPinFor(path);
  try {
    if (p) { await api('DELETE', `/api/pins/${p.id}`); if (!silent) toast('Unpinned'); }
    else { const n = await api('POST', '/api/pins', { path, note: '' }); bb.editNote = n.id; if (!silent) toast('Pinned. Open Browse > Pinned to add a note.'); }
  } catch (e) { toast(e.message, 'bad'); }
  await loadPins();
}
window.pinPath = bbTogglePin; window.isPinned = (p) => !!bbPinFor(p);
function renderPins() {
  const box = $('bbPinned'); if (!box) return;
  const open = true, pins = bb.pins;
  box.innerHTML = `<div class="bp-head" id="bpToggle"><h2>Pinned</h2><span class="grp-count">${pins.length}</span></div>${pins.length ? '' : '<p class="dim bp-hint">Nothing is pinned yet. In Browse > Files, press Pin on a file or folder (or the star on a row) and it is kept here with a note. A run can also be pinned from Diff, and a hunt from IOC.</p>'}
    ${open && pins.length ? `<div class="bp-list">${pins.map((p) => `<div class="bp-item ${p.exists ? '' : 'gone'}" data-pid="${esc(p.id)}">
      <div class="bp-main"><a class="bp-link" data-pgo="${esc(p.path)}" data-pdir="${p.dir ? 1 : 0}">${bbIcon(p.dir)} ${esc(p.path.slice(p.path.lastIndexOf('/') + 1))}</a><span class="bb-desc">${esc(bbDirOf(p.path))}</span>${p.exists ? '' : '<span class="bad" style="font-size:11px; margin-left:6px">no longer exists</span>'}
        <span class="bp-acts"><a data-pnote="${esc(p.id)}">${p.note ? 'Edit note' : 'Add note'}</a><a data-punpin="${esc(p.id)}">Unpin</a></span></div>
      ${bb.editNote === p.id ? `<div class="bp-edit"><textarea id="bpText" rows="2" maxlength="1000" placeholder="Why is this pinned?">${esc(p.note)}</textarea><div><button type="button" class="act" data-psave="${esc(p.id)}">Save note</button><button type="button" class="act sec" data-pcancel="1">Cancel</button></div></div>`
        : p.note ? `<div class="bp-note">${esc(p.note)}</div>` : ''}</div>`).join('')}</div>` : ''}`;
  if (bb.editNote && open) { const t = $('bpText'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
}
$('bbPinned').onclick = async (e) => {
  const t = e.target;
  if (t.closest('[data-pgo]')) { const a = t.closest('[data-pgo]'); bbClearSearch(false); go('browse', 'files'); if (a.dataset.pdir === '1') loadBrowse(a.dataset.pgo); else { await loadBrowse(bbDirOf(a.dataset.pgo)); bbOpenFile(a.dataset.pgo, '', true); } return; }
  const unpin = t.closest('[data-punpin]');
  if (unpin) { try { await api('DELETE', `/api/pins/${unpin.dataset.punpin}`); } catch (err) { toast(err.message, 'bad'); } await loadPins(); renderBrowse(); if (bb.file) bbRenderPreview(); return; }
  const note = t.closest('[data-pnote]'); if (note) { bb.editNote = note.dataset.pnote; renderPins(); return; }
  const save = t.closest('[data-psave]');
  if (save) { try { await api('PUT', `/api/pins/${save.dataset.psave}`, { note: $('bpText').value }); } catch (err) { toast(err.message, 'bad'); return; } bb.editNote = null; await loadPins(); return; }
  if (t.closest('[data-pcancel]')) { bb.editNote = null; renderPins(); return; }
  if (t.closest('#bpToggle')) { try { localStorage.setItem('kb.bbPinsOpen', bbPinsOpen() ? '0' : '1'); } catch { /* ignore */ } renderPins(); }
};
$('bbPinFolder').onclick = async () => { await bbTogglePin(bb.path); renderBrowse(); };

// ---- Diff: compare the output of two hunts or responses ----
const df = { runs: [], res: null, show: new Set(['changed', 'added', 'removed']), allHosts: false, open: new Set(), detail: new Map() };
async function loadDiff() {
  loadPins();
  try { df.runs = await api('GET', '/api/diff/runs'); } catch (e) { $('dfOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const opt = (r) => `<option value="${esc(r.path)}">${esc(r.name)} · ${esc(new Date(r.startedAt).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}</option>`;
  const html = (kind, label) => { const l = df.runs.filter((r) => r.kind === kind); return l.length ? `<optgroup label="${label}">${l.map(opt).join('')}</optgroup>` : ''; };
  const keepA = $('dfA').value, keepB = $('dfB').value;
  $('dfA').innerHTML = $('dfB').innerHTML = `<option value="">Choose a run…</option>${html('hunt', 'Hunts')}${html('response', 'Responses')}`;
  if (keepA) $('dfA').value = keepA; if (keepB) $('dfB').value = keepB;
  if (!df.runs.length) $('dfOut').innerHTML = '<p class="dim" style="margin:0">There are no hunts or responses to compare yet.</p>';
  else if (!df.res) $('dfOut').innerHTML = '<p class="dim" style="margin:0">Choose two runs and press Compare. Files are matched by their path inside the run, so the same hunt run twice lines up file for file, and you see what is only in A and what is only in B.</p>';
}
// Each side is a run and, optionally, one file of it. Both sides on a file compares just those two files; both on "Whole run" compares everything.
df.files = { A: [], B: [] }; df.label = {};
async function dfFiles(side, keep) {
  const run = $('df' + side).value, sel = $('dfF' + side);
  df.files[side] = [];
  sel.innerHTML = '<option value="">Whole run (all files)</option>';
  if (!run) return;
  try { df.files[side] = await api('POST', '/api/diff/files', { path: run }); } catch (e) { toast(e.message, 'bad'); return; }
  sel.innerHTML = '<option value="">Whole run (all files)</option>' + df.files[side].map((f) => `<option value="${esc(f.key)}">${esc(f.rel)}</option>`).join('');
  if (keep && df.files[side].some((f) => f.key === keep)) sel.value = keep;
}
const dfSidePath = (side) => { const run = $('df' + side).value, key = $('dfF' + side).value; const f = df.files[side].find((x) => x.key === key); return key && f ? `${run}/${f.rel}` : run; };
$('dfA').onchange = () => dfFiles('A', $('dfFA').value);
$('dfB').onchange = () => dfFiles('B', $('dfFB').value);
$('dfFA').onchange = () => { const k = $('dfFA').value; if (k && !$('dfFB').value && df.files.B.some((f) => f.key === k)) $('dfFB').value = k; }; // the same file in the other run
$('dfFB').onchange = () => { const k = $('dfFB').value; if (k && !$('dfFA').value && df.files.A.some((f) => f.key === k)) $('dfFA').value = k; };
async function dfCompare() {
  const ra = $('dfA').value, rb = $('dfB').value, fa = $('dfFA').value, fb = $('dfFB').value;
  if (!ra || !rb) { toast('Choose both runs', 'bad'); return; }
  if (!!fa !== !!fb) { toast('Choose a file on both sides, or "Whole run" on both', 'bad'); return; }
  const a = dfSidePath('A'), b = dfSidePath('B');
  if (a === b) { toast('Choose two different runs or files', 'bad'); return; }
  const lab = (side) => { const r = df.runs.find((x) => x.path === $('df' + side).value); const f = df.files[side].find((x) => x.key === $('dfF' + side).value); return `${r ? r.name : ''}${f ? ' / ' + f.rel : ''}`; };
  df.label = { [a]: lab('A'), [b]: lab('B') };
  $('dfOut').innerHTML = '<p class="dim" style="margin:0">Comparing…</p>';
  df.open.clear(); df.detail.clear();
  try { df.res = await api('POST', '/api/diff', { a, b }); } catch (e) { df.res = null; $('dfOut').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderDiff();
  if (fa && df.res.files.length === 1) dfToggle(df.res.files[0].key); // one file: show its rows straight away
}
const dfName = (p) => df.label[p] || (df.runs.find((r) => r.path === p) || {}).name || p.slice(p.lastIndexOf('/') + 1);
function renderDiff() {
  const r = df.res; if (!r) return;
  const files = r.files.filter((f) => df.show.has(f.status) || (f.status === 'same' && df.show.has('same'))).filter((f) => df.allHosts || !/^All[-_]Hosts/i.test(f.key));
  const t = (s) => r.files.filter((f) => f.status === s && (df.allHosts || !/^All[-_]Hosts/i.test(f.key))).length;
  const chip = (s, label) => `<button type="button" class="df-chip ${s} ${df.show.has(s) ? 'on' : ''}" data-dfshow="${s}">${label} <b>${t(s)}</b></button>`;
  $('dfOut').innerHTML = `<div class="df-sum"><div><b>A</b> ${esc(dfName(r.a.path))}</div><div class="dim">compared with</div><div><b>B</b> ${esc(dfName(r.b.path))}</div></div>
    <div class="df-chips">${chip('changed', 'Changed')}${chip('added', 'Only in B')}${chip('removed', 'Only in A')}${chip('same', 'Identical')}
      <label class="df-all"><input type="checkbox" id="dfAll" ${df.allHosts ? 'checked' : ''}> include the combined All-Hosts files</label></div>
    <div class="df-files">${files.map((f) => {
      const open = df.open.has(f.key), tag = { changed: 'Changed', added: 'Only in B', removed: 'Only in A', same: 'Identical' }[f.status];
      return `<div class="df-file ${f.status}"><div class="df-fhead" data-dfopen="${esc(f.key)}" data-st="${f.status}"><span class="df-tag ${f.status}">${tag}</span><span class="df-name">${esc(f.rel)}</span>
        <span class="df-nums">${f.status === 'changed' && !f.binary ? `<span class="rem">−${f.removed}</span> <span class="add">+${f.added}</span> <span class="dim">${f.same} same</span>` : f.binary && f.status === 'changed' ? '<span class="dim">binary file differs</span>' : f.status === 'added' ? `<span class="dim">${bbFmt(f.sizeB)}</span>` : f.status === 'removed' ? `<span class="dim">${bbFmt(f.sizeA)}</span>` : ''}</span></div>
        ${open ? `<div class="df-body">${dfDetailHtml(f)}</div>` : ''}</div>`;
    }).join('') || '<p class="dim" style="margin:8px 0 0">Nothing to show with these filters.</p>'}</div>${r.truncated ? '<p class="dim">Only the first 3000 files of each run were compared.</p>' : ''}`;
}
function dfDetailHtml(f) {
  const d = df.detail.get(f.key);
  if (f.binary && f.status === 'changed') return '<p class="dim" style="margin:6px 0">A binary file; its contents are not compared line by line.</p>';
  if (f.status === 'same') return '<p class="dim" style="margin:6px 0">The same in both runs.</p>';
  if (!d) return '<p class="dim" style="margin:6px 0">Loading…</p>';
  if (d.error) return `<p class="bad" style="margin:6px 0">${esc(d.error)}</p>`;
  if (d.binary) return '<p class="dim" style="margin:6px 0">A binary file or one too large to compare.</p>';
  const table = (rows, cls) => !rows.length ? '' : d.csv ? `<div class="bb-tablewrap"><table class="bb-tbl ${cls}"><thead><tr>${d.header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${d.header.map((_, i) => `<td title="${esc(r[i] ?? '')}">${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<pre class="code df-lines ${cls}">${rows.map((r) => esc(r)).join('\n')}</pre>`;
  const more = (shown, total) => (total > shown ? `<p class="dim" style="margin:4px 0">Showing ${shown} of ${total}.</p>` : '');
  return `${d.removedTotal ? `<div class="df-sec rem">Only in A (${d.removedTotal})</div>${table(d.removed, 'rem')}${more(d.removed.length, d.removedTotal)}` : ''}
    ${d.addedTotal ? `<div class="df-sec add">Only in B (${d.addedTotal})</div>${table(d.added, 'add')}${more(d.added.length, d.addedTotal)}` : ''}
    <p class="dim" style="margin:4px 0 2px">${d.same.toLocaleString()} ${d.csv ? 'row' : 'line'}${d.same === 1 ? '' : 's'} identical in both.</p>`;
}
$('dfOut').onclick = async (e) => {
  const chip = e.target.closest('[data-dfshow]');
  if (chip) { const s = chip.dataset.dfshow; if (df.show.has(s)) df.show.delete(s); else df.show.add(s); renderDiff(); return; }
  const head = e.target.closest('[data-dfopen]');
  if (head) dfToggle(head.dataset.dfopen);
};
async function dfToggle(key) {
  if (df.open.has(key)) { df.open.delete(key); renderDiff(); return; }
  df.open.add(key); renderDiff();
  const f = df.res.files.find((x) => x.key === key);
  if (f && f.status !== 'same' && !df.detail.has(key) && !(f.binary && f.status === 'changed')) {
    try { df.detail.set(key, await api('POST', '/api/diff/file', { a: df.res.a.path, b: df.res.b.path, key })); } catch (err) { df.detail.set(key, { error: err.message }); }
    renderDiff();
  }
}
$('dfOut').onchange = (e) => { if (e.target.id === 'dfAll') { df.allHosts = e.target.checked; renderDiff(); } };
$('dfGo').onclick = dfCompare;
$('dfSwap').onclick = async () => {
  const [a, b, fa, fb] = [$('dfA').value, $('dfB').value, $('dfFA').value, $('dfFB').value];
  $('dfA').value = b; $('dfB').value = a;
  await Promise.all([dfFiles('A', fb), dfFiles('B', fa)]);
  if (df.res) dfCompare();
};
$('dfPinA').onclick = () => { if ($('dfA').value) bbTogglePin(dfSidePath('A')); else toast('Choose run A first', 'bad'); };
$('dfPinB').onclick = () => { if ($('dfB').value) bbTogglePin(dfSidePath('B')); else toast('Choose run B first', 'bad'); };

// opening Browse from another page (Results, IOC) at a path, optionally highlighting text in a file
window.openInBrowse = async (path, find = '') => {
  go('browse', 'files');
  bbClearSearch(false);
  const seq = ++bb.seq;
  let isFile = false;
  try { const r = await api('GET', `/api/browse/file?path=${encodeURIComponent(path)}`); isFile = !!r; } catch { isFile = false; }
  if (seq !== bb.seq) return;
  if (isFile) { await loadBrowse(bbDirOf(path)); bbOpenFile(path, find, true); } else loadBrowse(path);
};
