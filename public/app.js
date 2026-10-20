const $ = (id) => document.getElementById(id);
// Small notice in the bottom-right corner; it fades out by itself after a couple of seconds.
function toast(text, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3400);
}
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
    ['view-collections', 'View Collections', 'Collections'], ['add-collections', 'Add Collections', 'Collections'], ['binaries', 'Binaries', 'Collections'],
    ['view-actions', 'View Actions', 'Actions'], ['add-actions', 'Add Actions', 'Actions'],
    { heading: 'User Management' },
    { heading: 'Shell Settings' },
    { heading: 'Health Settings' },
  ] },
  { id: 'hosts', label: 'Host Management', pages: [
    ['view-hosts', 'View Hosts', 'Hosts'], ['profiles', 'Profiles', 'Hosts'], ['groups', 'Groups', 'Hosts'],
    ['discover', 'Discover', 'Add Hosts'], ['manual', 'Manually Add', 'Add Hosts'],
  ] },
  { id: 'burrow', label: 'Burrow!', accent: true, pages: [['hunt', 'Hunt'], ['respond', 'Respond']] },
  { id: 'output', label: 'Output', pages: [['log', 'Log'], ['report', 'Report'], ['json', 'JSON']] },
  { id: 'browse', label: 'Browse', pages: [['files', 'Files']] },
  // The logo in the header opens this landing page. It has no tab of its own and no side menu.
  { id: 'home', label: 'Home', hidden: true, pages: [['home', 'Home']] },
  // Shell and Health are placed apart on the right of the top bar.
  { id: 'shell', label: 'Shell', pages: [['shell', 'Shell']], right: true, hostMenu: true }, // the side menu lists authenticated hosts
  { id: 'health', label: 'Health', pages: [['monitor', 'Monitor']], right: true },
];
const loaders = {
  'settings/view-collections': () => loadCollectionList(),
  'settings/view-actions': () => loadActionList(),
  'burrow/hunt': loadBurrowHunts,
  'browse/files': () => loadBrowse('/'),
  'home/home': loadHome,
  'shell/shell': loadShell,
  'health/monitor': loadMonitor,
  'settings/add-collections': () => addCollections(),
  'settings/add-actions': () => addActions(),
  'settings/binaries': loadBinaries,
  'hosts/view-hosts': loadHosts,
  'hosts/profiles': loadAuthHosts,
  'hosts/discover': loadAuthHosts,
  'hosts/groups': loadGroups,
  'output/log': loadRuns,
  'output/json': loadJsonRuns,
};

// Side menu. Pages with a group sit under a titled dropdown.
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
  $('sidenav').hidden = !!tab.hidden;
  if (tab.hidden) return;
  if (tab.hostMenu) { renderShellSide(); return; }
  if (!tab.pages.length) { $('sidenav').innerHTML = '<div class="empty">Nothing here yet</div>'; return; }
  let html = '', last = null;
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
    if (key && !openGroups.has(key)) continue;
    html += `<button data-tab="${tab.id}" data-page="${pid}" class="${group ? 'sub' : ''} ${currentSlug === `${tab.id}/${pid}` ? 'on' : ''}">${esc(label)}</button>`;
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
  document.body.classList.toggle('home', tab.id === 'home');
  renderSide();
  document.querySelectorAll('.page').forEach((s) => s.classList.toggle('on', s.id === slug));
  $('emptyTab').hidden = !!slug;
  if (!slug) location.hash = tab.id;
  else { location.hash = slug; loaders[slug]?.(); }
}

NAV.forEach((t, i) => {
  if (t.hidden) return;
  const b = document.createElement('button');
  b.textContent = t.label; b.dataset.tab = t.id;
  if (t.id === 'shell') { // a small hosts-up / remote-up count to the left of the Shell button, on every tab; filled in by the monitor poll
    const s = document.createElement('span'); s.className = 'navstat'; s.id = 'navStats'; $('topnav').append(s);
  }
  if (t.accent) b.className = 'accent';
  if (t.right) b.className = `right${NAV[i - 1]?.right ? '' : ' first'}`;
  b.onclick = () => go(t.id);
  $('topnav').append(b);
});
$('sidenav').onclick = (e) => {
  const sh = e.target.closest('button[data-shell-host]');
  if (sh) { shellHost = sh.dataset.shellHost; renderShellList(); renderShellMain(); return; }
  if (e.target.closest('#shellStart')) {
    const cur = shells.get(shellHost);
    if (cur && cur.status !== 'ended') endShell(shellHost); else startShell();
    return;
  }
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
let scanTimer, scanSeen = new Set();
$('scanBtn').onclick = async () => {
  try {
    const job = await api('POST', '/api/scans', { cidr: $('cidr').value });
    scanSeen = new Set(); setDiscovered([]); authState = {}; saveAuthState(); renderAuthHosts(); // a new scan starts a fresh list
    $('scanBtn').disabled = true; $('scanStop').hidden = false; $('scanStop').onclick = () => api('DELETE', `/api/scans/${job.id}`);
    $('scanBar').hidden = false;
    scanTimer = setInterval(() => pollScan(job.id), 700);
  } catch (e) { $('scanStatus').textContent = e.message; }
};
async function pollScan(id) {
  const j = await api('GET', `/api/scans/${id}`);
  $('scanStatus').textContent = `${j.status}: ${j.done}/${j.total} scanned, ${j.found.length} found`;
  $('scanBar').firstElementChild.style.width = `${(j.done / j.total) * 100}%`;
  addFound(j.found);
  if (j.status !== 'running') {
    clearInterval(scanTimer);
    $('scanBtn').disabled = false; $('scanStop').hidden = true;
    const n = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0);
    setDiscovered([...discovered].sort((a, b) => n(a.ip) - n(b.ip)));
    renderAuthHosts();
  }
}
// New hosts from a running scan are added to the table as they are found.
function addFound(found) {
  const fresh = found.filter((h) => !scanSeen.has(h.ip));
  if (!fresh.length) return;
  for (const h of fresh) {
    scanSeen.add(h.ip);
    discovered.push(h);
    if (h.known) {
      // already authenticated and saved: show the green badge, say so, and let the row fade away as usual
      authState[h.ip] = { [h.known.protocol]: { state: 'authenticated', reason: '', hostname: h.known.hostname, os: h.known.os } };
      toast(`${h.ip} already authenticated`);
      fadeOutHost(h.ip);
    }
  }
  setDiscovered(discovered); saveAuthState();
  renderAuthHosts();
}
// The row shows its authenticated badge for a moment, fades out slowly, then leaves the list (it lives under Hosts).
function fadeOutHost(ip) {
  authState[ip].fadeStart = Date.now();
  setTimeout(() => {
    setDiscovered(discovered.filter((h) => h.ip !== ip));
    delete authState[ip]; saveAuthState();
    renderAuthHosts();
  }, 3500);
}
// Discovered hosts are remembered for the browser session so the table reloads after a refresh.
let discovered = [];
try { discovered = JSON.parse(sessionStorage.getItem('discovered') || '[]'); } catch { /* storage unavailable */ }
function setDiscovered(found) {
  discovered = found;
  try { sessionStorage.setItem('discovered', JSON.stringify(found)); } catch { /* ignore */ }
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
// Authentication state per discovered host, kept for the browser session like the scan results.
// { [ip]: { winrm?: {state, reason, ...}, ssh?: {...}, testing?: 'winrm'|'ssh' } }
let authState = {};
try { authState = JSON.parse(sessionStorage.getItem('authState') || '{}'); } catch { /* storage unavailable */ }
const saveAuthState = () => { try { sessionStorage.setItem('authState', JSON.stringify(authState)); } catch { /* ignore */ } };

// One WinRM or SSH cell. Without a test it falls back to what the scan saw on that port.
function authCell(h, proto) {
  const st = authState[h.ip] || {};
  if (st.testing === proto) return '<span class="badge grey">Testing…</span>';
  const r = st[proto];
  if (r) {
    const [cls, label] = { authenticated: ['green', 'Authenticated'], absent: ['grey', 'Absent'], rejected: ['red', 'Credentials rejected'] }[r.state] || ['red', 'Failed'];
    return `<span class="badge ${cls}">${label}</span>${r.reason ? `<div class="reason ${r.state === 'absent' ? '' : 'bad'}">${esc(r.reason)}</div>` : ''}`;
  }
  const ports = proto === 'winrm' ? [5985, 5986] : [22];
  return h.openPorts.some((p) => ports.includes(p)) ? '<span class="dim">Port open · not tested</span>' : '<span class="dim">Absent</span>';
}
function renderAuthHosts() {
  const options = (ip) => `<option value="">— none —</option>` + profiles.map((p) =>
    `<option value="${p.id}" ${assignments[ip] === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  // a host that finished fading (e.g. across a page reload) is already in Hosts, so it is not listed again
  const listed = discovered.filter((h) => !(authState[h.ip]?.fadeStart && Date.now() - authState[h.ip].fadeStart > 3500));
  $('authTable').tBodies[0].innerHTML = listed.map((h) => {
    const [cls, label] = assumedOs(h);
    const fade = authState[h.ip]?.fadeStart ? `style="animation-delay:${((1200 - (Date.now() - authState[h.ip].fadeStart)) / 1000).toFixed(2)}s"` : '';
    const ok = authState[h.ip]?.winrm?.state === 'authenticated' ? authState[h.ip].winrm : authState[h.ip]?.ssh?.state === 'authenticated' ? authState[h.ip].ssh : null;
    return `<tr class="${fade ? 'fading' : ''}" ${fade}><td><b>${esc(h.ip)}</b></td><td>${esc(ok?.hostname || h.hostname || '-')}</td>
      <td><span class="os ${cls}">${label}</span></td><td class="dim">${h.openPorts.join(', ')}</td>
      <td><select class="psel" data-ip="${esc(h.ip)}">${options(h.ip)}</select></td>
      <td>${authCell(h, 'winrm')}</td><td>${authCell(h, 'ssh')}</td></tr>`;
  }).join('') || '<tr><td colspan="7" class="dim">No hosts yet. Run a subnet scan above.</td></tr>';
}

// Tests the profile assigned to one host. The server picks WinRM or SSH from the profile type.
async function testHost(ip) {
  const st = authState[ip] = authState[ip] || {};
  const proto = profiles.find((p) => p.id === assignments[ip])?.kind === 'Linux (SSH)' ? 'ssh' : 'winrm';
  st.testing = proto; delete st[proto];
  renderAuthHosts();
  try {
    const r = await api('POST', '/api/auth/test', { ip });
    delete st.testing;
    st[r.protocol || proto] = r;
    if (r.state === 'authenticated') {
      toast(`${ip} authenticated. ${r.added ? 'Added to Hosts' : 'Hosts entry updated'}`);
      fadeOutHost(ip);
    }
  } catch (e) {
    delete st.testing;
    st[proto] = { state: 'error', reason: e.message };
  }
  saveAuthState();
  renderAuthHosts();
  return st[proto]?.state;
}
$('authTable').onchange = async (e) => {
  if (!e.target.classList.contains('psel')) return;
  const ip = e.target.dataset.ip;
  try { assignments = await api('PUT', '/api/assignments', { ip, profileId: e.target.value || null }); }
  catch (err) { alert(err.message); loadAuthHosts(); return; }
  delete authState[ip]; saveAuthState(); // a different profile invalidates the old result
  renderAuthHosts();
  if (e.target.value) testHost(ip); // a valid profile is tested straight away
};
// "Authenticate" re-tests every host that has a profile, a few at a time.
$('authBtn').onclick = async () => {
  const ips = discovered.map((h) => h.ip).filter((ip) => assignments[ip]);
  const msg = $('authMsg');
  if (!ips.length) { msg.className = 'dim'; msg.textContent = 'Select a profile for at least one host first.'; return; }
  $('authBtn').disabled = true; msg.className = 'dim'; msg.textContent = `Testing ${ips.length} host${ips.length === 1 ? '' : 's'}…`;
  const results = [];
  const queue = [...ips];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) results.push(await testHost(queue.shift())); }));
  const okN = results.filter((s) => s === 'authenticated').length;
  msg.className = okN === results.length ? 'ok' : 'bad';
  msg.textContent = `${okN} of ${results.length} authenticated${okN === results.length ? '' : '; see the reason under each failed host'}.`;
  $('authBtn').disabled = false;
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
let hosts = [], hostLists = [];
async function loadHosts() {
  let lists;
  [hosts, lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  hostLists = lists;
  renderHosts();
}
let hostQuery = '';
function renderHosts() {
  const lists = hostLists;
  // "Add to group": the groups a host is in show as tags (click one to take the host out); the dropdown
  // offers the groups it is not in yet. Picking one makes the host a member straight away.
  // One fixed-size line per host, so rows never grow: the groups it is in show as tags (clipped if there are many,
  // the full list is in the tooltip), and one dropdown both adds it to a group and takes it out of one.
  const groupCell = (h) => {
    const mine = lists.filter((l) => l.hostIds.includes(h.id)), rest = lists.filter((l) => !l.hostIds.includes(h.id));
    const group = (label, items, prefix) => items.length ? `<optgroup label="${label}">${items.map((l) => `<option value="${prefix}${l.id}">${esc(l.name)}</option>`).join('')}</optgroup>` : '';
    return `<div class="gcell"><select class="gsel" data-host="${h.id}" ${lists.length ? '' : 'disabled'}>
        <option value="">${lists.length ? 'Groups' : 'None yet'}</option>
        ${group('Add to', rest, 'add:')}${group('Remove from', mine, 'remove:')}</select>
      <div class="gchips" title="${mine.length ? esc(mine.map((l) => l.name).join(', ')) : 'Not in any group'}">${mine.map((l) => `<span class="tagchip on">${esc(l.name)}</span>`).join('')}</div></div>`;
  };
  // Search matches name, address, OS and protocol. WinRM hosts show in blue and SSH hosts in orange.
  const q = hostQuery.toLowerCase();
  const shown = hosts.filter((h) => !q || [h.name, h.hostname, h.address, h.os, h.protocol === 'ssh' ? 'ssh' : 'winrm'].some((v) => String(v || '').toLowerCase().includes(q)));
  $('hostTable').tBodies[0].innerHTML = shown.map((h, i) => {
    const pc = h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm';
    return `<tr><td class="rown">${i + 1}</td>
    <td>${esc(h.name)}</td><td>${esc(h.address)}</td><td class="${pc}" title="${esc(h.os)}">${esc(String(h.os || '').replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}</td><td class="${pc}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</td>
    <td class="dim">${new Date(h.verifiedAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
    <td>${groupCell(h)}</td>
    <td><a data-del-host="${h.id}">Delete</a></td></tr>`;
  }).join('') || `<tr><td colspan="8" class="dim">${hosts.length ? 'No hosts match' : 'No hosts saved'}</td></tr>`;

  $('groupBox').innerHTML = groupsHtml(hosts, lists);
}
// Every group with its members; the arrow folds a group, and the fold state is remembered. Hosts that are in no group
// are collected in an Unassigned group at the end. Used by View Hosts and by the Groups page (which also lets you delete).
function groupsHtml(hosts, lists, { deletable = false } = {}) {
  const byId = Object.fromEntries(hosts.map((h) => [h.id, h]));
  const grouped = new Set(lists.flatMap((l) => l.hostIds));
  const groups = [...lists, { id: UNASSIGNED, name: 'Unassigned', hostIds: hosts.filter((h) => !grouped.has(h.id)).map((h) => h.id) }];
  return (hosts.length || lists.length ? groups : []).map((l) => {
    const members = l.hostIds.map((i) => byId[i]).filter(Boolean);
    const folded = foldedGroups.has(l.id);
    return `<div class="grp ${folded ? 'folded' : ''}">
      <div class="grp-row"><button class="grp-head" data-fold="${l.id}" aria-expanded="${!folded}"><span class="chev">${folded ? '▸' : '▾'}</span><span class="grp-name">${esc(l.name)}</span><span class="grp-count">${members.length}</span></button>${deletable && l.id !== UNASSIGNED ? `<a class="grp-del" data-del-list="${l.id}" title="Delete this group (the hosts stay saved)">Delete</a>` : ''}</div>
      <div class="grp-body">${members.length ? `<ul>${members.map((m) => `<li>${esc(m.name)}<span class="dim">${esc(m.address)}</span></li>`).join('')}</ul>` : '<div class="dim">No members</div>'}</div>
    </div>`;
  }).join('') || '<p class="dim" style="margin:0">No groups yet. Create one above.</p>';
}
const UNASSIGNED = '__unassigned';
$('hostSearch').oninput = () => { hostQuery = $('hostSearch').value.trim(); renderHosts(); };
const foldedGroups = new Set();
try { JSON.parse(localStorage.getItem('kb.foldedGroups') || '[]').forEach((g) => foldedGroups.add(g)); } catch { /* storage unavailable: all open */ }
const foldGroup = (e) => {
  const head = e.target.closest('[data-fold]'); if (!head) return;
  const g = head.dataset.fold;
  if (foldedGroups.has(g)) foldedGroups.delete(g); else foldedGroups.add(g);
  try { localStorage.setItem('kb.foldedGroups', JSON.stringify([...foldedGroups])); } catch { /* ignore */ }
  head.closest('.grp').classList.toggle('folded', foldedGroups.has(g));
  head.setAttribute('aria-expanded', String(!foldedGroups.has(g)));
  head.querySelector('.chev').textContent = foldedGroups.has(g) ? '▸' : '▾';
};
$('groupBox').onclick = foldGroup;
$('hosts/view-hosts').onclick = async (e) => {
  if (e.target.dataset.delHost) { await api('DELETE', `/api/hosts/${e.target.dataset.delHost}`); loadHosts(); return; }
};
$('hosts/view-hosts').onchange = async (e) => {
  if (!e.target.classList.contains('gsel') || !e.target.value) return;
  const [action, listId] = e.target.value.split(':');
  await setMembership(listId, e.target.dataset.host, action === 'add');
};
async function setMembership(listId, hostId, member) {
  const list = hostLists.find((l) => l.id === listId); if (!list) return;
  const hostIds = member ? [...new Set([...list.hostIds, hostId])] : list.hostIds.filter((i) => i !== hostId);
  try { await api('PUT', `/api/lists/${listId}`, { hostIds }); } catch (err) { alert(err.message); }
  loadHosts();
}

// ---- Manually Add ----
// Type an address and credentials, choose WinRM or SSH, and the server tries to log in. Only a successful login saves the
// host (it then shows under View Hosts and in the Shell and Health tabs); a failed one says why and saves nothing.
let mnProto = 'winrm', mnBusy = false;
const mnAttempts = []; // this session's attempts, newest first
function mnSetProto(p, focus) {
  mnProto = p;
  document.querySelectorAll('#mnProto button').forEach((b) => b.classList.toggle('on', b.dataset.v === p));
  $('mnDomainBox').hidden = p !== 'winrm';
  $('mnSslBox').hidden = p !== 'winrm';
  $('mnPort').placeholder = p === 'ssh' ? '22' : '5985, then 5986';
  if (focus) $('mnAddr').focus();
}
function mnRenderLog() {
  $('mnLog').innerHTML = mnAttempts.map((a) => `<div class="mnrow">
      <span class="${a.ok ? 'ok' : 'bad'}">${a.ok ? '✓' : '✗'}</span> <b>${esc(a.name)}</b> <span class="dim">${esc(a.address)} · ${a.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><span class="mnwhen">${esc(a.when)}</span>
      <div class="mnwhy ${a.ok ? 'dim' : 'bad'}">${esc(a.text)}</div></div>`).join('')
    || '<p class="dim" style="margin:0">Hosts you add here appear in this list, along with the reason when a login fails.</p>';
}
async function mnSubmit() {
  if (mnBusy) return;
  const body = {
    protocol: mnProto, address: $('mnAddr').value.trim(), name: $('mnName').value.trim(), domain: $('mnDomain').value.trim(),
    username: $('mnUser').value.trim(), password: $('mnPass').value, port: $('mnPort').value.trim(), useSsl: $('mnSsl').checked,
  };
  const say = (t, cls) => { $('mnMsg').textContent = t; $('mnMsg').className = cls || ''; };
  if (!body.address) return say('Enter the IP address or host name', 'bad');
  if (!body.username || !body.password) return say('Enter a username and password', 'bad');
  mnBusy = true; $('mnSubmit').disabled = true; $('mnSubmit').textContent = 'Authenticating…';
  say('Connecting. This can take up to a minute…', 'dim');
  const entry = { address: body.address, protocol: mnProto, name: body.name || body.address, when: new Date().toLocaleTimeString(), ok: false, text: '' };
  try {
    const r = await api('POST', '/api/hosts/manual', body);
    entry.name = r.name || entry.name;
    if (r.state === 'authenticated') {
      entry.ok = true;
      entry.text = `${r.added ? 'Authenticated and added' : 'Authenticated; this host was already saved, so its details were updated'}${r.os ? ` · ${r.os}` : ''}`;
      toast(`${entry.name} authenticated and ${r.added ? 'added to the known hosts' : 'updated'}`);
      for (const id of ['mnAddr', 'mnName', 'mnDomain', 'mnUser', 'mnPass', 'mnPort']) $(id).value = '';
      $('mnSsl').checked = false;
      say('');
    } else {
      entry.text = r.reason || 'Authentication failed';
      say(entry.text, 'bad');
    }
  } catch (e) {
    entry.text = e.message; say(e.message, 'bad');
  }
  mnAttempts.unshift(entry); mnRenderLog();
  mnBusy = false; $('mnSubmit').disabled = false; $('mnSubmit').textContent = 'Authenticate and add';
}
$('mnProto').onclick = (e) => { if (e.target.dataset.v) mnSetProto(e.target.dataset.v, true); };
$('mnSubmit').onclick = mnSubmit;
$('mnForm').onkeydown = (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); mnSubmit(); } };
mnSetProto('winrm'); mnRenderLog();

// ---- Groups (the API still calls these "lists") ----
async function loadGroups() {
  const [h, lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  $('listHosts').innerHTML = h.map((x) => `<label><input type="checkbox" class="hsel" value="${x.id}"> ${esc(x.name)} <span class="dim">${esc(x.address)}</span></label>`).join('')
    || '<span class="dim">No hosts saved yet</span>';
  $('groupList').innerHTML = groupsHtml(h, lists, { deletable: true });
}
$('hosts/groups').onclick = async (e) => {
  foldGroup(e);
  if (e.target.dataset.delList) { await api('DELETE', `/api/lists/${e.target.dataset.delList}`); loadGroups(); }
};
$('mkList').onclick = async () => {
  const hostIds = [...document.querySelectorAll('.hsel:checked')].map((c) => c.value);
  try { await api('POST', '/api/lists', { name: $('listName').value, hostIds }); $('listName').value = ''; $('listMsg').textContent = ''; loadGroups(); }
  catch (e) { $('listMsg').textContent = e.message; }
};

// ---- Footprint / Returns / Type icons ----
// Every collection and action shows three small icons (hover for what each means): its footprint on the host,
// what it returns, and how it gets the data.
const MI_SVG = (p) => `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const MI = {
  footprint: { title: 'Footprint', values: {
    none: { label: 'No footprint', tip: 'Runs only what is already on the host and leaves nothing behind.',
      svg: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>' },
    transient: { label: 'Transient', tip: 'Stages a tool or temporary files on the host and removes them afterwards.',
      svg: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>' },
    persistent: { label: 'Persistent', tip: 'Changes the host or leaves something behind.',
      svg: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>' },
  } },
  returns: { title: 'Returns', values: {
    records: { label: 'Records', tip: 'Rows of data taken from the script output (saved as CSV and JSON). No files are pulled.',
      svg: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M12 3v18"/>' },
    files: { label: 'Files', tip: 'Raw files pulled from the host into the evidence folder, with SHA-256 hashes.',
      svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>' },
    both: { label: 'Records + files', tip: 'Rows of data and raw files pulled into the evidence folder.',
      svg: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>' },
  } },
  kind: { title: 'Type', values: {
    command: { label: 'Command', tip: 'Runs a command on the host and captures its output.',
      svg: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>' },
    artefact: { label: 'Artefact', tip: 'Collects an existing artefact from the host, such as event logs or Prefetch files.',
      svg: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>' },
    tool: { label: 'Tool', tip: 'Copies a tool to the host, runs it and returns its output (for example Autoruns or KAPE).',
      svg: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>' },
  } },
};
const miOne = (group, value, labels) => {
  const g = MI[group], v = g.values[value]; if (!v) return '';
  return `<span class="mi mi-${group}-${value}" title="${esc(`${g.title}: ${v.label}. ${v.tip}`)}" aria-label="${esc(`${g.title}: ${v.label}`)}">${MI_SVG(v.svg)}${labels ? `<span>${esc(v.label)}</span>` : ''}</span>`;
};
const metaIcons = (h, labels = false) => `<span class="mis ${labels ? 'full' : ''}">${['footprint', 'returns', 'kind'].map((g) => miOne(g, h[g], labels)).join('')}</span>`;
// A toggle-button row for choosing one value of a group (used by the Add Collection form).
const miToggle = (group, allowed) => allowed.map((v) => {
  const x = MI[group].values[v];
  return `<button type="button" data-v="${v}" title="${esc(`${x.label}. ${x.tip}`)}">${MI_SVG(x.svg)}${esc(x.label)}</button>`;
}).join('');

// ---- Settings: View Collections / View Actions ----
// One library view serves both: a searchable, filterable list of scripts on the left and the open
// script on the right. `id` prefixes the element ids (collectionList, actionList, ...); `url` is the API root.
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
    el('List').innerHTML = all.filter((h) => h.type === type).map((h) => `<div class="collection-item ${h.id === open ? 'on' : ''} ${depState(h)}" data-id="${esc(h.id)}">
    ${h.verified ? VERIFIED : ''}${metaIcons(h)}<div class="hn">${esc(h.name)} ${h.match ? `<span class="mtag">${tag(h.match)}</span>` : ''}${h.warnings.length ? `<span class="mwarn" title="${esc(h.warnings.join('; '))}">⚠</span>` : ''}</div>
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
    const item = e.target.closest('.collection-item'); if (!item) return;
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
    ${metaIcons(h, true)}
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
const loadCollectionList = makeLibrary({ id: 'collection', url: '/api/collections', noun: 'collection', folder: 'collections' });
const loadActionList = makeLibrary({ id: 'action', url: '/api/actions', noun: 'action', folder: 'actions', showParams: true });

// ---- Settings: Add Collections / Add Actions ----
// Left: a form that writes <folder>/<type>/<file>.ps1|.sh. Right: the scripts the user has written, with
// view / edit / delete. Shipped (verified) scripts never appear here, so they cannot be changed.
// Collections list their dependencies (external binaries); actions list their parameters (named inputs).
function makeEditor({ P, url, noun, folder, items, hints }) {
  const el = (s) => $(P + s);
  const EXT = { powershell: '.ps1', bash: '.sh' };
  const itemKey = items.key; // 'dependencies' | 'parameters'
  let type = 'powershell', list = [], editing = null, viewing = null, mine = [];
  // Collections also choose a footprint, what they return and their type (actions have no such form fields).
  const META = { footprint: ['none', 'transient'], returns: ['records', 'files', 'both'], kind: ['command', 'artefact', 'tool'] };
  const meta = { footprint: 'none', returns: 'records', kind: 'command' };
  const hasMeta = !!el('Meta');
  const metaBox = (g) => el({ footprint: 'Footprint', returns: 'Returns', kind: 'Kind' }[g]);
  function setMeta(g, v) {
    meta[g] = v;
    metaBox(g).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }
  if (hasMeta) {
    for (const g of Object.keys(META)) metaBox(g).innerHTML = miToggle(g, META[g]);
    el('Meta').onclick = (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      for (const g of Object.keys(META)) if (metaBox(g).contains(b)) setMeta(g, b.dataset.v);
    };
  }

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
    if (hasMeta) for (const g of Object.keys(META)) setMeta(g, g === 'returns' ? 'records' : g === 'kind' ? 'command' : 'none');
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
    if (hasMeta) for (const g of Object.keys(META)) setMeta(g, h[g]);
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
        <div class="uh-main"><div class="hn">${esc(h.name)}</div><div class="uh-file">${esc(h.id)}</div>${metaIcons(h)}</div>
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
      ...(hasMeta ? meta : {}),
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
const addCollections = makeEditor({
  P: 'ah', url: '/api/collections', noun: 'collection', folder: 'collections',
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

// ---- Burrow: Hunt ----
// Left: start a new hunt. Right: previous hunts. A hunt runs one or more collections on hosts/groups.
// The dialog is in place; starting a hunt from it is not wired up yet.
async function loadBurrowHunts() {
  let runs = [];
  try { runs = await api('GET', '/api/runs'); } catch (e) { $('bhList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  $('bhList').innerHTML = runs.length
    ? `<table><thead><tr><th>Hunt</th><th>Collections</th><th>Hosts</th><th>Status</th><th>Started</th><th>Evidence</th></tr></thead><tbody>${runs.map((r) => `<tr>
        <td>${esc(r.name || r.collectionName)}</td><td>${esc((r.collectionNames || [r.collectionName]).join(', '))}</td><td>${new Set(r.results.map((x) => x.hostId)).size}${r.results.some((x) => x.status === 'error') ? ` <span class="bad">(${r.results.filter((x) => x.status === 'error').length} failed)</span>` : ''}</td>
        <td class="${r.status === 'completed' ? 'ok' : r.status === 'running' ? '' : 'bad'}">${esc(r.status.replaceAll('_', ' '))}</td>
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td>
        <td>${r.evidenceDir ? `<a data-evidence="/evidence/${esc(r.evidenceDir)}">${esc(r.evidenceDir)}</a>` : ''}</td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No hunts yet. Use New Hunt to run collections against your hosts.</p>';
  clearTimeout(huntPoll);
  if (runs.some((r) => r.status === 'running') && isActive('burrow/hunt')) huntPoll = setTimeout(loadBurrowHunts, 2000);
}
let huntPoll;
$('bhList').onclick = (e) => {
  const p = e.target.dataset.evidence; if (!p) return;
  go('browse', 'files');
  loadBrowse(p);
};

const hm = { collections: [], hosts: [], lists: [], selC: new Set(), selH: new Set(), selL: new Set(), q: '', shown: null };
const hmEl = (s) => $('hm' + s);
function hmCount() {
  const ids = new Set(hm.selH);
  for (const l of hm.lists) if (hm.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  return ids.size;
}
function hmSummary() {
  const c = hm.selC.size, h = hmCount();
  hmEl('Summary').textContent = `${c} collection${c === 1 ? '' : 's'} · ${h} host${h === 1 ? '' : 's'}`;
  hmEl('TabColl').textContent = c ? `Collections (${c})` : 'Collections';
}
// Collections tab: tick the ones to run; click a name to read its description and script on the right.
function hmRenderCollections() {
  const q = hm.q.toLowerCase();
  const shown = hm.collections.filter((c) => !q || [c.name, c.file, c.description, ...c.tags].some((s) => s.toLowerCase().includes(q)));
  hmEl('Collections').innerHTML = shown.map((c) => `<div class="pick ${c.id === hm.shown ? 'on' : ''}" data-view="${esc(c.id)}">
      <input type="checkbox" data-c="${esc(c.id)}" ${hm.selC.has(c.id) ? 'checked' : ''} aria-label="Include ${esc(c.name)}">
      <span class="pn">${esc(c.name)}</span>${metaIcons(c)}<span class="pt">${c.type === 'bash' ? 'Linux' : 'PowerShell'}</span></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No collections match.</p>';
}
async function hmShow(id) {
  hm.shown = id;
  hmRenderCollections();
  try {
    const h = await api('GET', `/api/collections/${id}`);
    if (id !== hm.shown) return;
    hmEl('Detail').innerHTML = `<div class="hd-name">${esc(h.name)}</div><div class="hd-file">${esc(h.id)}</div>${metaIcons(h, true)}
      <div class="hd-label hd-label-desc">Description</div><div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}</div>
      <div class="hd-label hd-label-dep">Dependencies</div><div class="hd-deps">${h.dependencies.length ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-tags">Tags</div><div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-code">Collection</div><pre class="code">${highlight(h.body, h.type)}</pre>`;
  } catch (e) { hmEl('Detail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function hmTab(name) {
  document.querySelectorAll('#hmTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  hmEl('PaneDetails').hidden = name !== 'details';
  hmEl('PaneColl').hidden = name !== 'collections';
}
function hmRenderTargets() {
  hmEl('Groups').innerHTML = hm.lists.map((l) => `<label class="pick"><input type="checkbox" data-l="${esc(l.id)}" ${hm.selL.has(l.id) ? 'checked' : ''}>
      <span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></label>`).join('')
    || '<p class="dim" style="margin:6px 0">No groups yet.</p>';
  hmEl('Hosts').innerHTML = hm.hosts.map((h) => `<label class="pick"><input type="checkbox" data-h="${esc(h.id)}" ${hm.selH.has(h.id) ? 'checked' : ''}>
      <span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span></label>`).join('')
    || '<p class="dim" style="margin:6px 0">No saved hosts yet.</p>';
}
async function openHuntModal() {
  hm.selC.clear(); hm.selH.clear(); hm.selL.clear(); hm.q = '';
  hm.shown = null; hmEl('Detail').innerHTML = '<p class="dim">Click a collection to see what it does.</p>'; hmTab('details');
  hmEl('Name').value = ''; hmEl('Search').value = ''; hmEl('Msg').textContent = '';
  hmEl('Msg').className = '';
  $('huntModal').hidden = false;
  hmEl('Name').focus();
  try {
    [hm.collections, hm.hosts, hm.lists] = await Promise.all([api('GET', '/api/collections'), api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  } catch (e) { hmEl('Msg').textContent = e.message; hmEl('Msg').className = 'bad'; }
  hmRenderCollections(); hmRenderTargets(); hmSummary();
}
const closeHuntModal = () => { $('huntModal').hidden = true; };
$('bhNew').onclick = openHuntModal;
$('hmCancel').onclick = closeHuntModal;
$('hmClose').onclick = closeHuntModal;
$('huntModal').onclick = (e) => { if (e.target.id === 'huntModal') closeHuntModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('huntModal').hidden) closeHuntModal(); });
$('hmTabs').onclick = (e) => { if (e.target.dataset.tab) hmTab(e.target.dataset.tab); };
$('hmCollections').onclick = (e) => {
  const row = e.target.closest('[data-view]');
  if (row && !e.target.matches('input')) hmShow(row.dataset.view);
};
hmEl('Search').oninput = () => { hm.q = hmEl('Search').value.trim(); hmRenderCollections(); };
$('huntModal').onchange = (e) => {
  const d = e.target.dataset, set = d.c ? [hm.selC, d.c] : d.h ? [hm.selH, d.h] : d.l ? [hm.selL, d.l] : null;
  if (!set) return;
  if (e.target.checked) set[0].add(set[1]); else set[0].delete(set[1]);
  hmSummary();
};
hmEl('Run').onclick = async () => {
  const msg = (t, cls) => { hmEl('Msg').textContent = t; hmEl('Msg').className = cls; };
  if (!hmEl('Name').value.trim()) return msg('Give the hunt a name.', 'bad');
  if (!hm.selC.size) return msg('Select at least one collection.', 'bad');
  if (!hmCount()) return msg('Select at least one host or group.', 'bad');
  hmEl('Run').disabled = true;
  try {
    const run = await api('POST', '/api/hunts', {
      name: hmEl('Name').value.trim(), collectionIds: [...hm.selC], hostIds: [...hm.selH], listIds: [...hm.selL],
    });
    closeHuntModal();
    toast(`Hunt "${run.name}" started. Results go to ${run.evidenceDir}`);
    loadBurrowHunts();
  } catch (e) { msg(e.message, 'bad'); }
  hmEl('Run').disabled = false;
};

// ---- Browse ----
// A read-only file view over collections, actions, binaries and collected evidence. Click a folder to open
// it, click a file to preview it on the right.
const bb = { path: '/', entries: [], open: null };
const bbFmt = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const bbIcon = (dir) => dir
  ? '<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 3.5h4.2l1.3 1.5h7.5v7.5h-13z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'
  : '<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
async function loadBrowse(path) {
  if (typeof path === 'string') { bb.path = path; bb.open = null; }
  try {
    const r = await api('GET', `/api/browse?path=${encodeURIComponent(bb.path)}`);
    bb.entries = r.entries;
  } catch (e) { $('bbList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderBrowse();
  if (!bb.open) $('bbPreview').innerHTML = '<p class="dim">Select a file to preview it.</p>';
}
function renderBrowse() {
  const segs = bb.path.split('/').filter(Boolean);
  let acc = '';
  $('bbCrumbs').innerHTML = `<a data-path="/">Browse</a>` + segs.map((s) => { acc += '/' + s; return ` <span class="sep">/</span> <a data-path="${esc(acc)}">${esc(s)}</a>`; }).join('');
  const top = bb.path === '/';
  const rows = bb.entries.map((e) => `<tr class="bb-row" data-name="${esc(e.name)}" data-dir="${e.dir ? 1 : 0}">
      <td class="bb-name">${bbIcon(e.dir)}<span>${esc(e.label || e.name)}</span>${e.desc ? `<span class="bb-desc">${esc(e.desc)}</span>` : ''}</td>
      <td class="dim">${e.dir ? `${e.count} item${e.count === 1 ? '' : 's'}` : bbFmt(e.size)}</td>
      <td class="dim">${top || !e.modified ? '' : esc(new Date(e.modified).toLocaleString())}</td></tr>`).join('');
  $('bbList').innerHTML = `<table><thead><tr><th>Name</th><th>${top ? 'Contents' : 'Size / items'}</th><th>${top ? '' : 'Modified'}</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="dim">This folder is empty.</td></tr>'}</tbody></table>`;
  document.querySelectorAll('#bbList .bb-row').forEach((tr) => tr.classList.toggle('on', tr.dataset.dir === '0' && tr.dataset.name === bb.open));
}
$('bbCrumbs').onclick = (e) => { const p = e.target.dataset.path; if (p) loadBrowse(p); };
$('bbList').onclick = async (e) => {
  const tr = e.target.closest('.bb-row'); if (!tr) return;
  const full = (bb.path === '/' ? '' : bb.path) + '/' + tr.dataset.name;
  if (tr.dataset.dir === '1') { loadBrowse(full); return; }
  bb.open = tr.dataset.name;
  renderBrowse();
  try {
    const f = await api('GET', `/api/browse/file?path=${encodeURIComponent(full)}`);
    if (bb.open !== tr.dataset.name) return;
    const ext = f.name.slice(f.name.lastIndexOf('.') + 1).toLowerCase();
    const body = f.binary ? `<p class="dim">Binary file (${bbFmt(f.size)}); no preview. Use Download to save it.</p>`
      : `<pre class="code">${ext === 'ps1' ? highlight(f.text, 'powershell') : ext === 'sh' ? highlight(f.text, 'bash') : ext === 'json' ? highlightJson(f.text) : esc(f.text)}</pre>${f.truncated ? `<p class="dim" style="margin-top:6px">Showing the first 512 KB of ${bbFmt(f.size)}.</p>` : ''}`;
    $('bbPreview').innerHTML = `<div class="bb-head"><div><div class="bb-title">${esc(f.name)}</div><div class="hd-file">${esc(f.path)} · ${bbFmt(f.size)} · ${esc(new Date(f.modified).toLocaleString())}</div></div>
      <a class="act sec" href="/api/browse/download?path=${encodeURIComponent(f.path)}" download>Download</a></div>${body}`;
  } catch (err) { $('bbPreview').innerHTML = `<p class="bad">${esc(err.message)}</p>`; }
};

// ---- Health: monitor ----
// One box per saved host. Host is the ping result (checked every minute); Remote is the WinRM or SSH port (checked every
// 5 minutes). Green is up, red is not responding, grey is not checked yet. The checks run in the server (src/monitor.js);
// this page only shows the latest results. The Shell tab shows the same counts as X/Y.
let monSnap = null, monTimer;
async function fetchMonitor(force = false) {
  try { monSnap = await api(force ? 'POST' : 'GET', force ? '/api/monitor/check' : '/api/monitor'); } catch { /* keep the last results */ }
  renderNavStats();
  return monSnap;
}
const ago = (ms) => {
  if (!ms) return 'not yet';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 5 ? 'just now' : s < 90 ? `${s}s ago` : s < 5400 ? `${Math.round(s / 60)}m ago` : s < 129600 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const dur = (ms) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : s < 129600 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
};
const monCountsHtml = (snap) => {
  if (!snap) return '';
  const { total, hostsUp, remoteUp } = snap.summary;
  return `<span title="Hosts that answer ping"><b class="${monClass(hostsUp, total)}">${hostsUp}/${total}</b> hosts up</span>
    <span title="Hosts whose WinRM or SSH port is open"><b class="${monClass(remoteUp, total)}">${remoteUp}/${total}</b> remote up</span>`;
};
// Green when everything is up, orange when at least 80% is, red below that.
const monClass = (n, total) => (!total ? 'dim' : n === total ? 'ok' : n / total >= 0.8 ? 'warnc' : 'bad');
// The small "hosts up · remote up" count under the Shell button in the top bar.
function renderNavStats() {
  const el = $('navStats'); if (!el || !monSnap) return;
  const { total, hostsUp, remoteUp } = monSnap.summary;
  el.innerHTML = total ? `<span title="Hosts up (answering ping)">hosts <b class="${monClass(hostsUp, total)}">${hostsUp}/${total}</b></span><span title="Remote up (WinRM or SSH port open)">remote <b class="${monClass(remoteUp, total)}">${remoteUp}/${total}</b></span>` : '';
}
let navTimer;
async function pollNavStats() {
  await fetchMonitor();
  clearTimeout(navTimer);
  navTimer = setTimeout(pollNavStats, 10000);
}
function renderMonitor() {
  if (!monSnap) return;
  $('monSum').innerHTML = monCountsHtml(monSnap);
  const n = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0) || 0;
  const hosts = [...monSnap.hosts].sort((a, b) => n(a.address) - n(b.address) || a.address.localeCompare(b.address));
  $('monGrid').innerHTML = hosts.map((h) => {
    const hp = h.host, rm = h.remote;
    const hostTxt = hp.state === 'up' ? `up${hp.rttMs ? ` · ${hp.rttMs} ms` : ''}` : hp.state === 'down' ? 'not responding' : 'checking…';
    const remTxt = rm.state === 'up' ? 'open' : rm.state === 'down' ? 'not responding' : 'checking…';
    const hostTip = hp.state === 'unknown' ? 'Ping has not run yet' : `Ping: ${hp.state === 'up' ? 'replied' : 'no reply'} (checked ${ago(hp.checkedAt)}; ${hp.state === 'up' ? 'up' : 'down'} for ${dur(hp.since)}). Checked every minute.`;
    const remTip = rm.state === 'unknown' ? `${rm.label} port check has not run yet` : `${rm.label}: ${rm.ports.map((p) => `port ${p.port} ${p.state}`).join(', ')} (checked ${ago(rm.checkedAt)}; ${rm.state === 'up' ? 'up' : 'down'} for ${dur(rm.since)}). Checked every 5 minutes.`;
    return `<div class="mon-box ${hp.state}">
      <div class="mon-name"><span>${esc(h.name)}</span><span class="mon-proto ${h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm'}">${rm.label}</span></div>
      <div class="mon-addr">${esc(h.address)}${h.os ? ` · ${esc(String(h.os).replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}` : ''}</div>
      <div class="mon-pills">
        <span class="mon-pill ${hp.state}" title="${esc(hostTip)}"><i></i><b>Host</b>${esc(hostTxt)}</span>
        <span class="mon-pill ${rm.state}" title="${esc(remTip)}"><i></i><b>Remote</b>${esc(rm.label)} ${esc(remTxt)}</span>
      </div>
      <div class="mon-foot">pinged ${ago(hp.checkedAt)} · ${rm.label} checked ${ago(rm.checkedAt)}</div></div>`;
  }).join('') || '<p class="dim" style="margin:0">No saved hosts yet. Add and authenticate hosts under Host Management to monitor them.</p>';
}
async function loadMonitor() {
  await fetchMonitor();
  renderMonitor();
  clearTimeout(monTimer);
  if (isActive('health/monitor')) monTimer = setTimeout(loadMonitor, 5000);
}
$('monCheck').onclick = async () => { $('monCheck').disabled = true; await fetchMonitor(true); renderMonitor(); setTimeout(() => { $('monCheck').disabled = false; loadMonitor(); }, 2500); };

// ---- Shell ----
// Left: Start/End shell for the selected host, a search box and the authenticated hosts. Right: the terminal.
// SSH hosts get a real terminal (keys go straight to the host); WinRM hosts get a line-by-line PowerShell shell, so
// the page does the line editing (typing, backspace, history) and sends a command when you press Enter.
let shellHosts = [], shellHost = null, shellQuery = '';
const shells = new Map(); // hostId -> { id, kind, term, fit, el, es, status, line, hist, histPos, queue }
const hostOf = (id) => shellHosts.find((h) => h.id === id);

function renderShellSide() {
  $('sidenav').innerHTML = `<div class="sidesearch"><button class="act" id="shellStart" type="button"></button>
    <input id="shellSearch" type="search" placeholder="Search hosts" autocomplete="off" spellcheck="false" value="${esc(shellQuery)}"></div><div id="shellList"></div>`;
  $('shellSearch').oninput = () => { shellQuery = $('shellSearch').value.trim(); renderShellList(); };
  renderShellList(); updateShellButton();
}
function updateShellButton() {
  const b = $('shellStart'); if (!b) return;
  const sh = shells.get(shellHost);
  const live = sh && sh.status !== 'ended';
  b.textContent = live ? 'End shell' : 'Start shell';
  b.classList.toggle('sec', !!live);
  b.disabled = !shellHost || sh?.status === 'connecting';
  b.title = shellHost ? '' : 'Select a host first';
}
function renderShellList() {
  const q = shellQuery.toLowerCase();
  const n = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0) || 0;
  const shown = shellHosts.filter((h) => !q || [h.address, h.hostname, h.name].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => n(a.address) - n(b.address) || a.address.localeCompare(b.address));
  const el = $('shellList'); if (!el) return;
  el.innerHTML = shown.map((h) => {
    const live = shells.get(h.id) && shells.get(h.id).status !== 'ended';
    return `<button class="shellhost ${h.id === shellHost ? 'on' : ''}" data-shell-host="${esc(h.id)}" title="${esc(h.os || '')}">
      <span class="sh-name">${live ? '<i class="dot"></i>' : ''}${esc(h.hostname || h.name)}</span><span class="sh-ip">${esc(h.address)}</span></button>`;
  }).join('') || `<div class="empty">${shellHosts.length ? 'No hosts match' : 'No authenticated hosts yet'}</div>`;
}
function renderShellMain() {
  const h = hostOf(shellHost), sh = shells.get(shellHost);
  const [cls, label] = !sh ? ['grey', 'Not connected'] : { connecting: ['grey', 'Connecting…'], connected: ['green', 'Connected'], ended: ['red', 'Session ended'] }[sh.status];
  $('shellHead').innerHTML = h
    ? `<span class="sh-title">${esc(h.hostname || h.name)}</span><span class="dim">${esc(h.address)} · ${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><span class="badge ${cls}">${label}</span>
       <span class="shell-actions"><button class="act sec" data-shell-act="Send file">Send file</button><button class="act sec" data-shell-act="Pull file">Pull file</button><button class="act sec" data-shell-act="Quick hunt">Quick hunt</button><button class="act sec" data-shell-act="Quick response">Quick response</button></span>`
    : '<span class="dim">Select a host on the left, then press Start shell.</span>';
  for (const [id, s] of shells) s.el.hidden = id !== shellHost;
  $('termEmpty').hidden = !!sh;
  if (sh) { sh.fit.fit(); sh.term.focus(); }
  updateShellButton();
}
// The row of buttons next to the status. Send file and Pull file work; the quick hunt and response ones are not built yet.
$('shellHead').onclick = (e) => {
  const act = e.target.dataset.shellAct; if (!act) return;
  if (act === 'Send file') {
    if (!liveShell()) return;
    positionMenu(e.target);
    $('sendMenu').hidden = !$('sendMenu').hidden;
    return;
  }
  if (act === 'Pull file') { openPull(); return; }
  const h = hostOf(shellHost);
  toast(`${act} for ${h ? h.hostname || h.name : 'this host'} isn't built yet`, 'bad');
};
async function loadShell() {
  try { shellHosts = await api('GET', '/api/hosts'); } catch { shellHosts = []; }
  if (!shellHosts.some((h) => h.id === shellHost)) shellHost = null;
  // shells that kept running while the page was away are reattached (their recent output is replayed)
  try { for (const o of await api('GET', '/api/shell')) if (!shells.has(o.hostId) && hostOf(o.hostId)) attachShell(o.hostId, o.id, o.kind); } catch { /* none */ }
  renderShellList(); renderShellMain();
}

function newTerminal(hostId) {
  const term = new Terminal({
    cursorBlink: true, fontFamily: "'Cascadia Mono', Consolas, monospace", fontSize: 13, scrollback: 5000,
    theme: { background: '#06070a', foreground: '#e7eaf0', cursor: '#00c8ff', selectionBackground: '#1d4a5c' },
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  const el = document.createElement('div');
  el.className = 'term-el'; el.hidden = hostId !== shellHost;
  $('termBox').append(el);
  term.open(el);
  return { term, fit, el };
}
function attachShell(hostId, sessionId, kind) {
  const t = newTerminal(hostId);
  const sh = { id: sessionId, kind, ...t, status: 'connected', line: '', hist: [], histPos: 0, queue: Promise.resolve() };
  shells.set(hostId, sh);
  const send = (data) => { sh.queue = sh.queue.then(() => api('POST', `/api/shell/${sessionId}/input`, { data })).catch(() => {}); };
  sh.term.onData((d) => (kind === 'ssh' ? send(d) : lineEdit(sh, d, send)));
  sh.es = new EventSource(`/api/shell/${sessionId}/stream`);
  sh.es.onmessage = (e) => { sh.term.write(JSON.parse(e.data).d); };
  sh.es.addEventListener('end', () => endShell(hostId, false));
  sh.es.onerror = () => { if (sh.es.readyState === EventSource.CLOSED) endShell(hostId, false); };
  renderShellMain(); renderShellList();
  return sh;
}
// WinRM shells have no terminal on the far side, so type, backspace and up/down history are handled here.
function lineEdit(sh, d, send) {
  const erase = (n) => sh.term.write('\b \b'.repeat(n));
  if (d === '\x1b[A' || d === '\x1b[B') { // history
    if (!sh.hist.length) return;
    sh.histPos = Math.max(0, Math.min(sh.hist.length, sh.histPos + (d.endsWith('A') ? -1 : 1)));
    erase(sh.line.length);
    sh.line = sh.hist[sh.histPos] || '';
    sh.term.write(sh.line);
    return;
  }
  if (d.startsWith('\x1b')) return; // other escape sequences (arrows left/right, etc.) are ignored
  for (const c of d) {
    if (c === '\r' || c === '\n') {
      sh.term.write('\r\n');
      if (sh.line.trim()) { sh.hist.push(sh.line); }
      sh.histPos = sh.hist.length;
      send(sh.line + '\n'); sh.line = '';
    } else if (c === '\x7f' || c === '\b') { if (sh.line) { sh.line = sh.line.slice(0, -1); erase(1); } }
    else if (c === '\x03') { sh.term.write('^C\r\n'); sh.line = ''; send('\n'); }
    else if (c >= ' ') { sh.line += c; sh.term.write(c); }
  }
}
function endShell(hostId, kill = true) {
  const sh = shells.get(hostId); if (!sh) return;
  if (sh.status === 'ended') return;
  sh.status = 'ended';
  try { sh.es?.close(); } catch { /* ignore */ }
  if (kill) api('DELETE', `/api/shell/${sh.id}`).catch(() => {});
  sh.term.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n');
  renderShellMain(); renderShellList();
}
async function startShell() {
  const hostId = shellHost; if (!hostId) return;
  const old = shells.get(hostId);
  if (old) { // a finished session's terminal is cleared away before a new one starts
    old.term.dispose(); old.el.remove(); shells.delete(hostId);
  }
  const t = newTerminal(hostId);
  const sh = { id: null, kind: null, ...t, status: 'connecting', line: '', hist: [], histPos: 0, queue: Promise.resolve() };
  shells.set(hostId, sh); renderShellMain(); renderShellList();
  t.fit.fit();
  try {
    const r = await api('POST', '/api/shell', { hostId, cols: t.term.cols, rows: t.term.rows });
    t.term.dispose(); t.el.remove(); shells.delete(hostId); // replace the placeholder terminal with the attached one
    attachShell(hostId, r.id, r.kind);
  } catch (e) {
    t.term.write(`\x1b[31m${e.message}\x1b[0m\r\n`);
    sh.status = 'ended'; renderShellMain(); renderShellList();
  }
}
window.addEventListener('resize', () => {
  const sh = shells.get(shellHost); if (!sh || !currentTab || currentTab.id !== 'shell') return;
  sh.fit.fit();
  if (sh.kind === 'ssh' && sh.id) api('POST', `/api/shell/${sh.id}/resize`, { cols: sh.term.cols, rows: sh.term.rows }).catch(() => {});
});

// ---- Shell: Send file / Pull file ----
// Send: pick files or a folder on this computer; they are pushed into the folder the shell is currently in.
// Pull: an explorer-style window over the HOST's file system; the file you pick is copied into evidence/Pulled-Files.
const noteShell = (t) => { $('shellNote').textContent = t; $('shellNote').hidden = !t; };
function liveShell() {
  const sh = shells.get(shellHost);
  if (!sh || sh.status !== 'connected' || !sh.id) { toast('Start the shell first', 'bad'); return null; }
  return sh;
}
async function sendFiles(files) {
  const sh = liveShell(); if (!sh) return;
  const list = [...files];
  if (!list.length) return toast('That folder has no files to send', 'bad');
  noteShell(`Sending 0 of ${list.length}…`);
  try {
    for (const [i, f] of list.entries()) {
      const rel = f.webkitRelativePath || f.name;
      const r = await fetch(`/api/shell/${sh.id}/send?path=${encodeURIComponent(rel)}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: f });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${rel}: ${data.error || r.statusText}`);
      noteShell(`Sending ${i + 1} of ${list.length}…`);
    }
    const first = list[0].webkitRelativePath || list[0].name;
    toast(`Sent ${list.length} file${list.length === 1 ? '' : 's'} (${first.includes('/') ? first.split('/')[0] + '/' : first}) to the shell's current folder`);
  } catch (e) { toast(`Send failed: ${e.message}`, 'bad'); }
  noteShell('');
}
function positionMenu(btn) {
  const r = btn.getBoundingClientRect();
  $('sendMenu').style.left = `${r.left}px`; $('sendMenu').style.top = `${r.bottom + 4}px`;
}
$('sendPickFiles').onclick = () => { $('sendMenu').hidden = true; $('sendFiles').click(); };
$('sendPickFolder').onclick = () => { $('sendMenu').hidden = true; $('sendFolder').click(); };
for (const id of ['sendFiles', 'sendFolder']) {
  $(id).onchange = () => { const files = $(id).files; sendFiles(files).finally(() => { $(id).value = ''; }); };
}
document.addEventListener('click', (e) => { if (!e.target.closest('#sendMenu, [data-shell-act="Send file"]')) $('sendMenu').hidden = true; });

const pm = { path: '', parent: null, sep: '\\', entries: [], sel: null, busy: false };
const pmJoin = (dir, name) => (dir.endsWith(pm.sep) ? dir + name : dir + pm.sep + name);
async function pmLoad(p) {
  const sh = liveShell(); if (!sh) return;
  $('pmMsg').textContent = ''; $('pmMsg').className = '';
  $('pmList').innerHTML = '<p class="dim" style="margin:8px 0">Loading…</p>';
  try {
    const r = await api('POST', `/api/shell/${sh.id}/ls`, { path: p });
    Object.assign(pm, { path: r.path, parent: r.parent, sep: r.sep, entries: r.entries, sel: null });
    $('pmPath').value = r.path || '(drives)';
  } catch (e) {
    $('pmList').innerHTML = '';
    $('pmMsg').textContent = e.message; $('pmMsg').className = 'bad';
    return;
  }
  pmRender();
}
function pmRender() {
  $('pmUp').disabled = pm.parent === null;
  $('pmPull').disabled = !pm.sel;
  $('pmSel').textContent = pm.sel || '';
  const rows = pm.entries.map((e) => `<tr class="bb-row ${!e.dir && e.name === pm.sel ? 'on' : ''}" data-name="${esc(e.name)}" data-dir="${e.dir ? 1 : 0}">
      <td class="bb-name">${bbIcon(e.dir)}<span>${esc(e.name)}</span></td>
      <td class="dim">${e.dir ? '' : bbFmt(e.size)}</td><td class="dim">${e.modified ? esc(new Date(e.modified).toLocaleString()) : ''}</td></tr>`).join('');
  $('pmList').innerHTML = `<table><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="dim">This folder is empty.</td></tr>'}</tbody></table>`;
}
async function openPull() {
  const sh = liveShell(); if (!sh) return;
  const h = hostOf(shellHost);
  $('pmTitle').textContent = `Pull file from ${h ? h.hostname || h.name : 'host'}`;
  $('pullModal').hidden = false;
  let start = '';
  try { start = (await api('GET', '/api/shell')).find((o) => o.id === sh.id)?.cwd || ''; } catch { /* start at the top */ }
  pmLoad(start);
}
const closePull = () => { $('pullModal').hidden = true; };
$('pmClose').onclick = closePull; $('pmCancel').onclick = closePull;
$('pullModal').onclick = (e) => { if (e.target.id === 'pullModal') closePull(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('pullModal').hidden) closePull(); });
$('pmUp').onclick = () => { if (pm.parent !== null) pmLoad(pm.parent); };
$('pmGo').onclick = () => pmLoad($('pmPath').value.trim() === '(drives)' ? '' : $('pmPath').value.trim());
$('pmPath').onkeydown = (e) => { if (e.key === 'Enter') $('pmGo').click(); };
$('pmList').onclick = (e) => {
  const tr = e.target.closest('.bb-row'); if (!tr) return;
  if (tr.dataset.dir === '1') { pmLoad(pmJoin(pm.path, tr.dataset.name)); return; }
  pm.sel = tr.dataset.name; pmRender();
};
$('pmList').ondblclick = (e) => { const tr = e.target.closest('.bb-row'); if (tr && tr.dataset.dir === '0') { pm.sel = tr.dataset.name; pullSelected(); } };
$('pmPull').onclick = () => pullSelected();
async function pullSelected() {
  const sh = liveShell(); if (!sh || !pm.sel || pm.busy) return;
  pm.busy = true; $('pmPull').disabled = true;
  $('pmMsg').className = 'dim'; $('pmMsg').textContent = 'Pulling…';
  try {
    const r = await api('POST', `/api/shell/${sh.id}/pull`, { path: pmJoin(pm.path, pm.sel) });
    closePull();
    toast(`Pulled ${r.name} (${bbFmt(r.size)}) to Evidence${r.folder.replace('/evidence', '')} · SHA-256 ${r.sha256.slice(0, 12)}…`);
  } catch (e) { $('pmMsg').className = 'bad'; $('pmMsg').textContent = e.message; $('pmPull').disabled = false; }
  pm.busy = false;
}

// ---- Home (opened from the logo) ----
const fmtUptime = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
};
async function loadHome() {
  const rows = [];
  try {
    const a = await api('GET', '/api/about');
    rows.push(['Server', esc(a.hostname) + (a.dnsDomain ? `<span class="dim">.${esc(a.dnsDomain.toLowerCase())}</span>` : '')],
      ['Listening on', `${esc(a.bind)} <span class="dim">(this PC only)</span>`],
      ['IP addresses', a.addresses.length ? a.addresses.slice(0, 4).map(esc).join('<br>') : '<span class="dim">none found</span>'],
      ['Version', esc(a.version)],
      ['Runtime', `Node ${esc(a.node)}`],
      ['System', esc(a.os)],
      ['Uptime', fmtUptime(a.uptimeSec)],
      ['Library', `${a.collections} collections · ${a.actions} actions`],
      ['Saved', `${a.hosts} hosts · ${a.profiles} profiles · ${a.runs} runs`]);
  } catch (e) { rows.push(['Server', `<span class="bad">${esc(e.message)}</span>`]); }
  rows.push(['Signed in as', '<span class="dim">Not signed in (sign-in is not set up yet)</span>']);
  $('homeInfo').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}
$('signOut').onclick = () => { $('signOutMsg').textContent = 'Sign-in is not set up yet, so there is nothing to sign out of.'; };

// Small syntax highlighter for the two collection languages. Each alternative is one capture group.
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
// One row per binary that a collection declares in $Dependencies. Red until the hunter uploads it.
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
async function loadBinaries() {
  const list = await api('GET', '/api/binaries');
  $('binTable').tBodies[0].innerHTML = list.map((b) => `<tr class="${b.present ? 'ready' : 'missing'}">
    <td><b>${esc(b.name)}</b></td>
    <td>${b.usedBy.map((h) => esc(h.name)).join('<br>') || '<span class="dim">No collection uses this</span>'}</td>
    <td><div class="binfield" title="${b.present ? `SHA-256 ${esc(b.sha256)}` : ''}">${b.present
      ? `${esc(b.name)} <span class="dim" style="margin-left:8px">${fmtSize(b.size)} · ${esc(b.sha256.slice(0, 12))}…</span>`
      : 'No file uploaded'}</div></td>
    <td>${b.present ? '<span class="badge green">Uploaded</span>' : '<span class="badge red">Not uploaded</span>'}</td>
    <td><div class="binactions">
      <button class="act ${b.present ? 'sec' : ''}" data-upload="${esc(b.name)}" ${b.usedBy.length ? '' : 'disabled'}>${b.present ? 'Replace…' : 'Upload…'}</button>
      <button class="del" data-remove="${esc(b.name)}" ${b.present ? '' : 'disabled'}>Remove</button>
    </div></td></tr>`).join('') || '<tr><td colspan="5" class="dim">No collection declares a binary dependency</td></tr>';
}
let uploadSlot = null;
$('binTable').onclick = async (e) => {
  const { upload, remove } = e.target.dataset;
  $('binMsg').textContent = '';
  if (upload) { uploadSlot = upload; $('binFile').click(); } // opens the file explorer
  if (remove) {
    if (!confirm(`Remove ${remove}? Collections that need it will fail until it is uploaded again.`)) return;
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
// The activity log (a chain-of-custody trail). One collapsible block per hunt, headed by the hunt's name; inside is a
// table of every action the hunt took: time (UTC), host, action, artefact, size, hash match, outcome and detail.
// Hover a Detail cell that has a SHA-256 chip to see the hash of what was written. Rows are coloured by kind.
// A hunt stays open or closed as you leave it (remembered); a hunt that is still running is open until you close it.
let pollRuns, logRuns = [];
const logEvents = new Map(); // runId -> events already fetched
const logOpen = new Map(); // runId -> true/false once the user has chosen
try { for (const [k, v] of JSON.parse(localStorage.getItem('kb.logOpen') || '[]')) logOpen.set(k, v); } catch { /* storage unavailable */ }
const isLogOpen = (r) => (logOpen.has(r.id) ? logOpen.get(r.id) : r.status === 'running');
const saveLogOpen = () => { try { localStorage.setItem('kb.logOpen', JSON.stringify([...logOpen])); } catch { /* ignore */ } };

async function fetchLogEvents() {
  await Promise.all(logRuns.filter(isLogOpen).map(async (r) => {
    const have = logEvents.get(r.id);
    if (have && r.status !== 'running' && have.length === r.eventCount) return;
    try { logEvents.set(r.id, await api('GET', `/api/runs/${r.id}/events`)); } catch { /* shown as loading */ }
  }));
}
async function loadRuns() {
  logRuns = await api('GET', '/api/runs');
  await fetchLogEvents();
  renderLog();
  clearTimeout(pollRuns);
  if (logRuns.some((r) => r.status === 'running') && isActive('output/log')) pollRuns = setTimeout(loadRuns, 2000);
}
const logRow = (e, i) => {
  const hashes = e.receivedHash || e.sourceHash ? `source: ${e.sourceHash || '-'}\nreceived: ${e.receivedHash || '-'}` : '';
  const out = /^ok/.test(e.outcome) ? 'ok' : e.outcome === 'error' ? 'bad' : 'warnc';
  return `<tr class="lg-k-${esc(e.kind)}"><td class="rown">${i + 1}</td><td title="${esc(e.t)}">${esc(e.t.slice(11, 19))}</td><td>${esc(e.host)}</td>
    <td class="lg-act">${esc(e.action)}</td><td>${esc(e.artefact)}</td><td class="num">${e.size === '' ? '' : esc(e.size)}</td><td>${esc(e.match)}</td>
    <td class="${out}">${esc(e.outcome)}</td><td class="lg-detail"${hashes ? ` title="${esc(hashes)}"` : ''}>${esc(e.detail)}${hashes ? ' <span class="lg-hash">SHA-256</span>' : ''}</td></tr>`;
};
function renderLog() {
  $('logBox').innerHTML = logRuns.map((r) => {
    const open = isLogOpen(r), evs = logEvents.get(r.id);
    const ok = r.results.filter((x) => x.status === 'ok').length;
    const badge = r.status === 'completed' ? 'green' : r.status === 'running' ? 'grey' : 'red';
    const table = !evs ? '<p class="dim lg-note">Loading…</p>'
      : `<table class="lg"><thead><tr><th class="rown">#</th><th>Time (UTC)</th><th>Host</th><th>Action</th><th>Artefact</th><th>Size</th><th>Hash match</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>${evs.map(logRow).join('')}</tbody></table>`;
    return `<div class="lg-hunt ${open ? 'open' : ''}">
      <div class="lg-head" data-toggle="${r.id}" role="button" tabindex="0" aria-expanded="${open}"><span class="chev">${open ? '▾' : '▸'}</span>
        <span class="lg-name">${esc(r.name || r.collectionName)}</span><span class="badge ${badge}">${esc(r.status.replaceAll('_', ' '))}</span>
        <span class="dim">${esc(new Date(r.startedAt).toLocaleString())}</span><span class="dim">${ok}/${r.results.length} ok · ${r.eventCount} event${r.eventCount === 1 ? '' : 's'}</span>
        <span class="lg-btns"><a href="/api/runs/${r.id}/log.csv" download data-stop="1" title="Download this hunt's log as CSV">Export CSV</a><a data-del="${r.id}" data-stop="1">Delete</a></span></div>
      ${open ? `<div class="lg-body">${table}</div>` : ''}</div>`;
  }).join('') || '<p class="dim" style="margin:0">No hunts yet. Use Burrow → Hunt to run collections against your hosts.</p>';
}
async function toggleLog(id, to) {
  const r = logRuns.find((x) => x.id === id); if (!r) return;
  logOpen.set(id, to ?? !isLogOpen(r)); saveLogOpen();
  renderLog();
  if (isLogOpen(r) && !logEvents.has(id)) { await fetchLogEvents(); renderLog(); }
}
$('logBox').onclick = async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = logRuns.find((x) => x.id === del.dataset.del);
    if (r && confirm(`Delete the log and record of "${r.name || r.collectionName}"? The evidence folder is not deleted.`)) { await api('DELETE', `/api/runs/${r.id}`); logOpen.delete(r.id); logEvents.delete(r.id); loadRuns(); }
    return;
  }
  if (e.target.closest('[data-stop]')) return;
  const head = e.target.closest('[data-toggle]'); if (head) toggleLog(head.dataset.toggle);
};
$('logBox').onkeydown = (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.toggle) { e.preventDefault(); toggleLog(e.target.dataset.toggle); }
};
$('logExpand').onclick = async () => { for (const r of logRuns) logOpen.set(r.id, true); saveLogOpen(); await fetchLogEvents(); renderLog(); };
$('logCollapse').onclick = () => { for (const r of logRuns) logOpen.set(r.id, false); saveLogOpen(); renderLog(); };

// ---- Output: JSON ----
// What a hunt collected, as JSON: the rows of its All-Hosts CSVs as records (the same as the hunt's hunt.json), ready to
// load into Elastic and the like. Runs from before hunt.json existed show their stored record (hosts, stdout, timings).
let jsonText = '', jsonReq = 0;
async function loadJsonRuns() {
  const runs = await api('GET', '/api/runs');
  const keep = $('jsonRun').value;
  $('jsonRun').innerHTML = runs.map((r) => `<option value="${r.id}">${esc(new Date(r.startedAt).toLocaleString())} - ${esc(r.name || r.collectionName)}</option>`).join('')
    || '<option value="">No runs yet</option>';
  if (keep && runs.some((r) => r.id === keep)) $('jsonRun').value = keep;
  $('jsonRun').disabled = !runs.length;
  showRunJson();
}
async function showRunJson() {
  const id = $('jsonRun').value, req = ++jsonReq;
  if (!id) { jsonText = ''; $('jsonOut').textContent = 'No runs yet. Results appear here once a collection has been run.'; setJsonButtons(); return; }
  const run = await api('GET', `/api/runs/${id}/data`);
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
  const label = $('jsonRun').selectedOptions[0]?.textContent.split(' - ').slice(1).join(' - ') || 'hunt';
  a.download = `${label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'hunt'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---- start (restores the tab/page from the URL hash) ----
// Links such as href="#hosts/discover" change only the hash, so follow it.
window.addEventListener('hashchange', () => {
  const [t, p] = location.hash.slice(1).split('/');
  if (t && `${t}/${p}` !== currentSlug) go(t, p);
});
const [startTab, startPage] = location.hash.slice(1).split('/');
go(startTab || 'hosts', startPage);
pollNavStats();
