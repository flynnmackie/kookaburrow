// Offline documentation: the markdown guides in docs/ (and the README) shipped with the server, rendered in the browser with the bundled marked library.
// Opened from the Documentation button on Home, and from "Setup guide" links on some settings pages (any element with data-doc="file.md#anchor").
const dc = { list: null, file: null, history: [], searchSeq: 0 };
const DOC_RE = /(?:^|\/)(README|\d\d-[a-z0-9-]+)\.md(#.*)?$/;
// GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens (the guides' contents lists use them)
const docSlug = (t) => String(t).trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');

// Markdown to a safe DOM fragment: no scripts, frames or event handlers, heading ids, images and links pointing at what this server serves.
function docRender(md) {
  const t = document.createElement('template');
  t.innerHTML = marked.parse(md, { gfm: true, mangle: false, headerIds: false });
  const c = t.content;
  c.querySelectorAll('script,iframe,object,embed,style,link,meta,base,form,input,button').forEach((n) => n.remove());
  c.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|xlink:href|action)$/i.test(a.name) && /^\s*(javascript|data|vbscript):/i.test(a.value) && !(a.name === 'src' && /^\s*data:image\//i.test(a.value)))) el.removeAttribute(a.name);
    }
  });
  const used = new Map();
  c.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => { const s = docSlug(h.textContent), n = used.get(s) || 0; used.set(s, n + 1); h.id = n ? `${s}-${n}` : s; });
  c.querySelectorAll('img').forEach((i) => { const m = /^(?:\.\.\/)?public\/(.+)$/.exec(i.getAttribute('src') || ''); if (m) i.setAttribute('src', '/' + m[1]); });
  c.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (/^https?:/i.test(h)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else if (h[0] !== '#' && !DOC_RE.test(h)) { a.removeAttribute('href'); a.title = 'This file is not part of the offline documentation'; }
  });
  return c;
}

async function docList() {
  if (!dc.list) dc.list = await api('GET', '/api/docs');
  $('docNav').innerHTML = dc.list.map((d) => `<a href="#" data-docfile="${esc(d.file)}" class="${d.file === dc.file ? 'on' : ''}">${esc(d.title)}</a>`).join('');
}
async function docOpen(file, anchor, { back } = {}) {
  const body = $('docBody');
  try {
    const r = await fetch(`/api/docs/file/${encodeURIComponent(file)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    const md = await r.text();
    if (!back && dc.file) dc.history.push({ file: dc.file, top: body.scrollTop });
    dc.file = file;
    body.replaceChildren(docRender(md));
    $('docBack').disabled = !dc.history.length;
    await docList();
    const target = anchor ? body.querySelector(`[id="${CSS.escape(anchor.replace(/^#/, ''))}"]`) : null;
    if (target) body.scrollTop = target.offsetTop - body.offsetTop - 8; else body.scrollTop = 0;
  } catch (e) { body.innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function openDocs(file = 'README.md', anchor = '') {
  $('docModal').hidden = false;
  docOpen(file, anchor);
}
window.openDocs = openDocs;
const closeDocs = () => { $('docModal').hidden = true; };
$('docX').onclick = closeDocs;
$('docModal').addEventListener('mousedown', (e) => { if (e.target === $('docModal')) closeDocs(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('docModal').hidden) closeDocs(); });
$('docBack').onclick = () => { const p = dc.history.pop(); if (p) docOpen(p.file, '', { back: true }).then(() => { $('docBody').scrollTop = p.top; }); };

// inside the document: other guides open here, in-page anchors scroll, everything else is left alone
$('docBody').addEventListener('click', (e) => {
  const a = e.target.closest('a[href]'); if (!a) return;
  const h = a.getAttribute('href');
  if (/^https?:/i.test(h)) return;
  e.preventDefault();
  if (h[0] === '#') { const t = $('docBody').querySelector(`[id="${CSS.escape(h.slice(1))}"]`); if (t) $('docBody').scrollTop = t.offsetTop - $('docBody').offsetTop - 8; return; }
  const m = DOC_RE.exec(h);
  if (m) docOpen(`${m[1]}.md`, m[2] || '');
});
$('docNav').addEventListener('click', (e) => { const a = e.target.closest('[data-docfile]'); if (a) { e.preventDefault(); $('docSearch').value = ''; docOpen(a.dataset.docfile); } });
// the same links work from anywhere in the app: <a data-doc="10-elastic.md#setting-up-kibana">
document.addEventListener('click', (e) => { const a = e.target.closest('[data-doc]'); if (!a) return; e.preventDefault(); const [f, h] = a.dataset.doc.split('#'); openDocs(f, h || ''); });
document.getElementById('homeDocs')?.addEventListener('click', (e) => { e.preventDefault(); openDocs(); });

// search across every guide (the server does the looking; the guides are not loaded into the page)
let docTimer = null;
$('docSearch').oninput = () => {
  clearTimeout(docTimer);
  const q = $('docSearch').value.trim();
  if (q.length < 2) { $('docResults').hidden = true; $('docNav').hidden = false; return; }
  docTimer = setTimeout(async () => {
    const seq = ++dc.searchSeq;
    let hits;
    try { hits = await api('GET', `/api/docs/search?q=${encodeURIComponent(q)}`); } catch { return; }
    if (seq !== dc.searchSeq) return;
    $('docNav').hidden = true; $('docResults').hidden = false;
    // highlight each word, escaping the text around the matches (so an entity such as &lt; is never cut in two)
    const words = q.split(/\s+/).filter((w) => w.length >= 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(words.join('|') || '$^', 'gi');
    const mark = (t) => { let out = '', last = 0; for (const m of t.matchAll(re)) { if (!m[0]) continue; out += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>'; last = m.index + m[0].length; } return out + esc(t.slice(last)); };
    $('docResults').innerHTML = hits.length ? hits.map((h) => `<a href="#" data-docfile="${esc(h.file)}" data-anchor="${esc(h.anchor)}"><b>${esc(h.title)}</b>${h.heading && h.heading !== h.title ? ` <span class="dim">› ${esc(h.heading)}</span>` : ''}<div class="dim">${mark(h.text)}</div></a>`).join('') : '<p class="dim" style="padding:8px">Nothing found.</p>';
  }, 250);
};
$('docResults').addEventListener('click', (e) => { const a = e.target.closest('[data-docfile]'); if (a) { e.preventDefault(); docOpen(a.dataset.docfile, a.dataset.anchor || ''); } });
