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

// A request that comes back 401 means the session has ended (or never existed): go to the sign-in page.
const rawFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const r = await rawFetch(...args);
  if (r.status === 401) location.replace('/login.html');
  return r;
};
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (r.status === 403 && data.permission !== undefined) showDenied({ permission: data.permission, needed: data.needed, what: 'do that' });
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

// ---- Access: what the signed-in user may do ----
// The server refuses anything the user's roles don't allow (src/route-perms.js); this is the part the user sees. A page, tab
// or button that needs a permission the user doesn't have gets a padlock, and using it opens a "Permission denied" popup
// instead of doing anything. Elements opt in with data-perm="<permission>" (several, separated by commas, mean any of them)
// and an optional data-perm-what="add hosts" that completes the sentence "You don't have permission to ...".
let access = { username: '', roles: [], permissions: new Set(), all: false, options: {} };
const can = (perm) => {
  if (!perm) return true;
  const list = Array.isArray(perm) ? perm : String(perm).split(',');
  return access.all || list.some((p) => access.permissions.has(p.trim()));
};
const LOCK = '<svg class="lock" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
async function loadAccess() {
  try {
    const [me, groups] = await Promise.all([api('GET', '/api/auth/me'), api('GET', '/api/permissions')]);
    access = { id: me.id, username: me.username, roles: me.roleNames, permissions: new Set(me.permissions), all: me.all, options: Object.fromEntries(groups.flatMap((g) => g.permissions).map((p) => [p.key, p])) };
  } catch { /* a 401 already redirected to the sign-in page */ }
  setNavUser();
}
// "Logged in as: name", small and blue, after the Shell and Health buttons.
function setNavUser() { const s = $('navUser'); if (s) s.innerHTML = access.username ? `Logged in as: <b>${esc(access.username)}</b>` : ''; }
const permLabel = (key) => access.options[key]?.label || key;

// The popup. `needed` is the list of labels the server sent (any one of them would have been enough).
function showDenied({ permission, needed, what } = {}) {
  if (!$('denyModal').hidden) return; // one popup at a time
  const labels = needed?.length ? needed : permission ? String(permission).split(',').map(permLabel) : [];
  $('denyBody').innerHTML = `<p>You don't have permission to ${what ? esc(what) : 'do that'}.</p>
    ${labels.length ? `<p class="dim">This needs <b>${labels.map(esc).join('</b> or <b>')}</b>.</p>` : ''}
    <p class="dim">Your role${access.roles.length === 1 ? '' : 's'}: ${access.roles.length ? access.roles.map(esc).join(', ') : 'none'}. Ask an administrator if you need access.</p>`;
  $('denyModal').hidden = false;
  $('denyOk').focus();
}
const closeDenied = () => { $('denyModal').hidden = true; };
$('denyOk').onclick = closeDenied; $('denyX').onclick = closeDenied;
$('denyModal').onclick = (e) => { if (e.target.id === 'denyModal') closeDenied(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('denyModal').hidden) closeDenied(); });

// Padlocks on every [data-perm] element the user can't use, including ones the page adds later.
function decorateLocks(root = document) {
  const els = [...(root.matches?.('[data-perm]') ? [root] : []), ...(root.querySelectorAll ? root.querySelectorAll('[data-perm]') : [])];
  for (const el of els) {
    const ok = can(el.dataset.perm);
    el.classList.toggle('locked', !ok);
    const lock = [...el.children].find((c) => c.matches?.('svg.lock'));
    if (ok) { lock?.remove(); continue; }
    if (!lock && !/^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName)) el.insertAdjacentHTML('afterbegin', LOCK);
    el.title = `Locked: needs ${el.dataset.perm.split(',').map((p) => permLabel(p.trim())).join(' or ')}`;
  }
}
// Only changes that add (or retext) something with data-perm trigger a pass, so the busy terminal output costs nothing.
let lockFrame = 0;
new MutationObserver((muts) => {
  const hit = muts.some((m) => [...m.addedNodes].some((n) => (n.nodeType === 1 ? n.matches('[data-perm]') || n.querySelector('[data-perm]') : n.nodeType === 3 && n.parentElement?.closest('[data-perm]'))));
  if (hit) { cancelAnimationFrame(lockFrame); lockFrame = requestAnimationFrame(() => decorateLocks()); }
}).observe(document.body, { childList: true, subtree: true });
// Using a locked element does nothing but show the popup. This runs before the element's own handlers.
const lockedTarget = (e) => { const el = e.target.closest?.('[data-perm]'); return el && !can(el.dataset.perm) ? el : null; };
function denyElement(e, el) {
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  showDenied({ permission: el.dataset.perm, what: el.dataset.permWhat || `use "${el.textContent.trim() || 'this'}"` });
}
document.addEventListener('click', (e) => { const el = lockedTarget(e); if (el) denyElement(e, el); }, true);
document.addEventListener('mousedown', (e) => { const el = lockedTarget(e); if (el && el.matches('select')) denyElement(e, el); }, true);

// Which permission each page needs. The top-bar tab for an area is locked when every page in it is.
const PAGE_PERM = {
  'settings/user-management': 'users.view', 'settings/shell-settings': 'system.view', 'settings/health-settings': 'system.view', 'settings/run-settings': 'system.view', 'settings/server-settings': 'system.view', 'settings/certificate': 'system.view', 'settings/elastic': 'system.view',
  'settings/view-collections': 'collections.view', 'settings/add-collections': 'collections.manage', 'settings/binaries': 'collections.manage',
  'settings/view-actions': 'actions.view', 'settings/add-actions': 'actions.manage',
  'hosts/view-hosts': 'hosts.view', 'hosts/profiles': 'hosts.view', 'hosts/groups': 'hosts.view', 'hosts/discover': 'hosts.manage', 'hosts/manual': 'hosts.manage',
  'burrow/hunt': 'hunts.view', 'burrow/respond': 'actions.view', 'burrow/workflow': 'workflows.view', 'burrow/recurring': 'hunts.view,actions.view',
  'output/log': 'hunts.view', 'output/report': 'hunts.view', 'output/json': 'hunts.view', 'browse/files': 'hunts.view', 'browse/pinned': 'hunts.view', 'output/diff': 'hunts.view', 'output/compare': 'hunts.view', 'output/ioc': 'hunts.view', 'output/baseline': 'hunts.view',
  'shell/shell': 'shell.open', 'health/monitor': 'system.view', 'health/monitor-log': 'system.view', 'health/quarantine-log': 'system.view',
};
const pageAllowed = (slug) => can(PAGE_PERM[slug]);
function refreshTopLocks() {
  for (const t of NAV) {
    const b = document.querySelector(`#topnav button[data-tab="${t.id}"]`); if (!b) continue;
    const pages = t.pages.filter(Array.isArray);
    const locked = pages.length > 0 && pages.every((p) => !pageAllowed(`${t.id}/${p[0]}`));
    b.classList.toggle('locked', locked);
    b.querySelector(':scope > svg.lock')?.remove();
    if (locked) { b.insertAdjacentHTML('afterbegin', LOCK); b.title = 'Locked: you do not have permission to use this area'; } else b.removeAttribute('title');
  }
}

// ---- navigation: top tabs -> left menu -> page (page ids are "tab/page" slugs) ----
const NAV = [
  // A third entry puts a page under a titled dropdown in the side menu (the titles are not pages).
  // { heading: 'Name' } is a titled dropdown with no pages yet.
  { id: 'settings', label: 'Settings', pages: [
    ['user-management', 'User Management', 'System'], ['shell-settings', 'Shell Settings', 'System'], ['health-settings', 'Health Settings', 'System'], ['run-settings', 'Run Settings', 'System'], ['server-settings', 'Server Settings', 'System'], ['certificate', 'Certificate', 'System'], ['elastic', 'Elastic', 'System'],
    ['view-collections', 'View Collections', 'Collections'], ['add-collections', 'Add Collections', 'Collections'],
    ['view-actions', 'View Actions', 'Actions'], ['add-actions', 'Add Actions', 'Actions'],
    ['binaries', 'Upload Binaries'],
  ] },
  { id: 'hosts', label: 'Host Management', pages: [
    ['view-hosts', 'View Hosts', 'Hosts'], ['profiles', 'Profiles', 'Hosts'], ['groups', 'Groups', 'Hosts'],
    ['discover', 'Discover', 'Add Hosts'], ['manual', 'Manually Add', 'Add Hosts'],
  ] },
  { id: 'burrow', label: 'Burrow!', accent: true, pages: [['hunt', 'Hunt'], ['respond', 'Respond'], ['workflow', 'Workflow'], ['recurring', 'Recurring']],
    // Hyperlink-style shortcuts under the pages: [label, slug of the page they open]
    links: [['View Collections (Hunt)', 'settings/view-collections'], ['View Actions (Respond)', 'settings/view-actions'], ['Upload Binaries', 'settings/binaries']] },
  { id: 'output', label: 'Results', pages: [
    ['log', 'Activity', 'Logs'], ['json', 'JSON', 'Logs'],
    ['report', 'Report', 'Analysis'], ['diff', 'Diff', 'Analysis'], ['compare', 'Cross-host comparison', 'Analysis'], ['ioc', 'IOC', 'Analysis'], ['baseline', 'Baseline', 'Analysis'],
  ] },
  { id: 'browse', label: 'Browse', pages: [['files', 'Files'], ['pinned', 'Pinned']] },
  // The logo in the header opens this landing page. It has no tab of its own and no side menu.
  { id: 'home', label: 'Home', hidden: true, pages: [['home', 'Home']] },
  // Shell and Health are placed apart on the right of the top bar.
  { id: 'shell', label: 'Shell', pages: [['shell', 'Shell']], right: true, hostMenu: true }, // the side menu lists authenticated hosts
  { id: 'health', label: 'Health', pages: [['monitor', 'Monitor'], ['monitor-log', 'Monitor log'], ['quarantine-log', 'Quarantine log']], right: true },
];
const loaders = {
  'settings/view-collections': () => loadCollectionList(),
  'settings/view-actions': () => loadActionList(),
  'burrow/hunt': loadBurrowHunts,
  'burrow/workflow': () => window.loadWorkflows?.(),
  'burrow/recurring': () => window.loadRecurring?.(),
  'output/report': () => window.loadReports?.(), // report.js loads after this file
  'burrow/respond': () => window.loadRespond?.(), // respond.js loads after this file
  'browse/files': () => window.bbEnter?.(), // browse.js
  'browse/pinned': () => window.loadPins?.(),
  'output/diff': () => window.loadDiff?.(), // browse.js
  'output/compare': () => window.loadCompare?.(), // analysis.js
  'output/baseline': () => window.loadBaselines?.(),
  'output/ioc': () => window.loadIocs?.(), // iocs.js
  'home/home': loadHome,
  'shell/shell': loadShell,
  'health/monitor': loadMonitor,
  'health/monitor-log': loadMonitorLog,
  'health/quarantine-log': loadQuarantineLog,
  'settings/user-management': loadUserMgmt,
  'settings/health-settings': loadHealthSettings,
  'settings/run-settings': loadRunSettings,
  'settings/server-settings': loadServerSettings,
  'settings/certificate': loadCertificate,
  'settings/elastic': loadElastic,
  'settings/shell-settings': loadShellSettings,
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
    if (key && !openGroups.has(key) && currentSlug !== `${tab.id}/${pid}`) continue; // the page you are on always shows
    const locked = !pageAllowed(`${tab.id}/${pid}`);
    html += `<button data-tab="${tab.id}" data-page="${pid}" class="${group ? 'sub' : ''} ${currentSlug === `${tab.id}/${pid}` ? 'on' : ''} ${locked ? 'locked' : ''}"${locked ? ` title="Locked: needs ${esc(permLabel(PAGE_PERM[`${tab.id}/${pid}`]))}"` : ''}>${locked ? LOCK : ''}${esc(label)}</button>`;
  }
  for (const [label, slug] of tab.links || []) html += `<button class="sidelink" data-link="${esc(slug)}">${esc(label)}</button>`;
  $('sidenav').innerHTML = html;
}

// A page the user may not open: say so and stay where they are (or go home if they have nowhere yet, e.g. a bookmarked link).
function denyPage(tab, page) {
  showDenied({ permission: PAGE_PERM[`${tab.id}/${page[0]}`], what: `open ${page[1]}` });
  if (!currentSlug) go('home', 'home');
  else if (location.hash !== `#${currentSlug}`) location.hash = currentSlug;
}
function go(tabId, pageId) {
  const tab = NAV.find((t) => t.id === tabId) || NAV[0];
  const real = tab.pages.filter(Array.isArray); // skip headings that have no pages yet
  let page = pageId ? real.find((p) => p[0] === pageId) : null;
  if (page) {
    if (!pageAllowed(`${tab.id}/${page[0]}`)) return denyPage(tab, page);
  } else {
    page = real.find((p) => pageAllowed(`${tab.id}/${p[0]}`)); // the first page the user may open
    if (!page && real.length) return denyPage(tab, real[0]);
  }
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
    const u = document.createElement('span'); u.className = 'navuser'; u.id = 'navUser'; $('topnav').append(u); setNavUser(); // "Logged in as", just left of the Shell button
  }
  if (t.accent) b.className = 'accent';
  if (t.right) b.className = `right${NAV[i - 1]?.right ? '' : ' first'}`;
  b.onclick = () => go(t.id);
  $('topnav').append(b);
});$('sidenav').onclick = (e) => {
  const fold = e.target.closest('[data-shfold]');
  if (fold) { const g = fold.dataset.shfold; if (shellFolded.has(g)) shellFolded.delete(g); else shellFolded.add(g); renderShellList(); return; }
  const sh = e.target.closest('button[data-shell-host]');
  if (sh) { shellHost = sh.dataset.shellHost; renderShellList(); renderShellMain(); return; }
  if (e.target.closest('#shellStart')) {
    const cur = shells.get(shellHost);
    if (cur && cur.status !== 'ended') endShell(shellHost); else startShell();
    return;
  }
  const link = e.target.closest('button[data-link]');
  if (link) { const [t, p] = link.dataset.link.split('/'); go(t, p); return; }
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
  $('scanStatus').textContent = `${j.status}: ${j.done}/${j.total} scanned, ${j.found.length} found${j.status === 'running' && j.phase === 'remote' ? ', checking remote protocols…' : ''}`;
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
  // the remote protocol check of a host finishes after the host is listed, so fill it in when it arrives
  let late = false;
  for (const h of found) { const mine = discovered.find((d) => d.ip === h.ip); if (mine && h.remote && !mine.remote) { mine.remote = h.remote; late = true; } }
  if (late) { setDiscovered(discovered); renderAuthHosts(); }
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

// Clear all: empties the discovered hosts list (and stops a scan that is still running).
$('scanClear').onclick = () => {
  if (!$('scanStop').hidden) $('scanStop').click();
  clearInterval(scanTimer); $('scanBtn').disabled = false; $('scanStop').hidden = true; // stop polling, or the cancelled scan would put its hosts back
  setDiscovered([]); scanSeen = new Set(); authState = {}; saveAuthState(); renderAuthHosts();
  $('scanStatus').textContent = ''; $('scanBar').hidden = true;
};
$('scanReset').onclick = () => { $('scanClear').click(); $('cidr').value = ''; }; // the same as Clear all under the results, and the address box is emptied too
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

// The Remote protocol cell: what the scan found (WinRM or SSH, chosen by the host's OS, green if it answers and orange if it
// appears down), with the result of the credential test underneath once one has been run.
function authCell(h) {
  const st = authState[h.ip] || {}, rem = h.remote;
  const label = (rem?.protocol || (/^Windows/.test(h.osGuess) ? 'winrm' : 'ssh')) === 'winrm' ? 'WinRM' : 'SSH';
  const found = !rem ? '<span class="dim">checking…</span>'
    : rem.available ? `<span class="ok" title="${esc(rem.detail)}">${label} available</span>`
      : `<span class="warnc" title="${esc(rem.detail)}">${label} - appears down</span>`;
  const proto = st.testing || (['winrm', 'ssh'].find((p) => st[p]));
  let auth = '';
  if (st.testing) auth = '<div><span class="badge grey">Testing…</span></div>';
  else if (proto && st[proto]) {
    const r = st[proto];
    const [cls, lbl] = { authenticated: ['green', 'Authenticated'], absent: ['grey', 'Absent'], rejected: ['red', 'Credentials rejected'] }[r.state] || ['red', 'Failed'];
    auth = `<div><span class="badge ${cls}">${lbl}</span></div>${r.reason ? `<div class="reason ${r.state === 'absent' ? '' : 'bad'}">${esc(r.reason)}</div>` : ''}`;
  }
  return found + auth;
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
      <td>${authCell(h)}</td></tr>`;
  }).join('') || '<tr><td colspan="6" class="dim">No hosts yet. Run a subnet scan above.</td></tr>';
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
  renderAuthHosts(); // nothing is tested until Authenticate is pressed
};
// "Authenticate" tests every host that has a profile, a few at a time. Hosts with no profile are skipped.
$('authBtn').onclick = async () => {
  const ips = discovered.map((h) => h.ip).filter((ip) => assignments[ip]);
  const skipped = discovered.length - ips.length;
  const msg = $('authMsg');
  if (!ips.length) { msg.className = 'dim'; msg.textContent = 'Select a profile for at least one host first.'; return; }
  $('authBtn').disabled = true; msg.className = 'dim'; msg.textContent = `Testing ${ips.length} host${ips.length === 1 ? '' : 's'}…`;
  const results = [];
  const queue = [...ips];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) results.push(await testHost(queue.shift())); }));
  const okN = results.filter((s) => s === 'authenticated').length;
  msg.className = okN === results.length ? 'ok' : 'bad';
  msg.textContent = `${okN} of ${results.length} authenticated${okN === results.length ? '' : '; see the reason under each failed host'}.${skipped ? ` ${skipped} host${skipped === 1 ? ' has' : 's have'} no profile and ${skipped === 1 ? 'was' : 'were'} skipped.` : ''}`;
  $('authBtn').disabled = false;
};

// ---- Profiles ----
function renderProfiles() {
  $('profileList').innerHTML = profiles.map((p) => `<div class="plist">
    <div class="pinfo">
      <a class="pname os ${p.kind.startsWith('Windows') ? 'windows' : 'unix'}" data-edit="${p.id}" title="Click to edit">${esc(p.name)}</a>
      <div class="dim pkind">${esc(p.kind)}</div>
    </div>
    <button class="act sec vh" type="button" data-hosts="${p.id}">View hosts</button>
    <button class="del" data-del="${p.id}" data-perm="hosts.manage" data-perm-what="delete credential profiles">Delete</button></div>`).join('') || '<p class="dim" style="margin:0">No profiles yet.</p>';
}
// View hosts: the saved hosts that were authenticated with a profile.
const closeProfHosts = () => { $('profHostsModal').hidden = true; };
$('phDone').onclick = $('phX').onclick = closeProfHosts;
$('profHostsModal').onclick = (e) => { if (e.target.id === 'profHostsModal') closeProfHosts(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('profHostsModal').hidden) closeProfHosts(); });
async function showProfileHosts(p) {
  $('phTitle').textContent = `Hosts that used "${p.name}"`;
  $('phBody').innerHTML = '<p class="dim">Loading…</p>'; $('profHostsModal').hidden = false;
  try {
    const mine = (await api('GET', '/api/hosts')).filter((h) => h.profileId === p.id);
    $('phBody').innerHTML = mine.length
      ? `<table class="bh"><thead><tr><th>Name</th><th>Address</th><th>OS</th><th>Protocol</th><th>Last verified</th></tr></thead><tbody>${mine.map((h) => `<tr><td><b>${esc(h.name)}</b></td><td>${esc(h.address)}</td><td class="dim">${esc(String(h.os || '').replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}</td><td class="${h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</td><td class="dim">${esc(fmtVerified((h.remoteCheck || {}).at || h.verifiedAt))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="dim" style="margin:0">No saved hosts have been authenticated with this profile yet.</p>';
  } catch (e) { $('phBody').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
$('profileList').onclick = async (e) => {
  const { edit, del, hosts: viewHosts } = e.target.dataset;
  if (viewHosts) { const p = profiles.find((x) => x.id === viewHosts); if (p) showProfileHosts(p); return; }
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
    const mine = lists.filter((l) => l.hostIds.includes(h.id));
    return `<button class="act sec" type="button" data-manage="${h.id}" data-perm="hosts.manage" data-perm-what="change host groups" title="${mine.length ? `In: ${esc(mine.map((l) => l.name).join(', '))}` : 'Not in any group (shows under Unassigned)'}">Manage groups</button>`;
  };
  // Search matches name, address, OS and protocol. WinRM hosts show in blue and SSH hosts in orange.
  const q = hostQuery.toLowerCase();
  const shown = hosts.filter((h) => !q || [h.name, h.hostname, h.address, h.os, h.protocol === 'ssh' ? 'ssh' : 'winrm'].some((v) => String(v || '').toLowerCase().includes(q)));
  $('hostTable').tBodies[0].innerHTML = shown.map((h, i) => {
    const pc = h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm';
    const rc = h.remoteCheck || { up: true, at: h.verifiedAt };
    return `<tr data-hostrow="${esc(h.id)}"><td class="hdotc"><span class="hdot ${rc.up ? '' : 'down'}" data-dot="${esc(h.id)}"></span></td><td class="rown">${i + 1}</td>
    <td class="hname" data-hname="${esc(h.id)}">${esc(h.name)} <a class="hren" data-rename="${esc(h.id)}" data-perm="hosts.manage" data-perm-what="rename hosts" title="Rename this host. Leave the name empty to go back to the discovered name">Rename</a></td><td>${esc(h.address)}</td><td class="${pc}" title="${esc(h.os)}">${esc(String(h.os || '').replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}</td><td class="${pc}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</td>
    <td class="dim" title="The credential profile this host was authenticated with">${esc(h.profileName || '-')}</td>
    <td class="${rc.up ? 'ok' : 'bad'}" data-lastver="${esc(h.id)}">${fmtVerified(rc.at)}</td>
    <td><button class="act sec" type="button" data-details="${esc(h.id)}" title="History and details of this host">Details</button></td>
    <td>${groupCell(h)}</td>
    <td><a data-del-host="${h.id}" data-perm="hosts.manage" data-perm-what="delete hosts">Delete</a></td></tr>`;
  }).join('') || `<tr><td colspan="11" class="dim">${hosts.length ? 'No hosts match' : 'No hosts saved'}</td></tr>`;

  $('groupBox').innerHTML = groupsHtml(hosts, lists);
  paintHostDots();
}
const fmtVerified = (at) => (at ? new Date(at).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
// The lamp and the Last verified text follow the live remote port check while monitoring is on; otherwise they show the last result kept on the host
// (a host starts green when it is verified, so it stays that way if monitoring is off).
function paintHostDots() {
  const live = new Map((monSnap && monSnap.enabled !== false ? monSnap.hosts : []).map((m) => [m.id, m]));
  for (const h of hosts) {
    const dot = document.querySelector(`[data-dot="${h.id}"]`), cell = document.querySelector(`[data-lastver="${h.id}"]`); if (!dot || !cell) continue;
    const m = live.get(h.id), checked = m && (m.remote.state === 'up' || m.remote.state === 'down') && m.remote.checkedAt;
    const rc = checked ? { up: m.remote.state === 'up', at: m.remote.checkedAt } : (h.remoteCheck || { up: true, at: h.verifiedAt });
    const label = h.protocol === 'ssh' ? 'SSH' : 'WinRM';
    dot.classList.toggle('down', !rc.up);
    dot.title = `${label} port ${rc.up ? 'open' : 'not responding'} (last checked ${fmtVerified(rc.at)})`;
    cell.className = rc.up ? 'ok' : 'bad'; cell.textContent = fmtVerified(rc.at);
  }
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
      <div class="grp-row"><button class="grp-head" data-fold="${l.id}" aria-expanded="${!folded}"><span class="chev">${folded ? '▸' : '▾'}</span><span class="grp-name">${esc(l.name)}</span><span class="grp-count">${members.length}</span></button>${deletable && l.id !== UNASSIGNED ? `<a class="grp-del" data-del-list="${l.id}" data-perm="hosts.manage" data-perm-what="delete groups" title="Delete this group (the hosts stay saved)">Delete</a>` : ''}</div>
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
  const rn = e.target.closest('[data-rename]');
  if (rn) { hostRenameStart(rn.dataset.rename); return; }
  const dt = e.target.closest('[data-details]');
  if (dt) { window.openHostDetail?.(dt.dataset.details); return; }
  const m = e.target.closest('[data-manage]');
  if (m) { gmHost = m.dataset.manage; renderGroupsModal(); $('groupsModal').hidden = false; $('gmDone').focus(); return; }
  if (e.target.dataset.delHost) { await api('DELETE', `/api/hosts/${e.target.dataset.delHost}`); loadHosts(); return; }
};
// Rename: the name cell becomes a text box. Enter saves, Esc cancels, and an empty name goes back to the discovered one.
function hostRenameStart(hid) {
  const h = hosts.find((x) => x.id === hid), cell = document.querySelector(`[data-hname="${hid}"]`); if (!h || !cell) return;
  cell.innerHTML = `<input type="text" class="hren-in" maxlength="100" value="${esc(h.name)}" placeholder="${esc(h.hostname || h.address)}" spellcheck="false" autocomplete="off">`;
  const inp = cell.firstChild; inp.focus(); inp.select();
  let done = false;
  const finish = async (save) => {
    if (done) return; done = true;
    if (save && inp.value.trim() !== h.name) {
      try { await api('PUT', `/api/hosts/${hid}`, { name: inp.value }); } catch (err) { alert(err.message); }
      await loadHosts();
    } else renderHosts();
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
  inp.onblur = () => finish(true);
}
// Manage groups: the groups the host is in, and a tick box for every group. Each tick adds or removes the host straight away.
let gmHost = null;
function renderGroupsModal() {
  const h = hosts.find((x) => x.id === gmHost); if (!h) { $('groupsModal').hidden = true; return; }
  const mine = hostLists.filter((l) => l.hostIds.includes(h.id));
  $('gmWho').textContent = `${h.name} · ${h.address}`;
  $('gmCurrent').innerHTML = mine.length ? mine.map((l) => `<span class="tagchip on">${esc(l.name)}</span>`).join('') : '<span class="dim">None. This host shows under Unassigned.</span>';
  $('gmList').innerHTML = hostLists.map((l) => `<label class="pick"><input type="checkbox" data-gm="${esc(l.id)}" ${l.hostIds.includes(h.id) ? 'checked' : ''} ${can('hosts.manage') ? '' : 'disabled'}>
      <span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></label>`).join('')
    || '<p class="dim" style="margin:6px 10px">No groups yet. Create one on the Groups page.</p>';
}
$('gmList').onchange = async (e) => { if (e.target.dataset.gm) await setMembership(e.target.dataset.gm, gmHost, e.target.checked); };
const closeGroups = () => { $('groupsModal').hidden = true; gmHost = null; };
$('gmDone').onclick = $('gmX').onclick = closeGroups;
$('groupsModal').onclick = (e) => { if (e.target.id === 'groupsModal') closeGroups(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('groupsModal').hidden) closeGroups(); });
async function setMembership(listId, hostId, member) {
  const list = hostLists.find((l) => l.id === listId); if (!list) return;
  const hostIds = member ? [...new Set([...list.hostIds, hostId])] : list.hostIds.filter((i) => i !== hostId);
  try { await api('PUT', `/api/lists/${listId}`, { hostIds }); } catch (err) { alert(err.message); }
  await loadHosts();
  if (!$('groupsModal').hidden) renderGroupsModal();
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
  if (!can('hosts.manage')) return showDenied({ permission: 'hosts.manage', what: 'add hosts' });
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
// New group: hosts are added from a typeable drop-down (the matches narrow as you type) and show as removable chips, like the tag filter.
let ngHosts = [], ngPicked = [], ngText = '', ngOpen = false; // saved hosts, the ids picked so far, what is typed, and whether the suggestions show
function ngRender() {
  const left = ngHosts.filter((h) => !ngPicked.includes(h.id));
  $('listHosts').innerHTML = `<div class="tf-dd">
      <input type="text" class="tf-taginput" data-role="ngInput" placeholder="${ngHosts.length ? (left.length ? 'Add a host…' : 'Every host is added') : 'No hosts saved yet'}" value="${esc(ngText)}" ${left.length ? '' : 'disabled'} autocomplete="off" spellcheck="false">
      <div class="tf-menu" data-role="ngMenu" hidden></div></div>
    ${ngPicked.length ? `<div class="tf-chips">${ngPicked.map((id) => { const h = ngHosts.find((x) => x.id === id); return h ? `<button type="button" class="tagchip on" data-ng-remove="${esc(id)}" title="Remove this host from the group">${esc(h.name)} <span class="dim">${esc(h.address)}</span><b class="x">×</b></button>` : ''; }).join('')}</div>` : ''}`;
  ngFill();
}
function ngFill() {
  const menu = $('listHosts').querySelector('[data-role=ngMenu]'); if (!menu) return;
  const q = ngText.trim().toLowerCase();
  const hits = ngHosts.filter((h) => !ngPicked.includes(h.id) && (!q || [h.name, h.hostname, h.address].some((v) => String(v || '').toLowerCase().includes(q))));
  menu.innerHTML = hits.map((h) => `<button type="button" data-ng-add="${esc(h.id)}">${esc(h.name)} <span class="dim">${esc(h.address)}</span></button>`).join('') || '<div class="tf-none">No hosts match</div>';
  menu.hidden = !ngOpen;
  $('listHosts').closest('.card').classList.toggle('ng-open', ngOpen); // the card grows while the suggestions show, so they are not cut off
}
const ngAdd = (id) => { if (!ngPicked.includes(id)) ngPicked.push(id); ngText = ''; ngOpen = false; ngRender(); };
$('listHosts').addEventListener('input', (e) => { if (e.target.dataset.role === 'ngInput') { ngText = e.target.value; ngOpen = true; ngFill(); } });
$('listHosts').addEventListener('focusin', (e) => { if (e.target.dataset.role === 'ngInput' && !ngOpen) { ngOpen = true; ngFill(); } });
$('listHosts').addEventListener('keydown', (e) => {
  if (e.target.dataset.role !== 'ngInput') return;
  if (e.key === 'Escape') { ngOpen = false; ngFill(); }
  if (e.key === 'Enter') { const first = $('listHosts').querySelector('[data-ng-add]'); if (first) { e.preventDefault(); ngAdd(first.dataset.ngAdd); } }
});
$('listHosts').addEventListener('click', (e) => {
  const add = e.target.closest('[data-ng-add]'), rm = e.target.closest('[data-ng-remove]');
  if (add) ngAdd(add.dataset.ngAdd);
  else if (rm) { ngPicked = ngPicked.filter((i) => i !== rm.dataset.ngRemove); ngRender(); }
});
document.addEventListener('click', (e) => { if (ngOpen && e.target.isConnected && !$('listHosts').contains(e.target)) { ngOpen = false; ngFill(); } });
async function loadGroups() {
  const [h, lists] = await Promise.all([api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  ngHosts = h; ngPicked = ngPicked.filter((id) => h.some((x) => x.id === id)); ngRender();
  $('groupList').innerHTML = groupsHtml(h, lists, { deletable: true });
}
$('hosts/groups').onclick = async (e) => {
  foldGroup(e);
  if (e.target.dataset.delList) { await api('DELETE', `/api/lists/${e.target.dataset.delList}`); loadGroups(); }
};
$('mkList').onclick = async () => {
  try { await api('POST', '/api/lists', { name: $('listName').value, hostIds: ngPicked }); $('listName').value = ''; $('listMsg').textContent = ''; ngPicked = []; ngText = ''; loadGroups(); }
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
    files: { label: 'Files', tip: 'Raw files pulled from the host into the output folder, with SHA-256 hashes.',
      svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>' },
    both: { label: 'Records + files', tip: 'Rows of data and raw files pulled into the output folder.',
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

// ---- The search / filter controls (View Collections, View Actions and the New Hunt / New Response dialogs share them) ----
// Search box on top (name, description and script text, matched server-side). Under it: the PowerShell / Linux toggle (owned by the
// caller) with the "Dependencies" and "★ Favourites" switches on the same line (`chips`), then dropdowns to filter by tag (a script
// must have ALL picked tags) and by type (footprint: none/transient; returns: records/files/both; kind: command/artefact/tool - within one group any
// picked value matches, across groups all must). Whatever is picked is added underneath as
// removable chips. `onChange(server)` is called after a change: true means ask the server again, false means redraw what is loaded.
function makeFilter({ box, chips, search, url, noun, favKind, getType, onChange }) {
  const f = { query: '', tags: [], kinds: [], deps: false, favOnly: false, tagList: [], favs: new Set() };
  let timer, menuOpen = false, tagOpen = false, tagText = ''; // the type menu, the tag suggestions, and what is typed in the tag box
  f.active = () => !!(f.query || f.tags.length || f.kinds.length || f.deps || f.favOnly);
  // the filters the server does not handle: type and favourites
  f.keep = (h) => (!f.favOnly || f.favs.has(h.id)) && GROUPS.every((g) => { const picked = f.kinds.filter((k) => k.startsWith(g + ':')); return !picked.length || picked.includes(`${g}:${h[g]}`); });
  f.qs = () => {
    const params = new URLSearchParams();
    if (f.query) params.set('q', f.query);
    if (f.tags.length) params.set('tags', f.tags.join(','));
    if (f.deps) params.set('deps', '1');
    return params.toString();
  };
  const GROUPS = ['footprint', 'returns', 'kind'];
  const kindChip = (k) => { const [g, v] = k.split(':'), x = MI[g].values[v]; return `${MI_SVG(x.svg)}<span>${esc(x.label)}</span>`; };
  f.render = () => {
    const availTags = f.tagList.filter((t) => !f.tags.includes(t.tag)), availKinds = GROUPS.flatMap((g) => Object.keys(MI[g].values).map((v) => `${g}:${v}`)).filter((k) => !f.kinds.includes(k));
    chips.innerHTML = `
      <button type="button" class="tagchip ${f.favOnly ? 'on' : ''}" data-favs="1" aria-pressed="${f.favOnly}" title="Only your favourite ${noun}s">★ Favourites</button>`;
    box.innerHTML = `
    <div class="tf-row">
      <div class="tf-dd">
        <input type="text" class="tf-taginput" data-role="tagInput" placeholder="${f.tagList.length ? (availTags.length ? 'Filter by tag…' : 'All tags selected') : 'No tags'}" value="${esc(tagText)}" ${availTags.length ? '' : 'disabled'} autocomplete="off" spellcheck="false">
        <div class="tf-menu" data-role="tagMenu" hidden></div>
      </div>
      <div class="tf-dd">
        <button type="button" class="tf-ddbtn" data-typemenu="1" ${availKinds.length ? '' : 'disabled'} aria-expanded="${menuOpen}">${availKinds.length ? 'Filter by type…' : 'All types selected'}<span>▾</span></button>
        <div class="tf-menu" ${menuOpen && availKinds.length ? '' : 'hidden'}>${GROUPS.map((g) => { const mine = availKinds.filter((k) => k.startsWith(g + ':')); return mine.length ? `<div class="tf-mh">${esc(MI[g].title)}</div>${mine.map((k) => `<button type="button" data-kind-add="${k}" title="${esc(MI[g].values[k.split(':')[1]].tip)}">${kindChip(k)}</button>`).join('')}` : ''; }).join('')}</div>
      </div>
    </div>
    ${f.tags.length || f.kinds.length ? `<div class="tf-chips">${f.tags.map((t) => `<button type="button" class="tagchip on" data-remove-tag="${esc(t)}" title="Remove this tag">${esc(t)}<b class="x">×</b></button>`).join('')}${f.kinds.map((k) => `<button type="button" class="tagchip on kindchip" data-remove-kind="${k}" title="Remove this filter">${kindChip(k)}<b class="x">×</b></button>`).join('')}</div>` : ''}`;
    fillTagMenu();
  };
  // the tag suggestions: the tags not picked yet whose name contains what was typed
  function fillTagMenu() {
    const menu = box.querySelector('[data-role=tagMenu]'); if (!menu) return;
    const q = tagText.trim().toLowerCase(), hits = f.tagList.filter((t) => !f.tags.includes(t.tag) && (!q || t.tag.toLowerCase().includes(q)));
    menu.innerHTML = hits.map((t) => `<button type="button" data-tag-add="${esc(t.tag)}">${esc(t.tag)} <span class="dim">(${t.count})</span></button>`).join('') || '<div class="tf-none">No tags match</div>';
    menu.hidden = !tagOpen;
  }
  // the tags of the current type and this user's favourites (the list itself is fetched by the caller)
  f.loadMeta = async () => {
    const [tags, fv] = await Promise.all([api('GET', `${url}/tags?type=${getType()}`), api('GET', '/api/favourites').catch(() => ({}))]);
    f.tagList = [...tags].sort((x, y) => x.tag.localeCompare(y.tag, undefined, { sensitivity: 'base' })); f.favs = new Set(fv[favKind] || []);
    f.render();
  };
  f.reset = () => { f.query = ''; f.tags = []; f.kinds = []; f.deps = false; f.favOnly = false; menuOpen = false; tagOpen = false; tagText = ''; search.value = ''; };
  const toggleTag = (tag) => { f.tags = f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag]; onChange(true); };
  const pickTag = (tag) => { tagText = ''; tagOpen = false; toggleTag(tag); };
  box.addEventListener('input', (e) => { if (e.target.dataset.role !== 'tagInput') return; tagText = e.target.value; tagOpen = true; fillTagMenu(); });
  box.addEventListener('focusin', (e) => { if (e.target.dataset.role === 'tagInput' && !tagOpen) { tagOpen = true; menuOpen = false; box.querySelector('.tf-ddbtn')?.setAttribute('aria-expanded', 'false'); box.querySelector('.tf-menu:not([data-role])')?.setAttribute('hidden', ''); fillTagMenu(); } });
  box.addEventListener('keydown', (e) => {
    if (e.target.dataset.role !== 'tagInput') return;
    if (e.key === 'Escape') { tagOpen = false; fillTagMenu(); }
    if (e.key === 'Enter') { const first = box.querySelector('[data-tag-add]'); if (first) { e.preventDefault(); pickTag(first.dataset.tagAdd); } }
  });
  box.onclick = (e) => {
    const d = (e.target.closest('[data-typemenu],[data-kind-add],[data-remove-kind],[data-remove-tag],[data-tag-add]') || {}).dataset || {};
    if (d.tagAdd) { pickTag(d.tagAdd); return; }
    if (d.typemenu) { menuOpen = !menuOpen; tagOpen = false; f.render(); return; }
    if (d.kindAdd) { f.kinds = [...f.kinds, d.kindAdd]; menuOpen = false; f.render(); onChange(false); return; }
    if (d.removeKind) { f.kinds = f.kinds.filter((k) => k !== d.removeKind); f.render(); onChange(false); return; }
    if (d.removeTag) toggleTag(d.removeTag);
  };
  chips.onclick = (e) => {
    const d = (e.target.closest('[data-deps],[data-favs]') || {}).dataset || {};
    if (d.favs) { f.favOnly = !f.favOnly; f.render(); onChange(false); return; }
    if (d.deps) { f.deps = !f.deps; f.render(); onChange(true); }
  };
  // a click outside closes the type menu (a click on a button that was just redrawn is detached from the page, so it is not "outside")
  document.addEventListener('click', (e) => { if ((menuOpen || tagOpen) && e.target.isConnected && !box.contains(e.target)) { menuOpen = false; tagOpen = false; f.render(); } });
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { f.query = search.value.trim(); onChange(true); }, 200);
  };
  // "Clear all" sits to the right of the search box: empties the search and switches off every filter (the PowerShell / Linux toggle stays)
  const wrap = document.createElement('div'); wrap.className = 'fl-search';
  const clearAll = document.createElement('button'); clearAll.type = 'button'; clearAll.className = 'act sec fl-clear'; clearAll.textContent = 'Clear all';
  search.parentNode.insertBefore(wrap, search); wrap.append(search, clearAll);
  search.removeAttribute('style');
  clearAll.onclick = () => { clearTimeout(timer); f.reset(); f.render(); onChange(true); };
  return f;
}

// ---- Settings: View Collections / View Actions ----
// One library view serves both: a searchable, filterable list of scripts on the left and the open
// script on the right. `id` prefixes the element ids (collectionList, actionList, ...); `url` is the API root.
function makeLibrary({ id, url, noun, folder, showParams }) {
  const el = (s) => $(id + s);
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  let type = 'powershell', all = [], req = 0, open = null;
  const favKind = id === 'action' ? 'actions' : 'collections';
  const f = makeFilter({ box: el('TagFilter'), chips: el('Chips'), search: el('Search'), url, noun, favKind, getType: () => type, onChange: (server) => (server ? load() : renderList()) });
  const starHtml = (sid) => f.favs.has(sid) ? '<span class="fav on" title="One of your favourites">★</span>' : '';

  async function load() {
    const r = ++req;
    const qs = f.qs();
    const [list] = await Promise.all([api('GET', `${url}${qs ? `?${qs}` : ''}`), f.loadMeta()]);
    if (r !== req) return; // a newer search is in flight
    all = list;
    // the box on the right is never empty: with nothing open yet, the first script in the list is opened
    if (!open) open = all.find((h) => h.type === type)?.id ?? null;
    renderList();
    if (open) show(open); // refresh the open script, e.g. after uploading a binary
  }

  // A script with binary dependencies is red until every one is uploaded, then light green.
  // Scripts with no dependencies keep the normal look.
  function depState(h) {
    if (h.missingDependencies.length) return 'unmet';
    return h.dependencies.length ? 'met' : '';
  }
  function renderList() {
    const keep = f.keep;
    const count = (t) => all.filter((h) => h.type === t && keep(h)).length;
    document.querySelectorAll(`#${id}Toggle button`).forEach((b) => {
      b.classList.toggle('on', b.dataset.type === type);
      // While searching, show how many hits each side has so matches in the other tab aren't missed.
      b.textContent = (b.dataset.type === 'bash' ? 'Linux' : 'PowerShell') + (f.active() ? ` (${count(b.dataset.type)})` : '');
    });
    const dir = `${folder}/${type === 'bash' ? 'bash' : 'powershell'}`;
    const tag = (m) => !m ? '' : [m.name && 'name', m.script && 'script'].filter(Boolean).join(' + ');
    el('List').innerHTML = all.filter((h) => h.type === type && keep(h)).map((h) => `<div class="collection-item ${h.id === open ? 'on' : ''} ${depState(h)}" data-id="${esc(h.id)}">
    ${h.verified ? VERIFIED : ''}${starHtml(h.id)}<div class="hn">${esc(h.name)} ${h.match ? `<span class="mtag">${tag(h.match)}</span>` : ''}${h.warnings.length ? `<span class="mwarn" title="${esc(h.warnings.join('; '))}">⚠</span>` : ''}</div>
    <div class="hd" title="${esc(h.description)}">${esc(h.description)}</div>
    <div class="hmeta">${metaIcons(h)}</div>
    ${h.missingDependencies.length ? `<div class="hmiss" title="Missing: ${esc(h.missingDependencies.join(', '))}">Some dependencies missing</div>`
      : h.dependencies.length ? '<div class="hready" title="Every required binary has been uploaded">Dependencies ready</div>' : ''}
    ${h.match && !h.match.name && h.match.line ? `<div class="hl">${esc(h.match.line)}</div>` : ''}</div>`).join('')
    || (f.active() ? `<p class="dim" style="margin:0">No ${type === 'bash' ? 'Linux' : 'PowerShell'} ${f.favOnly ? 'favourite ' : ''}${noun}s match${f.query ? ` "${esc(f.query)}"` : ''}${f.tags.length ? ` with tag${f.tags.length > 1 ? 's' : ''} ${f.tags.map(esc).join(' + ')}` : ''}${f.deps ? ' that need a dependency' : ''}.</p>`
      : `<p class="dim" style="margin:0">No ${noun}s found. Add scripts to <code>${dir}</code>.</p>`);
  }
  el('Toggle').onclick = (e) => {
    if (!e.target.dataset.type) return;
    type = e.target.dataset.type;
    f.tags = []; // tags differ between PowerShell and Linux scripts
    open = null; el('Detail').innerHTML = ''; el('Detail').classList.remove('unmet', 'met');
    load();
  };
  // Clicking a script shows it in the right-hand box; clicking one of its tags filters by it.
  el('List').onclick = (e) => {
    const item = e.target.closest('.collection-item'); if (!item) return;
    open = item.dataset.id;
    renderList();
    show(open);
  };
  el('Detail').onclick = async (e) => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    const sid = b.dataset.fav, on = !f.favs.has(sid);
    try {
      const fv = await api('PUT', `/api/favourites/${favKind}`, { id: sid, on });
      f.favs = new Set(fv[favKind] || []);
      f.render(); renderList(); show(sid);
    } catch (err) { toast(err.message, 'bad'); }
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
  // Parameters as "Required: a, b" and "Optional: c"; a script that takes none says so in green.
  const paramsHtml = (h) => {
    const req = h.parameters.filter((p) => !h.optionalParameters.includes(p)), opt = h.parameters.filter((p) => h.optionalParameters.includes(p));
    if (!h.parameters.length) return '<span class="ok">None</span>';
    return [req.length && `<div><b>Required:</b> ${req.map(esc).join(', ')}</div>`, opt.length && `<div><b>Optional:</b> ${opt.map(esc).join(', ')}</div>`].filter(Boolean).join('');
  };
  function renderDetail(h) {
    const deps = h.dependencies.length
      ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ' (uploaded)'}</span>`).join('')
      : '<span class="dim">None</span>';
    return `
    ${h.verified ? VERIFIED : ''}<button class="fav-btn ${f.favs.has(h.id) ? 'on' : ''}" data-fav="${esc(h.id)}" title="${f.favs.has(h.id) ? 'Remove from your favourites' : 'Add to your favourites'}" aria-pressed="${f.favs.has(h.id)}">${f.favs.has(h.id) ? '★' : '☆'}</button><div class="hd-name">${esc(h.name)}</div>
    <div class="hd-file">${esc(h.id)}</div>
    ${metaIcons(h, true)}
    ${h.missingDependencies.length ? `<div class="hd-unmet">Some dependencies missing: ${h.missingDependencies.map(esc).join(', ')}. Upload them in Settings → Binaries.</div>` : ''}
    ${h.warnings.length ? `<div class="hd-warn">${h.warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="hd-label hd-label-desc">Description</div>
    <div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}</div>
    <div class="hd-label hd-label-dep">Dependencies</div>
    <div class="hd-deps">${deps}</div>
    <div class="hd-label hd-label-tags">Tags</div>
    <div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
    <div class="hd-label hd-label-dep">Parameters</div>
    <div class="hd-params">${paramsHtml(h)}</div>
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
    el('Upload').hidden = false;
    el('Submit').textContent = `Add ${noun[0].toUpperCase() + noun.slice(1)}`;
    el('Cancel').hidden = true;
    el('Msg').textContent = '';
    setType('powershell');
    setItemsOn(false);
    if (hasMeta) for (const g of Object.keys(META)) setMeta(g, g === 'returns' ? 'records' : g === 'kind' ? 'command' : 'none');
  }
  // Upload: pick a .ps1 or .sh file; the server reads its header (name, description, tags and so on) and the form is filled in from it.
  // The user checks it and presses Add, so the usual rules (a description, a file name that is free, ...) still apply.
  async function fromFile(file) {
    const ext = (/\.(ps1|sh)$/i.exec(file.name) || [])[1];
    if (!ext) { el('Msg').textContent = 'Choose a .ps1 or .sh file.'; el('Msg').className = 'bad'; return; }
    if (file.size > 200 * 1024) { el('Msg').textContent = 'That file is over the 200 KB limit.'; el('Msg').className = 'bad'; return; }
    try {
      const t = ext.toLowerCase() === 'ps1' ? 'powershell' : 'bash';
      const p = await api('POST', `${url}/parse`, { type: t, text: await file.text() });
      reset(); setType(t);
      const base = file.name.replace(/\.(ps1|sh)$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 64);
      el('File').value = base; el('Name').value = p.name || base; el('Desc').value = p.description; el('Tags').value = p.tags.join(', ');
      el('Script').value = p.body;
      list = itemKey === 'parameters' ? p.parameters.map((x) => (p.optionalParameters.includes(x) ? `${x}?` : x)) : [...p[itemKey]];
      setItemsOn(list.length > 0);
      if (hasMeta) for (const g of Object.keys(META)) setMeta(g, g === 'footprint' && p.footprint === 'persistent' ? 'transient' : p[g]);
      el('Msg').className = p.hasHeader && p.description ? 'ok' : 'bad';
      el('Msg').textContent = p.hasHeader ? `Loaded ${file.name}. Check the details, then press Add.` : `Loaded ${file.name}, which has no header, so add a name and a description before pressing Add.`;
    } catch (e) { el('Msg').textContent = e.message; el('Msg').className = 'bad'; }
  }
  el('Upload').onclick = () => el('UploadFile').click();
  el('UploadFile').onchange = () => { const f = el('UploadFile').files[0]; el('UploadFile').value = ''; if (f) fromFile(f); };
  function edit(h) {
    reset();
    el('Upload').hidden = true; // an existing script is being edited
    editing = h.file;
    setType(h.type);
    el('Type').classList.add('locked');
    el('File').value = h.fileBase; el('File').readOnly = true;
    el('Name').value = h.name; el('Desc').value = h.description;
    el('Tags').value = h.tags.join(', ');
    el('Script').value = h.body;
    list = itemKey === 'parameters' ? h.parameters.map((p) => (h.optionalParameters.includes(p) ? `${p}?` : p)) : [...h[itemKey]];
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
        <div class="uh-btns"><button class="tagchip" data-act="view">${viewing === h.id ? 'Hide' : 'View'}</button><button class="tagchip" data-act="edit" data-perm="${noun === 'collection' ? 'collections.manage' : 'actions.manage'}" data-perm-what="edit ${noun}s">Edit</button><button class="del" data-act="delete" data-perm="${noun === 'collection' ? 'collections.manage' : 'actions.manage'}" data-perm-what="delete ${noun}s">Delete</button></div>
      </div>
      <div class="hd" title="${esc(h.description)}">${esc(h.description)}</div>
      ${h.tags.length ? `<div class="htags">${h.tags.map((t) => `<span class="htag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${h[itemKey].length ? `<div class="uh-deps">${items.label}: ${(itemKey === 'parameters' ? h.parameters.map((p) => (h.optionalParameters.includes(p) ? `${p} (optional)` : p)) : h[itemKey]).map(esc).join(', ')}</div>` : ''}
      ${viewing === h.id ? `<pre class="code">${highlight(h.body, h.type)}</pre>` : ''}</div>`).join('')
      || `<p class="dim" style="margin:0">No custom ${noun}s yet. Use the form on the left.</p>`;
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
  items: { key: 'parameters', label: 'Parameters', placeholder: { powershell: 'ProcessName  (end with ? if optional)', bash: 'PROCESS_NAME  (end with ? if optional)' } },
  hints: {
    powershell: "# Each parameter becomes a variable of the same name, e.g. $ProcessName.\nif (-not $ProcessName) { throw 'ProcessName is required' }\nStop-Process -Name $ProcessName -Force",
    bash: '# Each parameter becomes a variable of the same name, e.g. $PROCESS_NAME.\n[ -n "$PROCESS_NAME" ] || { echo "PROCESS_NAME is required" >&2; exit 2; }\npkill -x -- "$PROCESS_NAME"',
  },
});

// ---- Shared by Hunt and Respond ----
// A green R after a name marks a run that came from a recurring schedule.
// Small tags after a name: Q for a quick hunt or response (one host, from the Shell tab), a green R for a recurring run.
const schedTag = (r) => (r.quick ? '<span class="qtag" title="Quick run: one host, started from the Shell tab">Q</span>' : '') + (r.scheduleId ? '<span class="rtag" title="Ran on a recurring schedule">R</span>' : '');
// Confirms, then deletes a hunt or response: its record and its output folder. A running one can't be deleted.
async function confirmDeleteRun(r, url, noun) {
  if (r.status === 'running') { toast(`That ${noun} is still running. Wait for it to finish.`); return false; }
  if (!confirm(`Delete the ${noun} "${huntName(r)}"?\n\nThis removes it from the list and deletes its output folder${r.outputPath ? ` (output/${r.outputPath})` : ''}. This cannot be undone.`)) return false;
  try { await api('DELETE', url); return true; } catch (e) { toast(e.message); return false; }
}

// The recurring options in the New Hunt and New Response dialogs (prefix 'hm' or 'rm'): run every X minutes, until a time or until
// it is turned off, with the number of runs worked out from the system clock as you type.
const recHtml = (p) => `<div class="rec-row"><span>Run every</span><input type="number" id="${p}Every" min="1" step="1" value="60"><span>minutes</span></div>
  <div class="rec-row"><span>Until</span><label class="rec-opt"><input type="radio" name="${p}Until" id="${p}UntilTime" checked> <input type="datetime-local" id="${p}UntilAt"></label>
    <label class="rec-opt"><input type="radio" name="${p}Until" id="${p}UntilForever"> Until I turn it off</label></div>
  <div class="rec-sum" id="${p}RecSum"></div>`;
const recLocal = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const recFmt = (d) => d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
function recRead(p) {
  const every = Number($(p + 'Every').value), now = Date.now(), s = every === 1 ? '' : 's';
  if (!Number.isInteger(every) || every < 1) return { error: 'Enter a whole number of minutes (1 or more).' };
  if ($(p + 'UntilForever').checked) return { schedule: { everyMinutes: every, until: { type: 'forever' } }, text: `Runs now, then every ${every} minute${s}. It runs indefinitely until you turn it off.` };
  const at = new Date($(p + 'UntilAt').value).getTime();
  if (!Number.isFinite(at)) return { error: 'Pick the date and time it should run until.' };
  if (at <= now) return { error: 'The end time must be in the future.' };
  const n = Math.floor((at - now) / (every * 60000)) + 1, last = new Date(now + (n - 1) * every * 60000);
  return { schedule: { everyMinutes: every, until: { type: 'time', at: new Date(at).toISOString() } },
    text: `Runs now, then every ${every} minute${s} until ${recFmt(new Date(at))}. That is ${n} run${n === 1 ? '' : 's'} in total${n > 1 ? `, the last at ${recFmt(last)}` : ''}.` };
}
function recUpdate(p) {
  const r = recRead(p), el = $(p + 'RecSum');
  el.textContent = r.error || r.text; el.className = `rec-sum ${r.error ? 'bad' : ''}`;
  $(p + 'UntilAt').disabled = $(p + 'UntilForever').checked;
}
function recToggle(p, on) {
  $(p + 'RecBox').hidden = !on;
  if (on) { if (!$(p + 'UntilAt').value) $(p + 'UntilAt').value = recLocal(new Date(Date.now() + 86400000)); recUpdate(p); }
}
function recInit(p) {
  $(p + 'RecBox').innerHTML = recHtml(p);
  $(p + 'RecBox').oninput = $(p + 'RecBox').onchange = () => recUpdate(p);
  setInterval(() => { if (!$(p + 'RecBox').hidden) recUpdate(p); }, 10000); // the count follows the clock
}

// ---- Burrow: Hunt ----
// Top: the previous hunts (name, who ran it, status, started, finished, elapsed). Click one to fill the box below it with what it
// ran, the files it pulled back, its errors and downloads. New Hunt opens a dialog in three steps: who, which collections, name.
const bh = { runs: [], sel: null, tab: 'details' };
const fmtDur = (ms) => {
  if (ms == null || !(ms >= 0)) return '';
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m ${s % 60}s` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
const huntElapsed = (r) => fmtDur((r.finishedAt ? new Date(r.finishedAt) : Date.now()) - new Date(r.startedAt));
const huntStatus = (r) => {
  const cancelling = r.status === 'running' && r.cancelRequested;
  const text = cancelling ? 'cancelling…' : r.status.replaceAll('_', ' ');
  return `<span class="${r.status === 'completed' ? 'ok' : cancelling || r.status === 'completed_with_errors' || r.status === 'cancelled' ? 'st-warn' : r.status === 'running' ? 'st-run' : 'bad'}">${esc(text[0].toUpperCase() + text.slice(1))}</span>`;
};
// Progress of a hunt or response host by host: a bar of finished / total per host, what it is working on now and how long it has taken.
// Works for a run in progress (refreshed every 2 s with the list) and for one that has finished.
function hostProgressHtml(r, isHunt) {
  const nameKey = isHunt ? 'collectionName' : 'actionName', noun = isHunt ? 'collection' : 'action';
  const hosts = new Map();
  for (const x of r.results) { if (!hosts.has(x.hostId)) hosts.set(x.hostId, { label: x.hostLabel, address: x.address, items: [] }); hosts.get(x.hostId).items.push(x); }
  const isDone = (x) => x.status === 'ok' || x.status === 'error' || x.status === 'cancelled';
  const n = (list, s) => list.filter((x) => x.status === s).length;
  const bar = (list) => {
    const t = list.length || 1, seg = (s, cls) => (n(list, s) ? `<i class="${cls}" style="width:${(n(list, s) / t) * 100}%"></i>` : '');
    return `<span class="pbar">${seg('ok', 'ok')}${seg('error', 'bad')}${seg('cancelled', 'can')}${seg('running', 'run')}</span>`;
  };
  const rows = [...hosts.values()].map((h) => {
    const list = h.items, done = list.filter(isDone).length, running = list.find((x) => x.status === 'running');
    const starts = list.map((x) => x.startedAt).filter(Boolean).sort(), ends = list.filter(isDone).map((x) => x.finishedAt).filter(Boolean).sort();
    const finished = done === list.length;
    const el = starts.length ? fmtDur((finished && ends.length ? new Date(ends[ends.length - 1]) : Date.now()) - new Date(starts[0])) : '';
    let state;
    if (running) {
      const t = running.transfer;
      state = running.waiting ? '<span class="st-warn">Waiting</span> <span class="dim">for a free file-transfer slot</span>' : `<span class="st-run">Running</span> <span class="dim">${esc(running[nameKey] || '')}${t && t.total ? ` · pulling files ${bbFmt(t.bytes)} of ${bbFmt(t.total)}` : ''}</span>`;
    } else if (!finished) state = '<span class="dim">Waiting</span>';
    else {
      const bad = n(list, 'error'), can = n(list, 'cancelled');
      state = can ? `<span class="st-warn">Cancelled</span> <span class="dim">${can} not finished${bad ? `, ${bad} failed` : ''}</span>` : bad ? `<span class="bad">${bad} failed</span>` : '<span class="ok">Done</span>';
    }
    return `<tr><td>${esc(h.label || h.address)}${h.label && h.label !== h.address ? ` <span class="dim">${esc(h.address)}</span>` : ''}</td><td>${bar(list)}</td><td class="num dim">${done}/${list.length}</td><td>${state}</td><td class="num dim">${esc(el)}</td></tr>`;
  }).join('');
  const total = r.results.length, done = r.results.filter(isDone).length, hostsDone = [...hosts.values()].filter((h) => h.items.every(isDone)).length;
  return `<div class="hd-label">Progress by host</div>
    <div class="pall">${bar(r.results)}<span>${done} of ${total} ${noun} run${total === 1 ? '' : 's'} finished · ${hostsDone} of ${hosts.size} host${hosts.size === 1 ? '' : 's'} done</span>${r.status === 'running' && !r.cancelRequested ? `<a class="act sec bad" data-cancel="${esc(r.id)}" data-perm="${isHunt ? 'hunts.run' : 'actions.run'}" data-perm-what="cancel ${isHunt ? 'hunts' : 'responses'}" title="Stop this ${isHunt ? 'hunt' : 'response'}">Cancel ${isHunt ? 'hunt' : 'response'}</a>` : r.status === 'running' ? '<span class="st-warn">Cancelling…</span>' : ''}</div>
    <table class="bh"><thead><tr><th>Host</th><th style="width:34%">Progress</th><th class="num">Done</th><th>Now</th><th class="num">Elapsed</th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Cancels a running hunt or response after a warning. A response changes hosts, so its warning is stronger and the server asks for the confirmation too.
async function cancelRunUi(r, isHunt) {
  const name = huntName(r);
  const msg = isHunt
    ? `Cancel the hunt "${name}"?\n\nThe host being worked on is cut off and collections that have not started are skipped. What was already collected is kept.`
    : `WARNING: cancel the response "${name}"?\n\n• Actions change hosts. The one in progress is cut off part-way and may be partly applied, or still finish on the host.\n• Actions not yet started are skipped.\n• Check the affected hosts afterwards (the response log shows what was cut off).`;
  if (!confirm(msg)) return false;
  try { await api('POST', isHunt ? `/api/runs/${r.id}/cancel` : `/api/responses/${r.id}/cancel`, isHunt ? {} : { confirm: true }); toast('Cancelling…'); return true; } catch (e) { toast(e.message); return false; }
}
const huntName = (r) => r.name || r.collectionName || 'Hunt';

async function loadBurrowHunts() {
  let runs = [];
  try { runs = (await api('GET', '/api/runs')).filter((r) => r.kind !== 'response'); } catch (e) { $('bhList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  bh.runs = runs;
  if (bh.sel && !runs.some((r) => r.id === bh.sel)) { bh.sel = null; $('bhDetail').innerHTML = BH_HINT; }
  renderHuntList();
  clearTimeout(huntPoll);
  if (bh.sel && runs.find((r) => r.id === bh.sel)?.status === 'running') showHunt(bh.sel);
  if (runs.some((r) => r.status === 'running') && isActive('burrow/hunt')) huntPoll = setTimeout(loadBurrowHunts, 2000);
}
let huntPoll;
const BH_HINT = '<p class="dim" style="margin:0">Select a hunt to see its files, errors and downloads.</p>';
function renderHuntList() {
  $('bhList').innerHTML = bh.runs.length
    ? `<table class="bh"><thead><tr><th>Hunt</th><th>Run by</th><th>Status</th><th>Started</th><th>Finished</th><th>Elapsed</th><th></th></tr></thead><tbody>${bh.runs.map((r) => `<tr class="bh-row ${r.id === bh.sel ? 'on' : ''}" data-id="${esc(r.id)}">
        <td class="bh-name">${esc(huntName(r))}${schedTag(r)}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td><td>${huntStatus(r)}</td>
        <td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td><td class="dim">${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</td><td class="dim">${esc(huntElapsed(r))}</td><td class="bh-del">${r.status === 'running' && !r.cancelRequested ? `<a class="dl bad" data-cancel="${esc(r.id)}" data-perm="hunts.run" data-perm-what="cancel hunts" title="Stop this run">Cancel</a> ` : ''}<a class="dl bad" data-del="${esc(r.id)}" data-perm="hunts.run" data-perm-what="delete hunts" title="Delete this hunt and its output folder">Delete</a></td></tr>`).join('')}</tbody></table>`
    : '<p class="dim" style="margin:0">No hunts yet. Use New Hunt to run collections against your hosts.</p>';
}
// A collection or action that needs a binary that has not been uploaded cannot be picked: clicking it says what is missing.
function showMissingBinary(item) {
  $('errTitle').textContent = 'Required binary missing';
  $('errWhere').textContent = item.name;
  $('errBody').textContent = `Required binary missing: ${item.missingDependencies.join(', ')}\n\nUpload it under Settings → Binaries, then pick this again.`;
  $('errModal').hidden = false; $('errOk').focus();
}
// Clicking a host's error opens its message in a small popup.
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-errmsg]'); if (!a) return;
  $('errTitle').textContent = 'Error';
  $('errWhere').textContent = `${a.dataset.errhost} · ${a.dataset.erritem}`;
  $('errBody').textContent = a.dataset.errmsg;
  $('errModal').hidden = false; $('errOk').focus();
});
const closeErr = () => { $('errModal').hidden = true; };
$('errOk').onclick = $('errX').onclick = closeErr;
$('errModal').onclick = (e) => { if (e.target.id === 'errModal') closeErr(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('errModal').hidden) closeErr(); });
// The box under the hunt/response list. A header with the downloads, then three tabs: Details (what ran, the facts and the error log),
// Files (what it collected, each with a download) and Notebook (the hunt's or response's JSON file to scroll through).
// `kind` is 'hunt' or 'response'; the tab you pick stays selected as you click from one run to the next.
const BD_TABS = [['details', 'Details'], ['files', 'Files'], ['notebook', 'Notebook']];
async function bdNotebook(url) {
  try {
    let t = JSON.stringify(await api('GET', url), null, 2);
    const MAX = 1500000, cut = t.length > MAX;
    if (cut) t = t.slice(0, MAX);
    return `<pre class="code bd-json">${highlightJson(t)}</pre>${cut ? '<p class="dim" style="margin:6px 0 0">Showing the first part only. Download the file for all of it.</p>' : ''}`;
  } catch (e) { return `<p class="bad">${esc(e.message)}</p>`; }
}
function bdRender({ kind, r, events, files, tab, notebook }) {
  // the run's own files (log, All_Hosts) first, then each host's folder
  files = [...files].sort((a, b) => (a.folder === '') !== (b.folder === '') ? (a.folder === '' ? -1 : 1) : a.folder.localeCompare(b.folder, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const isHunt = kind === 'hunt', noun = isHunt ? 'hunt' : 'response';
  const hosts = new Set(r.results.map((x) => x.hostId)).size, idKey = isHunt ? 'collectionId' : 'actionId', nameKey = isHunt ? 'collectionName' : 'actionName';
  const rows = [...new Map(r.results.map((x) => [x[idKey], x[nameKey]])).entries()].map(([cid, name]) => {
    const mine = r.results.filter((x) => x[idKey] === cid), ok = mine.filter((x) => x.status === 'ok').length, bad = mine.filter((x) => x.status === 'error').length;
    const hostsCell = mine.map((x) => x.status === 'ok' ? `<span class="hres ok">${esc(x.address)} OK</span>`
      : x.status === 'error' ? `<a class="hres bad" data-errmsg="${esc(x.error || 'No error message was recorded.')}" data-errhost="${esc(x.address)}" data-erritem="${esc(name)}" title="Click to see the error">${esc(x.address)} error</a>`
      : `<span class="hres dim">${esc(x.address)} ${esc(x.status)}</span>`).join('');
    if (!isHunt) {
      const ps = (r.parameterNames || {})[cid] || [];
      return `<tr><td>${esc(name)}</td><td class="dim">${ps.length ? esc(ps.join(', ')) : '-'}</td><td>${hostsCell}</td></tr>`;
    }
    return `<tr><td>${esc(name)}</td><td>${hostsCell}</td><td class="num">${mine.reduce((n, x) => n + (x.rows || 0), 0)}</td></tr>`;
  }).join('');
  const problems = events.filter((e) => e.kind === 'error' || e.kind === 'warn' || /^(error|warning|unconfirmed)/.test(e.outcome || ''));
  const dl = (path, text, cls = 'act sec') => `<a class="${cls}" href="/api/browse/download?path=${encodeURIComponent(path)}" download data-perm="hunts.export" data-perm-what="download ${noun} results">${text}</a>`;
  const json = files.find((f) => /_All_Hosts.json$/.test(f.name) || /^(hunt|response).json$/.test(f.name)), jsonName = json ? json.name : '';
  const btns = `<div class="bd-btns bd-files-btns">${r.outputPath ? `<a class="act" href="/api/runs/${esc(r.id)}/download" download data-perm="hunts.export" data-perm-what="download ${noun} results" title="The whole ${noun} folder as one zip file">Download all (zip)</a>` : ''}<a class="act sec" href="/api/runs/${esc(r.id)}/log.csv" download data-perm="hunts.export" data-perm-what="export logs">Download log (CSV)</a>${json ? dl(json.path, 'Download JSON') : ''}${r.outputPath ? `<a class="act sec" data-evidence="/output/${esc(r.outputPath)}">Open in Browse</a>` : ''}</div>`;
  const head = `<div class="bd-head"><div><div class="hd-name">${esc(huntName(r))}${schedTag(r)}</div><div class="hd-file">${esc(r.outputPath ? `output/${r.outputPath}` : 'No output folder')}</div></div>
      <div class="toggle bd-tabs" role="tablist">${BD_TABS.map(([k, label]) => `<button type="button" role="tab" data-bdtab="${k}" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}">${label}${k === 'files' ? ` (${files.length})` : ''}</button>`).join('')}</div></div>`;
  let pane;
  if (tab === 'files') {
    pane = btns + (files.length ? `<table class="bh"><thead><tr><th>Folder</th><th>File</th><th class="num">Size</th><th></th></tr></thead><tbody>${files.map((f) => `<tr><td class="dim">${esc(f.folder || '/')}</td><td>${esc(f.name)}</td><td class="num dim">${bbFmt(f.size)}</td><td class="num">${dl(f.path, 'Download', 'dl')}</td></tr>`).join('')}</tbody></table>`
      : `<p class="dim" style="margin:0">${r.status === 'running' ? 'Nothing yet. Files appear as hosts finish.' : 'No files were saved.'}</p>`);
  } else if (tab === 'notebook') {
    pane = notebook;
  } else {
    pane = `<div class="bd-facts"><div><span>Status</span>${huntStatus(r)}</div><div><span>Run by</span>${r.startedBy ? esc(r.startedBy) : '-'}</div><div><span>Started</span>${esc(new Date(r.startedAt).toLocaleString())}</div>
      <div><span>Finished</span>${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString()) : '-'}</div><div><span>Elapsed</span>${esc(huntElapsed(r))}</div><div><span>Hosts</span>${hosts}</div></div>
    ${r.error ? `<div class="hd-unmet">${esc(r.error)}</div>` : ''}
    ${hostProgressHtml(r, isHunt)}
    <div class="hd-label">${isHunt ? 'Collections' : 'Actions'} run</div>
    <table class="bh"><thead><tr><th>${isHunt ? 'Collection' : 'Action'}</th>${isHunt ? '' : '<th>Parameters</th>'}<th>Result on each host</th>${isHunt ? '<th class="num">Rows</th>' : ''}</tr></thead><tbody>${rows || '<tr><td colspan="3" class="dim">None</td></tr>'}</tbody></table>
    <div class="hd-label">Error log <span class="dim">(${problems.length})</span></div>
    ${problems.length ? `<table class="bh"><thead><tr><th>Time</th><th>Host</th><th>${isHunt ? 'Action' : 'Step'}</th><th>${isHunt ? 'Collection' : 'Action'}</th><th>Detail</th></tr></thead><tbody>${problems.map((e) => `<tr class="${e.kind === 'warn' ? 'st-warn' : 'bad'}"><td class="dim">${esc(new Date(e.t).toLocaleTimeString())}</td><td>${esc(e.host)}</td><td>${esc(e.action)}</td><td>${esc(e.artefact)}</td><td class="bh-wrap">${esc(e.detail)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="ok" style="margin:0">No errors.</p>'}`;
  }
  return head + pane;
}
async function showHunt(id) {
  bh.sel = id; renderHuntList();
  const r = bh.runs.find((x) => x.id === id), box = $('bhDetail'); if (!r) return;
  let events, files, notebook = '';
  try { [events, files, notebook] = await Promise.all([api('GET', `/api/runs/${id}/events`), api('GET', `/api/runs/${id}/files`), bh.tab === 'notebook' ? bdNotebook(`/api/runs/${id}/data`) : '']); } catch (e) { box.innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  if (bh.sel !== id) return; // another hunt was clicked while this loaded
  const keep = box.querySelector('.bd-json')?.scrollTop;
  box.innerHTML = bdRender({ kind: 'hunt', r, events, files, tab: bh.tab, notebook });
  if (keep) box.querySelector('.bd-json').scrollTop = keep; // the running-hunt refresh does not jump back to the top
}
$('bhList').onclick = async (e) => {
  const can = e.target.closest('[data-cancel]');
  if (can) { const r = bh.runs.find((x) => x.id === can.dataset.cancel); if (r && await cancelRunUi(r, true)) loadBurrowHunts(); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    const r = bh.runs.find((x) => x.id === del.dataset.del);
    if (r && await confirmDeleteRun(r, `/api/runs/${r.id}?output=1`, 'hunt')) { if (bh.sel === r.id) { bh.sel = null; $('bhDetail').innerHTML = BH_HINT; } loadBurrowHunts(); }
    return;
  }
  const tr = e.target.closest('.bh-row'); if (tr) showHunt(tr.dataset.id);
};
$('bhDetail').onclick = async (e) => {
  const can = e.target.closest('[data-cancel]');
  if (can) { const r = bh.runs.find((x) => x.id === can.dataset.cancel); if (r && await cancelRunUi(r, true)) loadBurrowHunts(); return; }
  const t = e.target.closest('[data-bdtab]');
  if (t) { bh.tab = t.dataset.bdtab; showHunt(bh.sel); return; }
  const p = e.target.dataset.evidence; if (!p) return;
  go('browse', 'files');
  loadBrowse(p);
};

// ---- New hunt dialog ----
// 1. who (groups and hosts)  2. which collections (the View Collections list, with the full detail on the right)  3. name, and the recurring switch.
// ---- The Parameters tab of the New Hunt and New Response dialogs (one implementation for both) ----
// It lists the picked collections / actions that take parameters, each coloured by whether it is ready:
//   red     it needs parameters and they are not set yet
//   orange  it takes only optional parameters and they are not set (it can still run as it is)
//   green   its parameters are set: Set parameters was pressed with every required one filled in
// Typing in a parameter un-sets it again. Run is refused while anything is red. Values live in st.params for this dialog only.
function makeParamsPane({ root, p, st, noun, items, onRemove }) {
  const el = (x) => $(p + x);
  const taking = () => items().filter((x) => x.parameters.length);
  const required = (x) => x.parameters.filter((q) => !x.optionalParameters.includes(q));
  const stateOf = (x) => (st.setP.has(x.id) ? 'green' : required(x).length ? 'red' : 'orange');
  const LABEL = { red: 'Needs parameters', orange: 'Optional parameters', green: 'Parameters set' };
  const HELP = { red: 'Fill in the required parameters, then press Set parameters.', orange: 'Optional: it can run as it is, or fill these in and press Set parameters.', green: 'Parameters set.' };
  const secret = (q) => /pass|secret|token|key/i.test(q);
  const say = (t, cls) => { const m = el('PMsg'); if (m) { m.textContent = t; m.className = `pr-msg ${cls || ''}`; } };
  function paintList() {
    const list = taking();
    if (!list.some((x) => x.id === st.pShown)) st.pShown = list[0]?.id || null;
    el('PList').innerHTML = list.length
      ? list.map((x) => `<div class="collection-item pi ${stateOf(x)} ${x.id === st.pShown ? 'on' : ''}" data-pi="${esc(x.id)}"><div class="ci-main"><div class="hn">${esc(x.name)}</div><div class="pi-s">${LABEL[stateOf(x)]}</div></div><button type="button" class="unpick" data-unpick="${esc(x.id)}" title="Remove this ${noun} from the ${noun === 'action' ? 'response' : 'hunt'}" aria-label="Remove">×</button></div>`).join('')
      : `<p class="dim" style="margin:6px 10px">None of the picked ${noun}s take parameters.</p>`;
    const btn = el('TabParams'), states = list.map(stateOf);
    btn.lastChild.textContent = list.length ? `Parameters (${list.length})` : 'Parameters';
    btn.classList.remove('p-red', 'p-orange', 'p-green');
    if (list.length) btn.classList.add(states.includes('red') ? 'p-red' : states.includes('orange') ? 'p-orange' : 'p-green');
  }
  function paintState() {
    const x = taking().find((i) => i.id === st.pShown), t = el('PState');
    if (x && t) { t.className = `pr-state ${stateOf(x)}`; t.textContent = stateOf(x) === 'green' ? HELP.green : `${LABEL[stateOf(x)]}. ${HELP[stateOf(x)]}`; }
  }
  function paintDetail() {
    const x = taking().find((i) => i.id === st.pShown);
    if (!x) { el('PDetail').innerHTML = `<p class="dim" style="padding:10px 4px">${taking().length ? `Click a ${noun} on the left to set its parameters.` : `None of the picked ${noun}s take parameters, so there is nothing to set here.`}</p>`; return; }
    const v = st.params[x.id] || {};
    el('PDetail').innerHTML = `<div class="hd-name">${esc(x.name)}</div><div class="hd-file">${esc(x.id)}</div><div class="pr-desc dim">${esc(x.description)}</div>
      <div class="pr-state" id="${p}PState"></div>
      ${x.parameters.map((q) => `<label class="rm-prow"><span>${esc(q)} ${x.optionalParameters.includes(q) ? '<i class="dim">(optional)</i>' : '<i class="pr-req">required</i>'}</span><input type="${secret(q) ? 'password' : 'text'}" data-pi="${esc(x.id)}" data-pp="${esc(q)}" value="${esc(v[q] || '')}" autocomplete="off" spellcheck="false"></label>`).join('')}
      <div class="pr-foot"><button type="button" class="act" id="${p}PSet">Set parameters</button><span class="pr-msg" id="${p}PMsg"></span></div>`;
    paintState();
  }
  const render = () => { paintList(); paintDetail(); };
  function setParams() {
    const x = taking().find((i) => i.id === st.pShown); if (!x) return;
    const v = st.params[x.id] || {};
    const missing = required(x).filter((q) => !String(v[q] ?? '').trim());
    el('PDetail').querySelectorAll('input[data-pp]').forEach((i) => i.classList.toggle('bad', missing.includes(i.dataset.pp)));
    if (missing.length) { st.setP.delete(x.id); paintList(); paintState(); say(`Cannot set: enter a value for ${missing.join(', ')}.`, 'bad'); return; }
    st.setP.add(x.id); paintList(); paintState(); say('Parameters set.', 'ok');
  }
  $(root).addEventListener('click', (e) => {
    const un = e.target.closest(`#${p}PList [data-unpick]`);
    if (un) { onRemove(un.dataset.unpick); return; }
    const row = e.target.closest(`#${p}PList [data-pi]`);
    if (row) { st.pShown = row.dataset.pi; render(); return; }
    if (e.target.closest(`#${p}PSet`)) setParams();
  });
  $(root).addEventListener('input', (e) => {
    const d = e.target.dataset; if (!d.pp || !d.pi) return;
    (st.params[d.pi] ||= {})[d.pp] = e.target.value;
    e.target.classList.remove('bad');
    if (st.setP.delete(d.pi)) { paintList(); paintState(); say('Changed: press Set parameters again.', ''); } // editing un-sets it
  });
  return {
    render,
    reset() { st.params = {}; st.setP.clear(); st.pShown = null; },
    problem: () => taking().find((x) => stateOf(x) === 'red') || null, // the first one still red: it blocks Run
    show(id) { st.pShown = id; render(); },
    values() { const out = {}; for (const x of taking()) { const v = st.params[x.id] || {}; out[x.id] = Object.fromEntries(x.parameters.map((q) => [q, v[q] ?? ''])); } return out; },
    any: () => taking().length > 0,
  };
}

const hm = { collections: [], hosts: [], lists: [], selC: new Set(), selH: new Set(), selL: new Set(), matches: null, type: 'powershell', shown: null, recurring: false, quick: null, params: {}, setP: new Set(), pShown: null };
const hmParams = makeParamsPane({ root: 'huntModal', p: 'hm', st: hm, noun: 'collection', items: () => hm.collections.filter((c) => hm.selC.has(c.id)), onRemove: (id) => hmUnpick(id) });
const hmEl = (s) => $('hm' + s);
// A group counts as picked while every one of its hosts is picked: clicking a group picks all its hosts, and taking one host out of it
// (here or on the Overview tab) makes the group neutral again while the others stay picked. The ids go to the server as listIds.
function hmSyncGroups() {
  hm.selL = new Set(hm.lists.filter((l) => l.hostIds.length && l.hostIds.every((i) => hm.selH.has(i))).map((l) => l.id));
}
function hmCount() {
  const ids = new Set(hm.selH);
  for (const l of hm.lists) if (hm.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  return ids.size;
}
function hmSummary() {
  const c = hm.selC.size, h = hmCount();
  hmEl('Summary').textContent = `${c} collection${c === 1 ? '' : 's'} · ${h} host${h === 1 ? '' : 's'}`;
  hmEl('TabWho').lastChild.textContent = h ? `Who (${h})` : 'Who';
  hmEl('TabColl').lastChild.textContent = c ? `Collections (${c})` : 'Collections';
  hmParams.render(); // the Parameters tab follows what is picked
}
// The search box and filters are the same as View Collections (makeFilter). A search or tag/dependency filter is answered by the server
// (hm.matches holds the ids that matched); picked collections stay picked even when a filter hides them.
const hmF = makeFilter({ box: $('hmTagFilter'), chips: $('hmChips'), search: $('hmSearch'), url: '/api/collections', noun: 'collection', favKind: 'collections', getType: () => hm.type, onChange: (server) => (server ? hmQuery() : hmRenderCollections()) });
async function hmQuery() {
  const qs = hmF.qs(), mine = hm.qn = (hm.qn || 0) + 1;
  try {
    const [list] = await Promise.all([qs ? api('GET', `/api/collections?${qs}`) : null, hmF.loadMeta()]);
    if (mine !== hm.qn) return; // a newer search is in flight
    hm.matches = list ? new Map(list.map((c) => [c.id, c.match])) : null;
  } catch (e) { hmEl('Msg').textContent = e.message; hmEl('Msg').className = 'bad'; }
  hmRenderCollections();
}
function hmRenderCollections() {
  const keep = (c) => (!hm.matches || hm.matches.has(c.id)) && hmF.keep(c);
  const shown = hm.collections.filter((c) => c.type === hm.type && keep(c));
  const tag = (m) => !m ? '' : [m.name && 'name', m.script && 'script'].filter(Boolean).join(' + ');
  document.querySelectorAll('#hmToggle button').forEach((b) => {
    b.classList.toggle('on', b.dataset.type === hm.type);
    b.textContent = (b.dataset.type === 'bash' ? 'Linux' : 'PowerShell') + (hmF.active() ? ` (${hm.collections.filter((c) => c.type === b.dataset.type && keep(c)).length})` : '');
  });
  hmEl('Collections').innerHTML = shown.map((c) => { const m = hm.matches?.get(c.id); return `<div class="collection-item ${c.id === hm.shown ? 'on' : ''} ${hm.selC.has(c.id) ? 'sel' : ''} ${c.missingDependencies.length ? 'blocked' : ''}" data-view="${esc(c.id)}" ${c.missingDependencies.length ? `aria-disabled="true" title="Required binary missing: ${esc(c.missingDependencies.join(', '))}"` : ''}>
      <div class="ci-main">${c.verified ? VERIFIED : ''}${hmF.favs.has(c.id) ? '<span class="fav on" title="One of your favourites">★</span>' : ''}<div class="hn">${esc(c.name)} ${m ? `<span class="mtag">${tag(m)}</span>` : ''}</div><div class="hd" title="${esc(c.description)}">${esc(c.description)}</div>
      <div class="hmeta">${metaIcons(c)}</div>${m && !m.name && m.line ? `<div class="hl">${esc(m.line)}</div>` : ''}</div></div>`; }).join('')
    || `<p class="dim" style="margin:6px 10px">No ${hmF.active() ? 'collections match.' : 'collections.'}</p>`;
}
// the X on the Parameters and Overview tabs: take a collection out of the hunt
function hmUnpick(id) {
  hm.selC.delete(id); delete hm.params[id]; hm.setP.delete(id);
  hmSummary(); hmRenderCollections();
  if (document.querySelector('#hmTabs .on')?.dataset.pane === 'name') hmRenderTargetList();
}
async function hmShow(id) {
  hm.shown = id;
  hmRenderCollections();
  try {
    const h = await api('GET', `/api/collections/${id}`);
    if (id !== hm.shown) return;
    hmEl('Detail').innerHTML = `<button type="button" class="fav-btn ${hmF.favs.has(h.id) ? 'on' : ''}" data-fav="${esc(h.id)}" title="${hmF.favs.has(h.id) ? 'Remove from your favourites' : 'Add to your favourites'}" aria-pressed="${hmF.favs.has(h.id)}">${hmF.favs.has(h.id) ? '★' : '☆'}</button><div class="hd-name">${esc(h.name)}</div><div class="hd-file">${esc(h.id)}</div>${metaIcons(h, true)}
      <div class="hd-label hd-label-desc">Description</div><div class="hd-desc">${h.description ? esc(h.description) : '<span class="dim">-</span>'}${h.transfer === 'large' ? '<div class="smb-note"><b>Large transfer.</b> Files are pulled back over SMB (Windows, enabled temporarily) or SFTP (Linux).</div>' : ''}</div>
      <div class="hd-label hd-label-dep">Dependencies</div><div class="hd-deps">${h.dependencies.length ? h.dependencies.map((d) => `<span class="dep ${h.missingDependencies.includes(d) ? 'miss' : 'have'}">${esc(d)}${h.missingDependencies.includes(d) ? ' (not uploaded)' : ''}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-tags">Tags</div><div class="hd-tags">${h.tags.length ? h.tags.map((t) => `<span class="hd-tag">${esc(t)}</span>`).join('') : '<span class="dim">None</span>'}</div>
      <div class="hd-label hd-label-code">Collection</div><pre class="code">${highlight(h.body, h.type)}</pre>`;
  } catch (e) { hmEl('Detail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; }
}
function hmRenderTargets() {
  hmSyncGroups();
  hmEl('Groups').innerHTML = hm.lists.map((l) => `<div class="pick pk ${hm.selL.has(l.id) ? 'sel' : ''}" data-l="${esc(l.id)}">
      <span class="pn">${esc(l.name)}</span><span class="pt">${l.hostIds.length} host${l.hostIds.length === 1 ? '' : 's'}</span></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No groups yet.</p>';
  hmEl('Hosts').innerHTML = hm.hosts.map((h) => `<div class="pick pk ${hm.selH.has(h.id) ? 'sel' : ''}" data-h="${esc(h.id)}">
      <span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No saved hosts yet.</p>';
}
function hmTab(name) {
  document.querySelectorAll('#hmTabs button').forEach((b) => b.classList.toggle('on', b.dataset.pane === name));
  document.querySelectorAll('#huntModal .hsec').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  hmEl('Run').hidden = name !== 'name'; hmEl('Next').hidden = name === 'name'; // Run Hunt is only on the last tab
  if (name === 'params') hmParams.render();
  if (name === 'name') { hmRenderTargetList(); hmEl('Name').focus(); }
}
// The hosts the hunt will run against: the ticked hosts plus every member of the ticked groups, each once.
function hmRenderTargetList() {
  const ids = new Set(hm.selH);
  for (const l of hm.lists) if (hm.selL.has(l.id)) l.hostIds.forEach((i) => ids.add(i));
  const list = hm.hosts.filter((h) => ids.has(h.id));
  hmEl('TargetsHead').textContent = `Will run against ${list.length} host${list.length === 1 ? '' : 's'}`;
  hmEl('Targets').innerHTML = list.map((h) => `<div class="pick"><span class="pn">${esc(h.name)}</span><span class="pt">${esc(h.address)}</span><span class="proto-${h.protocol === 'ssh' ? 'ssh' : 'winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><button type="button" class="unpick" data-unpick-host="${esc(h.id)}" title="Remove this host from the hunt" aria-label="Remove">×</button></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No hosts selected yet. Choose them on the Who tab.</p>';
  // and what will run on them
  const items = hm.collections.filter((c) => hm.selC.has(c.id));
  hmEl('ItemsHead').textContent = `${items.length} collection${items.length === 1 ? '' : 's'} to run`;
  hmEl('Items').innerHTML = items.map((c) => `<div class="pick"><span class="pn" title="${esc(c.description)}">${esc(c.name)}</span>${metaIcons(c)}<span class="pt">${c.type === 'bash' ? 'Linux' : 'PowerShell'}</span><button type="button" class="unpick" data-unpick="${esc(c.id)}" title="Remove this collection from the hunt" aria-label="Remove">×</button></div>`).join('')
    || '<p class="dim" style="margin:6px 10px">No collections selected yet. Choose them on the Collections tab.</p>';
  // a collection that pulls back large files: say what will be switched on, and for which hosts, before the hunt runs
  const big = items.filter((c) => c.transfer === 'large'), win = list.filter((h) => h.protocol !== 'ssh'), lin = list.filter((h) => h.protocol === 'ssh');
  const names = (hs) => hs.slice(0, 4).map((h) => esc(h.name)).join(', ') + (hs.length > 4 ? ` and ${hs.length - 4} more` : '');
  const box = hmEl('SmbWarn');
  box.hidden = !big.length;
  box.innerHTML = big.length ? `<b>⚠ Large file transfer:</b> ${big.map((c) => esc(c.name)).join(', ')} brings back big files.
    ${win.length || !list.length ? `<p><b>SMB is enabled temporarily</b> on ${win.length ? `${win.length} Windows host${win.length === 1 ? '' : 's'} (${names(win)})` : 'Windows hosts'}, for this server only, then switched off again (left as found if already on).</p>` : ''}
    ${lin.length ? `<p>${lin.length} Linux host${lin.length === 1 ? '' : 's'} (${names(lin)}): the files come back over SFTP on the SSH connection, so nothing is switched on.</p>` : ''}` : '';
}
const HM_ORDER = ['who', 'coll', 'params', 'name'];
hmEl('Next').onclick = () => { const cur = document.querySelector('#hmTabs .on')?.dataset.pane; hmTab(HM_ORDER[Math.min(HM_ORDER.indexOf(cur) + 1, HM_ORDER.length - 1)]); };
function hmSetRecurring(on) {
  hm.recurring = on;
  hmEl('Recurring').setAttribute('aria-checked', on);
  hmEl('RecurringLabel').textContent = `Recurring hunt: ${on ? 'On' : 'Off'}`;
  recToggle('hm', on);
}
// Quick mode (from the Shell tab): the dialog is for one host, so it has no Who tab, no Rerun and no recurring switch.
function hmQuickUi(host) {
  hm.quick = host || null;
  const q = !!host;
  $('hmTitle').textContent = q ? `Quick hunt · ${host.name || host.hostname}` : 'New hunt';
  hmEl('TabWho').hidden = q; hmEl('Rerun').hidden = q;
  hmEl('TabColl').querySelector('.hnum').textContent = q ? '1' : '2';
  hmEl('TabParams').querySelector('.hnum').textContent = q ? '2' : '3';
  hmEl('TabName').querySelector('.hnum').textContent = q ? '3' : '4';
  hmEl('Recurring').closest('.sw-row').hidden = q;
  hmEl('Run').textContent = q ? 'Run Quick Hunt' : 'Run Hunt';
}
async function openHuntModal(quickHost) {
  hm.selC.clear(); hm.selH.clear(); hm.selL.clear(); hmF.reset(); hm.matches = null; hm.type = 'powershell'; hmParams.reset();
  hmQuickUi(quickHost);
  if (quickHost) { hm.selH.add(quickHost.id); hm.type = quickHost.protocol === 'ssh' ? 'bash' : 'powershell'; } // open on the host's own kind of collections
  hm.shown = null; hmEl('Detail').innerHTML = '<p class="dim">Click a collection to see what it does.</p>';
  hmEl('Name').value = quickHost ? (quickHost.hostname || quickHost.name) : ''; hmEl('Msg').textContent = '';
  hmEl('Msg').className = ''; hmSetRecurring(false);
  hmTab(quickHost ? 'coll' : 'who');
  $('huntModal').hidden = false;
  try {
    [hm.collections, hm.hosts, hm.lists] = await Promise.all([api('GET', '/api/collections'), api('GET', '/api/hosts'), api('GET', '/api/lists')]);
  } catch (e) { hmEl('Msg').textContent = e.message; hmEl('Msg').className = 'bad'; }
  hmF.loadMeta().catch(() => {}); hmRenderCollections(); hmRenderTargets(); hmSummary();
}
const closeHuntModal = () => { $('huntModal').hidden = true; };
$('bhNew').onclick = () => openHuntModal();
$('hmCancel').onclick = closeHuntModal;
$('hmClose').onclick = closeHuntModal;
$('huntModal').onclick = (e) => { if (e.target.id === 'huntModal') closeHuntModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('huntModal').hidden) closeHuntModal(); });
$('hmTabs').onclick = (e) => { const b = e.target.closest('button[data-pane]'); if (b) hmTab(b.dataset.pane); };
$('hmToggle').onclick = (e) => { if (e.target.dataset.type) { hm.type = e.target.dataset.type; hmF.tags = []; hmQuery(); } }; // tags differ between PowerShell and Linux
recInit('hm');
hmEl('Recurring').onclick = () => hmSetRecurring(!hm.recurring);
// the star on a collection's detail: your favourites are the same ones as in View Collections, and show in every list
hmEl('Detail').onclick = async (e) => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  try {
    const fv = await api('PUT', '/api/favourites/collections', { id: b.dataset.fav, on: !hmF.favs.has(b.dataset.fav) });
    hmF.favs = new Set(fv.collections || []);
    hmF.render(); hmRenderCollections(); hmShow(b.dataset.fav);
  } catch (err) { toast(err.message, 'bad'); }
};
$('hmItems').onclick = (e) => { const u = e.target.closest('[data-unpick]'); if (u) hmUnpick(u.dataset.unpick); };
$('hmCollections').onclick = (e) => {
  const row = e.target.closest('[data-view]'); if (!row) return;
  const id = row.dataset.view, c = hm.collections.find((x) => x.id === id); if (!c) return;
  if (c.missingDependencies.length) { showMissingBinary(c); return; }
  if (hm.selC.has(id)) hm.selC.delete(id); else hm.selC.add(id); // a click adds it to the hunt, another takes it out
  hmSummary(); hmShow(id);
};
$('hmGroups').onclick = (e) => {
  const row = e.target.closest('[data-l]'), l = row && hm.lists.find((x) => x.id === row.dataset.l); if (!l) return;
  const ids = l.hostIds.filter((i) => hm.hosts.some((h) => h.id === i)); if (!ids.length) return;
  if (hm.selL.has(l.id)) ids.forEach((i) => hm.selH.delete(i)); else ids.forEach((i) => hm.selH.add(i));
  hmRenderTargets(); hmSummary();
};
$('hmHosts').onclick = (e) => {
  const row = e.target.closest('[data-h]'); if (!row) return;
  if (hm.selH.has(row.dataset.h)) hm.selH.delete(row.dataset.h); else hm.selH.add(row.dataset.h);
  hmRenderTargets(); hmSummary();
};
// the X on a host in the Overview tab: it is no longer picked, which also makes any group it was in neutral on the Who tab
$('hmTargets').onclick = (e) => {
  const u = e.target.closest('[data-unpick-host]'); if (!u) return;
  hm.selH.delete(u.dataset.unpickHost); hmRenderTargets(); hmSummary(); hmRenderTargetList();
};
// Rerun past hunt: pick an earlier hunt and its hosts and collections are ticked, the name becomes "<name>_rerun", and the dialog moves
// to the Name tab. Nothing runs until Run Hunt is pressed.
const rr = { runs: [], sel: null };
const closeRerun = () => { $('rerunModal').hidden = true; };
function rrRender() {
  $('rrList').innerHTML = rr.runs.length
    ? `<table class="bh"><thead><tr><th>Hunt</th><th>Run by</th><th>Status</th><th>Started</th><th>Hosts</th><th>Collections</th></tr></thead><tbody>${rr.runs.map((r) => `<tr data-id="${esc(r.id)}" class="${r.id === rr.sel ? 'on' : ''}">
        <td class="bh-name">${esc(huntName(r))}${schedTag(r)}</td><td>${r.startedBy ? esc(r.startedBy) : '<span class="dim">-</span>'}</td><td>${huntStatus(r)}</td><td class="dim">${esc(new Date(r.startedAt).toLocaleString())}</td>
        <td>${new Set(r.results.map((x) => x.hostId)).size}</td><td>${esc((r.collectionNames || [r.collectionName]).join(', '))}</td></tr>`).join('')}</tbody></table>`
    : '<p class="dim">No previous hunts.</p>';
  $('rrUse').disabled = !rr.sel;
}
hmEl('Rerun').onclick = async () => {
  rr.sel = null; $('rrMsg').textContent = ''; $('rrList').innerHTML = '<p class="dim">Loading…</p>'; $('rerunModal').hidden = false;
  try { rr.runs = (await api('GET', '/api/runs')).filter((r) => r.kind !== 'response'); } catch (e) { $('rrList').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  rrRender();
};
$('rrList').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { rr.sel = tr.dataset.id; rrRender(); } };
$('rrList').ondblclick = (e) => { if (e.target.closest('tr[data-id]')) $('rrUse').click(); };
$('rrClose').onclick = $('rrCancel').onclick = closeRerun;
$('rerunModal').onclick = (e) => { if (e.target.id === 'rerunModal') closeRerun(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('rerunModal').hidden) { e.stopImmediatePropagation(); closeRerun(); } }, true);
$('rrUse').onclick = () => {
  const r = rr.runs.find((x) => x.id === rr.sel); if (!r) return;
  const hostIds = new Set(r.results.map((x) => x.hostId)), cids = r.collectionIds || [r.collectionId].filter(Boolean);
  hm.selH = new Set(hm.hosts.filter((h) => hostIds.has(h.id)).map((h) => h.id)); hm.selL.clear();
  hm.selC = new Set(cids.filter((c) => hm.collections.some((x) => x.id === c))); hmParams.reset();
  const lostH = hostIds.size - hm.selH.size, lostC = cids.length - hm.selC.size;
  hm.shown = null; hmEl('Detail').innerHTML = '<p class="dim">Click a collection to see what it does.</p>';
  hmEl('Name').value = `${huntName(r)}_rerun`;
  hmRenderTargets(); hmRenderCollections(); hmSummary(); hmSetRecurring(false);
  const gone = [lostH && `${lostH} host${lostH === 1 ? ' is' : 's are'}`, lostC && `${lostC} collection${lostC === 1 ? ' is' : 's are'}`].filter(Boolean).join(' and ');
  const needs = hmParams.any(); // parameter values are never kept, so they are set again
  hmEl('Msg').textContent = [gone && `${gone} no longer available and left out.`, needs && 'Set the parameters again on the Parameters tab.'].filter(Boolean).join(' '); hmEl('Msg').className = gone ? 'bad' : '';
  closeRerun(); hmTab(needs ? 'params' : 'name');
};
hmEl('Run').onclick = async () => {
  const msg = (t, cls) => { hmEl('Msg').textContent = t; hmEl('Msg').className = cls; };
  if (!hmCount()) { hmTab('who'); return msg('Select at least one host or group.', 'bad'); }
  if (!hm.selC.size) { hmTab('coll'); return msg('Select at least one collection.', 'bad'); }
  const unset = hmParams.problem();
  if (unset) { hmTab('params'); hmParams.show(unset.id); return msg(`${unset.name}: its parameters are not set. Fill them in and press Set parameters.`, 'bad'); }
  if (!hmEl('Name').value.trim()) { hmTab('name'); return msg('Give the hunt a name.', 'bad'); }
  const rec = hm.recurring ? recRead('hm') : null;
  if (rec?.error) { hmTab('name'); return msg(rec.error, 'bad'); }
  hmEl('Run').disabled = true;
  try {
    const run = await api('POST', '/api/hunts', {
      name: hmEl('Name').value.trim(), collectionIds: [...hm.selC], hostIds: [...hm.selH], listIds: [...hm.selL], params: hmParams.values(), schedule: rec?.schedule, quick: !!hm.quick,
    });
    closeHuntModal();
    toast(`Hunt "${run.name}" started${rec ? ` and scheduled: ${rec.text.replace(/^Runs now, then /, '')}` : `. Results go to ${run.outputPath}`}`);
    bh.sel = run.id;
    await loadBurrowHunts();
    showHunt(run.id);
  } catch (e) { msg(e.message, 'bad'); }
  hmEl('Run').disabled = false;
};

// ---- Browse ---- (the Files and Diff pages are in browse.js)
const bbFmt = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// ---- Settings: User Management ----
// Two tabs. Users: click a user to see (and, with Manage roles, change) their roles and the permissions those give them, or
// add a new user. Roles: click a role to see its permissions as tick boxes and who is in it, or create or edit one.
// Permissions build on each other: ticking an option also ticks the lower options it includes, and unticking a lower option
// unticks the ones that depend on it. The built-in admin role is locked (full access, always ticked) and admin users can't be
// taken out of it. You can only hand out permissions you hold yourself; the server checks that too.
const um = { tab: 'users', users: [], roles: [], groups: [], sel: { users: null, roles: null }, mode: 'view', draft: null };
let umInfo = {}; // permission key -> { label, desc, implies }
const umIncluded = (k, seen = new Set()) => { for (const i of umInfo[k]?.implies || []) if (!seen.has(i)) { seen.add(i); umIncluded(i, seen); } return [...seen]; };
const umGrantable = (key) => access.all || access.permissions.has(key);
const umRoleGrantable = (r) => access.all || r.permissions.every((p) => access.permissions.has(p));

async function loadUserMgmt() {
  try { [um.users, um.roles, um.groups] = await Promise.all([api('GET', '/api/users'), api('GET', '/api/roles'), api('GET', '/api/permissions')]); }
  catch (e) { $('umDetail').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  umInfo = Object.fromEntries(um.groups.flatMap((g) => g.permissions).map((p) => [p.key, p]));
  for (const t of ['users', 'roles']) if (!um[t].some((x) => x.id === um.sel[t])) um.sel[t] = um[t][0]?.id ?? null;
  um.mode = 'view'; um.draft = null;
  renderUserMgmt();
}
const umChip = (t, cls = '') => `<span class="um-chip ${cls}">${esc(t)}</span>`;

// Permission tick boxes by area. `editable` boxes can be changed (when the user may grant them); the rest are locked, and
// `tip` says why on hover. Options that include others say so ("Includes: ...").
function umPerms(granted, tip, editable = false) {
  return um.groups.map((g) => {
    const have = g.permissions.filter((p) => granted.has(p.key)).length;
    return `<div class="um-group"><div class="um-ghead"><label title="${esc(tip)}"><input type="checkbox" disabled data-ghead="${esc(g.id)}" ${have === g.permissions.length ? 'checked' : ''}> <b>${esc(g.name)}</b></label><span class="dim" data-gcount="${esc(g.id)}">${have}/${g.permissions.length}</span></div>
      <div class="um-perms">${g.permissions.map((p) => {
        const off = !editable || !umGrantable(p.key);
        const why = !editable ? tip : !umGrantable(p.key) ? "You can't grant a permission you don't have" : '';
        const inc = umIncluded(p.key);
        return `<label class="um-perm ${off ? '' : 'um-on'}" title="${esc(why)}"><input type="checkbox" data-pk="${esc(p.key)}" ${off ? 'disabled' : ''} ${granted.has(p.key) ? 'checked' : ''}>
        <span><b>${esc(p.label)}</b><span class="um-inc">${esc(p.desc)}</span>${inc.length ? `<span class="um-inc">Includes: ${inc.map((k) => esc(umInfo[k].label)).join(', ')}</span>` : ''}</span></label>`;
      }).join('')}</div></div>`;
  }).join('');
}
// Brings the tick boxes and the per-area counts in line with the draft without re-drawing the form.
function umRefreshTicks() {
  const root = um.mode === 'new' ? $('umModalBody') : $('umDetail');
  root.querySelectorAll('input[data-pk]').forEach((i) => { i.checked = um.draft.has(i.dataset.pk); });
  for (const g of um.groups) {
    const have = g.permissions.filter((p) => um.draft.has(p.key)).length;
    const c = root.querySelector(`[data-gcount="${g.id}"]`), h = root.querySelector(`[data-ghead="${g.id}"]`);
    if (c) c.textContent = `${have}/${g.permissions.length}`;
    if (h) h.checked = have === g.permissions.length;
  }
}
const umMsg = '<span class="um-msg" id="umMsg"></span>';

function renderUserMgmt() {
  document.querySelectorAll('#umTabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === um.tab));
  const users = um.tab === 'users', items = users ? um.users : um.roles, sel = items.find((x) => x.id === um.sel[um.tab]);
  const nb = $('umNew');
  nb.textContent = users ? 'New user' : 'New role';
  $('umListTitle').textContent = users ? 'Users:' : 'Roles:';
  nb.dataset.perm = users ? 'users.manage' : 'roles.manage';
  nb.dataset.permWhat = users ? 'create users' : 'create roles';
  nb.classList.toggle('on', um.mode === 'new');
  decorateLocks(nb);
  $('umList').innerHTML = items.map((x) => `<div class="um-item ${um.mode === 'view' && x.id === um.sel[um.tab] ? 'on' : ''}" data-id="${esc(x.id)}">
      <div class="um-name">${esc(x.name || x.username)}${x.username === access.username ? ' <span class="dim">(you)</span>' : ''}</div>
      <div class="um-sub">${users ? (x.roles.length ? x.roles.map((r) => umChip(um.roles.find((q) => q.id === r)?.name || r)).join('') : '<span class="dim">No roles</span>')
        : `${x.members.length} member${x.members.length === 1 ? '' : 's'} · ${x.all ? 'full access' : `${x.permissions.length} permissions`}`}</div></div>`).join('')
    || `<p class="dim" style="margin:6px 10px">No ${um.tab} yet.</p>`;
  $('umModal').hidden = um.mode !== 'new';
  if (um.mode === 'new') { $('umDetail').innerHTML = ''; $('umModalTitle').textContent = users ? 'New user' : 'New role'; return users ? renderNewUser() : renderRoleForm(null); }
  if (!sel) { $('umDetail').innerHTML = ''; return; }
  if (users) renderUserDetail(sel); else if (sel.builtin) renderBuiltinRole(sel); else renderRoleForm(sel);
}

// A list of roles as tick boxes for a user. `locked` (an admin) or a missing Manage roles permission turns them off.
function umRoleBoxes(draft, locked) {
  return um.roles.map((r) => {
    const has = draft.has(r.id), manage = can('roles.manage');
    const off = locked || !manage || (!has && !umRoleGrantable(r));
    const why = locked ? 'Locked: an admin keeps every role' : !manage ? 'Changing roles needs Manage roles' : !has && !umRoleGrantable(r) ? "You can't grant permissions you don't have" : '';
    return `<label class="um-perm ${off ? '' : 'um-on'}" title="${esc(why)}"><input type="checkbox" data-rid="${esc(r.id)}" ${off ? 'disabled' : ''} ${has ? 'checked' : ''}><span><b>${esc(r.name)}</b><span class="um-inc">${esc(r.description)}</span></span></label>`;
  }).join('');
}

function renderNewUser() {
  um.draft = um.draft || new Set();
  $('umModalBody').innerHTML = `<div class="dim" style="margin-bottom:8px; text-align:center">The new user signs in with this username and password.</div>
    <span class="fl">Username</span><input id="umUser" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. jsmith">
    <span class="fl">Password <span class="dim">(at least 8 characters)</span></span><input id="umPass" type="password" autocomplete="new-password">
    <div class="hd-label hd-label-dep">Roles</div>
    <div class="um-roles">${umRoleBoxes(um.draft, false)}</div>
    <div class="um-actions"><button class="act" type="button" data-uma="create-user" data-perm="users.manage" data-perm-what="create users">Create user</button><button class="act sec" type="button" data-uma="cancel">Cancel</button>${umMsg}</div>`;
}
function renderUserDetail(sel) {
  um.draft = um.draft || new Set(sel.roles);
  const locked = sel.all, me = sel.username === access.username;
  $('umDetail').innerHTML = `<div class="um-title">${esc(sel.username)}${me ? ' <span class="dim">(you)</span>' : ''}</div>
    <div class="dim" style="margin-bottom:10px">Account created ${esc(new Date(sel.createdAt).toLocaleString())}</div>
    <div class="hd-label hd-label-dep">Roles</div>
    <div class="um-roles">${umRoleBoxes(um.draft, locked)}</div>
    ${locked ? `<div class="um-lock">This user is an admin. Admins keep the admin role and every other role.${me ? '' : ' Another admin can delete this account.'}</div>${me || !access.all ? '' : `<div class="um-actions"><button class="del" type="button" data-uma="delete-user" data-perm="users.manage" data-perm-what="delete users">Delete admin</button>${umMsg}</div>`}`
      : `<div class="um-actions"><button class="act" type="button" data-uma="save-roles" data-perm="roles.manage" data-perm-what="change roles">Save roles</button>${me ? '' : '<button class="del" type="button" data-uma="delete-user" data-perm="users.manage" data-perm-what="delete users">Delete user</button>'}${umMsg}</div>`}
    <div class="hd-label hd-label-dep">Password</div>
    ${me ? '<div class="um-actions" style="margin-top:2px"><button class="act sec" type="button" data-uma="change-own-password">Change my password</button><span class="dim">You will need your current password.</span></div>'
      : `<div class="um-pw"><input id="umNewPw" type="password" autocomplete="new-password" placeholder="New password (at least 8 characters)"><input id="umNewPw2" type="password" autocomplete="new-password" placeholder="Confirm new password"><button class="act" type="button" data-uma="set-password" data-perm="users.manage" data-perm-what="change passwords">Set password</button></div><div class="dim">${sel.all ? 'This is another admin. ' : ''}They are signed out everywhere and use the new password next time they sign in.</div>`}
    <div class="um-msg" id="umPwMsg" style="margin:4px 0 0"></div>
    <div class="hd-label hd-label-dep">Permissions <span class="dim">${sel.all ? '(full access through the admin role)' : `(${sel.permissions.length} granted by their roles)`}</span></div>
    ${umPerms(new Set(sel.permissions), sel.all ? 'Locked: the admin role has every permission' : 'These come from the roles above')}`;
}
function renderBuiltinRole(sel) {
  $('umDetail').innerHTML = `<div class="um-title">${esc(sel.name)} <span class="badge grey">Built-in</span></div>
    <div class="dim" style="margin-bottom:10px">${esc(sel.description)}</div>
    <div class="um-lock">This role has full access to everything and cannot be changed or removed. Admin members cannot be taken out of it.</div>
    <div class="hd-label hd-label-dep">Members</div>
    <div class="um-chips">${sel.members.length ? sel.members.map((m) => umChip(m)).join('') : '<span class="dim">No members</span>'}</div>
    <div class="hd-label hd-label-dep">Permissions</div>
    <label class="um-perm um-master" title="Locked: the admin role has every permission"><input type="checkbox" disabled checked><span><b>Full access to everything</b><span class="um-inc">including permissions added in future</span></span></label>
    ${umPerms(new Set(sel.permissions), 'Locked: the admin role has every permission')}`;
}
// New role (sel is null) or an existing custom role.
function renderRoleForm(sel) {
  um.draft = um.draft || new Set(sel ? sel.permissions : []);
  const manage = can('roles.manage');
  (sel ? $('umDetail') : $('umModalBody')).innerHTML = `${sel ? `<div class="um-title">${esc(sel.name)}</div>` : '<div class="dim" style="margin-bottom:8px; text-align:center">Choose what people with this role can do.</div>'}
    ${sel ? '' : '<span class="fl">Name</span><input id="umRoleName" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. analyst">'}
    <span class="fl">Description</span><input id="umRoleDesc" type="text" autocomplete="off" maxlength="200" placeholder="What this role is for" value="${esc(sel ? sel.description : '')}">
    ${sel ? `<div class="hd-label hd-label-dep">Members</div><div class="um-chips">${sel.members.length ? sel.members.map((m) => umChip(m)).join('') : '<span class="dim">No members</span>'}</div>` : ''}
    <div class="hd-label hd-label-dep">Permissions</div>
    ${umPerms(um.draft, manage ? '' : 'Changing roles needs Manage roles', manage)}
    <div class="um-actions"><button class="act" type="button" data-uma="${sel ? 'save-role' : 'create-role'}" data-perm="roles.manage" data-perm-what="${sel ? 'change roles' : 'create roles'}">${sel ? 'Save role' : 'Create role'}</button>${sel ? '<button class="del" type="button" data-uma="delete-role" data-perm="roles.manage" data-perm-what="delete roles">Delete role</button>' : '<button class="act sec" type="button" data-uma="cancel">Cancel</button>'}${umMsg}</div>`;
}

const umSay = (t, cls = 'bad') => { const m = $('umMsg'); if (m) { m.textContent = t; m.className = `um-msg ${cls}`; } };
async function umSetPassword() {
  const sel = um.users.find((x) => x.id === um.sel.users); if (!sel) return;
  const say = (t) => { const m = $('umPwMsg'); if (m) { m.textContent = t; m.className = 'um-msg bad'; } };
  const p = $('umNewPw').value;
  if (p.length < 8) return say('The password must be at least 8 characters');
  if (p !== $('umNewPw2').value) return say('The passwords do not match');
  try {
    await api('PUT', `/api/users/${sel.id}/password`, { password: p });
    $('umNewPw').value = $('umNewPw2').value = ''; say('');
    toast(`Password changed for ${sel.username}. They have been signed out everywhere.`);
  } catch (e) { say(e.message); }
}
async function umAct(act) {
  if (act === 'change-own-password') return openPassword();
  if (act === 'set-password') return umSetPassword();
  const sel = (um.tab === 'users' ? um.users : um.roles).find((x) => x.id === um.sel[um.tab]);
  try {
    if (act === 'cancel') { um.mode = 'view'; um.draft = null; renderUserMgmt(); return; }
    if (act === 'create-user') {
      const r = await api('POST', '/api/users', { username: $('umUser').value.trim(), password: $('umPass').value, roles: [...um.draft] });
      toast(`User ${r.username} created`); um.sel.users = r.id;
    } else if (act === 'save-roles') {
      await api('PUT', `/api/users/${sel.id}`, { roles: [...um.draft] }); toast(`Roles saved for ${sel.username}`);
    } else if (act === 'delete-user') {
      if (!confirm(sel.all ? `Delete the ADMIN ${sel.username}? They will be signed out, can no longer sign in, and lose all access.` : `Delete the user ${sel.username}? They will be signed out and can no longer sign in.`)) return;
      await api('DELETE', `/api/users/${sel.id}`); toast(`User ${sel.username} deleted`); um.sel.users = null;
    } else if (act === 'create-role') {
      const r = await api('POST', '/api/roles', { name: $('umRoleName').value.trim(), description: $('umRoleDesc').value, permissions: [...um.draft] });
      toast(`Role ${r.name} created`); um.sel.roles = r.id;
    } else if (act === 'save-role') {
      await api('PUT', `/api/roles/${sel.id}`, { description: $('umRoleDesc').value, permissions: [...um.draft] }); toast(`Role ${sel.name} saved`);
    } else if (act === 'delete-role') {
      if (!confirm(`Delete the role ${sel.name}?`)) return;
      await api('DELETE', `/api/roles/${sel.id}`); toast(`Role ${sel.name} deleted`); um.sel.roles = null;
    }
  } catch (e) { umSay(e.message); return; }
  await loadUserMgmt();
}
$('umTabs').onclick = (e) => { if (e.target.dataset.t) { um.tab = e.target.dataset.t; um.mode = 'view'; um.draft = null; renderUserMgmt(); } };
$('umNew').onclick = () => { um.mode = 'new'; um.draft = null; renderUserMgmt(); };
$('umList').onclick = (e) => { const it = e.target.closest('.um-item'); if (it) { um.sel[um.tab] = it.dataset.id; um.mode = 'view'; um.draft = null; renderUserMgmt(); } };
$('umDetail').onclick = $('umModalBody').onclick = (e) => { const b = e.target.closest('[data-uma]'); if (b) umAct(b.dataset.uma); };
const umCancelNew = () => { if (um.mode === 'new') { um.mode = 'view'; um.draft = null; renderUserMgmt(); } };
$('umModalX').onclick = umCancelNew;
$('umModal').onclick = (e) => { if (e.target.id === 'umModal') umCancelNew(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('umModal').hidden) umCancelNew(); });
$('umDetail').onchange = $('umModalBody').onchange = (e) => {
  const t = e.target;
  if (t.dataset.rid) { t.checked ? um.draft.add(t.dataset.rid) : um.draft.delete(t.dataset.rid); return; }
  if (!t.dataset.pk) return;
  const k = t.dataset.pk;
  if (t.checked) { um.draft.add(k); umIncluded(k).forEach((i) => um.draft.add(i)); } // ticking an option ticks what it includes
  else { um.draft.delete(k); for (const o of Object.keys(umInfo)) if (umIncluded(o).includes(k)) um.draft.delete(o); } // unticking removes what depends on it
  umRefreshTicks();
};

// ---- Settings: Health Settings ----
// How often the monitor pings hosts and checks their WinRM/SSH port, and which hosts it checks (all of them by default;
// untick a host to take it out, tick it to put it back). Anyone who can view the system sees this; changing it needs Manage system.
const hs = { defaults: null, limits: null, hosts: [], pingOn: new Set(), remoteOn: new Set(), enabled: true };
const HS_UNITS = [['seconds', 1], ['minutes', 60], ['hours', 3600]];
function hsSetInterval(inputId, selectId, seconds) {
  // shown in the largest unit that divides it exactly, e.g. 300 seconds as 5 minutes
  const [name, mult] = [...HS_UNITS].reverse().find(([, m]) => seconds % m === 0) || HS_UNITS[0];
  $(selectId).innerHTML = HS_UNITS.map(([n]) => `<option value="${n}" ${n === name ? 'selected' : ''}>${n}</option>`).join('');
  $(inputId).value = seconds / mult;
}
const hsSeconds = (inputId, selectId) => Math.round(Number($(inputId).value) * HS_UNITS.find(([n]) => n === $(selectId).value)[1]);
function hsHints() {
  const hint = (id, inputId, selectId, def, [lo, hi]) => {
    const s = hsSeconds(inputId, selectId);
    $(id).textContent = !Number.isFinite(s) || s < lo || s > hi ? `Must be between ${fmtSecs(lo)} and ${fmtSecs(hi)}` : s === def ? '(the default)' : `(default ${fmtSecs(def)})`;
    $(id).className = !Number.isFinite(s) || s < lo || s > hi ? 'bad' : 'dim';
  };
  hint('hsPingHint', 'hsPing', 'hsPingUnit', hs.defaults.pingSeconds, hs.limits.pingSeconds);
  hint('hsPortHint', 'hsPort', 'hsPortUnit', hs.defaults.portSeconds, hs.limits.portSeconds);
}
const fmtSecs = (s) => (s % 3600 === 0 ? `${s / 3600} hour${s === 3600 ? '' : 's'}` : s % 60 === 0 ? `${s / 60} minute${s === 60 ? '' : 's'}` : `${s} seconds`);
function renderHsHosts() {
  const editable = can('system.manage'), dis = editable ? '' : 'disabled';
  const head = `<div class="hs-colhead"><span class="hs-col">Ping<br><a data-col="ping" data-set="all">all</a> <a data-col="ping" data-set="none">none</a></span><span class="hs-col">Remote<br><a data-col="remote" data-set="all">all</a> <a data-col="remote" data-set="none">none</a></span><span>Host</span></div>`;
  $('hsHosts').innerHTML = head + hs.hosts.map((h) => `<div class="hs-host ${hs.pingOn.has(h.id) || hs.remoteOn.has(h.id) ? '' : 'off'}" title="${editable ? '' : 'Changing this needs Manage system'}">
      <label class="hs-chk" title="Ping this host"><input type="checkbox" data-host="${esc(h.id)}" data-what="ping" ${hs.pingOn.has(h.id) ? 'checked' : ''} ${dis}></label>
      <label class="hs-chk" title="Check this host's ${h.protocol === 'ssh' ? 'SSH' : 'WinRM'} port"><input type="checkbox" data-host="${esc(h.id)}" data-what="remote" ${hs.remoteOn.has(h.id) ? 'checked' : ''} ${dis}></label>
      <span class="hs-name">${esc(h.name)}</span><span class="hs-addr">${esc(h.address)}</span><span class="proto-${h.protocol === 'ssh' ? 'ssh' : 'winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><span class="hs-os">${esc(String(h.os || '').replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}</span></div>`).join('')
    || '<p class="dim" style="margin:8px 10px">No saved hosts yet.</p>';
  $('hsCount').textContent = `Ping ${hs.pingOn.size} of ${hs.hosts.length} · Remote ${hs.remoteOn.size} of ${hs.hosts.length}`;
}
async function loadHealthSettings() {
  let r;
  try { r = await api('GET', '/api/settings/health'); } catch (e) { $('hsMsg').textContent = e.message; $('hsMsg').className = 'um-msg bad'; return; }
  hs.defaults = r.defaults; hs.limits = r.limits; hs.hosts = r.hosts; hs.enabled = r.settings.enabled;
  setSwitch('hsEnabled', hs.enabled);
  $('hsEnabledLabel').textContent = `Health monitoring: ${hs.enabled ? 'On' : 'Off'}`;
  $('hsEnabledNote').textContent = hs.enabled ? 'Hosts are being checked' : 'No checks are running and the Health page and top-bar counts are off';
  $('hsBody').classList.toggle('hs-off', !hs.enabled);
  hs.pingOn = new Set(r.hosts.filter((h) => !r.settings.pingOff.includes(h.id)).map((h) => h.id));
  hs.remoteOn = new Set(r.hosts.filter((h) => !r.settings.remoteOff.includes(h.id)).map((h) => h.id));
  hsSetInterval('hsPing', 'hsPingUnit', r.settings.pingSeconds);
  hsSetInterval('hsPort', 'hsPortUnit', r.settings.portSeconds);
  const editable = can('system.manage');
  for (const id of ['hsPing', 'hsPingUnit', 'hsPort', 'hsPortUnit']) $(id).disabled = !editable;
  $('hsMsg').textContent = '';
  hsHints(); renderHsHosts();
}
for (const id of ['hsPing', 'hsPingUnit', 'hsPort', 'hsPortUnit']) $(id).oninput = hsHints;
$('hsEnabled').onclick = async () => {
  if (!can('system.manage')) return;
  const to = !hs.enabled;
  try { await api('PUT', '/api/settings/health', { enabled: to }); toast(`Health monitoring turned ${to ? 'on' : 'off'}`); await loadHealthSettings(); pollNavStats(); }
  catch (e) { $('hsMsg').textContent = e.message; $('hsMsg').className = 'um-msg bad'; }
};
$('hsHosts').onchange = (e) => {
  const id = e.target.dataset.host, set = e.target.dataset.what === 'ping' ? hs.pingOn : hs.remoteOn; if (!id) return;
  e.target.checked ? set.add(id) : set.delete(id);
  renderHsHosts();
};
$('hsHosts').onclick = (e) => {
  const a = e.target.closest('a[data-col]'); if (!a) return;
  if (!can('system.manage')) return showDenied({ permission: 'system.manage', what: 'change health settings' });
  const key = a.dataset.col === 'ping' ? 'pingOn' : 'remoteOn';
  hs[key] = a.dataset.set === 'all' ? new Set(hs.hosts.map((h) => h.id)) : new Set();
  renderHsHosts();
};
$('hsAll').onclick = () => { if (!can('system.manage')) return showDenied({ permission: 'system.manage', what: 'change health settings' }); hs.pingOn = new Set(hs.hosts.map((h) => h.id)); hs.remoteOn = new Set(hs.pingOn); renderHsHosts(); };
$('hsNone').onclick = () => { if (!can('system.manage')) return showDenied({ permission: 'system.manage', what: 'change health settings' }); hs.pingOn = new Set(); hs.remoteOn = new Set(); renderHsHosts(); };
$('hsDefaults').onclick = () => {
  hsSetInterval('hsPing', 'hsPingUnit', hs.defaults.pingSeconds);
  hsSetInterval('hsPort', 'hsPortUnit', hs.defaults.portSeconds);
  hs.pingOn = new Set(hs.hosts.map((h) => h.id)); hs.remoteOn = new Set(hs.pingOn);
  hsHints(); renderHsHosts();
  $('hsMsg').textContent = 'Defaults restored. Press Save to apply them.'; $('hsMsg').className = 'um-msg dim';
};
$('hsSave').onclick = async () => {
  try {
    await api('PUT', '/api/settings/health', {
      pingSeconds: hsSeconds('hsPing', 'hsPingUnit'), portSeconds: hsSeconds('hsPort', 'hsPortUnit'),
      pingOff: hs.hosts.filter((h) => !hs.pingOn.has(h.id)).map((h) => h.id), remoteOff: hs.hosts.filter((h) => !hs.remoteOn.has(h.id)).map((h) => h.id),
    });
    toast('Health settings saved');
    $('hsMsg').textContent = ''; pollNavStats();
    loadHealthSettings();
  } catch (e) { $('hsMsg').textContent = e.message; $('hsMsg').className = 'um-msg bad'; }
};

// ---- Settings: Shell Settings ----
// The on/off switch turns shell access off for everyone (open shells are closed). Below it: which hosts shells can be opened
// to (all of them, or only the ticked ones), how many shells can be open at once (never more than 8) and how many minutes a
// shell may sit without input before it is closed. Anyone who can view the system sees this; changing it needs Manage system.
const ss = { defaults: null, limits: null, hosts: [], allowed: new Set(), mode: 'all', enabled: true };
function setSwitch(id, on) { $(id).setAttribute('aria-checked', String(on)); }
function ssHints() {
  const [lo, hi] = ss.limits.maxSessions, n = Number($('ssMax').value), t = Number($('ssTimeout').value), [tlo, thi] = ss.limits.timeoutMinutes;
  const badMax = !Number.isInteger(n) || n < lo || n > hi, badTime = !Number.isInteger(t) || t < tlo || t > thi;
  $('ssMaxHint').textContent = badMax ? `Must be a whole number from ${lo} to ${hi}` : `at most ${n} open at once (hard limit ${hi})`;
  $('ssMaxHint').className = badMax ? 'bad' : 'dim';
  $('ssTimeoutHint').textContent = badTime ? `Must be a whole number from ${tlo} to ${thi}` : `minutes without input${t === ss.defaults.timeoutMinutes ? ' (the default)' : ` (default ${ss.defaults.timeoutMinutes})`}`;
  $('ssTimeoutHint').className = badTime ? 'bad' : 'dim';
}
function renderSsHosts() {
  const editable = can('system.manage') && ss.mode === 'selected';
  document.querySelectorAll('input[name=ssMode]').forEach((r) => { r.checked = r.value === ss.mode; r.disabled = !can('system.manage'); });
  $('ssHosts').innerHTML = ss.hosts.map((h) => {
    const on = ss.mode === 'all' || ss.allowed.has(h.id);
    return `<label class="hs-host ${on ? '' : 'off'}" title="${ss.mode === 'all' ? 'Shells are allowed to every host. Choose "Only the hosts ticked below" to pick.' : can('system.manage') ? '' : 'Changing this needs Manage system'}">
      <input type="checkbox" data-host="${esc(h.id)}" ${on ? 'checked' : ''} ${editable ? '' : 'disabled'}>
      <span class="hs-name">${esc(h.name)}</span><span class="hs-addr">${esc(h.address)}</span><span class="proto-${h.protocol === 'ssh' ? 'ssh' : 'winrm'}">${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><span class="hs-os">${esc(String(h.os || '').replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}</span></label>`;
  }).join('') || '<p class="dim" style="margin:8px 10px">No saved hosts yet.</p>';
  $('ssCount').textContent = ss.mode === 'all' ? `Shells can be opened to all ${ss.hosts.length} hosts` : `${ss.allowed.size} of ${ss.hosts.length} hosts allowed`;
  $('ssAll').hidden = $('ssNone').hidden = ss.mode === 'all';
}
function renderSsSwitch(active) {
  setSwitch('ssEnabled', ss.enabled);
  $('ssEnabledLabel').textContent = `Shell access: ${ss.enabled ? 'On' : 'Off'}`;
  $('ssEnabledNote').textContent = ss.enabled ? (active ? `${active} shell${active === 1 ? '' : 's'} open now` : 'No shells open') : 'Shells cannot be opened, and any that were open have been closed';
  $('ssBody').classList.toggle('hs-off', !ss.enabled);
}
async function loadShellSettings() {
  let r;
  try { r = await api('GET', '/api/settings/shell'); } catch (e) { $('ssMsg').textContent = e.message; $('ssMsg').className = 'um-msg bad'; return; }
  Object.assign(ss, { defaults: r.defaults, limits: r.limits, hosts: r.hosts, mode: r.settings.hostMode, enabled: r.settings.enabled });
  ss.allowed = new Set(r.settings.hostMode === 'selected' ? r.settings.allowedHosts : r.hosts.map((h) => h.id));
  $('ssMax').value = r.settings.maxSessions; $('ssTimeout').value = r.settings.timeoutMinutes;
  const editable = can('system.manage');
  $('ssMax').disabled = $('ssTimeout').disabled = !editable;
  $('ssMsg').textContent = '';
  renderSsSwitch(r.active); ssHints(); renderSsHosts();
}
$('ssEnabled').onclick = async () => {
  if (!can('system.manage')) return;
  const to = !ss.enabled;
  if (!to && !confirm('Turn shell access off? Every open shell will be closed.')) return;
  try { await api('PUT', '/api/settings/shell', { enabled: to }); toast(`Shell access turned ${to ? 'on' : 'off'}`); loadShellSettings(); }
  catch (e) { $('ssMsg').textContent = e.message; $('ssMsg').className = 'um-msg bad'; }
};
$('ssMax').oninput = $('ssTimeout').oninput = ssHints;
document.querySelectorAll('input[name=ssMode]').forEach((r) => { r.onchange = () => { if (!can('system.manage')) return; ss.mode = r.value; renderSsHosts(); }; });
$('ssHosts').onchange = (e) => {
  const id = e.target.dataset.host; if (!id) return;
  e.target.checked ? ss.allowed.add(id) : ss.allowed.delete(id);
  renderSsHosts();
};
const ssGuard = () => (can('system.manage') ? true : (showDenied({ permission: 'system.manage', what: 'change shell settings' }), false));
$('ssAll').onclick = () => { if (ssGuard()) { ss.allowed = new Set(ss.hosts.map((h) => h.id)); renderSsHosts(); } };
$('ssNone').onclick = () => { if (ssGuard()) { ss.allowed = new Set(); renderSsHosts(); } };
$('ssDefaults').onclick = () => {
  $('ssMax').value = ss.defaults.maxSessions; $('ssTimeout').value = ss.defaults.timeoutMinutes;
  ss.mode = 'all'; ss.allowed = new Set(ss.hosts.map((h) => h.id));
  ssHints(); renderSsHosts();
  $('ssMsg').textContent = 'Defaults restored. Press Save to apply them.'; $('ssMsg').className = 'um-msg dim';
};
$('ssSave').onclick = async () => {
  try {
    await api('PUT', '/api/settings/shell', { hostMode: ss.mode, allowedHosts: [...ss.allowed], maxSessions: Number($('ssMax').value), timeoutMinutes: Number($('ssTimeout').value) });
    toast('Shell settings saved'); loadShellSettings();
  } catch (e) { $('ssMsg').textContent = e.message; $('ssMsg').className = 'um-msg bad'; }
};

// ---- Run Settings: how many hosts a hunt or response works on at once ----
const rs = { defaults: null, limits: null, server: null };
// How the number typed compares with what this server can take: { level: 'ok' | 'warn' | 'bad', text } or null when it is not a valid number.
function rsAdvice(key, n) {
  const sv = rs.server, rec = sv.recommended, gb = (x) => (x >= 10 ? Math.round(x) : x.toFixed(1));
  if (key === 'concurrency') {
    const mem = (n * sv.perHostMb) / 1024, memTxt = `about ${gb(mem)} GB of memory for the PowerShell sessions`;
    if (n <= rec.concurrency) return { level: 'ok', text: `Within what this server handles comfortably (up to ${rec.concurrency}); ${memTxt}.` };
    if (n <= rec.caution) return { level: 'warn', text: `Above the recommended ${rec.concurrency} for ${sv.cores} cores and ${gb(sv.ramGb)} GB: hunts will finish sooner but the server may slow down while sessions start; ${memTxt}.` };
    return { level: 'bad', text: `Too high for ${sv.cores} cores and ${gb(sv.ramGb)} GB (above ${rec.caution}): expect a slow server, timeouts on hosts and possible memory shortage; ${memTxt}. Recommended: ${rec.concurrency}.` };
  }
  const base = n <= rec.largeConcurrency ? { level: 'ok', text: `Fine for this server (recommended up to ${rec.largeConcurrency}).` }
    : n <= rec.largeConcurrency * 2 ? { level: 'warn', text: `Above the recommended ${rec.largeConcurrency}: transfers are limited by disk and network, so each is slower.` }
    : { level: 'bad', text: `Far above the recommended ${rec.largeConcurrency}: the disk and network will be saturated and transfers may time out.` };
  if (sv.freeDiskGb != null && n > 1 && sv.freeDiskGb < 20 * n) { base.text += ` Free disk space for results is ${sv.freeDiskGb} GB, which may not be enough for ${n} large collections at once.`; if (base.level === 'ok') base.level = 'warn'; }
  return base;
}
function rsHints() {
  const chk = (id, key) => {
    const n = Number($(id).value), [lo, hi] = rs.limits[key], bad = !Number.isInteger(n) || n < lo || n > hi;
    $(id + 'Hint').textContent = bad ? `Must be a whole number from ${lo} to ${hi}` : `default ${rs.defaults[key]}, up to ${hi}`; $(id + 'Hint').className = bad ? 'bad' : 'dim';
    const adv = bad ? null : rsAdvice(key, n), box = $(id + 'Advice');
    box.hidden = !adv; if (adv) { box.className = `rs-adv ${adv.level}`; box.textContent = (adv.level === 'ok' ? '\u2713 ' : '\u26A0 ') + adv.text; }
  };
  chk('rsHosts', 'concurrency'); chk('rsLarge', 'largeConcurrency');
  const sv = rs.server;
  $('rsServer').textContent = `This server: ${sv.cores} CPU cores, ${sv.ramGb} GB RAM (${sv.freeRamGb} GB free now)${sv.freeDiskGb != null ? `, ${sv.freeDiskGb} GB free where results are kept` : ''}. Recommended: ${sv.recommended.concurrency} hosts at once and ${sv.recommended.largeConcurrency} large transfers.`;
}
async function loadRunSettings() {
  let r;
  try { r = await api('GET', '/api/settings/runs'); } catch (e) { $('rsMsg').textContent = e.message; $('rsMsg').className = 'um-msg bad'; return; }
  rs.defaults = r.defaults; rs.limits = r.limits; rs.server = r.server;
  $('rsHosts').value = r.settings.concurrency; $('rsLarge').value = r.settings.largeConcurrency;
  $('rsHosts').disabled = $('rsLarge').disabled = !can('system.manage');
  $('rsMsg').textContent = ''; rsHints();
}
$('rsHosts').oninput = $('rsLarge').oninput = rsHints;
$('rsDefaults').onclick = () => { $('rsHosts').value = rs.defaults.concurrency; $('rsLarge').value = rs.defaults.largeConcurrency; rsHints(); $('rsMsg').textContent = 'Defaults restored. Press Save to apply them.'; $('rsMsg').className = 'um-msg dim'; };
$('rsSave').onclick = async () => {
  const risky = [['rsHosts', 'concurrency'], ['rsLarge', 'largeConcurrency']].map(([id, k]) => [Number($(id).value), k]).filter(([n, k]) => Number.isInteger(n) && rsAdvice(k, n).level === 'bad');
  if (risky.length && !confirm(`These settings are well above what this server (${rs.server.cores} cores, ${rs.server.ramGb} GB RAM) can handle:\n\n${risky.map(([n, k]) => rsAdvice(k, n).text).join('\n\n')}\n\nSave them anyway?`)) return;
  try { await api('PUT', '/api/settings/runs', { concurrency: Number($('rsHosts').value), largeConcurrency: Number($('rsLarge').value) }); toast('Run settings saved'); loadRunSettings(); }
  catch (e) { $('rsMsg').textContent = e.message; $('rsMsg').className = 'um-msg bad'; }
};

// ---- Server Settings: the address and port the server listens on and who may connect ----
// Every change is checked by the server as you type (/api/settings/server/check): errors stop the save, warnings ask for a confirmation.
// Saving restarts the server; this page then waits for it to come back (at the new address when that changed).
const sv = { r: null, timer: null, seq: 0, last: null };
const svForm = () => {
  const mode = document.querySelector('input[name=svMode]:checked')?.value || 'local';
  return { host: mode === 'local' ? '127.0.0.1' : mode === 'all' ? '0.0.0.0' : $('svAddr').value, port: Number($('svPort').value), allowFrom: $('svAllow').value };
};
function svRenderAdvice(c) {
  sv.last = c;
  const box = $('svAdvice'), items = [...c.errors.map((t) => ['bad', '\u2716 ' + t]), ...c.warnings.map((t) => ['warn', '\u26A0 ' + t])];
  box.innerHTML = items.map(([k, t]) => `<div class="rs-adv ${k}">${esc(t)}</div>`).join('') + (!c.errors.length ? `<div class="rs-adv ok">\u2713 After saving, the server will be reachable at: ${c.urls.map((u) => esc(u)).join(', ')}. This PC (localhost) can always connect.</div>` : '');
  $('svSave').disabled = !!c.errors.length || !can('system.manage');
}
async function svCheck() {
  const n = ++sv.seq;
  try { const c = await api('POST', '/api/settings/server/check', svForm()); if (n === sv.seq) svRenderAdvice(c); }
  catch (e) { if (n === sv.seq) { $('svAdvice').innerHTML = `<div class="rs-adv bad">${esc(e.message)}</div>`; $('svSave').disabled = true; } }
}
const svSoon = () => { clearTimeout(sv.timer); sv.timer = setTimeout(svCheck, 350); };
async function loadServerSettings() {
  let r;
  try { r = await api('GET', '/api/settings/server'); } catch (e) { $('svMsg').textContent = e.message; $('svMsg').className = 'um-msg bad'; return; }
  sv.r = r;
  const s = r.settings;
  $('svAddr').innerHTML = r.addresses.map((a) => `<option value="${esc(a.address)}">${esc(a.address)} (${esc(a.name)})</option>`).join('') || '<option value="">no network address found</option>';
  const mode = s.host === '127.0.0.1' ? 'local' : s.host === '0.0.0.0' ? 'all' : 'one';
  document.querySelectorAll('input[name=svMode]').forEach((x) => { x.checked = x.value === mode; });
  if (mode === 'one') { if (![...$('svAddr').options].some((o) => o.value === s.host)) $('svAddr').insertAdjacentHTML('beforeend', `<option value="${esc(s.host)}">${esc(s.host)} (not found on this machine)</option>`); $('svAddr').value = s.host; }
  $('svPort').value = s.port; $('svAllow').value = s.allowFrom.join('\n');
  const editable = can('system.manage');
  document.querySelectorAll('input[name=svMode]').forEach((x) => { x.disabled = !editable; });
  $('svAddr').disabled = $('svPort').disabled = $('svAllow').disabled = !editable;
  $('svAddr').hidden = mode !== 'one';
  $('svNow').textContent = `Listening on ${r.running.host === '0.0.0.0' ? 'all interfaces' : r.running.host}:${r.running.port}. You are connected from ${r.you.address}.`;
  $('svFallback').hidden = !r.fallback;
  if (r.fallback) $('svFallbackText').textContent = `Saved settings failed (${r.fallback.reason}); started on ${r.fallback.used} instead.`;
  $('svMsg').textContent = '';
  svCheck();
}
document.querySelectorAll('input[name=svMode]').forEach((x) => { x.onchange = () => { $('svAddr').hidden = x.value !== 'one' || !x.checked; svSoon(); }; });
$('svAddr').onchange = $('svPort').oninput = $('svAllow').oninput = svSoon;
$('svFallbackDismiss').onclick = async () => { await api('DELETE', '/api/settings/server/fallback').catch(() => {}); $('svFallback').hidden = true; };
$('svReset').onclick = () => {
  const d = sv.r.defaults;
  document.querySelectorAll('input[name=svMode]').forEach((x) => { x.checked = x.value === (d.host === '127.0.0.1' ? 'local' : 'all'); });
  $('svAddr').hidden = true; $('svPort').value = d.port; $('svAllow').value = ''; svCheck();
  $('svMsg').textContent = 'Defaults restored (this PC only). Press Save to apply them.'; $('svMsg').className = 'um-msg dim';
};
// After a save the server restarts: wait for it, at the new address when that changed, then open the page there.
async function svWaitForRestart(urls, port) {
  const here = new URL(location.href);
  const target = (() => {
    const h = here.hostname, local = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    const pick = urls.find((u) => new URL(u).hostname === h) || (local ? urls.find((u) => new URL(u).hostname === '127.0.0.1') : urls[0]) || `http://127.0.0.1:${port}`;
    return local ? `http://${h}:${port}` : pick;
  })();
  $('svMsg').className = 'um-msg dim';
  const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 2500));
  while (Date.now() - t0 < 40000) {
    $('svMsg').textContent = `Restarting the server… waiting for ${target}`;
    try { await fetch(`${target}/login.html`, { mode: 'no-cors', cache: 'no-store' }); location.href = `${target}/#settings/server-settings`; return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  $('svMsg').className = 'um-msg bad';
  $('svMsg').textContent = `No answer at ${target}. Try http://127.0.0.1:${port} on the server PC.`;
}
$('svSave').onclick = async () => {
  const body = svForm();
  const c = sv.last;
  if (!c || c.errors.length) return;
  if (c.warnings.length && !confirm(`The server will restart with these settings, but they look wrong:\n\n${c.warnings.map((w) => '\u2022 ' + w).join('\n\n')}\n\nSave and restart anyway?`)) return;
  if (!c.warnings.length && !confirm('Save these settings and restart the server? Everyone using it is disconnected for a few seconds; running hunts are not resumed.')) return;
  const running = [...bh.runs, ...br.runs].filter((x) => x.status === 'running').length;
  if (running && !confirm(`${running} hunt/response${running === 1 ? ' is' : 's are'} still running. Restarting stops ${running === 1 ? 'it' : 'them'}. Restart anyway?`)) return;
  $('svSave').disabled = true;
  try { const r = await api('PUT', '/api/settings/server', { ...body, confirm: true }); svWaitForRestart(r.urls, c.normalized.port); }
  catch (e) { $('svMsg').textContent = e.message; $('svMsg').className = 'um-msg bad'; $('svSave').disabled = false; }
};

// ---- Certificate: HTTPS for the server ----
// Generates a private certificate authority (CA) and a server certificate for the names typed here, turns HTTPS on or off (the server
// restarts) and downloads the CA so other machines can trust it. Plain HTTP requests from other machines are redirected to HTTPS; this PC
// (localhost) keeps working over plain HTTP whatever the certificate is.
const ce = { st: null, addrs: [] };
const ceDate = (iso) => new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
// ---- Elastic: forward hunt rows to Elasticsearch ----
const el = { st: null };
function elShowAuth() { const a = $('elAuth').value; $('elKeyRow').hidden = a !== 'apikey'; $('elBasicRow').hidden = a !== 'basic'; }
function elBody() {
  const b = { url: $('elUrl').value, auth: $('elAuth').value, index: $('elIndex').value, insecure: $('elInsecure').checked, ca: $('elCa').value, username: $('elUser').value };
  if ($('elKey').value) b.apiKey = $('elKey').value;
  if ($('elPass').value) b.password = $('elPass').value;
  return b;
}
function elMsg(t, cls) { $('elMsg').className = 'um-msg ' + (cls || ''); $('elMsg').textContent = t; }
function elStatusText(s) {
  const bits = [];
  if (s.sent || s.failed) bits.push(`${s.sent.toLocaleString()} rows sent, ${s.failed.toLocaleString()} failed since the server started`);
  if (s.queued) bits.push(`${s.queued.toLocaleString()} waiting`);
  if (s.lastOkAt) bits.push('last sent ' + new Date(s.lastOkAt).toLocaleString());
  if (s.lastError) bits.push('last error: ' + s.lastError);
  $('elStatus').textContent = bits.join(' \u00b7 ');
}
async function loadElastic() {
  let r;
  try { r = await api('GET', '/api/settings/elastic'); } catch (e) { elMsg(e.message, 'bad'); return; }
  const s = r.settings; el.st = s;
  const editable = can('system.manage');
  setSwitch('elEnabled', s.enabled);
  $('elEnabledLabel').textContent = `Forwarding: ${s.enabled ? 'On' : 'Off'}`;
  $('elEnabledNote').textContent = s.enabled ? 'New hunt results are sent as they arrive.' : 'Off: nothing is sent unless you send a hunt below.';
  $('elUrl').value = s.url; $('elAuth').value = s.auth; $('elIndex').value = s.index; $('elInsecure').checked = s.insecure; $('elCa').value = s.ca; $('elUser').value = s.username;
  $('elKey').value = ''; $('elPass').value = '';
  $('elKey').placeholder = s.hasApiKey ? '(saved: type to replace)' : 'Paste the key (encoded or id:key)';
  $('elPass').placeholder = s.hasPassword ? '(saved: type to replace)' : '';
  $('elIndexHint').textContent = `indexes: ${s.index}-<collection>  (data view: ${s.index}-*)`;
  elShowAuth();
  for (const id of ['elUrl', 'elAuth', 'elKey', 'elUser', 'elPass', 'elIndex', 'elInsecure', 'elCa']) $(id).disabled = !editable;
  $('elAdvice').innerHTML = '';
  elStatusText(r.status);
  try {
    const runs = (await api('GET', '/api/runs')).filter((x) => x.kind === 'hunt' && x.status !== 'running').slice(0, 100);
    $('elRun').innerHTML = runs.length ? runs.map((x) => `<option value="${esc(x.id)}">${esc(x.name)} (${esc(new Date(x.startedAt).toLocaleString())}${x.elastic ? `, sent ${x.elastic.sent}${x.elastic.failed ? `, failed ${x.elastic.failed}` : ''}` : ''})</option>`).join('') : '<option value="">No finished hunts</option>';
    $('elSend').disabled = !editable || !runs.length;
  } catch { $('elRun').innerHTML = '<option value="">Hunts unavailable</option>'; $('elSend').disabled = true; }
}
$('elAuth').onchange = elShowAuth;
$('elEnabled').onclick = async () => {
  if (!can('system.manage')) return;
  const to = $('elEnabled').getAttribute('aria-checked') !== 'true';
  try { await api('PUT', '/api/settings/elastic', { ...elBody(), enabled: to }); } catch (e) { elMsg(e.message, 'bad'); return; }
  await loadElastic(); elMsg(to ? 'Forwarding turned on' : 'Forwarding turned off', 'ok');
};
$('elSave').onclick = async () => {
  elMsg('Saving\u2026', 'dim');
  try { await api('PUT', '/api/settings/elastic', elBody()); } catch (e) { elMsg(e.message, 'bad'); return; }
  await loadElastic(); elMsg('Saved', 'ok');
};
$('elTest').onclick = async () => {
  elMsg('Testing\u2026', 'dim'); $('elAdvice').innerHTML = '';
  let t;
  try { t = await api('POST', '/api/settings/elastic/test', elBody()); } catch (e) { elMsg(e.message, 'bad'); return; }
  elMsg('');
  const lines = [];
  if (t.version) lines.push(`<div class="rs-adv ok">\u2713 Connected to Elasticsearch ${esc(t.version)}${t.cluster ? ` (cluster ${esc(t.cluster)})` : ''}${t.security === false ? ', security is off' : ''}</div>`);
  if (t.canWrite === true && t.security) lines.push('<div class="rs-adv ok">\u2713 This account can create indexes and write documents</div>');
  if (t.note) lines.push(`<div class="rs-adv">${esc(t.note)}</div>`);
  if (t.error) lines.push(`<div class="rs-adv bad">${esc(t.error)}</div>`);
  $('elAdvice').innerHTML = lines.join('');
};
$('elSend').onclick = async () => {
  const runId = $('elRun').value; if (!runId) return;
  elMsg('Queuing\u2026', 'dim');
  try { const r = await api('POST', '/api/settings/elastic/forward', { runId }); elMsg(`${r.queued.toLocaleString()} rows queued`, 'ok'); } catch (e) { elMsg(e.message, 'bad'); return; }
  setTimeout(async () => { try { elStatusText((await api('GET', '/api/settings/elastic')).status); } catch { /* ignore */ } }, 3000);
};
async function loadCertificate() {
  let st;
  try { st = await api('GET', '/api/settings/certificate'); } catch (e) { $('ceMsg').textContent = e.message; $('ceMsg').className = 'um-msg bad'; return; }
  try { ce.addrs = (await api('GET', '/api/settings/server')).addresses.map((a) => a.address); } catch { ce.addrs = []; }
  ce.st = st;
  const editable = can('system.manage');
  setSwitch('ceEnabled', st.enabled);
  $('ceEnabledLabel').textContent = `HTTPS: ${st.enabled ? 'On' : 'Off'}`;
  $('ceEnabledNote').textContent = st.enabled ? 'Other machines are redirected to https://. This PC can still use plain http://.' : st.hasCert ? 'Turn it on to serve the certificate below.' : 'Generate a certificate first.';
  $('ceNames').value = (st.names.length ? st.names : ce.addrs).join('\n');
  $('ceNames').disabled = !editable;
  const c = st.cert, ca = st.ca;
  $('ceInfo').innerHTML = c
    ? `<div class="bd-facts"><div><span>Names and addresses</span>${esc(c.names.join(', '))}</div><div><span>Valid until</span>${esc(ceDate(c.notAfter))} <span class="dim" style="display:inline;text-transform:none">(${c.daysLeft} days)</span></div><div><span>Certificate fingerprint</span><code style="font-size:11px;word-break:break-all">${esc(c.fingerprint)}</code></div>${ca ? `<div><span>CA (trust this one)</span>${esc(ca.subject)}, until ${esc(ceDate(ca.notAfter))}<br><code style="font-size:11px;word-break:break-all">${esc(ca.fingerprint)}</code></div>` : ''}</div>`
    : '<p class="dim" style="margin:0">No certificate yet. Check the names below and press Generate.</p>';
  $('ceAdvice').innerHTML = [...st.warnings.map((t) => `<div class="rs-adv warn">\u26A0 ${esc(t)}</div>`), ...(st.loadError ? [`<div class="rs-adv bad">${esc(st.loadError)}</div>`] : []), ...(!st.engine ? ['<div class="rs-adv bad">The bundled Python is not installed, so certificates cannot be generated. Run: npm run setup-winrm</div>'] : [])].join('');
  $('ceCa').hidden = !ca;
  $('ceGen').disabled = $('ceNewCa').disabled = $('ceAddMine').disabled = !editable || !st.engine;
  $('ceMsg').textContent = '';
}
$('ceAddMine').onclick = () => {
  const have = new Set($('ceNames').value.split(/[\s,;]+/).filter(Boolean).map((x) => x.toLowerCase()));
  for (const a of [...ce.addrs, location.hostname.replace(/^\[|\]$/g, '')]) if (a && !['localhost', '127.0.0.1', '::1'].includes(a)) have.add(a.toLowerCase());
  $('ceNames').value = [...have].join('\n');
};
async function ceGenerate(newCa) {
  if (newCa && !confirm('Make a NEW certificate authority? Every machine that trusts the current one must import the new CA, or it gets a certificate error.')) return;
  $('ceMsg').className = 'um-msg dim'; $('ceMsg').textContent = 'Generating…';
  try {
    const r = await api('POST', '/api/settings/certificate/generate', { names: $('ceNames').value, newCa });
    toast(r.reusedCa ? 'Certificate generated (same CA)' : 'Certificate and CA generated');
    await loadCertificate();
    $('ceMsg').className = 'um-msg dim';
    $('ceMsg').textContent = ce.st.enabled ? 'Restart the server (turn HTTPS off and on) to use the new certificate.' : 'Done. Download the CA, trust it on the machines you browse from, then turn HTTPS on.';
  } catch (e) { $('ceMsg').textContent = e.message; $('ceMsg').className = 'um-msg bad'; }
}
$('ceGen').onclick = () => ceGenerate(false);
$('ceNewCa').onclick = () => ceGenerate(true);
$('ceEnabled').onclick = async () => {
  if (!can('system.manage')) return;
  const to = !ce.st.enabled;
  if (to && !ce.st.hasCert) { $('ceMsg').textContent = 'Generate a certificate first.'; $('ceMsg').className = 'um-msg bad'; return; }
  const msg = to
    ? 'Turn HTTPS on and restart? Other machines are redirected to https:// and must trust the CA. This PC keeps plain http://.'
    : 'Turn HTTPS off and restart the server? Everything goes back to plain HTTP.';
  if (!confirm(msg)) return;
  const running = [...bh.runs, ...br.runs].filter((x) => x.status === 'running').length;
  if (running && !confirm(`${running} hunt/response${running === 1 ? ' is' : 's are'} still running. Restarting stops ${running === 1 ? 'it' : 'them'}. Restart anyway?`)) return;
  try { await api('PUT', '/api/settings/certificate', { enabled: to }); } catch (e) { $('ceMsg').textContent = e.message; $('ceMsg').className = 'um-msg bad'; return; }
  // wait for the server (plain HTTP answers either way: other machines just get a redirect), then move to the right scheme
  const here = new URL(location.href), local = ['localhost', '127.0.0.1', '[::1]'].includes(here.hostname);
  const httpUrl = `http://${here.host}`, goto = to ? (local ? httpUrl : `https://${here.host}`) : httpUrl;
  $('ceMsg').className = 'um-msg dim';
  await new Promise((r) => setTimeout(r, 2500));
  for (const t0 = Date.now(); Date.now() - t0 < 40000; await new Promise((r) => setTimeout(r, 1000))) {
    $('ceMsg').textContent = 'Restarting the server…';
    try { await fetch(`${httpUrl}/login.html`, { mode: 'no-cors', cache: 'no-store', redirect: 'manual' }); location.href = `${goto}/#settings/certificate`; return; } catch { /* not up yet */ }
  }
  $('ceMsg').className = 'um-msg bad';
  $('ceMsg').textContent = `The server did not answer. From the server PC, open http://127.0.0.1:${here.port || 46200} (localhost always works).`;
};

// ---- Health: monitor ----
// One box per saved host. Host is the ping result (checked every minute); Remote is the WinRM or SSH port (checked every
// 5 minutes). Green is up, red is not responding, grey is not checked yet. The checks run in the server (src/monitor.js);
// this page only shows the latest results. The Shell tab shows the same counts as X/Y.
let monSnap = null, monTimer;
async function fetchMonitor(force = false) {
  if (!can('system.view')) { monSnap = null; if ($('navStats')) $('navStats').innerHTML = ''; return null; }
  try { monSnap = await api(force ? 'POST' : 'GET', force ? '/api/monitor/check' : '/api/monitor'); } catch { /* keep the last results */ }
  renderNavStats();
  if (isActive('hosts/view-hosts')) paintHostDots();
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
  const { pingTotal, remoteTotal, hostsUp, remoteUp } = snap.summary;
  return `<span title="Hosts that answer ping"><b class="${monClass(hostsUp, pingTotal)}">${hostsUp}/${pingTotal}</b> hosts up</span>
    <span title="Hosts whose WinRM or SSH port is open"><b class="${monClass(remoteUp, remoteTotal)}">${remoteUp}/${remoteTotal}</b> remote up</span>`;
};
// Green when everything is up, orange when at least 80% is, red below that.
const monClass = (n, total) => (!total ? 'dim' : n === total ? 'ok' : n / total >= 0.8 ? 'warnc' : 'bad');
// The small "hosts up · remote up" count under the Shell button in the top bar.
function renderNavStats() {
  const el = $('navStats'); if (!el || !monSnap) return;
  if (monSnap.enabled === false) { el.innerHTML = '<span title="Health monitoring is turned off in Settings > System > Health Settings">health monitoring off</span>'; return; }
  const { total, pingTotal, remoteTotal, hostsUp, remoteUp } = monSnap.summary;
  const part = (label, tip, up, n) => `<span title="${tip}">${label} ${n ? `<b class="${monClass(up, n)}">${up}/${n}</b>` : '<b class="dim">off</b>'}</span>`;
  el.innerHTML = total ? part('hosts', 'Hosts up (answering ping)', hostsUp, pingTotal) + part('remote', 'Remote up (WinRM or SSH port open)', remoteUp, remoteTotal) : '';
}
let navTimer;
async function pollNavStats() {
  await fetchMonitor();
  clearTimeout(navTimer);
  navTimer = setTimeout(pollNavStats, 10000);
}
// Quarantine and release run in the background, so say how each one ended when its card stops showing "…".
const monQPrev = new Map();
function monQuarantineToasts() {
  const now = new Map((monSnap?.hosts || []).map((h) => [h.id, h]));
  for (const [id, was] of monQPrev) {
    const h = now.get(id), q = h?.quarantine, name = h?.name || 'The host';
    if (was === 'pending') { if (!q) toast(`Quarantine of ${name} failed. See the Quarantine log.`, 'bad'); else if (q.status === 'active') toast(`${name} is quarantined`); }
    if (was === 'releasing') { if (!q) toast(`${name} is no longer quarantined`); else if (q.status === 'active') toast(`Release of ${name} failed. See the Quarantine log.`, 'bad'); }
  }
  monQPrev.clear();
  for (const h of monSnap?.hosts || []) if (h.quarantine && (h.quarantine.status === 'pending' || h.quarantine.status === 'releasing')) monQPrev.set(h.id, h.quarantine.status);
}
function renderMonitor() {
  if (!monSnap) return;
  monQuarantineToasts();
  if (monSnap.enabled === false) {
    $('monSum').innerHTML = '<span class="dim">Monitoring is off</span>';
    $('monGrid').innerHTML = '<p class="dim" style="margin:0">Health monitoring is off (Settings → System → Health Settings).</p>';
    return;
  }
  const pe = fmtSecs(monSnap.summary.pingEveryMs / 1000), re = fmtSecs(monSnap.summary.portsEveryMs / 1000);
  $('monSub').textContent = `Ping every ${pe}, WinRM / SSH port every ${re}. Green up, red down, dashed not monitored.`;
  $('monSum').innerHTML = monCountsHtml(monSnap) + (monSnap.summary.excluded ? `<span class="dim" title="Change which hosts are monitored in Settings > System > Health Settings">${monSnap.summary.excluded} not monitored</span>` : '');
  const n = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0) || 0;
  const hosts = [...monSnap.hosts].sort((a, b) => n(a.address) - n(b.address) || a.address.localeCompare(b.address));
  $('monGrid').innerHTML = hosts.map((h) => {
    const hp = h.host, rm = h.remote;
    const hostTxt = hp.state === 'off' ? 'not monitored' : hp.state === 'up' ? `up${hp.rttMs ? ` · ${hp.rttMs} ms` : ''}` : hp.state === 'down' ? 'not responding' : 'checking…';
    const remTxt = rm.state === 'off' ? 'not monitored' : rm.state === 'up' ? 'open' : rm.state === 'down' ? 'not responding' : 'checking…';
    const hostTip = hp.state === 'off' ? 'Ping is turned off for this host in Settings > System > Health Settings' : hp.state === 'unknown' ? 'Ping has not run yet' : `Ping: ${hp.state === 'up' ? 'replied' : 'no reply'} (checked ${ago(hp.checkedAt)}; ${hp.state === 'up' ? 'up' : 'down'} for ${dur(hp.since)}). Checked every ${pe}.`;
    const remTip = rm.state === 'off' ? `The ${rm.label} port check is turned off for this host in Settings > System > Health Settings` : rm.state === 'unknown' ? `${rm.label} port check has not run yet` : `${rm.label}: ${rm.ports.map((p) => `port ${p.port} ${p.state}`).join(', ')} (checked ${ago(rm.checkedAt)}; ${rm.state === 'up' ? 'up' : 'down'} for ${dur(rm.since)}). Checked every ${re}.`;
    const q = h.quarantine, qs = q ? q.status || 'active' : '';
    return `<div class="mon-box ${hp.state === 'off' ? rm.state : hp.state} ${q ? 'quarantined' : ''}">
      <div class="mon-name"><span>${q ? '<span class="q-warn" title="This host is quarantined (network-isolated)">⚠</span> ' : ''}${esc(h.name)}</span><span class="mon-proto ${h.protocol === 'ssh' ? 'proto-ssh' : 'proto-winrm'}">${rm.label}</span></div>
      <div class="mon-addr">${esc(h.address)}${h.os ? ` · ${esc(String(h.os).replace(/^Microsoft /, '').replace(/\s*\(\d[\d.]*\)$/, ''))}` : ''}</div>
      <div class="mon-pills">
        <span class="mon-pill ${hp.state}" title="${esc(hostTip)}"><i></i><b>Host</b>${esc(hostTxt)}</span>
        <span class="mon-pill ${rm.state}" title="${esc(remTip)}"><i></i><b>Remote</b>${rm.state === 'off' ? '' : `${esc(rm.label)} `}${esc(remTxt)}</span>
      </div>
      ${q ? `<div class="q-banner">⚠ ${qs === 'pending' ? 'QUARANTINING…' : qs === 'releasing' ? 'RELEASING…' : `QUARANTINED · ${q.until ? `until ${esc(new Date(q.until).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}` : 'until released'}${q.by ? ` · by ${esc(q.by)}` : ''}`}</div>${q.lastError ? `<div class="q-err" title="${esc(q.lastError)}">Last release failed: ${esc(q.lastError)}</div>` : ''}` : ''}
      <div class="mon-foot"><span class="mon-btns"><button class="act sec mon-check" type="button" data-check="${esc(h.id)}" title="Ping this host and check its ${rm.label} port now">Check</button><button class="act mon-q ${q ? 'on' : ''}" type="button" data-q="${esc(h.id)}" data-qname="${esc(h.name)}" data-qon="${q ? 1 : ''}" ${qs === 'pending' || qs === 'releasing' ? 'disabled' : ''} data-perm="actions.run" data-perm-what="quarantine hosts" title="${q ? 'Lift the quarantine: restore this host\'s network access' : 'Isolate this host from the network with Host - Isolate'}">${qs === 'pending' ? 'Quarantining…' : qs === 'releasing' ? 'Releasing…' : q ? 'Unquarantine' : 'Quarantine'}</button></span>${hp.state === 'off' ? 'ping off' : `pinged ${ago(hp.checkedAt)}`} · ${rm.state === 'off' ? `${rm.label} check off` : `${rm.label} checked ${ago(rm.checkedAt)}`}</div></div>`;
  }).join('') || '<p class="dim" style="margin:0">No saved hosts yet. Add and authenticate hosts under Host Management to monitor them.</p>';
}
async function loadMonitor() {
  await fetchMonitor();
  renderMonitor();
  clearTimeout(monTimer);
  if (isActive('health/monitor')) monTimer = setTimeout(loadMonitor, 5000);
}
// Health > Monitor log: every ping and port check the monitor made, newest first.
let mlEntries = [], mlTimer, mlFilter = 'all';
async function loadMonitorLog() {
  try { const r = await api('GET', '/api/monitor/log?limit=1000'); mlEntries = r.entries; mlEnabled = r.enabled; } catch (e) { $('mlBox').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  renderMonitorLog();
  clearTimeout(mlTimer);
  if (isActive('health/monitor-log')) mlTimer = setTimeout(loadMonitorLog, 5000);
}
// ---- Quarantine: the "for how long?" popup, the "are you sure?" popup, and Health > Quarantine log ----
let qHost = null;
function openQuarantine(hostId, name, on) {
  qHost = { id: hostId, name };
  $('qMsg').textContent = ''; $('qMsg').className = '';
  if (on) {
    $('uqWho').textContent = name; $('uqMsg').textContent = ''; $('uqMsg').className = '';
    $('uqYes').disabled = false; $('uqYes').textContent = 'Yes, unquarantine'; $('uqModal').hidden = false; $('uqNo').focus();
  } else {
    $('qWho').textContent = name; $('qUntil').checked = true; $('qCustom').value = ''; $('qGo').disabled = false; $('qGo').textContent = 'Quarantine'; $('qModal').hidden = false; $('qGo').focus();
  }
}
const closeQ = () => { $('qModal').hidden = true; $('uqModal').hidden = true; };
$('qX').onclick = $('qCancel').onclick = $('uqX').onclick = $('uqNo').onclick = closeQ;
$('qModal').onclick = (e) => { if (e.target.id === 'qModal') closeQ(); };
$('uqModal').onclick = (e) => { if (e.target.id === 'uqModal') closeQ(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (!$('qModal').hidden || !$('uqModal').hidden)) closeQ(); });
$('qCustom').oninput = () => { if ($('qCustom').value) $('qCustomRadio').checked = true; };
$('qGo').onclick = async () => {
  const v = document.querySelector('#qModal input[name=qlen]:checked')?.value;
  let minutes = v === 'custom' ? Number($('qCustom').value) : v === 'until' ? 0 : Number(v);
  if (v === 'custom' && (!Number.isInteger(minutes) || minutes < 1)) { $('qMsg').textContent = 'Enter a whole number of minutes.'; $('qMsg').className = 'bad'; return; }
  $('qGo').disabled = true;
  try { await api('POST', `/api/quarantine/${encodeURIComponent(qHost.id)}`, { minutes: minutes || null }); closeQ(); toast(`Quarantining ${qHost.name}…`); loadMonitor(); }
  catch (e) { $('qMsg').textContent = e.message; $('qMsg').className = 'bad'; $('qGo').disabled = false; $('qGo').textContent = 'Quarantine'; }
};
$('uqYes').onclick = async () => {
  $('uqYes').disabled = true;
  try { await api('DELETE', `/api/quarantine/${encodeURIComponent(qHost.id)}`); closeQ(); toast(`Releasing ${qHost.name}…`); loadMonitor(); }
  catch (e) { $('uqMsg').textContent = e.message; $('uqMsg').className = 'bad'; $('uqYes').disabled = false; $('uqYes').textContent = 'Yes, unquarantine'; }
};
let qlTimer;
async function loadQuarantineLog() {
  let entries;
  try { entries = (await api('GET', '/api/quarantine/log?limit=1000')).entries; } catch (e) { $('qlBox').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const q = $('qlSearch').value.trim().toLowerCase();
  const shown = entries.filter((e) => !q || [e.host, e.address, e.action, e.by, e.detail].some((v) => String(v || '').toLowerCase().includes(q)));
  $('qlCount').textContent = `${shown.length} of ${entries.length} shown`;
  const bad = (a) => /failed/i.test(a), good = (a) => /^(Quarantined|Released)/.test(a);
  $('qlBox').innerHTML = shown.length
    ? `<table class="ml"><thead><tr><th>Time</th><th>Host</th><th>Event</th><th>By</th><th>Detail</th></tr></thead><tbody>${shown.map((e) => `<tr><td class="dim" title="${esc(e.t)}">${esc(new Date(e.t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</td>
        <td><b>${esc(e.host)}</b> <span class="dim">${esc(e.address)}</span></td><td class="${bad(e.action) ? 'bad' : e.action === 'Quarantined' ? 'q-text' : good(e.action) ? 'ok' : ''}">${esc(e.action)}</td><td>${e.by ? esc(e.by) : '<span class="dim">-</span>'}</td><td class="mlm ${bad(e.action) ? 'bad' : ''}">${esc(e.detail || '')}</td></tr>`).join('')}</tbody></table>`
    : `<p class="dim" style="margin:0">${entries.length ? 'Nothing matches.' : 'No host has been quarantined yet.'}</p>`;
  clearTimeout(qlTimer);
  if (isActive('health/quarantine-log')) qlTimer = setTimeout(loadQuarantineLog, 5000);
}
$('qlSearch').oninput = loadQuarantineLog;
let mlEnabled = true;
function renderMonitorLog() {
  const q = $('mlSearch').value.trim().toLowerCase();
  document.querySelectorAll('#mlFilter button').forEach((b) => b.classList.toggle('on', b.dataset.f === mlFilter));
  const shown = mlEntries.filter((e) => (mlFilter === 'all' || (mlFilter === 'ok') === e.ok) && (!q || [e.host, e.address, e.check, e.command, e.message].some((v) => String(v || '').toLowerCase().includes(q)))).slice(0, 500);
  $('mlCount').textContent = `${shown.length} of ${mlEntries.length} shown`;
  $('mlBox').innerHTML = shown.length
    ? `<table class="ml"><thead><tr><th>Time</th><th>Host</th><th>Check</th><th>Command</th><th>Result</th><th>Message</th></tr></thead><tbody>${shown.map((e) => `<tr><td class="dim" title="${esc(e.t)}">${esc(new Date(e.t).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</td>
        <td><b>${esc(e.host)}</b> <span class="dim">${esc(e.address)}</span></td><td>${esc(e.check)}</td><td class="mlc">${esc(e.command)}</td>
        <td class="${e.ok ? 'ok' : 'bad'}">${e.ok ? 'Success' : 'Error'}</td><td class="mlm ${e.ok ? '' : 'bad'}">${esc(e.message)}</td></tr>`).join('')}</tbody></table>`
    : `<p class="dim" style="margin:0">${mlEnabled ? (mlEntries.length ? 'No checks match.' : 'No checks have run yet since the server started.') : 'Health monitoring is off.'}</p>`;
}
$('mlSearch').oninput = renderMonitorLog;
$('mlFilter').onclick = (e) => { if (e.target.dataset.f) { mlFilter = e.target.dataset.f; renderMonitorLog(); } };
$('monGrid').onclick = async (e) => {
  const qb = e.target.closest('[data-q]');
  if (qb) { openQuarantine(qb.dataset.q, qb.dataset.qname, !!qb.dataset.qon); return; }
  const b = e.target.closest('[data-check]'); if (!b) return;
  b.disabled = true; b.textContent = 'Checking…';
  try { monSnap = await api('POST', `/api/monitor/check/${encodeURIComponent(b.dataset.check)}`); } catch (err) { toast(err.message, 'bad'); }
  renderMonitor();
};
$('monCheck').onclick = async () => { $('monCheck').disabled = true; await fetchMonitor(true); renderMonitor(); setTimeout(() => { $('monCheck').disabled = false; loadMonitor(); }, 2500); };

// ---- Shell ----
// Left: Start/End shell for the selected host, a search box and the authenticated hosts. Right: the terminal.
// SSH hosts get a real terminal (keys go straight to the host); WinRM hosts get a line-by-line PowerShell shell, so
// the page does the line editing (typing, backspace, history) and sends a command when you press Enter.
let shellHosts = [], shellLists = [], shellHost = null, shellQuery = '';
const shellFolded = new Set(); // groups folded in the host list
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
  const off = shellCfg && !shellCfg.enabled, blocked = !!(shellCfg && shellCfg.allowedHosts && shellHost && !shellCfg.allowedHosts.includes(shellHost));
  b.disabled = !shellHost || sh?.status === 'connecting' || (!live && (off || blocked));
  b.title = !live && off ? 'Shell access is turned off in Shell Settings' : !live && blocked ? 'Shells to this host are not allowed in Shell Settings' : shellHost ? '' : 'Select a host first';
}
function renderShellList() {
  const q = shellQuery.toLowerCase();
  const n = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0) || 0;
  const shown = shellHosts.filter((h) => !q || [h.address, h.hostname, h.name].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => n(a.address) - n(b.address) || a.address.localeCompare(b.address));
  const el = $('shellList'); if (!el) return;
  // each host sits under every group it is in; hosts in no group come under Unassigned
  const grouped = new Set(shellLists.flatMap((l) => l.hostIds));
  const groups = [...shellLists.map((l) => ({ id: l.id, name: l.name, hosts: shown.filter((h) => l.hostIds.includes(h.id)) })), { id: UNASSIGNED, name: 'Unassigned', hosts: shown.filter((h) => !grouped.has(h.id)) }].filter((g) => g.hosts.length);
  const hostBtn = (h) => {
    const live = shells.get(h.id) && shells.get(h.id).status !== 'ended';
    return `<button class="shellhost ${h.id === shellHost ? 'on' : ''} ${shellDenied(h.id) ? 'denied' : ''}" data-shell-host="${esc(h.id)}" title="${esc(shellDenied(h.id) ? (shellCfg && !shellCfg.enabled ? 'Shell access is turned off in Shell Settings' : 'Shells to this host are not allowed in Shell Settings') : h.os || '')}">
      <span class="sh-name">${live ? '<i class="dot"></i>' : ''}${esc(h.name || h.hostname)}</span><span class="sh-ip">${esc(h.address)}</span></button>`;
  };
  el.innerHTML = groups.map((g) => {
    const folded = shellFolded.has(g.id) && !q;
    return `<button type="button" class="shgrp" data-shfold="${esc(g.id)}" aria-expanded="${!folded}"><span class="chev">${folded ? '▸' : '▾'}</span><span class="shg-name">${esc(g.name)}</span><span class="shg-n">${g.hosts.length}</span></button>${folded ? '' : g.hosts.map(hostBtn).join('')}`;
  }).join('') || `<div class="empty">${shellHosts.length ? 'No hosts match' : 'No authenticated hosts yet'}</div>`;
}
function renderShellMain() {
  const h = hostOf(shellHost), sh = shells.get(shellHost);
  const [cls, label] = !sh ? ['grey', 'Not connected'] : { connecting: ['grey', 'Connecting…'], connected: ['green', 'Connected'], ended: ['red', 'Session ended'] }[sh.status];
  $('shellHead').innerHTML = h
    ? `<span class="sh-title">${esc(h.name || h.hostname)}</span><span class="dim">${esc(h.address)} · ${h.protocol === 'ssh' ? 'SSH' : 'WinRM'}</span><span class="badge ${cls}">${label}</span>${shellCfg && !shellCfg.enabled ? '<span class="badge red" title="Turned off in Settings > System > Shell Settings">Shell access is off</span>' : shellDenied(shellHost) ? '<span class="badge red" title="Change this in Settings > System > Shell Settings">Not allowed for this host</span>' : ''}
       <span class="shell-actions"><button class="act sec" data-shell-act="Send file" data-perm="shell.files" data-perm-what="send files to hosts">Send file</button><button class="act sec" data-shell-act="Pull file" data-perm="shell.files" data-perm-what="pull files from hosts">Pull file</button><button class="act sec" data-shell-act="Quick hunt" data-perm="hunts.run" data-perm-what="run hunts">Quick hunt</button><button class="act sec" data-shell-act="Quick response" data-perm="actions.run" data-perm-what="run actions">Quick response</button></span>`
    : '<span class="dim">Select a host on the left, then press Start shell.</span>';
  for (const [id, s] of shells) s.el.hidden = id !== shellHost;
  $('termEmpty').hidden = !!sh;
  if (sh) { sh.fit.fit(); sh.term.focus(); }
  updateShellButton();
}
// The row of buttons next to the status. Quick hunt and Quick response open the New Hunt / New Response dialog for this one host.
$('shellHead').onclick = (e) => {
  const act = e.target.dataset.shellAct; if (!act) return;
  if (act === 'Send file') {
    if (!liveShell()) return;
    positionMenu(e.target);
    $('sendMenu').hidden = !$('sendMenu').hidden;
    return;
  }
  if (act === 'Pull file') { openPull(); return; }
  const h = hostOf(shellHost); if (!h) return;
  if (act === 'Quick hunt') openHuntModal(h);
  else if (act === 'Quick response') window.openRespModal?.(h); // respond.js
};
let shellCfg = null; // the limits from Shell Settings (on/off, allowed hosts, maximum and timeout)
const shellDenied = (hostId) => !!(shellCfg && (!shellCfg.enabled || (shellCfg.allowedHosts && !shellCfg.allowedHosts.includes(hostId))));
async function loadShell() {
  try { shellCfg = await api('GET', '/api/shell/config'); } catch { shellCfg = null; }
  try { shellHosts = await api('GET', '/api/hosts'); } catch { shellHosts = []; }
  try { shellLists = await api('GET', '/api/lists'); } catch { shellLists = []; }
  if (!shellHosts.some((h) => h.id === shellHost)) shellHost = null;
  // shells that kept running while the page was away are reattached (their recent output is replayed)
  try { for (const o of await api('GET', '/api/shell')) if (!shells.has(o.hostId) && hostOf(o.hostId)) attachShell(o.hostId, o.id, o.kind); } catch { /* none */ }
  renderShellList(); renderShellMain();
}

function newTerminal(hostId) {
  const term = new Terminal({
    cursorBlink: true, fontFamily: "'Cascadia Mono', Consolas, monospace", fontSize: 13, scrollback: 5000,
    theme: { background: '#0a0e14', foreground: '#e6eaf0', cursor: '#4d8cf5', selectionBackground: '#2a4a7c' },
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
// Pull: an explorer-style window over the HOST's file system; the file you pick is copied into output/Pulled-Files.
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
  $('pmTitle').textContent = `Pull file from ${h ? h.name || h.hostname : 'host'}`;
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
    toast(`Pulled ${r.name} (${bbFmt(r.size)}) to Output${r.folder.replace('/output', '')} · SHA-256 ${r.sha256.slice(0, 12)}…`);
  } catch (e) { $('pmMsg').className = 'bad'; $('pmMsg').textContent = e.message; $('pmPull').disabled = false; }
  pm.busy = false;
}

// ---- Home (opened from the logo) ----
const fmtUptime = (sec) => {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${sec % 60}s`;
};
const fmtBytes = (n) => (n < 1073741824 ? `${(n / 1048576).toFixed(0)} MB` : n < 1099511627776 ? `${(n / 1073741824).toFixed(1)} GB` : `${(n / 1099511627776).toFixed(2)} TB`);
async function loadHome() {
  const rows = [], stats = [];
  try {
    const a = await api('GET', '/api/about');
    const split = (c) => `${c.standard}${c.custom ? ` + ${c.custom} custom` : ''}`;
    const engine = String(a.winrm || '').replace(/^pypsrp \(bundled, (pypsrp [\d.]+).*$/, '$1 (bundled)');
    const ips = a.addresses.slice(0, 3).map(esc).join('<br>') + (a.addresses.length > 3 ? `<br><span class="dim">+${a.addresses.length - 3} more</span>` : '');
    rows.push({ section: 'Server' }, ['Name', esc(a.hostname) + (a.dnsDomain ? `<span class="dim">.${esc(a.dnsDomain.toLowerCase())}</span>` : '')],
      ['Listening', `${esc(a.bind)}${a.bindHost === '127.0.0.1' ? ' <span class="dim">this PC only</span>' : a.bindHost === '0.0.0.0' ? ' <span class="dim">all interfaces</span>' : ''}`],
      ['Addresses', a.addresses.length ? ips : '<span class="dim">none found</span>'],
      ['Version', `${esc(a.version)} <span class="dim">Node ${esc(String(a.node).replace(/^v/, ''))}</span>`],
      ['WinRM', esc(engine)],
      ['OS', esc(String(a.os).replace(/^Windows /, 'Win ').replace(/ \(x64\)$/, ''))],
      ['Uptime', fmtUptime(a.uptimeSec)],
      ['Disk', a.storage ? `${fmtBytes(a.storage.used)} used <span class="dim">${fmtBytes(a.storage.free)} free</span>` : '<span class="dim">unknown</span>'],
      { section: 'Library' },
      ['Hunts', split(a.collections)],
      ['Responses', split(a.actions)],
      ['Binaries', `${a.binaries.uploaded} uploaded${a.binaries.missing ? ` <span class="dim">${a.binaries.missing} needed</span>` : ''}`],
      ['Users', `${a.users} <span class="dim">${a.roles} roles</span>`]);
    stats.push(['Saved hosts', a.hosts], ['Profiles', a.profiles], ['Hunts ran', a.huntsRan], ['Actions ran', a.responsesRan]);
  } catch (e) { rows.push(['Server', `<span class="bad">${esc(e.message)}</span>`]); }
  try {
    const me = await api('GET', '/api/auth/me');
    $('signOutMsg').textContent = me.roleNames.length ? `${me.username} (${me.roleNames.join(', ')})` : me.username; // shown beside the Sign out button
    renderHomeAccess(me, await api('GET', '/api/permissions'));
  } catch { /* a 401 already redirected */ }
  $('homeInfo').innerHTML = rows.map((r) => (Array.isArray(r) ? `<dt>${r[0]}</dt><dd>${r[1]}</dd>` : `<dt class="hsec">${r.section}</dt>`)).join('');
  $('homeStats').innerHTML = stats.map(([k, v]) => `<div class="hs"><b>${v}</b><span>${esc(k)}</span></div>`).join('');
}
// Right of the logo: the signed-in user's roles, their permissions (green) and restrictions (red).
function renderHomeAccess(me, groups) {
  const options = groups.flatMap((g) => g.permissions), has = new Set(me.permissions);
  const can = options.filter((p) => has.has(p.key)), cant = options.filter((p) => !has.has(p.key));
  const list = (items, cls, mark, empty) => (items.length ? items.map((p) => `<li class="${cls}" title="${esc(p.desc)}"><i>${mark}</i>${esc(p.label)}</li>`).join('') : `<li class="dim">${empty}</li>`);
  $('homePerms').innerHTML = `<div class="hp-title">Your access</div>
    <div class="hp-roles">${me.roleNames.length ? me.roleNames.map((r) => `<span class="um-chip">${esc(r)}</span>`).join('') : '<span class="dim">No roles</span>'}</div>
    ${me.all
      ? `<div class="hp-line"><span class="sdot ok"></span>Full access <span class="dim">${can.length} of ${options.length} permissions</span></div>
         <details class="hp-more"><summary>Show permissions</summary><ul>${list(can, 'can', '✓', 'Nothing')}</ul></details>`
      : `<div class="hp-head can">Permissions <span class="dim">${can.length}</span></div><ul>${list(can, 'can', '✓', 'Nothing')}</ul>
         <div class="hp-head cant">Restrictions <span class="dim">${cant.length}</span></div><ul>${list(cant, 'cant', '✗', 'Nothing is restricted')}</ul>`}`;
}
// ---- Change your own password ----
// A dialog on the Home page (and from your own row in User Management). It asks for the current password; everywhere else you
// are signed in is signed out, but this session carries on.
function openPassword() {
  for (const id of ['pwCur', 'pwNew', 'pwNew2']) $(id).value = '';
  $('pwMsg').textContent = '';
  $('pwModal').hidden = false;
  $('pwCur').focus();
}
const closePassword = () => { $('pwModal').hidden = true; };
$('changePw').onclick = openPassword;
$('pwX').onclick = closePassword; $('pwCancel').onclick = closePassword;
$('pwModal').onclick = (e) => { if (e.target.id === 'pwModal') closePassword(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('pwModal').hidden) closePassword(); });
$('pwModal').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('pwSave').click(); } };
$('pwSave').onclick = async () => {
  const say = (t) => { $('pwMsg').textContent = t; $('pwMsg').className = 'um-msg bad'; };
  if (!$('pwCur').value) return say('Enter your current password');
  if ($('pwNew').value.length < 8) return say('The new password must be at least 8 characters');
  if ($('pwNew').value !== $('pwNew2').value) return say('The new passwords do not match');
  if ($('pwNew').value === $('pwCur').value) return say('Choose a password that is different from the current one');
  $('pwSave').disabled = true;
  try {
    await api('PUT', `/api/users/${access.id}/password`, { password: $('pwNew').value, currentPassword: $('pwCur').value });
    closePassword();
    toast('Password changed. Your other sessions have been signed out.');
  } catch (e) { say(e.message); }
  $('pwSave').disabled = false;
};

$('signOut').onclick = async () => {
  try { await api('POST', '/api/auth/logout'); } catch { /* signing out anyway */ }
  location.replace('/login.html');
};

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
    <td>${b.usedBy.map((h) => esc(h.name)).join('<br>') || '<span class="dim">Nothing uses this</span>'}</td>
    <td><div class="binfield" title="${b.present ? `SHA-256 ${esc(b.sha256)}` : ''}">${b.present
      ? `${esc(b.name)} <span class="dim" style="margin-left:8px">${fmtSize(b.size)} · ${esc(b.sha256.slice(0, 12))}…</span>`
      : 'No file uploaded'}</div></td>
    <td><div class="binactions">
      <button class="act ${b.present ? 'sec' : ''}" data-upload="${esc(b.name)}" ${b.usedBy.length ? '' : 'disabled'}>${b.present ? 'Replace…' : 'Upload…'}</button>
      <button class="del" data-remove="${esc(b.name)}" ${b.present ? '' : 'disabled'}>Remove</button>
    </div></td></tr>`).join('') || '<tr><td colspan="4" class="dim">No collection declares a binary dependency</td></tr>';
}
let uploadSlot = null;
// ---- Upload from server ----
// Point the server at an external location (a folder, an SMB share, Nextcloud / WebDAV or SFTP); it searches below it for the binaries the
// collections need, then copies the ones ticked into the binaries folder. Nothing about the location is remembered: the values live in this
// page until the popup is closed (the password too), and the server keeps them in memory for a few minutes only.
const FS_TYPES = {
  folder: { label: 'Folder on the server', fields: [['path', 'Folder', 'text', 'D:\\Tools  or  /srv/tools']], note: 'A folder this server can open: a local disk, a mounted share or a network path it is already signed in to.' },
  smb: { label: 'SMB share', fields: [['path', 'Share and folder', 'text', '\\\\server\\share\\tools'], ['username', 'Username', 'text', 'DOMAIN\\user'], ['password', 'Password', 'password', '']], note: 'Searches the folder and everything below it. A Linux server needs smbclient installed.' },
  nextcloud: { label: 'Nextcloud', fields: [['url', 'Nextcloud address', 'text', 'https://cloud.example.com'], ['insecure', 'Allow a self-signed certificate', 'checkbox', '']], nc: true, note: 'Enter your Nextcloud address and press Sign in. A temporary app password is used and removed when you close this.' },
  webdav: { label: 'WebDAV (manual)', fields: [['url', 'Folder address', 'text', 'https://cloud.example.com/apps/files/?dir=/Tools'], ['username', 'Username', 'text', ''], ['password', 'Password', 'password', 'app password'], ['insecure', 'Allow a self-signed certificate', 'checkbox', '']], note: 'Folder, WebDAV (.../remote.php/dav/files/USER/Tools) or public share (.../s/TOKEN) address. Use an app password with 2FA.' },
  sftp: { label: 'SFTP', fields: [['host', 'Server', 'text', 'files.example.com'], ['port', 'Port', 'text', '22'], ['username', 'Username', 'text', ''], ['password', 'Password', 'password', ''], ['path', 'Folder', 'text', '/tools']], note: 'Searches the folder and everything below it.' },
};
const fsx = { type: 'folder', vals: {}, session: null, result: null, nc: null }; // nc: the Nextcloud sign-in { id, status, user, loginUrl }
let fsNcTimer;
const fsBytes = (n) => (n == null ? '-' : fmtSize(n));
function fsRender() {
  const t = FS_TYPES[fsx.type], v = (fsx.vals[fsx.type] ||= {});
  $('fsBody').innerHTML = `<div class="toggle fs-types" id="fsTypes">${Object.entries(FS_TYPES).map(([k, x]) => `<button type="button" data-fstype="${k}" class="${k === fsx.type ? 'on' : ''}">${esc(x.label)}</button>`).join('')}</div>
    <div class="fs-form">${t.fields.map(([k, label, kind, ph]) => kind === 'checkbox'
      ? `<span></span><label class="fs-opts" style="margin:0"><input type="checkbox" data-fsf="${k}" ${v[k] ? 'checked' : ''}> ${esc(label)}</label>`
      : `<label for="fsf_${k}">${esc(label)}</label>${fsx.type === 'folder' && k === 'path' ? '<div class="fs-inline">' : ''}<input type="${kind}" id="fsf_${k}" data-fsf="${k}" placeholder="${esc(ph)}" value="${esc(v[k] || '')}" autocomplete="off" spellcheck="false">${fsx.type === 'folder' && k === 'path' ? '<button type="button" class="act sec" id="fsBrowseBtn" title="Choose the folder from this server\'s disks">Browse…</button></div>' : ''}`).join('')}</div><div id="fsBrowse" class="fs-browse" hidden></div>
    <div class="fs-note">${esc(t.note)}</div>${t.nc ? '<div id="fsNc"></div>' : ''}<div class="fs-res" id="fsRes"></div>`;
  fsRenderNc(); fsRenderResult();
}
// Sign in with Nextcloud: the button, the waiting message, and once signed in who it is plus an optional folder to look in.
function fsRenderNc() {
  const box = $('fsNc'); if (!box) return;
  const n = fsx.nc, v = fsx.vals.nextcloud || {};
  box.innerHTML = !n ? '<button type="button" class="act" id="fsNcStart">Sign in with Nextcloud</button>'
    : n.status === 'waiting' ? `<div class="fs-note" style="margin:6px 0">Waiting for you to sign in and approve access in the Nextcloud tab that opened… <a href="${esc(n.loginUrl)}" target="_blank" rel="noopener">Open it again</a> · <a id="fsNcCancel">Cancel</a></div>`
    : `<div class="fs-ok" style="margin:6px 0">✓ Signed in as <b>${esc(n.user)}</b> · <a id="fsNcOut">Sign out</a></div>
       <div class="fs-form"><label for="fsf_folder">Folder (optional)</label><input type="text" id="fsf_folder" data-fsf="folder" placeholder="/Tools  (leave empty to search all your files)" value="${esc(v.folder || '')}" autocomplete="off" spellcheck="false"></div>`;
}
async function fsNcForget() {
  clearInterval(fsNcTimer);
  const n = fsx.nc; fsx.nc = null;
  if (n) { try { await api('DELETE', `/api/binaries/source/nextcloud/${n.id}`); } catch { /* it expires on the server anyway */ } }
}
function fsNcPoll() {
  clearInterval(fsNcTimer);
  fsNcTimer = setInterval(async () => {
    const n = fsx.nc; if (!n || n.status !== 'waiting') { clearInterval(fsNcTimer); return; }
    try {
      const r = await api('GET', `/api/binaries/source/nextcloud/${n.id}`);
      if (fsx.nc !== n) return;
      if (r.status === 'done') { n.status = 'done'; n.user = r.user; clearInterval(fsNcTimer); fsRenderNc(); fsSay('Signed in. Press Search.', 'ok'); }
      else if (r.status === 'expired') { fsx.nc = null; clearInterval(fsNcTimer); fsRenderNc(); fsSay('The sign-in timed out. Press Sign in again.', 'bad'); }
    } catch { /* try again on the next tick */ }
  }, 2000);
}
$('fsBody').addEventListener('click', async (e) => {
  if (e.target.closest('#fsNcStart')) {
    const v = fsx.vals.nextcloud || {};
    const w = window.open('', '_blank'); if (w) w.opener = null; // the browser tab for signing in; opened now so the click is allowed to open it
    fsSay('');
    try {
      const r = await api('POST', '/api/binaries/source/nextcloud/start', { url: v.url, insecure: !!v.insecure });
      fsx.nc = { id: r.id, status: 'waiting', loginUrl: r.loginUrl };
      if (w) w.location.href = r.loginUrl;
      fsRenderNc(); fsNcPoll();
    } catch (err) { if (w) w.close(); fsSay(err.message, 'bad'); }
  } else if (e.target.closest('#fsNcCancel') || e.target.closest('#fsNcOut')) { await fsNcForget(); fsx.result = null; fsEnd(); fsRenderNc(); fsRenderResult(); fsSay(''); }
});
function fsRenderResult() {
  const box = $('fsRes'), r = fsx.result; if (!box) return;
  $('fsImport').hidden = !(r && r.found.length);
  if (!r) { box.innerHTML = ''; return; }
  const rows = r.found.map((f, i) => `<tr data-fsrow="${i}"><td><input type="checkbox" class="fs-pick" checked></td><td><b>${esc(f.binary)}</b>${f.present ? ' <span class="badge orange" title="A file with this name is already uploaded">already uploaded</span>' : ''}</td>
      <td>${f.copies.length > 1 ? `<select class="fs-copy">${f.copies.map((c, j) => `<option value="${j}">${esc(c.path)} · ${esc(fsBytes(c.size))}${c.modifiedAt ? ` · ${esc(new Date(c.modifiedAt).toLocaleDateString())}` : ''}</option>`).join('')}</select>` : `<span title="${esc(f.copies[0].path)}">${esc(f.copies[0].path)}</span> <span class="dim">· ${esc(fsBytes(f.copies[0].size))}${f.copies[0].modifiedAt ? ` · ${esc(new Date(f.copies[0].modifiedAt).toLocaleDateString())}` : ''}</span>`}</td>
      <td><input type="text" class="fs-hash" placeholder="Expected SHA-256 (optional)" spellcheck="false" autocomplete="off"></td><td class="fs-status"></td></tr>`).join('');
  box.innerHTML = r.found.length
    ? `<table><thead><tr><th></th><th>Binary</th><th>Found at</th><th>Check</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>
       <label class="fs-opts"><input type="checkbox" id="fsOverwrite"> Overwrite binaries that are already uploaded</label>`
    : '<p class="fs-warn" style="margin:0">None of the binaries were found there.</p>';
  box.innerHTML += `<div class="fs-note">${r.missing.length ? `Not found (${r.missing.length}): ${esc(r.missing.join(', '))}. ` : 'Everything on the list was found. '}${r.stats.method === 'folder walk' ? `Searched ${r.stats.scanned.toLocaleString()} items in ${r.stats.seconds}s` : `Searched on the server in ${r.stats.seconds}s`}${r.stats.truncated ? ' <span class="fs-warn">(stopped early: the location is very large or slow, so some folders were not searched)</span>' : ''}${r.stats.unreadable ? `; ${r.stats.unreadable} folder${r.stats.unreadable === 1 ? '' : 's'} could not be read` : ''}.</div>`;
}
// Browse…: a small folder picker over this server's disks (drives on Windows, / on Linux). Click a folder to open it, then Use this folder.
async function fsBrowseTo(p) {
  const box = $('fsBrowse'); if (!box) return;
  box.hidden = false;
  let d;
  try { d = await api('GET', `/api/binaries/source/browse?path=${encodeURIComponent(p || '')}`); } catch (e) { box.innerHTML = `<div class="fs-bad" style="padding:6px 8px">${esc(e.message)}</div><div style="padding:0 8px 8px"><button type="button" class="act sec" data-fsdir="">Back to the top</button> <button type="button" class="act sec" id="fsBrowseClose">Close</button></div>`; return; }
  box.dataset.path = d.path;
  box.innerHTML = `<div class="fs-bhead"><button type="button" class="act sec" data-fsdir="${esc(d.parent ?? '')}" ${d.parent === null ? 'disabled' : ''} title="Up one level">↑ Up</button>
      <input type="text" id="fsBrowsePath" value="${esc(d.path)}" placeholder="${d.path === '' ? 'Drives' : ''}" spellcheck="false" autocomplete="off" title="Type a path and press Enter">
      <button type="button" class="act" id="fsBrowseUse" ${d.path === '' ? 'disabled' : ''}>Use this folder</button><button type="button" class="act sec" id="fsBrowseClose">Close</button></div>
    <div class="fs-blist">${d.entries.map((e) => `<button type="button" class="fs-bitem" data-fsdir="${esc(e.path)}" title="${esc(e.path)}">📁 ${esc(e.name)}</button>`).join('') || '<div class="dim" style="padding:6px 8px">No folders in here.</div>'}${d.truncated ? '<div class="dim" style="padding:6px 8px">Only the first 2,000 folders are shown. Type the path above to go further.</div>' : ''}</div>`;
}
$('fsBody').addEventListener('click', (e) => {
  if (e.target.closest('#fsBrowseBtn')) { fsBrowseTo((fsx.vals.folder || {}).path || ''); return; }
  const go = e.target.closest('[data-fsdir]');
  if (go) { fsBrowseTo(go.dataset.fsdir); return; }
  if (e.target.closest('#fsBrowseClose')) { $('fsBrowse').hidden = true; return; }
  if (e.target.closest('#fsBrowseUse')) {
    const p = ($('fsBrowsePath').value || '').trim(); if (!p) return;
    (fsx.vals.folder ||= {}).path = p; $('fsf_path').value = p; $('fsBrowse').hidden = true; fsx.result = null; fsRenderResult(); fsSay('');
  }
});
$('fsBody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'fsBrowsePath') { e.preventDefault(); e.stopPropagation(); fsBrowseTo(e.target.value); } }, true);
function fsSay(text, cls) { $('fsMsg').textContent = text; $('fsMsg').className = cls || ''; }
async function fsEnd() { if (fsx.session) { try { await api('DELETE', `/api/binaries/source/${fsx.session}`); } catch { /* it expires anyway */ } fsx.session = null; } }
$('binFromServer').onclick = () => { fsx.result = null; fsx.session = null; fsSay(''); fsRender(); $('fsModal').hidden = false; };
const closeFs = () => { $('fsModal').hidden = true; fsEnd(); fsNcForget(); fsx.vals = {}; fsx.result = null; $('fsBody').innerHTML = ''; }; // the typed values, passwords included, are dropped
$('fsOk').onclick = $('fsX').onclick = closeFs;
$('fsModal').onclick = (e) => { if (e.target.id === 'fsModal') closeFs(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fsModal').hidden) closeFs(); });
$('fsBody').onclick = (e) => {
  const b = e.target.closest('[data-fstype]'); if (!b) return;
  fsx.type = b.dataset.fstype; fsx.result = null; fsEnd(); fsSay(''); fsRender();
};
$('fsBody').addEventListener('input', (e) => { const k = e.target.dataset.fsf; if (k) (fsx.vals[fsx.type] ||= {})[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
$('fsBody').addEventListener('change', (e) => { const k = e.target.dataset.fsf; if (k && e.target.type === 'checkbox') (fsx.vals[fsx.type] ||= {})[k] = e.target.checked; });
$('fsBody').onkeydown = (e) => { if (e.key === 'Enter' && e.target.dataset.fsf) $('fsSearch').click(); };
$('fsSearch').onclick = async () => {
  await fsEnd(); fsx.result = null; fsRenderResult();
  $('fsSearch').disabled = true; fsSay('Searching… this can take a while on a large location.', 'dim');
  try {
    if (FS_TYPES[fsx.type].nc && fsx.nc?.status !== 'done') throw new Error('Press Sign in with Nextcloud first.');
    const body = FS_TYPES[fsx.type].nc ? { type: 'nextcloud', credential: fsx.nc.id, folder: (fsx.vals.nextcloud || {}).folder || '' } : { type: fsx.type, ...(fsx.vals[fsx.type] || {}) };
    const r = await api('POST', '/api/binaries/source/search', body);
    fsx.session = r.session; fsx.result = r; fsRenderResult();
    fsSay(r.found.length ? `Found ${r.found.length} of ${r.found.length + r.missing.length}. Tick what to import.` : 'Nothing found.', r.found.length ? 'ok' : 'bad');
  } catch (e) { fsSay(e.message, 'bad'); } finally { $('fsSearch').disabled = false; }
};
$('fsImport').onclick = async () => {
  const r = fsx.result; if (!r) return;
  const items = [], rows = [];
  document.querySelectorAll('#fsRes tr[data-fsrow]').forEach((tr) => {
    if (!tr.querySelector('.fs-pick').checked) return;
    const f = r.found[+tr.dataset.fsrow], sel = tr.querySelector('.fs-copy'), copy = f.copies[sel ? +sel.value : 0];
    items.push({ binary: f.binary, path: copy.path, sha256: tr.querySelector('.fs-hash').value.trim() });
    rows.push(tr);
  });
  if (!items.length) { fsSay('Tick at least one binary.', 'bad'); return; }
  $('fsImport').disabled = true; fsSay('Importing…', 'dim');
  rows.forEach((tr) => { tr.querySelector('.fs-status').textContent = 'Waiting…'; });
  try {
    const out = await api('POST', '/api/binaries/source/import', { session: fsx.session, items, overwrite: $('fsOverwrite').checked });
    out.results.forEach((x, i) => {
      const td = rows[i].querySelector('.fs-status');
      td.className = `fs-status ${x.status === 'imported' ? 'fs-ok' : x.status === 'skipped' ? 'fs-warn' : 'fs-bad'}`;
      td.textContent = x.status === 'imported' ? `Imported (${fsBytes(x.size)})` : x.message;
      td.title = x.sha256 ? `SHA-256 ${x.sha256}` : '';
    });
    const n = out.results.filter((x) => x.status === 'imported').length;
    fsSay(`Imported ${n} of ${out.results.length}.`, n === out.results.length ? 'ok' : 'bad');
    loadBinaries();
  } catch (e) { fsSay(e.message, 'bad'); rows.forEach((tr) => { tr.querySelector('.fs-status').textContent = ''; }); } finally { $('fsImport').disabled = false; }
};
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
        <span class="lg-name">${esc(r.name || r.collectionName)}</span>${schedTag(r)}<span class="badge ${badge}">${esc(r.status.replaceAll('_', ' '))}</span>
        <span class="dim">${esc(new Date(r.startedAt).toLocaleString())}</span><span class="dim">${ok}/${r.results.length} ok · ${r.eventCount} event${r.eventCount === 1 ? '' : 's'}</span>
        <span class="lg-btns"><a href="/api/runs/${r.id}/log.csv" download data-stop="1" data-perm="hunts.export" data-perm-what="export logs" title="Download this hunt's log as CSV">Export CSV</a><a data-del="${r.id}" data-stop="1" data-perm="hunts.run" data-perm-what="delete hunt records">Delete</a></span></div>
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
    if (r && confirm(`Delete the log and record of "${r.name || r.collectionName}"? The output folder is not deleted.`)) { await api('DELETE', `/api/runs/${r.id}`); logOpen.delete(r.id); logEvents.delete(r.id); loadRuns(); }
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
loadAccess().then(() => {
  refreshTopLocks(); decorateLocks();
  go(startTab || 'hosts', startPage);
  pollNavStats();
});
