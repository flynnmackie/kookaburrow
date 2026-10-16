const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

// ---- navigation: top tabs -> left menu -> page (page ids are "tab/page" slugs) ----
const NAV = [
  // A third entry puts a page under a titled dropdown in the side menu (the titles are not pages).
  // { heading: 'Name' } is a titled dropdown with no pages yet.
  { id: 'settings', label: 'Settings', pages: [
    { heading: 'System' },
    ['view-hunts', 'View Hunts', 'Hunts'], ['add-hunts', 'Add Hunts', 'Hunts'], ['binaries', 'Binaries', 'Hunts'],
    ['view-actions', 'View Actions', 'Actions'], ['add-actions', 'Add Actions', 'Actions'],
    { heading: 'User Management' },
    { heading: 'Shell Settings' },
    { heading: 'Health Settings' },
  ] },
  { id: 'hosts', label: 'Host Management', pages: [
    ['view-hosts', 'View Hosts', 'Hosts'], ['profiles', 'Profiles', 'Hosts'], ['groups', 'Groups', 'Hosts'],
    ['discover', 'Discover', 'Add Hosts'], ['manual', 'Manually Add', 'Add Hosts'],
  ] },
  { id: 'burrow', label: 'Burrow!', accent: true, pages: [['hunts', 'Hunts'], ['actions', 'Actions']] },
  { id: 'output', label: 'Output', pages: [['log', 'Log'], ['report', 'Report'], ['json', 'JSON']] },
  // Shell and Health are placed apart on the right of the top bar; nothing in them yet.
  { id: 'shell', label: 'Shell', pages: [], right: true },
  { id: 'health', label: 'Health', pages: [], right: true },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const loaders = {
  'settings/view-hunts': () => loadHuntList(),
  'settings/view-actions': () => loadActionList(),
  'settings/add-hunts': () => addHunts(),
  'settings/add-actions': () => addActions(),
  'settings/binaries': loadBinaries,
  'hosts/view-hosts': loadHosts,
  'hosts/profiles': loadAuthHosts,
  'hosts/discover': loadAuthHosts,
  'hosts/groups': loadGroups,
  'output/log': loadRuns,
  'output/json': loadJsonRuns,
};

// Side menu. Pages numbered I, II, ... in order; pages with a group sit under a titled dropdown.
// Every dropdown starts closed; the ones you open stay open across refreshes (kept in localStorage).
const OPEN_KEY = 'kb.openGroups';
const openGroups = new Set();
try { JSON.parse(localStorage.getItem(OPEN_KEY) || '[]').forEach((k) => openGroups.add(k)); } catch { /* storage unavailable: all closed */ }
function saveOpenGroups() {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openGroups])); } catch { /* ignore */ }
}
let currentTab = null, currentSlug = null;
function renderSide() {
  const tab = currentTab;
  if (!tab.pages.length) { $('sidenav').innerHTML = '<div class="empty">Nothing here yet</div>'; return; }
  let html = '', last = null, n = 0;
  const heading = (name) => {
    const open = openGroups.has(`${tab.id}/${name}`);
    html += `<button class="sidehead" data-group="${esc(`${tab.id}/${name}`)}" aria-expanded="${open}"><span class="chev">${open ? '▾' : '▸'}</span>${esc(name)}</button>`;
    return open;
  };
  for (const entry of tab.pages) {
    if (!Array.isArray(entry)) { // a heading with no pages yet
      if (heading(entry.heading)) html += '<div class="empty sub">Nothing here yet</div>';
      last = null;
      continue;
    }
    const [pid, label, group] = entry;
    const key = group ? `${tab.id}/${group}` : null;
    if (group && group !== last) heading(group);
    last = group || null;
    const num = ROMAN[n++]; // numbering counts every page, open or not, so it never shifts
    if (key && !openGroups.has(key)) continue;
    html += `<button data-tab="${tab.id}" data-page="${pid}" class="${group ? 'sub' : ''} ${currentSlug === `${tab.id}/${pid}` ? 'on' : ''}"><span class="num">${num}</span>${esc(label)}</button>`;
  }
  $('sidenav').innerHTML = html;
}

function go(tabId, pageId) {
  const tab = NAV.find((t) => t.id === tabId) || NAV[0];
  const real = tab.pages.filter(Array.isArray); // skip headings that have no pages yet
  const page = real.find((p) => p[0] === pageId) || real[0];
  const slug = page ? `${tab.id}/${page[0]}` : null;

  document.querySelectorAll('#topnav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab.id));
  currentTab = tab; currentSlug = slug;
  renderSide();
  document.querySelectorAll('.page').forEach((s) => s.classList.toggle('on', s.id === slug));
  $('emptyTab').hidden = !!slug;
  if (!slug) location.hash = tab.id;
  else { location.hash = slug; loaders[slug]?.(); }
}

NAV.forEach((t, i) => {
  const b = document.createElement('button');
  b.textContent = t.label; b.dataset.tab = t.id;
  if (t.accent) b.className = 'accent';
  if (t.right) b.className = `right${NAV[i - 1]?.right ? '' : ' first'}`;
  b.onclick = () => go(t.id);
  $('topnav').append(b);
});
$('sidenav').onclick = (e) => {
  const head = e.target.closest('button[data-group]');
  if (head) { // titles only open/close their group
    const key = head.dataset.group;
    if (openGroups.has(key)) openGroups.delete(key); else openGroups.add(key);
    saveOpenGroups();
    renderSide();
    return;
  }
  const b = e.target.closest('button[data-page]');
  if (b) go(b.dataset.tab, b.dataset.page);
};
const isActive = (slug) => $(slug)?.classList.contains('on');

// ---- Discover ----
let scanTimer;
$('scanBtn').onclick = async () => {
  try {
    const job = await api('POST', '/api/scans', { cidr: $('cidr').value });
    $('scanBtn').disabled = true; $('scanStop').hidden = false; $('scanStop').onclick = () => api('DELETE', `/api/scans/${job.id}`);
    $('scanBar').hidden = false;
    scanTimer = setInterval(() => pollScan(job.id), 700);
  } catch (e) { $('scanStatus').textContent = e.message; }
};
async function pollScan(id) {
  const j = await api('GET', `/api/scans/${id}`);
  $('scanStatus').textContent = `${j.status}: ${j.done}/${j.total} scanned, ${j.found.length} found`;
  $('scanBar').firstElementChild.style.width = `${(j.done / j.total) * 100}%`;
  if (j.status !== 'running') {
    clearInterval(scanTimer);
    $('scanBtn').disabled = false; $('scanStop').hidden = true;
    renderScan(j.found);
  }
}
// Discovered hosts are remembered for the browser session so the table reloads after a refresh.
let discovered = [];
try { discovered = JSON.parse(sessionStorage.getItem('discovered') || '[]'); } catch { /* storage unavailable */ }
function setDiscovered(found) {
  discovered = found;
  try { sessionStorage.setItem('discovered', JSON.stringify(found)); } catch { /* ignore */ }
}

// A finished scan fills the Discovered hosts table straight away.
function renderScan(found) {
  setDiscovered(found);
  loadAuthHosts();
}
$('cidr').onkeydown = (e) => { if (e.key === 'Enter') $('scanBtn').click(); };

// ---- Authenticate ----
// OS is only an assumption from open ports (RDP/SMB/WinRM => Windows, SSH alone => Unix).
function assumedOs(h) {
  if (/^Windows/.test(h.osGuess)) return ['windows', 'Windows'];
  if (/^Linux/.test(h.osGuess)) return ['unix', 'Unix'];
  return ['unknown', 'Unknown'];
}
let profiles = [], assignments = {};
async function loadAuthHosts() {
  [profiles, assignments] = await Promise.all([api('GET', '/api/profiles'), api('GET', '/api/assignments')]);
  renderAuthHosts();
  renderProfiles();
}
function renderAuthHosts() {
  const options = (ip) => `<option value="">— none —</option>` + profiles.map((p) =>
    `<option value="${p.id}" ${assignments[ip] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  $('authTable').tBodies[0].innerHTML = discovered.map((h) => {
    const [cls, label] = assumedOs(h);
    return `<tr><td><b>${esc(h.ip)}</b></td><td>${esc(h.hostname || '-')}</td>
      <td><span class="os ${cls}">${label}</span></td><td class="dim">${h.openPorts.join(', ')}</td>
      <td><select class="psel" data-ip="${esc(h.ip)}">${options(h.ip)}</select></td>
      <td class="bad">⚠ verify</td><td class="bad">⚠ verify</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="dim">No hosts yet. Run a subnet scan above.</td></tr>';
}
$('authTable').onchange = async (e) => {
  if (!e.target.classList.contains('psel')) return;
  try { assignments = await api('PUT', '/api/assignments', { ip: e.target.dataset.ip, profileId: e.target.value || null }); }
  catch (err) { alert(err.message); loadAuthHosts(); }
};

// ---- Profiles ----
function renderProfiles() {
  $('profileList').innerHTML = profiles.map((p) => `<div class="plist">
    <div class="pinfo">
      <a class="pname os ${p.kind.startsWith('Windows') ? 'windows' : 'unix'}" data-edit="${p.id}" title="Click to edit">${esc(p.name)}</a>
      <div class="dim pkind">${esc(p.kind)}</div>
    </div>
    <button class="del" data-del="${p.id}">Delete</button></div>`).join('') || '<p class="dim" style="margin:0">No profiles yet.</p>';
}
$('profileList').onclick = async (e) => {
  const { edit, del } = e.target.dataset;
  if (edit) {
    // Load into the form; the password stays blank, and leaving it blank keeps the stored one.
    const p = profiles.find((x) => x.id === edit); if (!p) return;
    $('pName').value = p.name; $('pKind').value = p.kind; $('pDomain').value = p.domain || '';
    $('pUser').value = p.username; $('pPass').value = ''; $('pSudo').value = '';
    $('pPass').placeholder = 'Password (blank = keep current)';
    kindChanged();
  }
  if (del) {
    const p = profiles.find((x) => x.id === del);
    if (!confirm(`Delete profile "${p?.name}"? Hosts using it will be set back to none.`)) return;
    await api('DELETE', `/api/profiles/${del}`);
    loadAuthHosts();
  }
};
$('pSave').onclick = async () => {
  const m = $('pMsg');
  try {
    const p = await api('POST', '/api/profiles', {
      name: $('pName').value, kind: $('pKind').value, domain: $('pDomain').value,
      username: $('pUser').value, password: $('pPass').value, sudoPassword: $('pSudo').value,
    });
    m.className = 'ok'; m.textContent = `Saved "${p.name}"`;
    for (const id of ['pName', 'pDomain', 'pUser', 'pPass', 'pSudo']) $(id).value = '';
    $('pPass').placeholder = 'Password';
    loadAuthHosts();
  } catch (err) { m.className = 'bad'; m.textContent = err.message; }
};
// The profile form's Domain / Sudo fields only apply to some profile kinds.
function kindChanged() {
  const k = $('pKind').value;
  $('pDomain').hidden = k !== 'Windows (domain)';
  $('pSudo').hidden = k !== 'Linux (SSH)';
}
$('pKind').onchange = kindChanged;
kindChanged();

// ---- Hosts ----
let hosts = [];
async function loadHosts() {
  let lists;
  [hosts, lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  $('hostTable').tBodies[0].innerHTML = hosts.map((h) => `<tr>
    <td>${esc(h.name)}</td><td>${esc(h.address)}</td><td>${esc(h.os)}</td><td>${h.protocol}</td>
    <td class="dim">${new Date(h.verifiedAt).toLocaleString()}</td>
    <td><a data-del-host="${h.id}">Delete</a></td></tr>`).join('') || '<tr><td colspan="6" class="dim">No hosts saved</td></tr>';

  // Groups box: every group with its members.
  const byId = Object.fromEntries(hosts.map((h) => [h.id, h]));
  $('groupBox').innerHTML = lists.map((l) => {
    const members = l.hostIds.map((i) => byId[i]).filter(Boolean);
    return `<div class="grp">
      <div class="grp-name">${esc(l.name)}<span class="grp-count">${members.length} host${members.length === 1 ? '' : 's'}</span></div>
      ${members.length ? `<ul>${members.map((m) => `<li>${esc(m.name)}<span class="dim">${esc(m.address)}</span></li>`).join('')}</ul>` : '<div class="dim" style="margin-top:4px">No members</div>'}
    </div>`;
  }).join('') || '<p class="dim" style="margin:0">No groups yet. Create one under Host Management → Groups.</p>';
}
$('hosts/view-hosts').onclick = async (e) => {
  if (e.target.dataset.delHost) { await api('DELETE', `/api/hosts/${e.target.dataset.delHost}`); loadHosts(); }
};

// ---- Groups (the API still calls these "lists") ----
async function loadGroups() {
  const [h, lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  $('listHosts').innerHTML = h.map((x) => `<label><input type="checkbox" class="hsel" value="${x.id}"> ${esc(x.name)} <span class="dim">${esc(x.address)}</span></label>`).join('')
    || '<span class="dim">No hosts saved yet</span>';
  const byId = Object.fromEntries(h.map((x) => [x.id, x]));
  $('listTable').tBodies[0].innerHTML = lists.map((l) => `<tr><td>${esc(l.name)}</td>
    <td>${l.hostIds.map((i) => esc(byId[i]?.name)).join(', ')}</td><td><a data-del-list="${l.id}">Delete</a></td></tr>`).join('') || '<tr><td colspan="3" class="dim">No groups</td></tr>';
}
$('hosts/groups').onclick = async (e) => {
  if (e.target.dataset.delList) { await api('DELETE', `/api/lists/${e.target.dataset.delList}`); loadGroups(); }
};
$('mkList').onclick = async () => {
  const hostIds = [...document.querySelectorAll('.hsel:checked')].map((c) => c.value);
  try { await api('POST', '/api/lists', { name: $('listName').value, hostIds }); $('listName').value = ''; $('listMsg').textContent = ''; loadGroups(); }
  catch (e) { $('listMsg').textContent = e.message; }
};

// ---- Settings: View Hunts / View Actions ----
// One library view serves both: a searchable, filterable list of scripts on the left and the open
// script on the right. `id` prefixes the element ids (huntList, actionList, ...); `url` is the API root.
function makeLibrary({ id, url, noun, folder, showParams }) {
  const el = (s) => $(id + s);
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  let type = 'powershell', all = [], tagList = [], selectedTags = [], depsOnly = false;
  let query = '', req = 0, open = null, searchTimer;

  async function load() {
    const r = ++req;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (selectedTags.length) params.set('tags', selectedTags.join(','));
    if (depsOnly) params.set('deps', '1');
    const qs = params.toString();
    const [list, tags] = await Promise.all([
      api('GET', `${url}${qs ? `?${qs}` : ''}`),
      api('GET', `${url}/tags?type=${type}`),
    ]);
    if (r !== req) return; // a newer search is in flight
    all = list; tagList = tags;
    renderTagFilter();
    renderList();
    if (open) show(open); // refresh the open script, e.g. after uploading a binary
  }

  // Filters: pick tags from the dropdown (scripts must have ALL selected tags) and/or switch on
  // "Dependencies" to keep only scripts that need at least one external binary. Selected tags show
  // as removable chips under the dropdown.
  function renderTagFilter() {
    const available = tagList.filter((t) => !selectedTags.includes(t.tag));
    el('TagFilter').innerHTML = `
    <div class="tf-row">
      <select data-role="tagSelect" ${available.length ? '' : 'disabled'}>
        <option value="">${tagList.length ? (available.length ? 'Filter by tag…' : 'All tags selected') : 'No tags'}</option>
        ${available.map((t) => `<option value="${esc(t.tag)}">${esc(t.tag)} (${t.count})</option>`).join('')}
      </select>
      <button class="tagchip ${depsOnly ? 'on' : ''}" data-deps="1" aria-pressed="${depsOnly}" title="Only ${noun}s that need at least one dependency (external binary)">Dependencies</button>
      ${selectedTags.length || depsOnly ? '<a data-clear-tags="1">Clear</a>' : ''}
    </div>
    ${selectedTags.length ? `<div class="tf-chips">${selectedTags.map((t) => `<button class="tagchip on" data-remove-tag="${esc(t)}" title="Remove filter">${esc(t)} ×</button>`).join('')}</div>` : ''}`;
  }
  function toggleTag(tag) {
    selectedTags = selectedTags.includes(tag) ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag];
    load();
  }
  el('TagFilter').onchange = (e) => { if (e.target.dataset.role === 'tagSelect' && e.target.value) toggleTag(e.target.value); };
  el('TagFilter').onclick = (e) => {
    if (e.target.dataset.clearTags) { selectedTags = []; depsOnly = false; load(); return; }
    if (e.target.dataset.deps) { depsOnly = !depsOnly; load(); return; }
    if (e.target.dataset.removeTag) toggleTag(e.target.dataset.removeTag);
  };
  // Searches the name/description and the script text itself (matching is done server-side).
  el('Search').oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = el('Search').value.trim(); load(); }, 200);
  };

  // A script with binary dependencies is red until every one is uploaded, then light green.
  // Scripts with no dependencies keep the normal look.
  function depState(h) {
    if (h.missingDependencies.length) return 'unmet';
    return h.dependencies.length ? 'met' : '';
  }
  function renderList() {
    const count = (t) => all.filter((h) => h.type === t).length;
    document.querySelectorAll(`#${id}Toggle button`).forEach((b) => {
      b.classList.toggle('on', b.dataset.type === type);
      // While searching, show how many hits each side has so matches in the other tab aren't missed.
      b.textContent = (b.dataset.type === 'bash' ? 'Linux' : 'PowerShell') + (query || selectedTags.length || depsOnly ? ` (${count(b.dataset.type)})` : '');
    });
    const dir = `${folder}/${type === 'bash' ? 'bash' : 'powershell'}`;
    const tag = (m) => !m ? '' : [m.name && 'name', m.script && 'script'].filter(Boolean).join(' + ');
    el('List').innerHTML = all.filter((h) => h.type === type).map((h) => `<div class="hunt-item ${h.id === open ? 'on' : ''} ${depState(h)}" data-id="${esc(h.id)}">
    ${h.verified ? VERIFIED : ''}<div class="hn">${esc(h.name)} ${h.match ? `<span class="mtag">${tag(h.match)}</span>` : ''}${h.warnings.length ? `<span class="mwarn" title="${esc(h.warnings.join('; '))}">⚠</span>` : ''}</div>
    <div class="hd" title="${esc(h.description)}">${esc(h.description)}</div>
    ${h.tags.length ? `<div class="htags">${h.tags.map((t) => `<span class="htag ${selectedTags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
    ${h.missingDependencies.length ? `<div class="hmiss" title="Missing: ${esc(h.missingDependencies.join(', '))}">Some dependencies missing</div>`
      : h.dependencies.length ? '<div class="hready" title="Every required binary has been uploaded">Dependencies ready</div>' : ''}
    ${h.match && !h.match.name && h.match.line ? `<div class="hl">${esc(h.match.line)}</div>` : ''}</div>`).join('')
    || (query || selectedTags.length || depsOnly ? `<p class="dim" style="margin:0">No ${type === 'bash' ? 'Linux' : 'PowerShell'} ${noun}s match${query ? ` "${esc(query)}"` : ''}${selectedTags.length ? ` with tag${selectedTags.length > 1 ? 's' : ''} ${selectedTags.map(esc).join(' + ')}` : ''}${depsOnly ? ' that need a dependency' : ''}.</p>`
      : `<p class="dim" style="margin:0">No ${noun}s found. Add scripts to <code>${dir}</code>.</p>`);
  }
  el('Toggle').onclick = (e) => {
    if (!e.target.dataset.type) return;
    type = e.target.dataset.type;
    selectedTags = []; // tags differ between PowerShell and Linux scripts
    open = null; el('Detail').innerHTML = ''; el('Detail').classList.remove('unmet', 'met');
    load();
  };
  // Clicking a script shows it in the right-hand box; clicking one of its tags filters by it.
  el('List').onclick = (e) => {
    if (e.target.dataset.tag) { toggleTag(e.target.dataset.tag); return; }
    const item = e.target.closest('.hunt-item'); if (!item) return;
    open = item.dataset.id;
    renderList();
    show(open);
  };
  async function show(sid) {
    try {
      const h = await api('GET', `${url}/${sid}`);
      if (sid !== open) return; // a newer click won the race
      el('Detail').classList.toggle('unmet', depState(h) === 'unmet');
      el('Detail').classList.toggle('met', depState(h) === 'met');
      el('Detail').innerHTML = renderDetail(h);
    } catch (err) { el('Detail').innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
  }

  // Name / description / dependencies are shown in their own colours, then the script as code.
  // A script with binaries that have not been uploaded is shown in red with a warning.
  function renderDetail(h) {
    const deps = h.dependencies.length
      ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ' (uploaded)'}</span>`).join('')
      : '<span class="dim">None</span>';
    return `
    ${h.verified ? VERIFIED : ''}<div class="hd-name">${esc(h.name)}</div>
    <div class="hd-file">${esc(h.id)}</div>
    ${h.missingDependencies.length ? `<div class="hd-unmet">Some dependencies missing: ${h.missingDependencies.map(esc).join(', ')}. Upload them in Settings → Binaries.</div>` : ''}
    ${h.warnings.length ? `<div class="hd-warn">${h.warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="hd-label hd-label-desc">Description</div>
    <div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}</div>
    ${showParams ? `<div class="hd-label hd-label-dep">Parameters</div>
    <div class="hd-deps">${h.parameters.length ? h.parameters.map((p) => `<span class="dep have">${esc(p)}</span>`).join('') : '<span class="dim">None</span>'}</div>` : ''}
    <div class="hd-label hd-label-dep">Dependencies</div>
    <div class="hd-deps">${deps}</div>
    <div class="hd-label hd-label-tags">Tags</div>
    <div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
    <div class="hd-label hd-label-code">${Noun}</div>
    <pre class="code">${highlight(h.body, h.type)}</pre>`;
  }
  return load;
}
const VERIFIED = '<span class="vtick" title="Verified: shipped with Kookaburrow and unmodified">✓</span>';
const loadHuntList = makeLibrary({ id: 'hunt', url: '/api/hunts', noun: 'hunt', folder: 'hunts' });
const loadActionList = makeLibrary({ id: 'action', url: '/api/actions', noun: 'action', folder: 'actions', showParams: true });

// ---- Settings: Add Hunts / Add Actions ----
// Left: a form that writes <folder>/<type>/<file>.ps1|.sh. Right: the scripts the user has written, with
// view / edit / delete. Shipped (verified) scripts never appear here, so they cannot be changed.
// Hunts list their dependencies (external binaries); actions list their parameters (named inputs).
function makeEditor({ P, url, noun, folder, items, hints }) {
  const el = (s) => $(P + s);
  const EXT = { powershell: '.ps1', bash: '.sh' };
  const itemKey = items.key; // 'dependencies' | 'parameters'
  let type = 'powershell', list = [], editing = null, viewing = null, mine = [];

  function setType(t) {
    type = t;
    document.querySelectorAll(`#${P}Type button`).forEach((b) => b.classList.toggle('on', b.dataset.type === t));
    el('Ext').textContent = EXT[t];
    el('Script').placeholder = hints[t];
    el('ItemInput').placeholder = items.placeholder[t];
  }
  function setItemsOn(on) {
    document.querySelectorAll(`#${P}ItemToggle button`).forEach((b) => b.classList.toggle('on', (b.dataset.v === 'yes') === on));
    el('ItemBox').hidden = !on;
    if (!on) list = [];
    renderItems();
  }
  function renderItems() {
    el('ItemList').innerHTML = list.map((d) => `<button type="button" class="tagchip on" data-rm="${esc(d)}" title="Remove">${esc(d)} ×</button>`).join('');
  }
  function addItem() {
    const v = el('ItemInput').value.trim();
    if (v && !list.includes(v)) list.push(v);
    el('ItemInput').value = '';
    renderItems();
  }
  function reset() {
    editing = null;
    el('File').value = el('Name').value = el('Desc').value = el('Tags').value = el('Script').value = '';
    el('File').readOnly = false;
    el('Type').classList.remove('locked');
    el('Title').textContent = `New ${noun}`;
    el('Submit').textContent = `Add ${noun[0].toUpperCase() + noun.slice(1)}`;
    el('Cancel').hidden = true;
    el('Msg').textContent = '';
    setType('powershell');
    setItemsOn(false);
  }
  function edit(h) {
    reset();
    editing = h.file;
    setType(h.type);
    el('Type').classList.add('locked');
    el('File').value = h.fileBase; el('File').readOnly = true;
    el('Name').value = h.name; el('Desc').value = h.description;
    el('Tags').value = h.tags.join(', ');
    el('Script').value = h.body;
    list = [...h[itemKey]];
    setItemsOn(list.length > 0);
    el('Title').textContent = `Editing ${h.file}`;
    el('Submit').textContent = 'Save Changes';
    el('Cancel').hidden = false;
    el('Msg').textContent = '';
    el('Form').scrollTop = 0;
  }

  async function load() {
    try { mine = await api('GET', `${url}/user`); } catch (e) { el('List').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
    render();
  }
  function render() {
    el('List').innerHTML = mine.map((h) => `<div class="uh" data-id="${esc(h.id)}">
      <div class="uh-top">
        <div class="uh-main"><div class="hn">${esc(h.name)}</div><div class="uh-file">${esc(h.id)}</div></div>
        <div class="uh-btns"><button class="tagchip" data-act="view">${viewing === h.id ? 'Hide' : 'View'}</button><button class="tagchip" data-act="edit">Edit</button><button class="del" data-act="delete">Delete</button></div>
      </div>
      <div class="hd" title="${esc(h.description)}">${esc(h.description)}</div>
      ${h.tags.length ? `<div class="htags">${h.tags.map((t) => `<span class="htag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${h[itemKey].length ? `<div class="uh-deps">${items.label}: ${h[itemKey].map(esc).join(', ')}</div>` : ''}
      ${viewing === h.id ? `<pre class="code">${highlight(h.body, h.type)}</pre>` : ''}</div>`).join('')
      || `<p class="dim" style="margin:0">You have not added any ${noun}s yet. Use the form on the left; ${noun}s you add are saved to <code>${folder}/powershell</code> or <code>${folder}/bash</code>.</p>`;
  }

  el('Type').onclick = (e) => { if (e.target.dataset.type && !editing) setType(e.target.dataset.type); };
  el('ItemToggle').onclick = (e) => { if (e.target.dataset.v) setItemsOn(e.target.dataset.v === 'yes'); };
  el('ItemAdd').onclick = addItem;
  el('ItemInput').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } };
  el('ItemList').onclick = (e) => { if (e.target.dataset.rm) { list = list.filter((d) => d !== e.target.dataset.rm); renderItems(); } };
  el('Cancel').onclick = reset;
  el('Submit').onclick = async () => {
    if (el('ItemInput').value.trim()) addItem(); // a typed but not yet added entry still counts
    const body = {
      type, file: el('File').value.trim(), name: el('Name').value, description: el('Desc').value,
      tags: el('Tags').value.split(/[\s,]+/).filter(Boolean), [itemKey]: list, script: el('Script').value,
    };
    try {
      const saved = editing
        ? await api('PUT', `${url}/${type}/${editing}`, body)
        : await api('POST', url, body);
      const msg = `Saved ${saved.id}`;
      reset();
      el('Msg').textContent = msg; el('Msg').className = 'ok';
      await load();
    } catch (e) { el('Msg').textContent = e.message; el('Msg').className = 'bad'; }
  };
  el('List').onclick = async (e) => {
    const act = e.target.dataset.act; if (!act) return;
    const h = mine.find((x) => x.id === e.target.closest('.uh').dataset.id); if (!h) return;
    if (act === 'view') { viewing = viewing === h.id ? null : h.id; render(); }
    else if (act === 'edit') edit(h);
    else if (act === 'delete' && confirm(`Delete ${h.id}? This removes the file from the ${folder} folder.`)) {
      try { await api('DELETE', `${url}/${h.id}`); if (editing === h.file) reset(); if (viewing === h.id) viewing = null; await load(); }
      catch (err) { el('Msg').textContent = err.message; el('Msg').className = 'bad'; }
    }
  };
  reset();
  return load;
}
const addHunts = makeEditor({
  P: 'ah', url: '/api/hunts', noun: 'hunt', folder: 'hunts',
  items: { key: 'dependencies', label: 'Dependencies', placeholder: { powershell: 'autorunsc.exe', bash: 'osqueryi' } },
  hints: {
    powershell: '# Runs remotely. Read-only checks; write results to the output stream.\nGet-Process | Select-Object Id, ProcessName, Path | Format-Table -AutoSize',
    bash: '# Runs remotely over SSH. Read-only checks; write results to stdout.\nps -eo pid,user,args',
  },
});
const addActions = makeEditor({
  P: 'aa', url: '/api/actions', noun: 'action', folder: 'actions',
  items: { key: 'parameters', label: 'Parameters', placeholder: { powershell: 'ProcessName', bash: 'PROCESS_NAME' } },
  hints: {
    powershell: "# Each parameter becomes a variable of the same name, e.g. $ProcessName.\nif (-not $ProcessName) { throw 'ProcessName is required' }\nStop-Process -Name $ProcessName -Force",
    bash: '# Each parameter becomes a variable of the same name, e.g. $PROCESS_NAME.\n[ -n "$PROCESS_NAME" ] || { echo "PROCESS_NAME is required" >&2; exit 2; }\npkill -x -- "$PROCESS_NAME"',
  },
});

// Small syntax highlighter for the two hunt languages. Each alternative is one capture group.
const HL = {
  powershell: {
    re: /((?<![$\w])#.*$)|("(?:[^"`\\]|`[\s\S]|\\.)*"|'(?:[^']|'')*')|(\$\{[^}]*\}|\$[\w:?]+)|(\b[A-Z][A-Za-z]+-[A-Z][A-Za-z]+\b)|((?<=\s)-[A-Za-z]+\b)|(\b(?:if|else|elseif|foreach|for|while|switch|function|param|return|try|catch|finally|throw|in|begin|process|end)\b)/gm,
    cls: ['c', 's', 'v', 'f', 'p', 'k'],
  },
  bash: {
    re: /((?<![$\w])#.*$)|("(?:[^"\\]|\\[\s\S])*"|'[^']*')|(\$\{[^}]*\}|\$\(|\$[A-Za-z_]\w*|\$[?#@*!0-9$])|(\b(?:echo|printf|cd|export|local|read|exit|return|source|test|set|unset|eval|exec)\b)|((?<=\s)--?[A-Za-z][\w-]*)|(\b(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|select)\b)/gm,
    cls: ['c', 's', 'v', 'f', 'p', 'k'],
  },
};
function highlight(code, type) {
  const { re, cls } = HL[type] || HL.powershell;
  re.lastIndex = 0;
  let out = '', pos = 0, m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += esc(code.slice(pos, m.index));
    const g = m.findIndex((x, i) => i > 0 && x !== undefined) - 1;
    out += `<span class="t-${cls[g]}">${esc(m[0])}</span>`;
    pos = m.index + m[0].length;
  }
  return out + esc(code.slice(pos));
}

// ---- Settings: Binaries ----
// One row per binary that a hunt declares in $Dependencies. Red until the hunter uploads it.
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
async function loadBinaries() {
  const list = await api('GET', '/api/binaries');
  $('binTable').tBodies[0].innerHTML = list.map((b) => `<tr class="${b.present ? 'ready' : 'missing'}">
    <td><b>${esc(b.name)}</b></td>
    <td>${b.usedBy.map((h) => esc(h.name)).join('<br>') || '<span class="dim">No hunt uses this</span>'}</td>
    <td><div class="binfield" title="${b.present ? `SHA-256 ${esc(b.sha256)}` : ''}">${b.present
      ? `${esc(b.name)} <span class="dim" style="margin-left:8px">${fmtSize(b.size)} · ${esc(b.sha256.slice(0, 12))}…</span>`
      : 'No file uploaded'}</div></td>
    <td>${b.present ? '<span class="badge green">Uploaded</span>' : '<span class="badge red">Not uploaded</span>'}</td>
    <td><div class="binactions">
      <button class="act ${b.present ? 'sec' : ''}" data-upload="${esc(b.name)}" ${b.usedBy.length ? '' : 'disabled'}>${b.present ? 'Replace…' : 'Upload…'}</button>
      <button class="del" data-remove="${esc(b.name)}" ${b.present ? '' : 'disabled'}>Remove</button>
    </div></td></tr>`).join('') || '<tr><td colspan="5" class="dim">No hunt declares a binary dependency</td></tr>';
}
let uploadSlot = null;
$('binTable').onclick = async (e) => {
  const { upload, remove } = e.target.dataset;
  $('binMsg').textContent = '';
  if (upload) { uploadSlot = upload; $('binFile').click(); } // opens the file explorer
  if (remove) {
    if (!confirm(`Remove ${remove}? Hunts that need it will fail until it is uploaded again.`)) return;
    try { await api('DELETE', `/api/binaries/${encodeURIComponent(remove)}`); } catch (err) { $('binMsg').textContent = err.message; }
    loadBinaries();
  }
};
// The chosen file is stored under the slot's name, whatever the file was called locally.
$('binFile').onchange = async () => {
  const file = $('binFile').files[0], slot = uploadSlot;
  $('binFile').value = '';
  if (!file || !slot) return;
  const btn = document.querySelector(`#binTable button[data-upload="${CSS.escape(slot)}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
  try {
    const r = await fetch(`/api/binaries/${encodeURIComponent(slot)}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
  } catch (err) { $('binMsg').textContent = `Upload failed: ${err.message}`; }
  loadBinaries();
};

// ---- Output: Log ----
let pollRuns, openId = null;
async function loadRuns() {
  const runs = await api('GET', '/api/runs');
  $('runTable').tBodies[0].innerHTML = runs.map((r) => `<tr>
    <td>${new Date(r.startedAt).toLocaleString()}</td><td>${esc(r.huntName)}</td>
    <td class="${r.status === 'completed' ? 'ok' : r.status === 'running' ? 'dim' : 'bad'}">${r.status.replaceAll('_', ' ')}</td>
    <td>${r.results.filter((x) => x.status === 'ok').length}/${r.results.length} ok</td>
    <td><a data-open="${r.id}">View</a> &nbsp; <a data-del-run="${r.id}">Delete</a></td></tr>`).join('') || '<tr><td colspan="5" class="dim">No runs yet</td></tr>';
  clearTimeout(pollRuns);
  if (runs.some((r) => r.status === 'running') && isActive('output/log')) {
    pollRuns = setTimeout(() => { loadRuns(); if (openId) openRun(openId); }, 2000);
  }
}
$('runTable').onclick = async (e) => {
  if (e.target.dataset.open) openRun(e.target.dataset.open);
  if (e.target.dataset.delRun) {
    await api('DELETE', `/api/runs/${e.target.dataset.delRun}`);
    if (openId === e.target.dataset.delRun) { openId = null; $('runDetail').hidden = true; }
    loadRuns();
  }
};
async function openRun(id) {
  openId = id;
  const r = await api('GET', `/api/runs/${id}`);
  $('runDetail').hidden = false;
  $('runDetail').innerHTML = `<h2>${esc(r.huntName)} - ${r.status.replaceAll('_', ' ')}</h2>` + r.results.map((x) => `
    <div style="margin-bottom:14px"><b>${esc(x.hostLabel)}</b> <span class="dim">${esc(x.address)}</span>
    <span class="${x.status === 'ok' ? 'ok' : x.status === 'error' ? 'bad' : 'dim'}">${x.status}</span>
    ${x.durationMs ? `<span class="dim">${(x.durationMs / 1000).toFixed(1)}s</span>` : ''}${x.truncated ? ' <span class="bad">(output truncated)</span>' : ''}
    ${x.stdout ? `<pre>${esc(x.stdout)}</pre>` : ''}${x.stderr ? `<pre class="bad">${esc(x.stderr)}</pre>` : ''}</div>`).join('');
}

// ---- Output: JSON ----
// The full stored record of a run (hosts, status, stdout, stderr, timings) as pretty-printed JSON.
let jsonText = '', jsonReq = 0;
async function loadJsonRuns() {
  const runs = await api('GET', '/api/runs');
  const keep = $('jsonRun').value;
  $('jsonRun').innerHTML = runs.map((r) => `<option value="${r.id}">${esc(new Date(r.startedAt).toLocaleString())} - ${esc(r.huntName)}</option>`).join('')
    || '<option value="">No runs yet</option>';
  if (keep && runs.some((r) => r.id === keep)) $('jsonRun').value = keep;
  $('jsonRun').disabled = !runs.length;
  showRunJson();
}
async function showRunJson() {
  const id = $('jsonRun').value, req = ++jsonReq;
  if (!id) { jsonText = ''; $('jsonOut').textContent = 'No runs yet. Results appear here once a hunt has been run.'; setJsonButtons(); return; }
  const run = await api('GET', `/api/runs/${id}`);
  if (req !== jsonReq) return; // a newer selection is loading
  jsonText = JSON.stringify(run, null, 2);
  // Colouring a multi-megabyte document would freeze the page, so large runs are shown plain.
  $('jsonOut').innerHTML = jsonText.length > 400000 ? esc(jsonText) : highlightJson(jsonText);
  $('jsonSize').textContent = `${fmtSize(jsonText.length)}${jsonText.length > 400000 ? ' (shown without colour)' : ''}`;
  setJsonButtons();
}
function setJsonButtons() { $('jsonCopy').disabled = $('jsonSave').disabled = !jsonText; if (!jsonText) $('jsonSize').textContent = ''; }
function highlightJson(text) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out = '', pos = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(pos, m.index));
    const cls = m[1] ? (m[2] ? 't-v' : 't-s') : m[3] ? 't-k' : 't-f'; // key / string / literal / number
    out += m[1] && m[2] ? `<span class="${cls}">${esc(m[1])}</span>${esc(m[2])}` : `<span class="${cls}">${esc(m[0])}</span>`;
    pos = m.index + m[0].length;
  }
  return out + esc(text.slice(pos));
}
$('jsonRun').onchange = showRunJson;
$('jsonCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(jsonText); $('jsonCopy').textContent = 'Copied'; }
  catch { $('jsonCopy').textContent = 'Copy failed'; }
  setTimeout(() => { $('jsonCopy').textContent = 'Copy'; }, 1500);
};
$('jsonSave').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
  a.download = `run-${$('jsonRun').value}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---- start (restores the tab/page from the URL hash) ----
const [startTab, startPage] = location.hash.slice(1).split('/');
go(startTab || 'hosts', startPage);
