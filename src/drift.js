const diff = require('./diff');

// Drift (Results > Diff): every change between two runs rated red, amber or green.
//   red     dangerous: it looks like an attack, or a protection was weakened (an encoded or hidden PowerShell command, a program that runs from a
//           temp or download folder, a new member of an administrator group, a known attack tool, a reverse shell, antivirus exclusions,
//           an ld.so.preload entry, a new authorized SSH key ...)
//   amber   worth a look: a new or changed item in a collection about persistence, accounts, command and control, execution, lateral movement or the network
//   green   low risk: something that went away, or a change in an inventory-type collection
// The rating looks at the collection (its tags, see diff.collectionInfo) and at the text of the row; "why" says which. It is a guide to
// where to look first, not a verdict: every red item still needs a person to decide.
const ORDER = { red: 3, amber: 2, green: 1 };

// [pattern, why, applies to] ; applies: 'new' (new or changed items only) or 'any'
const DANGEROUS = [
  [/\b(mimikatz|sekurlsa|gentilkiwi|psexec|paexec|procdump|meterpreter|cobalt ?strike|beacon\.dll|netcat|ncat|nc64|chisel|ngrok|rclone|lazagne|rubeus|sharphound|bloodhound|crackmapexec|impacket)\b/i, 'a well-known attack tool', 'any'],
  [/-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{30,}|frombase64string|downloadstring|invoke-expression|\biex\s*[(\s]|-w(indowstyle)?\s+hidden|-nop\b.*-w\b/i, 'encoded, hidden or download-and-run PowerShell', 'new'],
  [/[A-Za-z]:\\(users\\[^\\]+\\(appdata|downloads|desktop)|programdata|windows\\temp|users\\public|\$recycle\.bin)\\[^|;,]*\.(exe|dll|ps1|vbs|js|bat|cmd|scr|hta)\b|\/(tmp|var\/tmp|dev\/shm)\/[^\s|;,]*/i, 'a program that runs from a folder anyone can write to', 'new'],
  [/bash\s+-i|\/dev\/tcp\/|nc\s+-e|ncat\s+-e|mkfifo\s+\S+;\s*nc|socat\s+.*exec:/i, 'a reverse shell', 'new'],
  [/disablerealtimemonitoring|disableantispyware|disablebehaviormonitoring|exclusionpath|exclusionprocess|exclusionextension/i, 'antivirus protection weakened or excluded', 'new'],
  [/ld\.so\.preload|appinit_dlls|userinitmprlogonscript|authorized_keys|image file execution options|debugger\s*=/i, 'a classic persistence hook', 'new'],
  [/\b(domain admins|enterprise admins|schema admins|administrators)\b|\b(sudo|wheel|docker|lxd|disk|shadow)\b.*\w+,/i, 'a privileged group', 'new'],
  [/(^|[^0-9])(4444|31337|1337|5555|6666|9001|1234)([^0-9]|$)/, 'a port often used by attack tools', 'new'],
  [/uid=0|:0:0:|nopasswd|permitrootlogin\s+yes|passwordauthentication\s+yes|permitemptypasswords\s+yes/i, 'root access or weak SSH or sudo settings', 'new'],
];

// kind: 'added' | 'removed' | 'modified'; info: diff.collectionInfo; text: what the item says. Returns { sev, why }.
function classify(kind, info, text) {
  const hay = String(text || '');
  for (const [re, why, scope] of DANGEROUS) {
    if (scope === 'new' && kind === 'removed') continue;
    if (re.test(hay)) return { sev: 'red', why: `Contains ${why}` };
  }
  const att = (info && info.attention) || 0, label = (info && info.label) || 'this collection';
  if (kind === 'removed') return { sev: 'green', why: `Gone from ${label}` };
  if (att >= 1) return { sev: 'amber', why: `${kind === 'modified' ? 'Changed' : 'New'} in ${label}${info.tags && info.tags.find((t) => ['persistence', 'accounts', 'c2', 'malware', 'defense-evasion', 'privilege-escalation', 'execution', 'lateral-movement'].includes(t)) ? ` (${info.tags.find((t) => ['persistence', 'accounts', 'c2', 'malware', 'defense-evasion', 'privilege-escalation', 'execution', 'lateral-movement'].includes(t))})` : ''}` };
  return { sev: 'green', why: `${kind === 'modified' ? 'Changed' : 'New'} in ${label}, an inventory collection` };
}
const itemText = (row, changes) => `${(Array.isArray(row) ? row : [row]).join(' ')} ${(changes || []).filter((c) => !c.time).map((c) => `${c.col} ${c.a} ${c.b}`).join(' ')}`;

// ---- the drift report (one self-contained HTML page) ----
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NAME = { added: 'New', removed: 'Gone', modified: 'Changed' };

// Every change of a comparison as a flat list { sev, why, collection, host, kind, title, detail }, worst first.
function entries(pa, pb, opts = {}) {
  const s = diff.summarise(pa, pb, opts), out = [];
  for (const f of s.files.filter((x) => x.kind === 'data' && x.status !== 'same' && !x.hostMissing).slice(0, 300)) {
    let d; try { d = diff.detail(pa, pb, f.key, opts); } catch { continue; }
    if (!d || d.binary) continue;
    const info = { label: f.label, tags: f.tags || [], attention: f.attention || 0 };
    const host = f.hostName || f.host || (f.hostsB != null ? 'all hosts (pooled)' : '');
    const title = (row) => (d.csv ? ((d.keyColumns && d.keyColumns.length ? d.keyColumns : d.header.slice(0, 2)).map((h) => row[d.header.indexOf(h)] ?? '').filter(Boolean).join(' · ') || row.slice(0, 2).join(' ')) : String(row)).slice(0, 160);
    const fields = (row) => (d.csv ? d.header.map((h, i) => (row[i] ? `${h}: ${row[i]}` : '')).filter(Boolean).join('  |  ') : String(row)).slice(0, 600);
    const hostOf = (it) => (it.hosts && it.hosts.length ? it.hosts.join(', ') : host);
    for (const it of d.addedItems) { const c = classify('added', info, itemText(it.row)); out.push({ ...c, collection: f.label, host: hostOf(it), kind: 'added', title: title(it.row), detail: fields(it.row) }); }
    for (const it of d.removedItems) { const c = classify('removed', info, itemText(it.row)); out.push({ ...c, collection: f.label, host: hostOf(it), kind: 'removed', title: title(it.row), detail: fields(it.row) }); }
    for (const m of d.modified) { const c = classify('modified', info, itemText(m.b, m.changed)); out.push({ ...c, collection: f.label, host: hostOf(m), kind: 'modified', title: title(m.b), detail: m.changed.filter((x) => !x.time).map((x) => `${x.col}: ${x.a || '(empty)'} → ${x.b || '(empty)'}`).join('  |  ') }); }
  }
  out.sort((x, y) => ORDER[y.sev] - ORDER[x.sev] || x.collection.localeCompare(y.collection) || x.title.localeCompare(y.title));
  return { summary: s, entries: out };
}

function driftReport(pa, pb, names, opts = {}) {
  const { summary, entries: list } = entries(pa, pb, opts);
  const n = { red: 0, amber: 0, green: 0 }; for (const e of list) n[e.sev]++;
  const total = Math.max(1, list.length), pct = (k) => ((n[k] / total) * 100).toFixed(1);
  const verdict = n.red ? `${n.red} dangerous change${n.red === 1 ? '' : 's'} found` : n.amber ? 'No dangerous changes, but some need a look' : list.length ? 'Only low-risk changes' : 'No changes';
  const row = (e) => `<tr class="r ${e.sev}" data-sev="${e.sev}"><td><span class="pill ${e.sev}">${e.sev}</span></td><td>${esc(NAME[e.kind])}</td><td>${esc(e.collection)}</td><td>${esc(e.host)}</td><td class="t">${esc(e.title)}</td><td class="d">${esc(e.detail)}</td><td class="w">${esc(e.why)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Drift report: ${esc(names.a)} to ${esc(names.b)}</title>
<style>
:root{--bg:#fff;--fg:#1a2233;--dim:#667085;--line:#dfe3ea;--panel:#f6f8fb;--red:#d92d20;--amber:#d98e04;--green:#1a9b60}
@media (prefers-color-scheme:dark){:root{--bg:#10141b;--fg:#dde3ee;--dim:#8b96a8;--line:#273040;--panel:#161c26;--red:#ef6a60;--amber:#e3b04b;--green:#46c28c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif}
header{padding:22px 28px 14px;border-bottom:1px solid var(--line)}h1{margin:0 0 4px;font-size:21px}.sub{color:var(--dim);font-size:13px}
.vs{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 0}.side{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:4px 10px}.side i{font-style:normal;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin-right:6px}
.bar{display:flex;height:12px;border-radius:6px;overflow:hidden;margin:16px 28px 6px;background:var(--line)}.bar i{display:block}.bar .red{background:var(--red)}.bar .amber{background:var(--amber)}.bar .green{background:var(--green)}
.sum{display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin:0 28px 14px}.sum b.v{font-size:15px}.cnt{display:flex;gap:6px;align-items:center;cursor:pointer;user-select:none;border:1px solid var(--line);border-radius:999px;padding:2px 12px 2px 8px}.cnt.off{opacity:.4}.dot{width:10px;height:10px;border-radius:50%;display:inline-block}.dot.red{background:var(--red)}.dot.amber{background:var(--amber)}.dot.green{background:var(--green)}
.tools{margin:0 28px 10px;display:flex;gap:10px}.tools input{flex:1;max-width:420px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.wrap{margin:0 28px 40px;overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px}th{position:sticky;top:0;background:var(--panel);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim)}td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr.r.red td:first-child{box-shadow:inset 4px 0 0 var(--red)}tr.r.amber td:first-child{box-shadow:inset 4px 0 0 var(--amber)}tr.r.green td:first-child{box-shadow:inset 4px 0 0 var(--green)}tr.r.red{background:color-mix(in srgb,var(--red) 8%,transparent)}tr.r.amber{background:color-mix(in srgb,var(--amber) 7%,transparent)}
td.t{font-weight:600}td.d{font:12px ui-monospace,Consolas,monospace;max-width:560px;word-break:break-word}td.w{color:var(--dim);font-size:12px}
.pill{display:inline-block;min-width:58px;text-align:center;border-radius:999px;padding:0 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:#fff}.pill.red{background:var(--red)}.pill.amber{background:var(--amber)}.pill.green{background:var(--green)}
.empty{padding:30px;text-align:center;color:var(--dim)}.note{margin:0 28px 14px;color:var(--dim);font-size:12px}
</style></head><body>
<header><h1>Drift report</h1><div class="sub">What changed between two runs, rated by how dangerous it looks. Generated ${esc(new Date().toLocaleString())}.</div>
<div class="vs"><span class="side"><i>Before</i>${esc(names.a)}</span><span>→</span><span class="side"><i>After</i>${esc(names.b)}</span>${summary.pooled ? '<span class="sub">hosts pooled: ' + esc(summary.poolReason || '') + '</span>' : ''}</div></header>
<div class="bar"><i class="red" style="width:${pct('red')}%"></i><i class="amber" style="width:${pct('amber')}%"></i><i class="green" style="width:${pct('green')}%"></i></div>
<div class="sum"><b class="v">${esc(verdict)}</b>
<span class="cnt"><span class="dot red"></span><b>${n.red}</b> red <span class="sub">dangerous</span></span>
<span class="cnt"><span class="dot amber"></span><b>${n.amber}</b> amber <span class="sub">look at</span></span>
<span class="cnt"><span class="dot green"></span><b>${n.green}</b> green <span class="sub">low risk</span></span></div>
<div class="note">Red: looks like an attack or a weakened protection. Amber: a new or changed item in a collection about persistence, accounts, execution, lateral movement or the network. Green: something that went away, or a change in an inventory collection. Times and counters that change on every run are not counted. This is a guide to where to look first, not a verdict.</div>
<div class="wrap">${list.length ? `<table id="t"><thead><tr><th>Rating</th><th>Change</th><th>Collection</th><th>Host</th><th>Item</th><th>Details</th><th>Why</th></tr></thead><tbody>${list.map(row).join('')}</tbody></table>` : '<div class="empty">No changes between the two runs.</div>'}</div>
</body></html>`;
}

module.exports = { classify, entries, driftReport };
