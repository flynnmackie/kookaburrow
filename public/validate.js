// ---- Monitor > Validate: Checks and History ----
// Laid out like Burrow > Hunt: a table of checks on top, a detail card below (Results / About / History tabs), and New Check as a four-step
// dialog like New Hunt (Who, Conditions, Schedule, Overview). A check is a tree of conditions (src/validate.js PRESETS) joined with AND / OR,
// run on hosts and groups by hand or on a schedule. It runs once as soon as it is saved.
// Shares helpers with app.js: api, esc, $, toast, can, decorateLocks, isActive, fmtDur, go, and the recurring box (recInit, recToggle,
// recRead, recUpdate, recLocal); rcEvery from recurring.js.
const vd = { presets: [], checks: [], sel: null, tab: 'results', runId: null, runs: new Map(), filter: 'all', open: new Set() };
let vdPoll;
const vdFull = (t) => (t ? new Date(t).toLocaleString() : '-');
// classes m-*, not ok / bad: those get a status dot inside tables (polish.css)
const VD_MARK = { 1: ['m-ok', '✓', 'True'], 0: ['m-bad', '✗', 'False'], N: ['m-na', '–', 'Not applicable on this OS'], E: ['m-err', '!', 'Could not check'] };
const VD_HINT = '<p class="dim" style="margin:0">Select a check.</p>';
const vdCheck = () => vd.checks.find((x) => x.id === vd.sel) || null;

async function loadValidate() {
  let r;
  try { r = await api('GET', '/api/validate'); } catch (e) { $('vdList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  vd.presets = r.presets; vd.checks = r.checks;
  if (vd.sel && !vd.checks.some((c) => c.id === vd.sel)) { vd.sel = null; vd.runId = null; }
  await vdEnsureRun();
  renderValidate();
  clearTimeout(vdPoll);
  if (vd.checks.some((c) => c.running) && isActive('health/validate')) vdPoll = setTimeout(loadValidate, 2500);
}
window.loadValidate = loadValidate;
// An older run chosen from History is fetched once and kept.
async function vdEnsureRun() {
  const c = vdCheck();
  if (!c || !vd.runId || vd.runId === c.last?.id || vd.runs.has(vd.runId)) return;
  try { vd.runs.set(vd.runId, await api('GET', `/api/validate/runs/${vd.runId}`)); } catch { vd.runId = null; }
}
const vdRunOf = (c) => (vd.runId && vd.runId !== c.last?.id && vd.runs.get(vd.runId)?.checkId === c.id ? vd.runs.get(vd.runId) : c.last);

// ---- the list ----
function vdResult(c) {
  if (c.running) return '<span class="st-run">Running</span>';
  const l = c.last; if (!l) return '<span class="dim">Not run yet</span>';
  if (!l.failed && !l.errors) return `<span class="ok">All ${l.hosts.length} pass</span>`;
  return `<span class="${l.failed ? 'bad' : 'st-warn'}">${[l.failed ? `${l.failed} fail` : '', l.errors ? `${l.errors} unreachable` : ''].filter(Boolean).join(', ')}</span> <span class="dim">of ${l.hosts.length}</span>`;
}
const vdRuns = (c) => (c.status === 'manual' ? '<span class="dim">By hand</span>' : `Every ${esc(rcEvery(c.everyMinutes))}${c.status === 'paused' ? ' <span class="st-warn">paused</span>' : c.status === 'finished' ? ' <span class="dim">finished</span>' : ''}`);
function renderList() {
  const n = vd.checks.length, bad = vd.checks.filter((c) => c.last && (c.last.failed || c.last.errors)).length, good = vd.checks.filter((c) => c.last && !c.last.failed && !c.last.errors && c.last.status === 'done').length;
  $('vdSum').innerHTML = n ? `<span><b class="${bad ? 'bad' : ''}">${bad}</b> failing</span><span><b>${good}</b> passing</span>` : '';
  $('vdList').innerHTML = n
    ? `<table class="bh"><thead><tr><th>Check</th><th>Result</th><th>Hosts</th><th>Runs</th><th>Last run</th><th>Next run</th><th></th></tr></thead><tbody>${vd.checks.map((c) => `<tr class="bh-row ${c.id === vd.sel ? 'on' : ''}" data-id="${esc(c.id)}">
        <td class="bh-name">${esc(c.name)}</td><td>${vdResult(c)}</td><td class="dim">${c.hosts}</td><td>${vdRuns(c)}</td>
        <td class="dim">${c.last ? esc(vdFull(c.last.startedAt)) : '-'}</td><td class="dim">${c.status === 'active' && c.nextRun ? esc(vdFull(c.nextRun)) : '-'}</td>
        <td class="bh-del vd-act"><a class="dl" data-vdrun="${esc(c.id)}" data-perm="hunts.run" data-perm-what="run checks" title="Run it on all its hosts now">Run now</a><a class="dl" data-vdedit="${esc(c.id)}" data-perm="hunts.run" data-perm-what="edit checks">Edit</a>${c.status === 'manual' || c.status === 'finished' ? '' : `<a class="dl" data-vdpause="${esc(c.id)}" data-perm="hunts.run" data-perm-what="pause checks">${c.status === 'paused' ? 'Resume' : 'Pause'}</a>`}<a class="dl bad" data-vddel="${esc(c.id)}" data-perm="hunts.run" data-perm-what="delete checks" title="Delete this check and its history">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No checks yet.</p>';
  decorateLocks($('vdList'));
}
$('vdList').onclick = async (e) => {
  const t = e.target;
  const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (err) { toast(err.message, 'bad'); } loadValidate(); };
  const rn = t.closest('[data-vdrun]'); if (rn) { vd.sel = rn.dataset.vdrun; vd.tab = 'results'; vd.runId = null; return act(() => api('POST', `/api/validate/${rn.dataset.vdrun}/run`), 'Running'); }
  const pz = t.closest('[data-vdpause]'); if (pz) { const c = vd.checks.find((x) => x.id === pz.dataset.vdpause); return act(() => api('PUT', `/api/validate/${c.id}`, { enabled: !c.enabled }), c.enabled ? 'Paused' : 'Resumed'); }
  const dl = t.closest('[data-vddel]'); if (dl) { const c = vd.checks.find((x) => x.id === dl.dataset.vddel); if (!confirm(`Delete the check "${c.name}"?\n\nThis removes it and its history. It cannot be undone.`)) return; return act(() => api('DELETE', `/api/validate/${c.id}`), 'Check deleted'); }
  const ed = t.closest('[data-vdedit]'); if (ed) { wzOpen(vd.checks.find((x) => x.id === ed.dataset.vdedit)); return; }
  const row = t.closest('.bh-row'); if (!row) return;
  vd.sel = row.dataset.id; vd.runId = null; vd.open.clear();
  await vdEnsureRun(); renderValidate();
};

// ---- the detail card ----
const VD_TABS = [['results', 'Results'], ['about', 'About'], ['history', 'History']];
function paneResults(c, run) {
  if (!run) return '<p class="dim" style="margin:0">Not run yet.</p>';
  const hs = run.hosts, n = hs.length, by = (s) => hs.filter((h) => h.status === s).length;
  const pass = by('pass'), fail = by('fail'), err = by('error'), busy = n - pass - fail - err, done = run.status === 'done';
  const result = !done ? '<span class="st-run">Running</span>' : !fail && !err ? '<span class="ok">All pass</span>' : `<span class="${fail ? 'bad' : 'st-warn'}">${[fail ? `${fail} fail` : '', err ? `${err} unreachable` : ''].filter(Boolean).join(', ')}</span>`;
  const seg = (k, cls) => (k ? `<i class="${cls}" style="width:${(k / (n || 1)) * 100}%"></i>` : '');
  const f = vd.filter, shown = hs.filter((h) => f === 'all' || h.status === f);
  const chip = (k, label, count) => `<button type="button" data-vdf="${k}" class="${f === k ? 'on' : ''}">${label} ${count}</button>`;
  const latest = vd.runId && vd.runId !== c.last?.id && run.id === vd.runId;
  const heads = c.conditions.map((x) => `<th class="vd-ch" title="${esc(x.text)}">${esc(x.text)}</th>`).join('');
  const body = shown.map((h) => {
    const open = vd.open.has(h.hostId);
    const st = h.status === 'pass' ? '<span class="ok">Pass</span>' : h.status === 'fail' ? '<span class="bad">Fail</span>' : h.status === 'error' ? '<span class="st-warn">Unreachable</span>' : '<span class="st-run">Checking…</span>';
    const cells = c.conditions.map((x) => { const l = h.leaves?.[x.id]; if (!l) return '<td class="vd-c dim">·</td>'; const [cls, m, w] = VD_MARK[l.s] || VD_MARK.E; return `<td class="vd-c ${cls}" title="${esc(`${w}${l.d ? `: ${l.d}` : ''}`)}">${m}</td>`; }).join('');
    const sub = !open ? '' : `<tr class="vd-sub"><td colspan="${c.conditions.length + 2}">${h.status === 'error' ? `<div class="vd-line"><b class="m-err">!</b><span class="bad">${esc(h.error || 'The host did not answer.')}</span></div>`
      : c.conditions.map((x) => { const l = h.leaves?.[x.id]; if (!l) return ''; const [cls, m, w] = VD_MARK[l.s] || VD_MARK.E; return `<div class="vd-line"><b class="${cls}" title="${w}">${m}</b><span>${esc(x.text)}${l.d ? ` <span class="dim">: ${esc(l.d)}</span>` : ''}</span></div>`; }).join('')}</td></tr>`;
    return `<tr class="bh-row ${open ? 'on' : ''}" data-vdhost="${esc(h.hostId)}"><td><b>${esc(h.name)}</b> <span class="dim">${esc(h.address)}</span></td><td>${st}</td>${cells}</tr>${sub}`;
  }).join('');
  return `<div class="bd-facts"><div><span>Result</span>${result}</div><div><span>Started</span>${esc(vdFull(run.startedAt))}</div><div><span>Finished</span>${done ? esc(vdFull(run.finishedAt)) : '-'}</div>
      <div><span>Elapsed</span>${esc(fmtDur((done ? new Date(run.finishedAt) : Date.now()) - new Date(run.startedAt)))}</div><div><span>Hosts passing</span>${pass} of ${n}</div><div><span>Run by</span>${run.by === 'schedule' ? 'its schedule' : esc(run.by || '-')}</div></div>
    ${latest ? `<p class="dim" style="margin:6px 0 0">This is an earlier run. <a class="dl" data-vdlatest="1">Show the latest</a></p>` : ''}
    <div class="pall" style="margin-top:8px"><span class="pbar">${seg(pass, 'ok')}${seg(fail, 'bad')}${seg(err, 'can')}${seg(busy, 'run')}</span><span>${pass} of ${n} host${n === 1 ? '' : 's'} pass</span></div>
    <div class="vd-filter"><div class="toggle">${chip('all', 'All', n)}${chip('fail', 'Failing', fail)}${chip('pass', 'Passing', pass)}${chip('error', 'Unreachable', err)}</div><span class="dim">Select a host. ✓ true · ✗ false · – not applicable · ! could not check</span></div>
    <div class="vd-res"><table class="bh vd-grid"><thead><tr><th>Host</th><th>Result</th>${heads}</tr></thead><tbody>${body || `<tr><td colspan="${c.conditions.length + 2}" class="dim">No hosts match.</td></tr>`}</tbody></table></div>`;
}
function paneAbout(c) {
  const fact = (k, v) => `<div><span>${k}</span>${v}</div>`;
  const until = !c.everyMinutes ? '-' : c.until?.type === 'time' ? esc(vdFull(c.until.at)) : 'Indefinitely, until it is deleted';
  const status = { manual: 'By hand only', active: 'Active', paused: 'Paused', finished: 'Finished' }[c.status];
  return `<div class="bd-facts">${fact('Name', esc(c.name))}${fact('Runs', c.everyMinutes ? `Every ${esc(rcEvery(c.everyMinutes))}` : 'By hand')}${fact('Until', until)}${fact('Status', esc(status))}${fact('Next run', c.status === 'active' && c.nextRun ? esc(vdFull(c.nextRun)) : '-')}${fact('Hosts', c.hosts)}${fact('Conditions', c.conditions.length)}${fact('Created by', c.createdBy ? esc(c.createdBy) : '-')}${fact('Created', esc(vdFull(c.createdAt)))}${fact('Last changed', esc(vdFull(c.updatedAt)))}</div>
    ${c.description ? `<div class="hd-label">Description</div><p style="margin:0">${esc(c.description)}</p>` : ''}
    <div class="hd-label">A host passes when</div><p style="margin:0">${esc(c.expression)}</p>
    <div class="hd-label">Conditions</div><div class="rc-items">${c.conditions.map((x) => `<div class="rc-item">${esc(x.text)}</div>`).join('')}</div>
    <p class="dim" style="margin:4px 0 0">A condition that does not apply to a host's OS, or that could not be checked, counts as false.</p>
    <div class="hd-label">Run on <span class="dim">(${c.hosts})</span></div>
    <div class="ab-hosts">${c.groups.map((g) => `<span class="hres dim">${esc(g)} <span class="dim">(group)</span></span>`).join('')}${c.hostList.map((h) => `<span class="hres dim">${esc(h.name)}${h.name !== h.address ? ` (${esc(h.address)})` : ''}</span>`).join('') || '<span class="dim">None</span>'}</div>`;
}
function paneHistory(c) {
  if (!c.history.length) return '<p class="dim" style="margin:0">It has not run yet.</p>';
  return `<table class="bh"><thead><tr><th>Started</th><th>Run by</th><th>Result</th><th class="num">Hosts</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Unreachable</th></tr></thead><tbody>${c.history.map((h) => `<tr class="bh-row ${(vd.runId || c.last?.id) === h.id ? 'on' : ''}" data-vdopenrun="${esc(h.id)}">
      <td>${esc(vdFull(h.startedAt))}</td><td class="dim">${h.by === 'schedule' ? 'its schedule' : esc(h.by || '-')}</td><td>${h.status === 'running' ? '<span class="st-run">Running</span>' : h.failed || h.errors ? `<span class="${h.failed ? 'bad' : 'st-warn'}">Issues</span>` : '<span class="ok">All pass</span>'}</td>
      <td class="num">${h.hosts}</td><td class="num">${h.passed}</td><td class="num ${h.failed ? 'bad' : 'dim'}">${h.failed}</td><td class="num ${h.errors ? 'st-warn' : 'dim'}">${h.errors}</td></tr>`).join('')}</tbody></table>`;
}
function renderDetail() {
  const c = vdCheck(), box = $('vdDetail');
  if (!c) { box.innerHTML = VD_HINT; return; }
  const run = vdRunOf(c);
  const head = `<div class="bd-head"><div><div class="hd-name">${esc(c.name)}</div><div class="hd-file">${esc(c.expression)}</div></div>
    <div class="toggle bd-tabs" role="tablist">${VD_TABS.map(([k, label]) => `<button type="button" role="tab" data-vdtab="${k}" aria-selected="${k === vd.tab}" class="${k === vd.tab ? 'on' : ''}">${label}${k === 'history' ? ` (${c.history.length})` : ''}</button>`).join('')}</div></div>`;
  box.innerHTML = head + (vd.tab === 'about' ? paneAbout(c) : vd.tab === 'history' ? paneHistory(c) : paneResults(c, run));
}
function renderValidate() { renderList(); renderDetail(); }
$('vdDetail').onclick = async (e) => {
  const t = e.target, c = vdCheck(); if (!c) return;
  const tab = t.closest('[data-vdtab]'); if (tab) { vd.tab = tab.dataset.vdtab; renderDetail(); return; }
  const f = t.closest('[data-vdf]'); if (f) { vd.filter = f.dataset.vdf; renderDetail(); return; }
  if (t.closest('[data-vdlatest]')) { vd.runId = null; renderDetail(); return; }
  const hr = t.closest('[data-vdopenrun]'); if (hr) { vd.runId = hr.dataset.vdopenrun; vd.tab = 'results'; vd.open.clear(); await vdEnsureRun(); renderDetail(); return; }
  const h = t.closest('[data-vdhost]'); if (h) { const id = h.dataset.vdhost; if (vd.open.has(id)) vd.open.delete(id); else vd.open.add(id); renderDetail(); }
};

// ---- New Check / Edit: Who, Conditions, Schedule, Overview ----
const wz = { editing: null, selL: new Set(), selH: new Set(), tree: null, sel: 'r', hosts: [], lists: [] };
const WZ_ORDER = ['who', 'cond', 'opts', 'name'], WZ_MAX_LEAVES = 40, WZ_MAX_GROUP_DEPTH = 3;
const wzPreset = (k) => vd.presets.find((p) => p.key === k);
const wzNode = (path) => path.split('.').slice(1).reduce((n, i) => n.items[Number(i)], wz.tree);
const wzParentPath = (path) => path.split('.').slice(0, -1).join('.');
const wzNewCond = (key = 'service') => ({ type: 'cond', preset: key, not: false, params: Object.fromEntries(wzPreset(key).params.map((f) => [f.key, f.default ?? ''])) });
const wzLeaves = (n) => (n.type === 'cond' ? [n] : n.items.flatMap(wzLeaves));
const wzSay = (t, cls = 'bad') => { $('vdMsg').textContent = t || ''; $('vdMsg').className = cls; };

// What a condition says, in words (the server's describe(), for the rows and the overview).
const wzOpt = (p, key, v) => ((wzPreset(p.preset)?.params.find((f) => f.key === key)?.options || []).find(([k]) => k === v) || [, v])[1];
function wzSentence(c) {
  const p = c.params, v = (x) => (x === '' || x == null ? '…' : x);
  const label = () => String(wzOpt(c, 'what', p.what) || '…').replace(/ \((Windows|Linux)\)$/, '');
  return ({
    service: () => `service "${v(p.name)}" ${{ running: 'is running', stopped: 'is stopped', installed: 'is installed', missing: 'is not installed' }[p.state] || p.state}`,
    port: () => `${String(p.proto || 'tcp').toUpperCase()} port ${v(p.port)} is ${p.state === 'closed' ? 'not listening' : 'listening'}${p.process ? ` (by ${p.process})` : ''}`,
    process: () => `process "${v(p.name)}" is ${p.state === 'absent' ? 'not running' : 'running'}`,
    logging: label, security: label,
    logsize: () => `the ${v(p.log)} log is enabled and at least ${v(p.min)} MB`,
    registry: () => `registry ${v(p.path)}\\${v(p.name)} ${{ equals: `= ${v(p.value)}`, contains: `contains "${v(p.value)}"`, exists: 'exists', missing: 'does not exist' }[p.op] || p.op}`,
    file: () => `file ${v(p.path)} ${p.state === 'missing' ? 'does not exist' : `exists${p.sha256 ? ' with the expected SHA-256' : ''}`}`,
    command: () => `command output ${p.op === 'not-contains' ? 'does not contain' : 'contains'} "${v(p.text)}"`,
  }[c.preset] || (() => c.preset))();
}
// The first thing wrong with a condition or group, or ''.
function wzProblem(n) {
  if (n.type === 'group') { if (!n.items.length) return 'A group has no conditions in it'; for (const x of n.items) { const m = wzProblem(x); if (m) return m; } return ''; }
  const p = wzPreset(n.preset);
  for (const f of p.params) {
    const v = String(n.params[f.key] ?? '').trim();
    if (!f.optional && v === '') return `${p.label}: fill in ${f.label}`;
    if (f.key === 'port' && v !== '' && !(Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 65535)) return `${p.label}: the port must be 1 to 65535`;
    if (f.type === 'number' && v !== '' && !(Number(v) >= 0)) return `${p.label}: ${f.label} must be a number`;
  }
  if (n.preset === 'command' && !String(n.params.ps || '').trim() && !String(n.params.sh || '').trim()) return 'Command output: give a PowerShell command, a shell command or both';
  return '';
}
// The tree as rows: { n, path, depth, join } (join is the AND / OR that links it to the one before it in its group).
function wzRows() {
  const out = [];
  const walk = (n, path, depth, join) => { out.push({ n, path, depth, join }); if (n.type === 'group') n.items.forEach((x, i) => walk(x, `${path}.${i}`, depth + 1, i ? n.op : null)); };
  walk(wz.tree, 'r', 0, null);
  return out;
}
const wzHostList = () => {
  const ids = new Set(wz.selH);
  for (const l of wz.lists) if (wz.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  return wz.hosts.filter((h) => ids.has(h.id));
};
const hname = (h) => h.name || h.hostname || h.address;
function wzSummary() {
  const c = wzLeaves(wz.tree).length, h = wzHostList().length;
  $('vdSummary').textContent = `${c} condition${c === 1 ? '' : 's'} · ${h} host${h === 1 ? '' : 's'}`;
}

function wzRenderWho() {
  $('vdGroups').innerHTML = wz.lists.map((l) => `<div class="pick pk ${wz.selL.has(l.id) ? 'sel' : ''}" data-vl="${esc(l.id)}"><span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></div>`).join('') || '<p class="dim" style="margin:6px 10px">No groups yet.</p>';
  $('vdHosts').innerHTML = wz.hosts.map((h) => `<div class="pick pk ${wz.selH.has(h.id) ? 'sel' : ''}" data-vh="${esc(h.id)}"><span class="pn">${esc(hname(h))}</span><span class="pt">${esc(h.address)}</span></div>`).join('') || '<p class="dim" style="margin:6px 10px">No saved hosts yet.</p>';
  wzSummary();
}
$('vdGroups').onclick = (e) => { const r = e.target.closest('[data-vl]'); if (!r) return; const id = r.dataset.vl; if (wz.selL.has(id)) wz.selL.delete(id); else wz.selL.add(id); wzRenderWho(); };
$('vdHosts').onclick = (e) => { const r = e.target.closest('[data-vh]'); if (!r) return; const id = r.dataset.vh; if (wz.selH.has(id)) wz.selH.delete(id); else wz.selH.add(id); wzRenderWho(); };

function wzRenderTree() {
  $('vdTree').innerHTML = wzRows().map(({ n, path, depth, join }) => {
    const on = path === wz.sel ? 'on' : '', pad = `padding-left:${10 + depth * 18}px`, op = join ? `<span class="vc-op">${join.toUpperCase()}</span>` : '', not = n.not ? '<span class="vc-not">NOT</span>' : '';
    if (n.type === 'group') {
      return `<div class="collection-item pi grp ${wzProblem(n) ? 'red' : 'green'} ${on}" data-vcpath="${path}" style="${pad}"><div class="ci-main"><div class="hn">${op}<span class="vc-grp">${n.op === 'or' ? 'ANY of these (OR)' : 'ALL of these (AND)'}</span>${not}</div><div class="hd">${n.items.length} item${n.items.length === 1 ? '' : 's'}</div></div>${path === 'r' ? '' : `<button type="button" class="unpick" data-vcdel="${path}" title="Remove this group" aria-label="Remove">×</button>`}</div>`;
    }
    const s = wzSentence(n);
    return `<div class="collection-item pi ${wzProblem(n) ? 'red' : 'green'} ${on}" data-vcpath="${path}" style="${pad}"><div class="ci-main"><div class="hn">${op}${esc(wzPreset(n.preset).label)}${not}</div><div class="hd" title="${esc(s)}">${esc(s)}</div></div><button type="button" class="unpick" data-vcdel="${path}" title="Remove this condition" aria-label="Remove">×</button></div>`;
  }).join('');
  const target = wz.tree && wzNode(wz.sel).type === 'group' ? wzNode(wz.sel) : wzNode(wzParentPath(wz.sel));
  $('vdAddNote').textContent = `Adds to: ${target.op === 'or' ? 'ANY of these (OR)' : 'ALL of these (AND)'}`;
  const btn = $('vdTabCond'), n = wzLeaves(wz.tree).length;
  btn.lastChild.textContent = n ? `Conditions (${n})` : 'Conditions';
  btn.classList.remove('p-red', 'p-green');
  btn.classList.add(wzProblem(wz.tree) ? 'p-red' : 'p-green');
  wzSummary();
}
const wzFieldRow = (n, f) => {
  const v = n.params[f.key] ?? '';
  const input = f.type === 'select' ? `<select data-vcparam="${f.key}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
    : `<input data-vcparam="${f.key}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" autocomplete="off" spellcheck="false">`;
  return `<label class="rm-prow"><span>${esc(f.label)} ${f.optional ? '<i class="dim">(optional)</i>' : '<i class="pr-req">required</i>'}</span>${input}</label>`;
};
const wzNotRow = (n, what) => `<div class="sw-row"><button class="switch" type="button" role="switch" data-vcnot aria-checked="${!!n.not}" aria-label="Not"></button><b>Not</b><span class="dim">passes when ${what} is false</span></div>`;
function wzRenderCond() {
  const n = wzNode(wz.sel), box = $('vdCond');
  if (n.type === 'group') {
    const root = wz.sel === 'r';
    box.innerHTML = `<div class="vc-form"><div class="hd-name">${root ? 'The check' : 'Group'}</div><div class="hd-file">${root ? 'Top level' : 'Inside another group'}</div>
      <div class="pr-desc dim">A group passes when <b>all</b> (AND) or <b>any</b> (OR) of the things in it pass. Put a group inside a group for combinations like A AND (B OR C).</div>
      <label class="rm-prow"><span>Passes when</span><div class="toggle"><button type="button" data-vcop="and" class="${n.op === 'and' ? 'on' : ''}">ALL of these (AND)</button><button type="button" data-vcop="or" class="${n.op === 'or' ? 'on' : ''}">ANY of these (OR)</button></div></label>
      ${wzNotRow(n, 'the group')}
      <p class="vc-gnote dim">It has ${n.items.length} item${n.items.length === 1 ? '' : 's'}. Use <b>+ Condition</b> and <b>+ Group</b> under the list to add to it.</p>
      ${root ? '' : `<div class="pr-foot"><button type="button" class="act sec" data-vcdel="${wz.sel}">Remove group</button></div>`}</div>`;
    return;
  }
  const p = wzPreset(n.preset), groups = [...new Set(vd.presets.map((x) => x.group))];
  box.innerHTML = `<div class="vc-form"><div class="hd-name">${esc(p.label)}</div><div class="hd-file">${esc(p.group)}</div><div class="pr-desc dim">${esc(p.help)}</div>
    <div class="pr-state" id="vdCState"></div>
    <label class="rm-prow"><span>Check</span><select data-vcpreset>${groups.map((g) => `<optgroup label="${esc(g)}">${vd.presets.filter((x) => x.group === g).map((x) => `<option value="${x.key}" ${x.key === n.preset ? 'selected' : ''} ${x.needs && !can(x.needs) ? 'disabled' : ''}>${esc(x.label)}${x.needs && !can(x.needs) ? ' (needs Run actions)' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
    ${p.params.map((f) => wzFieldRow(n, f)).join('')}
    ${wzNotRow(n, 'this')}
    <div class="pr-foot"><button type="button" class="act sec" data-vcdel="${wz.sel}">Remove condition</button></div></div>`;
  wzPaintState();
}
function wzPaintState() {
  const el = $('vdCState'); if (!el) return;
  const n = wzNode(wz.sel), m = n.type === 'cond' ? wzProblem(n) : '';
  el.className = `pr-state ${m ? 'red' : 'green'}`; el.textContent = m ? `${m}.` : 'Complete.';
}
function wzSelect(path) { wz.sel = path; wzRenderTree(); wzRenderCond(); }
$('vdTree').onclick = (e) => {
  const d = e.target.closest('[data-vcdel]'); if (d) { e.stopPropagation(); wzRemove(d.dataset.vcdel); return; }
  const r = e.target.closest('[data-vcpath]'); if (r) wzSelect(r.dataset.vcpath);
};
function wzRemove(path) {
  if (path === 'r') return;
  const pp = wzParentPath(path), parent = wzNode(pp);
  parent.items.splice(Number(path.split('.').pop()), 1);
  wzSelect(pp);
}
// New items go in the selected group, or in the group the selected condition is in.
const wzTarget = () => (wzNode(wz.sel).type === 'group' ? wz.sel : wzParentPath(wz.sel));
$('vdAddCond').onclick = () => {
  if (wzLeaves(wz.tree).length >= WZ_MAX_LEAVES) return toast(`A check can have ${WZ_MAX_LEAVES} conditions at most`, 'bad');
  const tp = wzTarget(), g = wzNode(tp); g.items.push(wzNewCond()); wzSelect(`${tp}.${g.items.length - 1}`);
};
$('vdAddGroup').onclick = () => {
  const tp = wzTarget(), g = wzNode(tp);
  if (tp.split('.').length - 1 > WZ_MAX_GROUP_DEPTH - 1) return toast('Groups nest four deep at most', 'bad');
  if (wzLeaves(wz.tree).length >= WZ_MAX_LEAVES) return toast(`A check can have ${WZ_MAX_LEAVES} conditions at most`, 'bad');
  g.items.push({ type: 'group', op: g.op === 'and' ? 'or' : 'and', not: false, items: [wzNewCond()] });
  wzSelect(`${tp}.${g.items.length - 1}.0`);
};
$('vdCond').onclick = (e) => {
  const n = wzNode(wz.sel);
  const op = e.target.closest('[data-vcop]'); if (op) { n.op = op.dataset.vcop; wzRenderTree(); wzRenderCond(); return; }
  const not = e.target.closest('[data-vcnot]'); if (not) { n.not = !n.not; wzRenderTree(); wzRenderCond(); return; }
  const d = e.target.closest('[data-vcdel]'); if (d) wzRemove(d.dataset.vcdel);
};
$('vdCond').oninput = (e) => { const f = e.target.closest('input[data-vcparam]'); if (!f) return; wzNode(wz.sel).params[f.dataset.vcparam] = f.value; wzRenderTree(); wzPaintState(); };
$('vdCond').onchange = (e) => {
  const n = wzNode(wz.sel);
  const f = e.target.closest('select[data-vcparam]'); if (f) { n.params[f.dataset.vcparam] = f.value; wzRenderTree(); wzPaintState(); return; }
  const p = e.target.closest('select[data-vcpreset]');
  if (p) { const pp = wzParentPath(wz.sel), idx = Number(wz.sel.split('.').pop()); wzNode(pp).items[idx] = { ...wzNewCond(p.value), not: n.not }; wzRenderTree(); wzRenderCond(); }
};

// Schedule: the same recurring box as New Hunt (run every N minutes, until a time or until it is turned off).
recInit('vd');
function wzSetRecurring(on) {
  wz.rec = on;
  $('vdRecurring').setAttribute('aria-checked', on);
  $('vdRecurringLabel').textContent = `Recurring check: ${on ? 'On' : 'Off'}`;
  recToggle('vd', on);
}
$('vdRecurring').onclick = () => wzSetRecurring(!wz.rec);

function wzRenderOverview() {
  const hosts = wzHostList(), rows = wzRows();
  $('vdTargetsHead').textContent = `Will check ${hosts.length} host${hosts.length === 1 ? '' : 's'}`;
  $('vdTargets').innerHTML = hosts.map((h) => `<div class="pick"><span class="pn">${esc(hname(h))}</span><span class="pt">${esc(h.address)}</span><span class="proto-${h.protocol === 'ssh' ? 'ssh' : 'winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span></div>`).join('') || '<p class="dim" style="margin:6px 10px">No hosts chosen.</p>';
  const n = wzLeaves(wz.tree).length;
  $('vdItemsHead').textContent = `Passes when (${n} condition${n === 1 ? '' : 's'})`;
  $('vdItems').innerHTML = rows.map(({ n: x, depth, join }) => `<div class="pick"><span class="pn" style="padding-left:${depth * 16}px">${join ? `<span class="vc-op">${join.toUpperCase()}</span>` : ''}${x.type === 'group' ? `<span class="vc-grp">${x.op === 'or' ? 'ANY of' : 'ALL of'}</span>${x.not ? '<span class="vc-not">NOT</span>' : ''}` : `${x.not ? '<span class="vc-not" style="margin:0 6px 0 0">NOT</span>' : ''}${esc(wzSentence(x))}`}</span></div>`).join('');
  const rec = wz.rec ? recRead('vd') : null, row = (k, v) => `<div><span>${k}</span>${v}</div>`;
  $('vdOvOpts').innerHTML = row('Repeats', wz.rec ? (rec && !rec.error ? esc(rec.text) : '<span class="bad">Set when and for how long on the Schedule tab</span>') : '<span class="dim">No, it runs once now and again when you press Run now</span>');
  $('vdTryHost').innerHTML = `<option value="">Choose a host…</option>${(hosts.length ? hosts : wz.hosts).map((h) => `<option value="${esc(h.id)}">${esc(hname(h))} · ${esc(h.address)}</option>`).join('')}`;
}
const wzBody = () => ({ name: $('vdName').value.trim(), description: $('vdDesc').value, hostIds: [...wz.selH], listIds: [...wz.selL], tree: wz.tree });
$('vdTry').onclick = async () => {
  const hostId = $('vdTryHost').value; if (!hostId) return wzSay('Choose a host to try it on.');
  const m = wzProblem(wz.tree); if (m) { wzTab('cond'); return wzSay(`${m}.`); }
  $('vdTry').disabled = true; wzSay('Running the conditions on the host…', 'dim'); $('vdTryOut').hidden = true;
  try {
    const r = await api('POST', '/api/validate/try', { ...wzBody(), hostId }), h = r.run.hosts[0];
    const st = h.status === 'pass' ? '<span class="ok">Pass</span>' : h.status === 'fail' ? '<span class="bad">Fail</span>' : `<span class="st-warn">Unreachable</span> <span class="bad">${esc(h.error)}</span>`;
    $('vdTryOut').innerHTML = `<b>${esc(h.name)}</b>: ${st}${r.conditions.map((x) => { const l = h.leaves?.[x.id]; if (!l) return ''; const [cls, mark, w] = VD_MARK[l.s] || VD_MARK.E; return `<div class="vd-line"><b class="${cls}" title="${w}">${mark}</b><span>${esc(x.text)}${l.d ? ` <span class="dim">: ${esc(l.d)}</span>` : ''}</span></div>`; }).join('')}`;
    $('vdTryOut').hidden = false; wzSay('');
  } catch (e) { wzSay(e.message); } finally { $('vdTry').disabled = false; }
};

function wzTab(name) {
  document.querySelectorAll('#vdTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === name));
  document.querySelectorAll('#vdModal .hsec').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  $('vdSave').hidden = name !== 'name'; $('vdNext').hidden = name === 'name';
  if (name === 'cond') { wzRenderTree(); wzRenderCond(); }
  if (name === 'name') { wzRenderOverview(); $('vdName').focus(); }
  wzSay('');
}
$('vdTabs').onclick = (e) => { const b = e.target.closest('button[data-pane]'); if (b) wzTab(b.dataset.pane); };
$('vdNext').onclick = () => { const cur = document.querySelector('#vdTabs .on')?.dataset.pane; wzTab(WZ_ORDER[Math.min(WZ_ORDER.indexOf(cur) + 1, WZ_ORDER.length - 1)]); };
const closeWz = () => { $('vdModal').hidden = true; };
$('vdX').onclick = $('vdCancel').onclick = closeWz;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('vdModal').hidden) closeWz(); });

async function wzOpen(c = null) {
  try { [wz.hosts, wz.lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]); if (!vd.presets.length) vd.presets = (await api('GET', '/api/validate')).presets; } catch (e) { toast(e.message, 'bad'); return; }
  wz.editing = c; wz.selL = new Set(c?.listIds || []); wz.selH = new Set(c?.hostIds || []);
  wz.tree = c ? JSON.parse(JSON.stringify(c.tree)) : { type: 'group', op: 'and', not: false, items: [wzNewCond('service')] };
  wz.sel = wz.tree.items.length ? 'r.0' : 'r';
  $('vdTitle').textContent = c ? `Edit ${c.name}` : 'New check';
  $('vdName').value = c?.name || ''; $('vdDesc').value = c?.description || '';
  wzSetRecurring(false);
  if (c && c.everyMinutes > 0) {
    wzSetRecurring(true); $('vdEvery').value = c.everyMinutes;
    if (c.until?.type === 'time') { $('vdUntilTime').checked = true; $('vdUntilAt').value = recLocal(new Date(c.until.at)); } else $('vdUntilForever').checked = true;
    recUpdate('vd');
  }
  $('vdTryOut').hidden = true;
  wzRenderWho(); wzTab('who'); wzSay('');
  $('vdModal').hidden = false;
}
$('vdNew').onclick = () => wzOpen(null);
$('vdSave').onclick = async () => {
  const problem = (pane, msg) => { wzTab(pane); wzSay(msg); };
  const b = wzBody();
  if (!wzHostList().length) return problem('who', 'Choose at least one host or group.');
  const m = wzProblem(wz.tree); if (m) return problem('cond', `${m}.`);
  let schedule = null;
  if (wz.rec) { const r = recRead('vd'); if (r.error) return problem('opts', r.error); schedule = r.schedule; }
  if (!b.name) return problem('name', 'Give the check a name.');
  $('vdSave').disabled = true; wzSay('Saving…', 'dim');
  try {
    const body = { ...b, schedule, enabled: wz.editing ? wz.editing.enabled : true };
    const c = wz.editing ? await api('PUT', `/api/validate/${wz.editing.id}`, body) : await api('POST', '/api/validate', body);
    closeWz(); toast(wz.editing ? `Check ${c.name} saved` : `Check ${c.name} created and running`);
    vd.sel = c.id; vd.tab = 'results'; vd.runId = null; vd.open.clear(); loadValidate();
  } catch (e) { wzSay(e.message); } finally { $('vdSave').disabled = false; }
};

// ---- History: every run of every check, like the other Health logs ----
const vh = { all: [], filter: 'all' };
let vhTimer;
async function loadValidateHistory() {
  let r;
  try { r = await api('GET', '/api/validate'); } catch (e) { $('vhList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  vd.presets = r.presets; vd.checks = r.checks;
  vh.all = r.checks.flatMap((c) => c.history.map((h) => ({ ...h, check: c }))).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  renderValidateHistory();
  clearTimeout(vhTimer);
  if (isActive('health/validate-history')) vhTimer = setTimeout(loadValidateHistory, 5000);
}
window.loadValidateHistory = loadValidateHistory;
function renderValidateHistory() {
  const q = $('vhSearch').value.trim().toLowerCase();
  document.querySelectorAll('#vhFilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === vh.filter));
  const issue = (h) => h.failed || h.errors;
  const shown = vh.all.filter((h) => (vh.filter === 'all' || (vh.filter === 'issues' ? issue(h) : !issue(h) && h.status === 'done')) && (!q || [h.check.name, h.by].some((v) => String(v || '').toLowerCase().includes(q)))).slice(0, 500);
  $('vhCount').textContent = `${shown.length} of ${vh.all.length} shown`;
  $('vhList').innerHTML = shown.length
    ? `<table class="ml"><thead><tr><th>Time</th><th>Check</th><th>Run by</th><th>Hosts</th><th>Pass</th><th>Fail</th><th>Unreachable</th><th>Result</th></tr></thead><tbody>${shown.map((h) => `<tr class="vh-row" data-vhcheck="${esc(h.check.id)}" data-vhrun="${esc(h.id)}"><td class="dim">${esc(new Date(h.startedAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</td>
        <td><b>${esc(h.check.name)}</b></td><td>${h.by === 'schedule' ? '<span class="dim">its schedule</span>' : h.by ? esc(h.by) : '<span class="dim">-</span>'}</td><td>${h.hosts}</td><td>${h.passed}</td><td class="${h.failed ? 'bad' : 'dim'}">${h.failed}</td><td class="${h.errors ? 'st-warn' : 'dim'}">${h.errors}</td>
        <td class="${h.status === 'running' ? 'st-run' : issue(h) ? (h.failed ? 'bad' : 'st-warn') : 'ok'}">${h.status === 'running' ? 'Running' : issue(h) ? 'Issues' : 'All pass'}</td></tr>`).join('')}</tbody></table>`
    : `<p class="dim" style="margin:0">${vh.all.length ? 'No runs match.' : 'No check has run yet.'}</p>`;
}
$('vhSearch').oninput = renderValidateHistory;
$('vhFilter').onclick = (e) => { if (e.target.dataset.f) { vh.filter = e.target.dataset.f; renderValidateHistory(); } };
// Opens a run on the Checks page: its check selected, on the Results tab.
$('vhList').onclick = (e) => { const r = e.target.closest('[data-vhrun]'); if (!r) return; vd.sel = r.dataset.vhcheck; vd.tab = 'results'; vd.runId = r.dataset.vhrun; vd.open.clear(); go('health', 'validate'); };

if (isActive('health/validate')) loadValidate();
if (isActive('health/validate-history')) loadValidateHistory();
