// ---- Settings > Collections > YARA Rules ----
// Rule files for the YARA collections (src/yara.js): add (upload or paste), enable or disable, look at, delete. The enabled ones are
// joined into kb-rules.yar on the server, which the YARA collections stage on the host.
// Shares helpers with app.js: api, esc, $, toast, can, bbFmt, decorateLocks, isActive.
const yr = { files: [], built: null, scanner: {}, compiler: null, open: new Set(), text: new Map() };

async function loadYara() {
  let r;
  try { r = await api('GET', '/api/yara'); } catch (e) { $('yrList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  Object.assign(yr, r);
  renderYara();
}
window.loadYara = loadYara;

const yrCheck = (c) => (!c ? '' : c.clash?.length ? `<span class="badge orange" title="${esc(`Another enabled file already defines: ${c.clash.join(', ')}`)}">name clash</span>`
  : c.ok === true ? '<span class="badge green" title="Compiled with YARA on this server">compiles</span>'
  : c.ok === false ? `<span class="badge red" title="${esc(c.error || '')}">does not compile</span>` : `<span class="badge grey" title="${esc(c.how || '')}">not checked</span>`);

function renderYara() {
  const b = yr.built || {}, s = yr.scanner || {};
  const joined = !b.files ? '<span class="bad">No rules are enabled</span>, so the YARA collections have no <code>kb-rules.yar</code> to run with.'
    : `<b>${b.rules}</b> rule${b.rules === 1 ? '' : 's'} from <b>${b.files}</b> file${b.files === 1 ? '' : 's'} in <code>kb-rules.yar</code> ${b.check?.ok === true ? '<span class="badge green">compiles</span>' : b.check?.ok === false ? `<span class="badge red" title="${esc(b.check.error || '')}">does not compile</span> <span class="bad">${esc(b.check.error || '')}</span>` : '<span class="badge grey">not checked</span>'}`;
  $('yrStatus').innerHTML = `<div>${joined}</div>
    <div class="dim">${s.yara64 ? '<code>yara64.exe</code> is uploaded.' : '<span class="bad"><code>yara64.exe</code> is not uploaded yet</span>: add it on <a href="#settings/binaries">Binaries</a> (from the YARA releases on GitHub) before running a YARA hunt.'} ${yr.compiler ? `Rules are compiled here with ${esc(yr.compiler)}.` : 'Rules are not compiled on this server (no YARA here), so a mistake only shows when a hunt runs.'}</div>`;
  if (!yr.files.length) { $('yrList').innerHTML = '<p class="dim" style="margin:10px 0 0">No rule files yet. Press Add rules to upload or paste some.</p>'; return; }
  const may = can('collections.manage');
  $('yrList').innerHTML = `<table class="bh yr-tbl"><thead><tr><th></th><th>Rule file</th><th class="num">Rules</th><th>Check</th><th class="num">Size</th><th>Added</th><th></th></tr></thead><tbody>${yr.files.map((f) => {
    const open = yr.open.has(f.id), t = yr.text.get(f.id);
    return `<tr class="${f.enabled ? '' : 'yr-off'}"><td><button class="switch sm" type="button" role="switch" aria-checked="${f.enabled}" data-yrtoggle="${esc(f.id)}" ${may ? '' : 'disabled'} title="${f.enabled ? 'Enabled: in kb-rules.yar' : 'Disabled: not used by hunts'}"></button></td>
      <td><b>${esc(f.name)}</b> ${f.builtin ? '<span class="badge grey" title="Ships with Kookaburrow: cannot be deleted, kept up to date. Choose it for one hunt or scan, or enable it to add it to every YARA hunt.">built-in</span>' : `<span class="dim">${esc(f.filename)}</span>`}${f.note ? `<div class="dim" style="font-size:11.5px">${esc(f.note)}</div>` : ''}${f.imports.length ? `<div class="dim" style="font-size:11px">imports ${esc(f.imports.join(', '))}</div>` : ''}</td>
      <td class="num"><a data-yropen="${esc(f.id)}" title="Show the rule names and the file">${f.rules.length}</a></td><td>${yrCheck(f.check)}</td><td class="num dim">${bbFmt(f.size)}</td>
      <td class="dim nw">${esc(f.by || '')} · ${esc(new Date(f.at).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }))}</td>
      <td class="bh-del">${f.builtin ? '<span class="dim">built-in</span>' : `<a class="bad" data-yrdel="${esc(f.id)}" data-perm="collections.manage" data-perm-what="delete YARA rules">Delete</a>`}</td></tr>
      ${open ? `<tr class="yr-detail"><td></td><td colspan="6">${f.check?.ok === false ? `<div class="bad" style="margin-bottom:6px">${esc(f.check.error || '')}</div>` : ''}<div class="yr-names">${f.rules.map((n) => `<code>${esc(n)}</code>`).join(' ')}</div>${t === undefined ? (may ? '<p class="dim">Loading the file…</p>' : '') : `<pre class="code yr-text">${esc(t)}</pre>`}</td></tr>` : ''}`;
  }).join('')}</tbody></table>`;
  decorateLocks($('yrList'));
}

$('yrList').onclick = async (e) => {
  const tg = e.target.closest('[data-yrtoggle]');
  if (tg) {
    const f = yr.files.find((x) => x.id === tg.dataset.yrtoggle);
    try { await api('PUT', `/api/yara/${f.id}`, { enabled: !f.enabled }); toast(f.enabled ? `${f.name} disabled` : `${f.name} enabled`); } catch (err) { toast(err.message, 'bad'); }
    loadYara(); return;
  }
  const op = e.target.closest('[data-yropen]');
  if (op) {
    const rid = op.dataset.yropen;
    if (yr.open.has(rid)) { yr.open.delete(rid); renderYara(); return; }
    yr.open.add(rid); renderYara();
    if (!yr.text.has(rid) && can('collections.manage')) { try { yr.text.set(rid, (await api('GET', `/api/yara/${rid}/text`)).text); } catch (err) { yr.text.set(rid, err.message); } renderYara(); }
    return;
  }
  const del = e.target.closest('[data-yrdel]');
  if (del) {
    const f = yr.files.find((x) => x.id === del.dataset.yrdel);
    if (!confirm(`Delete the rule file "${f?.name}"? Its ${f?.rules.length} rule(s) are removed from kb-rules.yar.`)) return;
    try { await api('DELETE', `/api/yara/${f.id}`); toast('Rule file deleted'); } catch (err) { toast(err.message, 'bad'); }
    yr.open.delete(f.id); yr.text.delete(f.id); loadYara();
  }
};

const yrSay = (t, cls = 'bad') => { $('yrMsg').textContent = t; $('yrMsg').className = `um-msg ${cls}`; };
$('yrAdd').onclick = () => { $('yrForm').hidden = false; $('yrName').value = $('yrNote').value = $('yrText').value = ''; $('yrFile').value = ''; $('yrFileName').textContent = 'One or more rule files (5 MB each at most), or paste rules below'; yrSay(''); $('yrName').focus(); };
$('yrCancel').onclick = () => { $('yrForm').hidden = true; };
$('yrFile').onchange = () => {
  const fs = [...$('yrFile').files];
  $('yrFileName').textContent = fs.length ? fs.map((f) => `${f.name} (${bbFmt(f.size)})`).join(', ') : 'One or more rule files (5 MB each at most), or paste rules below';
  if (fs.length === 1 && !$('yrName').value.trim()) $('yrName').value = fs[0].name.replace(/\.[^.]+$/, '');
};
// Each chosen file is added on its own (named after the file when more than one is chosen); pasted text is one more file.
$('yrSave').onclick = async () => {
  const files = [...$('yrFile').files], pasted = $('yrText').value;
  if (!files.length && !pasted.trim()) return yrSay('Choose a rule file or paste rules');
  if (files.some((f) => f.size > 5 * 1024 * 1024)) return yrSay('A rule file is over 5 MB');
  const name = $('yrName').value.trim(), note = $('yrNote').value;
  if (!name && (pasted.trim() || files.length === 1)) return yrSay('Give the rule file a name');
  $('yrSave').disabled = true; yrSay('Adding and compiling…', 'dim');
  const done = [], failed = [];
  const one = async (n, filename, text) => { try { const r = await api('POST', '/api/yara', { name: n, filename, text, note }); done.push(r); } catch (err) { failed.push(`${n}: ${err.message}`); } };
  for (const f of files) await one(files.length === 1 ? name : f.name.replace(/\.[^.]+$/, ''), f.name, await f.text());
  if (pasted.trim()) await one(files.length ? `${name || 'Pasted'} (pasted)` : name, `${(name || 'pasted').replace(/[^\w.-]+/g, '_')}.yar`, pasted);
  $('yrSave').disabled = false;
  const off = done.filter((r) => !r.enabled);
  if (failed.length) yrSay(failed.join(' · '));
  else { $('yrForm').hidden = true; }
  if (done.length) toast(`${done.length} rule file${done.length === 1 ? '' : 's'} added${off.length ? `; ${off.length} not enabled (it does not compile, or a rule name is already used)` : ''}`, off.length ? 'bad' : undefined);
  loadYara();
};

if (isActive('settings/yara')) loadYara();

// ---- The YaraRule parameter of a YARA hunt (the Parameters tab of New Hunt) ----
// A dropdown of the rule files on the server (built-in ones first), the rule text in a box below, and "Write my own rule". The value is
// all (the enabled rule files), file:<id> or custom:<text>; src/yara-rule.js uses it for that one hunt. A rule written here can be saved
// under a name from the hunt page once it has run.
const yrp = { files: null, loading: false, texts: new Map(), custom: new Map() };
const YR_TEMPLATE = 'rule My_Rule\n{\n    meta:\n        description = "What this finds"\n    strings:\n        $s1 = "text to find" ascii wide nocase\n    condition:\n        $s1\n}\n';
function yrLoadChoices(again) {
  if (yrp.files || yrp.loading) return;
  yrp.loading = true;
  api('GET', '/api/yara/choices').then((r) => { yrp.files = r.files; }).catch(() => { yrp.files = []; }).finally(() => { yrp.loading = false; again(); });
}
window.yrPickHtml = (x, value, again) => {
  if (!yrp.files) { yrLoadChoices(again); return '<div class="rm-prow"><span>YaraRule <i class="dim">(optional)</i></span><span class="dim">Loading the rules on the server…</span></div>'; }
  const mode = value.startsWith('custom:') ? 'custom' : value.startsWith('file:') ? 'file' : 'all', fid = mode === 'file' ? value.slice(5) : '';
  const group = (label, l) => (l.length ? `<optgroup label="${label}">${l.map((f) => `<option value="file:${esc(f.id)}" ${fid === f.id ? 'selected' : ''}>${esc(f.name)} (${f.rules} rule${f.rules === 1 ? '' : 's'})</option>`).join('')}</optgroup>` : '');
  let text = '', note = '';
  if (mode === 'all') { text = 'The rule files that are enabled on Settings > Collections > YARA Rules are used.\n\nChoose a rule file above to run only that one, or write your own rule.'; }
  else if (mode === 'file') {
    if (!yrp.texts.has(fid)) { yrp.texts.set(fid, null); api('GET', `/api/yara/choices/${fid}/text`).then((r) => yrp.texts.set(fid, r.text)).catch((e) => yrp.texts.set(fid, '// ' + e.message)).finally(again); }
    text = yrp.texts.get(fid) ?? 'Loading…';
    const f = yrp.files.find((q) => q.id === fid); note = f && f.note ? esc(f.note) : '';
  } else text = value.slice(7);
  const pi = esc(x.id);
  return `<div class="rm-prow yr-pick"><span>YaraRule <i class="dim">(optional)</i></span>
    <select data-yrsel data-pi="${pi}"><option value="" ${mode === 'all' ? 'selected' : ''}>The enabled rule files (default)</option>${group('Built-in rules', yrp.files.filter((f) => f.builtin))}${group('Rule files on the server', yrp.files.filter((f) => !f.builtin))}<option value="custom" ${mode === 'custom' ? 'selected' : ''}>Write my own rule…</option></select>
    ${note ? `<div class="dim yr-note">${note}</div>` : ''}
    <textarea class="yr-text" data-yrtext data-pi="${pi}" rows="14" spellcheck="false" ${mode === 'custom' ? '' : 'readonly'} placeholder="Write a YARA rule">${esc(text)}</textarea>
    <div class="dim yr-note">${mode === 'custom' ? 'Compiled when you run the hunt. After it has run, the hunt page offers to save this rule on the server under a name.' : mode === 'file' ? 'This rule file is used for this hunt only. It is shown here so you can see what it looks for.' : ''}</div></div>`;
};
window.yrOnSelect = (el, st, again) => {
  const id = el.dataset.pi, v = el.value, p = (st.params[id] ||= {});
  if (v === 'custom') { if (!yrp.custom.has(id)) yrp.custom.set(id, YR_TEMPLATE); p.YaraRule = 'custom:' + yrp.custom.get(id); }
  else p.YaraRule = v || 'all';
  again();
};
window.yrOnText = (el, st) => { const id = el.dataset.pi; if (el.readOnly) return; yrp.custom.set(id, el.value); (st.params[id] ||= {}).YaraRule = 'custom:' + el.value; };
// On the hunt page: a rule written for the hunt can be saved on the server once it has run
window.yrSaveBanner = (r) => {
  const items = Object.entries(r.yara || {}).filter(([, y]) => y.mode === 'custom');
  if (!items.length) return '';
  return items.map(([cid, y]) => (y.saved ? `<div class="df-note" style="color:var(--ok);border-color:rgba(63,185,132,.4)">The rule this hunt ran with was saved on the server as <b>${esc(y.saved.name)}</b> (Settings &gt; Collections &gt; YARA Rules).</div>`
    : y.canSave ? `<div class="df-note">This hunt ran with a rule written for it (<b>${esc(y.name)}</b>). <a data-yrsave="${esc(r.id)}|${esc(cid)}|${esc(y.name)}" data-perm="collections.manage" data-perm-what="save YARA rules" style="cursor:pointer">Save it on the server…</a> to use it again from the list.</div>` : '')).join('');
};
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-yrsave]'); if (!a) return;
  const [rid, cid, def] = a.dataset.yrsave.split('|');
  const name = prompt('Save this YARA rule on the server as:', def); if (!name) return;
  try { const r = await api('POST', `/api/runs/${rid}/yara-save`, { collectionId: cid, name }); toast(`Saved as ${r.file.name}${r.compiled === false ? " (it does not compile)" : ""}`); yrp.files = null; if (window.loadBurrowHunts) await window.loadBurrowHunts(); } catch (err) { toast(err.message, 'bad'); }
});
