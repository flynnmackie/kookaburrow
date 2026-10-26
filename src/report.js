const fs = require('fs');
const path = require('path');
const { outputDir } = require('./config');
const { runDir, parseCsv } = require('./output');

// Builds the HTML report for one hunt or response (Results > Report). One self-contained page, no external files, in the layout of the
// Windows baseline reports: a title block, a sticky search bar, a section list down the left and one section per collection (or
// action) with its data in a table. The report covers every host in the run together: each table holds the rows from all hosts, with
// the host named on each row. Everything that came from a host is escaped before it goes into the page.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
const dur = (a, b) => { if (!a || !b) return '-'; const s = Math.max(0, Math.round((new Date(b) - new Date(a)) / 1000)), m = Math.floor(s / 60); return m ? `${m}m ${s % 60}s` : `${s}s`; };
const nice = (s) => String(s || '').replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

// The run's JSON (<name>_All_Hosts.json), or the older hunt.json / response.json, or null.
function dataOf(run) {
  const dir = runDir(run);
  if (!dir || !fs.existsSync(dir)) return null;
  const top = fs.readdirSync(dir).find((n) => /_All_Hosts\.json$/.test(n));
  const file = top ? path.join(dir, top) : ['All-Hosts/hunt.json', 'response.json'].map((p) => path.join(dir, p)).find((p) => fs.existsSync(p));
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// hosts (optional) is the address each row belongs to, so the host filter at the top of the report can show or hide it.
const table = (cols, rows, cls = 'dfir', hosts = null) => `<div class='tablewrap'><table class='${cls}'><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr${hosts && hosts[i] != null ? ` data-host='${esc(hosts[i])}'` : ''}>${r.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const ART_ROWS = 100; // rows of each artefact shown per host; the CSV in the output folder has all of them
function artefactSections(run, hostName) {
  const base = runDir(run);
  if (!base || run.kind === 'response') return [];
  const perHost = []; // { address, summary: [{ cat }], dir }
  for (const r of run.results) {
    if (!r.rawPath || perHost.some((h) => h.address === r.address)) continue;
    const dir = path.resolve(base, r.rawPath);
    if (!dir.startsWith(path.resolve(base) + path.sep)) continue;
    let table;
    try { table = parseCsv(fs.readFileSync(path.join(dir, 'summary.csv'), 'utf8')); } catch { continue; }
    if (table.length < 2) continue;
    const head = table[0], idx = (n) => head.indexOf(n);
    if (idx('Category') < 0 || idx('Id') < 0) continue;
    const rows = table.slice(1).map((c) => Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']))).filter((x) => x.Id);
    perHost.push({ address: r.address, dir, rows });
  }
  if (!perHost.length) return [];
  const cats = [], seen = new Set();
  for (const h of perHost) for (const x of h.rows) if (!seen.has(x.Id)) { seen.add(x.Id); cats.push({ id: x.Id, title: x.Category }); }
  const out = [];
  for (const cat of cats) {
    let total = 0, bad = false, html = '';
    const status = [], data = [];
    for (const h of perHost) {
      const x = h.rows.find((r) => r.Id === cat.id);
      if (!x) continue;
      total += Number(x.Records) || 0;
      if (x.Status === 'error') bad = true;
      status.push([hostName.get(h.address) || h.address, h.address, x.Status, x.Records, `${x.Seconds}s`, x.Columns || '', x.Notes || '']);
      if (x.File) {
        try {
          const t = parseCsv(fs.readFileSync(path.join(h.dir, path.basename(x.File)), 'utf8'));
          if (t.length > 1) data.push({ address: h.address, head: t[0], rows: t.slice(1), shown: Math.min(ART_ROWS, t.length - 1) });
        } catch { /* the file was not pulled: the status row says so */ }
      }
    }
    html += `<p class='desc'>What the baseline captured for this artefact on each host: how many records, whether it worked, how long it took and anything it could not read.</p>`;
    html += table(['Host', 'Address', 'Status', 'Records', 'Time', 'Columns', 'Notes'], status, 'dfir', status.map((s) => s[1]));
    if (data.length) {
      const cols = [...new Set(data.flatMap((d) => d.head))];
      const rows = [], owners = [];
      for (const d of data) for (const r of d.rows.slice(0, ART_ROWS)) { rows.push([hostName.get(d.address) || d.address, ...cols.map((c) => { const i = d.head.indexOf(c); return i < 0 ? '' : r[i] ?? ''; })]); owners.push(d.address); }
      const cut = data.filter((d) => d.rows.length > ART_ROWS);
      html += `<div style='height:12px'></div>${table(['Host', ...cols], rows, 'dfir', owners)}`;
      if (cut.length) html += `<p class='fallbacknote'>Showing the first ${ART_ROWS} of ${cut.map((d) => `${d.rows.length} rows (${esc(hostName.get(d.address) || d.address)})`).join(', ')}. The CSV in the output folder has every row.</p>`;
    } else html += `<p class='empty'>No rows were captured for this artefact.</p>`;
    out.push({ title: cat.title, count: total, err: bad, html });
  }
  return out;
}

function generateReport(run, hostsInfo = []) {
  const isHunt = run.kind !== 'response', noun = isHunt ? 'Hunt' : 'Response', data = dataOf(run);
  const hostName = new Map(run.results.map((r) => [r.address, r.hostLabel]));
  const hostOf = new Map(hostsInfo.map((h) => [h.address, h]));
  const addresses = [...new Set(run.results.map((r) => r.address))];
  const sections = []; // { title, count, html }

  // ---- Overview: the run itself and every host
  const names = isHunt ? (run.collectionNames || [run.collectionName]) : (run.actionNames || []);
  const failed = run.results.filter((r) => r.status === 'error').length;
  sections.push({
    title: 'Run summary', count: 1, err: false,
    html: `<p class='desc'>What was run, by whom and how it went.</p>${table(['Item', 'Value'], [
      ['Name', run.name || run.collectionName], ['Type', noun], ['Run by', run.startedBy || '-'], ['Status', nice(run.status)],
      ['Started', fmt(run.startedAt)], ['Finished', fmt(run.finishedAt)], ['Elapsed', dur(run.startedAt, run.finishedAt)],
      [isHunt ? 'Collections' : 'Actions', names.join(', ')], ['Hosts', String(addresses.length)],
      ['Runs that failed', String(failed)], ['Output folder', run.outputPath ? `output/${run.outputPath}` : '-'],
    ])}`,
  });
  sections.push({
    title: 'Hosts', count: addresses.length, err: false,
    html: `<p class='desc'>Every host this ${noun.toLowerCase()} ran against, and how many of its runs worked.</p>${table(['Host', 'Address', 'OS', 'Protocol', 'Results'], addresses.map((a) => {
      const mine = run.results.filter((r) => r.address === a), ok = mine.filter((r) => r.status === 'ok').length, info = hostOf.get(a) || {};
      return [hostName.get(a) || a, a, String(info.os || '-').replace(/^Microsoft /, ''), info.protocol === 'ssh' ? 'SSH' : info.protocol ? 'WinRM' : '-', `${ok} of ${mine.length} ok${mine.length - ok ? `, ${mine.length - ok} failed` : ''}`];
    }), 'dfir', addresses)}`,
  });

  // ---- One section per collection or action, with the rows from every host
  const items = isHunt ? (data?.collections || []) : (data?.actions || []);
  const itemIds = isHunt ? [...new Map(run.results.map((r) => [r.collectionId, r.collectionName])).entries()] : [...new Map(run.results.map((r) => [r.actionId, r.actionName])).entries()];
  for (const [i, [id, name]] of itemIds.entries()) {
    const d = items.find((x) => (isHunt ? x.collection?.id : x.id) === id) || items[i] || {};
    const meta = isHunt ? d.collection : d;
    const mine = run.results.filter((r) => (isHunt ? r.collectionId : r.actionId) === id);
    const bad = mine.filter((r) => r.status === 'error');
    const records = (isHunt ? d.records : d.output) || [];
    let cols = isHunt ? (d.columns || (records[0] ? Object.keys(records[0]) : [])) : ['Stream', 'Output', 'TargetIP'];
    if (!cols.length && records[0]) cols = Object.keys(records[0]);
    const hasIp = cols.includes('TargetIP');
    const showCols = hasIp ? ['Host', ...cols] : cols;
    const rows = records.map((r) => (hasIp ? [hostName.get(r.TargetIP) || '', ...cols.map((c) => r[c])] : cols.map((c) => r[c])));
    let html = meta?.description ? `<p class='desc'>${esc(meta.description)}</p>` : '';
    html += `<div class='source'><b>Source:</b> ${esc(id)}${meta?.type ? ` &middot; ${esc(meta.type === 'bash' ? 'Linux' : 'PowerShell')}` : ''}${meta?.kind ? ` &middot; ${esc(meta.kind)}` : ''}${meta?.footprint ? ` &middot; footprint ${esc(meta.footprint)}` : ''}</div>`;
    if (bad.length) html += `<p class='fallbacknote'>${bad.length} of ${mine.length} host${mine.length === 1 ? '' : 's'} failed: ${bad.map((r) => `${esc(r.address)} (${esc(r.error || 'no message')})`).join('; ')}</p>`;
    if (!isHunt) html += `${table(['Host', 'Address', 'Result', 'Time', 'Error'], mine.map((r) => [r.hostLabel, r.address, nice(r.status), r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '-', r.error || '']), 'dfir', mine.map((r) => r.address))}<div style='height:12px'></div>`;
    html += rows.length ? table(showCols, rows, 'dfir', records.map((r) => r.TargetIP ?? r.HostAddress ?? null)) : `<p class='empty'>${mine.some((r) => r.status === 'ok') || !mine.length ? 'No rows were returned.' : 'No data: every host failed.'}</p>`;
    sections.push({ title: name, count: rows.length, err: bad.length > 0, html });
  }

  // ---- Large-transfer collections that write a summary.csv next to numbered CSVs (Baseline - Windows Full): one section per artefact
  // category with what was found on each host (status, record count, time, notes) and the first rows of its CSV.
  for (const s of artefactSections(run, hostName)) sections.push(s);

  const title = `${run.name || run.collectionName || noun} - ${noun} report`;
  const nav = sections.map((s, i) => `<li><a href='#sec${i + 1}'>${esc(s.title)} <span class='badge${s.err ? ' err' : s.count ? '' : ' zero'}'>${s.count}</span></a></li>`).join('');
  const main = sections.map((s, i) => `<section id='sec${i + 1}'><h2>${esc(s.title)} <span class='badge${s.err ? ' err' : s.count ? '' : ' zero'}'>${s.count}</span></h2>${s.html}</section>`).join('\n');
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  return `<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>${esc(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
    <h1>${esc(run.name || run.collectionName || noun)}<span class='sub'>&nbsp;&mdash;&nbsp;${noun} report</span></h1>
    <div class='meta'>
        <b>Run by:</b> ${esc(run.startedBy || '-')} &nbsp;|&nbsp;
        <b>Started:</b> ${esc(fmt(run.startedAt))} &nbsp;|&nbsp;
        <b>Status:</b> ${esc(nice(run.status))} &nbsp;|&nbsp;
        <b>Hosts:</b> ${addresses.length} &nbsp;|&nbsp;
        <b>Generated:</b> ${esc(new Date().toLocaleString())} &nbsp;|&nbsp;
        <b>Report times:</b> ${esc(tz)}
    </div>
</header>
<div class='toolbar'>
    <input id='globalSearch' type='search' placeholder='Search all sections&hellip;  ( press / )' autocomplete='off'>
    <select id='hostFilter' title='Show only one host'><option value=''>All hosts (${addresses.length})</option>${addresses.map((a) => `<option value='${esc(a)}'>${esc(hostName.get(a) && hostName.get(a) !== a ? `${hostName.get(a)} - ${a}` : a)}</option>`).join('')}</select>
    <span id='searchInfo'></span>
</div>
<div class='layout'>
    <nav>
        <h3>Sections</h3>
        <ul>${nav}</ul>
    </nav>
    <main>
${main}
    </main>
</div>
<footer>Generated by Kookaburrow</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const STYLE = `
    :root { --bg:#0f1419; --panel:#1a2029; --panel2:#222a35; --fg:#d7dde5;
            --muted:#8a94a3; --accent:#6181ff; --accent2:#2bd4a4; --err:#ff5c5c;
            --warn:#ffce54; --border:#2c3542; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:'Segoe UI','Liberation Sans','DejaVu Sans',Arial,sans-serif;
           background:var(--bg); color:var(--fg); font-size:14px; line-height:1.55; }
    header { background:#000; padding:34px 30px 20px; border-bottom:2px solid var(--accent); }
    header h1 { margin:0; font-size:30px; color:#fff; font-weight:700; }
    header h1 .sub { color:var(--accent); font-weight:400; font-size:22px; }
    header .meta { color:var(--muted); font-size:13px; margin:10px 0 0; }
    header .meta b { color:var(--fg); }
    .toolbar { position:sticky; top:0; z-index:50; display:flex; align-items:center;
               gap:14px; background:#11161d; border-bottom:1px solid var(--border);
               padding:10px 20px; }
    .toolbar input { flex:1; max-width:620px; background:var(--panel2);
                     border:1px solid var(--border); color:var(--fg); border-radius:8px;
                     padding:9px 14px; font-size:14px; outline:none;
                     font-family:Consolas,'DejaVu Sans Mono','Liberation Mono','Courier New',monospace; }
    .toolbar input:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(97,129,255,.18); }
    .toolbar select { background:var(--panel2); border:1px solid var(--border); color:var(--fg); border-radius:8px; padding:9px 12px; font-size:13.5px; max-width:320px; outline:none; }
    .toolbar select:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(97,129,255,.18); }
    .toolbar #searchInfo { color:var(--muted); font-size:12.5px; white-space:nowrap; }
    .layout { display:flex; align-items:flex-start; }
    nav { position:sticky; top:53px; width:250px; min-width:250px; height:calc(100vh - 53px);
          overflow:auto; background:var(--panel); border-right:1px solid var(--border);
          padding:16px 10px; }
    nav h3 { color:var(--accent2); font-size:11px; text-transform:uppercase;
             letter-spacing:1px; margin:6px 12px; border-bottom:1px solid var(--border); padding-bottom:4px; }
    nav ul { list-style:none; margin:0; padding:0; }
    nav li a { display:flex; justify-content:space-between; align-items:center;
               gap:8px; padding:7px 12px; color:var(--fg); text-decoration:none;
               border-radius:6px; font-size:13px; }
    nav li a:hover { background:var(--panel2); color:#fff; }
    main { flex:1; padding:24px 30px; max-width:calc(100% - 250px); min-width:0; }
    section { background:var(--panel); border:1px solid var(--border);
              border-radius:10px; padding:18px 22px; margin-bottom:22px;
              scroll-margin-top:74px; }
    section h2 { margin:0 0 4px; font-size:18px; color:var(--accent);
                 display:flex; align-items:center; gap:10px; }
    .desc { color:var(--muted); margin:0 0 8px; font-size:12.5px; }
    .source { color:var(--accent2); margin:0 0 14px; font-size:12px;
              font-family:Consolas,'DejaVu Sans Mono','Liberation Mono','Courier New',monospace;
              background:rgba(43,212,164,0.07); border-left:3px solid var(--accent2);
              padding:6px 10px; border-radius:4px; overflow-wrap:anywhere; }
    .source b { color:var(--muted); font-family:'Segoe UI','Liberation Sans','DejaVu Sans',Arial,sans-serif; }
    .badge { background:var(--accent); color:#06121f; font-size:11px; font-weight:700;
             border-radius:10px; padding:1px 9px; min-width:20px; text-align:center; }
    .badge.zero { background:var(--border); color:var(--muted); }
    .badge.err  { background:var(--err); color:#fff; }
    .tablewrap { max-height:70vh; overflow:auto; border:1px solid var(--border);
                 border-radius:8px; }
    table { width:100%; border-collapse:separate; border-spacing:0; font-size:12.5px; }
    thead th { position:sticky; top:0; z-index:1; background:var(--panel2); color:#fff;
               text-align:left; padding:8px 10px; border-bottom:2px solid var(--accent);
               white-space:nowrap; }
    tbody td { padding:6px 10px; border-bottom:1px solid var(--border);
               vertical-align:top; max-width:520px; overflow-wrap:anywhere; white-space:pre-wrap; }
    tbody tr:nth-child(even) { background:rgba(255,255,255,.018); }
    tbody tr:hover { background:rgba(97,129,255,.07); }
    .cellclip { overflow:hidden; }
    .showmore { display:inline-block; margin-top:4px; padding:0; border:0;
                background:none; color:var(--accent); font-family:inherit;
                font-size:12px; cursor:pointer; }
    .showmore:hover { color:var(--accent2); text-decoration:underline; }
    @media print { .cellclip { max-height:none !important; }
                   .showmore { display:none; } }
    .empty { color:var(--muted); font-style:italic; }
    .fallbacknote { color:var(--warn); margin:0 0 14px; font-size:12px;
                    background:rgba(255,206,84,0.07); border-left:3px solid var(--warn);
                    padding:6px 10px; border-radius:4px; overflow-wrap:anywhere; }
    footer { color:var(--muted); font-size:12px; padding:18px 30px; border-top:1px solid var(--border); }
`;

const SCRIPT = `
(function () {
    var search = document.getElementById('globalSearch');
    var hostSel = document.getElementById('hostFilter');
    var info   = document.getElementById('searchInfo');
    // Rows are shown when they match the search text AND belong to the chosen host. Rows that do not belong to a host (the run
    // summary) always stay. A section with nothing left to show is hidden while a search or host filter is active.
    function apply() {
        var q = search.value.trim().toLowerCase();
        var host = hostSel ? hostSel.value : '';
        var totalMatches = 0;
        document.querySelectorAll('main section').forEach(function (sec) {
            var secMatches = 0, filterable = false;
            sec.querySelectorAll('table.dfir').forEach(function (t) {
                t.querySelectorAll('tbody tr').forEach(function (tr) {
                    var h = tr.getAttribute('data-host');
                    var hostOk = host === '' || h === null || h === host;
                    var textOk = q === '' || tr.textContent.toLowerCase().indexOf(q) !== -1;
                    var hit = hostOk && textOk;
                    tr.style.display = hit ? 'table-row' : 'none';
                    if (q !== '' || (host !== '' && h !== null)) {
                        filterable = true;
                        if (hit) { secMatches++; totalMatches++; }
                    }
                });
            });
            if (!sec.querySelector('table.dfir')) sec.style.display = (q === '' && host === '') ? '' : 'none';
            else sec.style.display = (filterable && secMatches === 0) ? 'none' : '';
            // the counts in the section list and in the section heading follow the filter too
            var badges = [sec.querySelector('h2 .badge'), document.querySelector("nav a[href='#" + sec.id + "'] .badge")];
            badges.forEach(function (b) {
                if (!b) return;
                if (b.getAttribute('data-total') === null) b.setAttribute('data-total', b.textContent);
                b.textContent = filterable ? String(secMatches) : b.getAttribute('data-total');
                if (!b.classList.contains('err')) b.classList.toggle('zero', b.textContent === '0');
            });
        });
        info.textContent = (q === '' && host === '') ? '' : (totalMatches + ' row(s) match');
    }
    search.addEventListener('input', apply);
    if (hostSel) hostSel.addEventListener('change', apply);
    document.addEventListener('keydown', function (e) {
        if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
        else if (e.key === 'Escape') { search.value = ''; if (hostSel) hostSel.value = ''; apply(); search.blur(); }
    });
    var MAXLINES = 5;
    function clampCells() {
        var cells = document.querySelectorAll('table.dfir tbody td');
        if (!cells.length) return;
        var cs  = getComputedStyle(cells[0]);
        var lh  = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.55);
        var max = lh * MAXLINES;
        var probe = document.createRange();
        var tall  = [];
        for (var i = 0; i < cells.length; i++) {
            probe.selectNodeContents(cells[i]);
            if (probe.getBoundingClientRect().height > max + 1) tall.push(cells[i]);
        }
        tall.forEach(function (td) {
            var clip = document.createElement('div');
            clip.className = 'cellclip';
            clip.style.maxHeight = max + 'px';
            while (td.firstChild) clip.appendChild(td.firstChild);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'showmore';
            btn.textContent = 'Show more...';
            btn.addEventListener('click', function () {
                var open = clip.classList.toggle('open');
                clip.style.maxHeight = open ? 'none' : max + 'px';
                btn.textContent = open ? 'Show less' : 'Show more...';
            });
            td.appendChild(clip);
            td.appendChild(btn);
        });
    }
    clampCells();
    apply();
})();
`;

// Reports are kept together in output/reports/, named after the run's folder: <H|R>_<name>_<date>_Report.html.
const reportsDir = () => path.join(outputDir, 'reports');
function reportFile(run) {
  const dir = runDir(run);
  if (!dir) return null;
  const file = path.join(reportsDir(), `${path.basename(dir)}_Report.html`);
  return fs.existsSync(file) ? file : null;
}
function writeReport(run, hostsInfo) {
  const dir = runDir(run);
  if (!dir || !fs.existsSync(dir)) throw new Error('This run has no output folder, so there is nothing to report on');
  fs.mkdirSync(reportsDir(), { recursive: true });
  const file = path.join(reportsDir(), `${path.basename(dir)}_Report.html`);
  fs.writeFileSync(file, generateReport(run, hostsInfo));
  return file;
}

module.exports = { generateReport, writeReport, reportFile };
