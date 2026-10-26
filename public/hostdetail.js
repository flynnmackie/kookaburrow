// ---- Host details (Host Management > View Hosts > Details) ----
// One host's details and history: where it is and how it was added, the hunts and responses that ran on it, quarantine history, and its
// recent health checks. Shares helpers with app.js: api, esc, $.
const hdWhen = (iso) => (iso ? new Date(iso).toLocaleString([], { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
async function openHostDetail(id) {
  $('hdTitle').textContent = 'Host';
  $('hdBody').innerHTML = '<p class="dim">Loading…</p>';
  $('hostModal').hidden = false;
  let r;
  try { r = await api('GET', `/api/hosts/${encodeURIComponent(id)}/history`); } catch (e) { $('hdBody').innerHTML = `<p class="bad">${esc(e.message)}</p>`; return; }
  const h = r.host, ssh = h.protocol === 'ssh', up = h.remoteCheck?.up !== false;
  $('hdTitle').textContent = h.name || h.hostname || h.address;
  const fact = (k, v) => `<div><span>${k}</span>${v}</div>`;
  const q = r.quarantine;
  $('hdBody').innerHTML = `<div class="hd-badges">
      <span class="badge ${ssh ? 'orange' : 'blue'}">${ssh ? 'SSH' : 'WinRM'}</span><span class="badge ${up ? 'green' : 'red'}">${ssh ? 'SSH' : 'WinRM'} port ${up ? 'open' : 'not responding'}</span>
      ${q ? `<span class="badge red" title="Network isolated">⚠ Quarantined${q.until ? ` until ${esc(hdWhen(q.until))}` : ''}</span>` : ''}
      ${r.groups.map((g) => `<span class="tagchip on">${esc(g.name)}</span>`).join('')}</div>
    <div class="bd-facts hd-facts">
      ${fact('Name', esc(h.name))}${fact('Hostname', esc(h.hostname || '-'))}${fact('Address', esc(h.address))}${fact('Operating system', esc(h.os || '-'))}
      ${fact('Protocol', ssh ? 'SSH' : 'WinRM')}${fact('Signed in as', esc(h.username || '-'))}${fact('Credential profile', esc(h.profileName || '-'))}${fact('Verified', esc(hdWhen(h.verifiedAt)))}
      ${fact('Last port check', `<span class="${up ? 'ok' : 'bad'}">${esc(hdWhen(h.remoteCheck?.at))}</span>`)}${fact('Groups', r.groups.length ? esc(r.groups.map((g) => g.name).join(', ')) : 'None (Unassigned)')}</div>
    <div class="hd-sec">Hunts and responses <span class="dim">(${r.runTotal})</span></div>
    ${r.runs.length ? `<div class="hd-tablewrap"><table class="bh"><thead><tr><th>Started</th><th>Type</th><th>Name</th><th>What ran</th><th>Result</th><th>By</th></tr></thead><tbody>${r.runs.map((x) => {
      const bad = x.items.filter((i) => i.status === 'error' || i.status === 'failed').length;
      return `<tr><td class="dim nw">${esc(hdWhen(x.startedAt))}</td><td>${x.kind === 'response' ? 'Response' : 'Hunt'}${x.quick ? ' <span class="qtag" title="Quick run">Q</span>' : ''}</td><td>${esc(x.name)}</td>
        <td class="dim">${esc(x.items.map((i) => i.name).filter(Boolean).join(', '))}</td><td class="${x.status === 'completed' ? 'ok' : x.status === 'failed' ? 'bad' : 'dim'}" ${x.status === 'completed_with_errors' ? 'style="color:var(--orange)"' : ''}>${esc(String(x.status).replace(/_/g, ' '))}${bad ? ` (${bad} failed)` : ''}</td><td class="dim">${esc(x.startedBy || '')}</td></tr>`;
    }).join('')}</tbody></table></div>${r.runTotal > r.runs.length ? `<p class="dim" style="margin:4px 0">Showing the latest ${r.runs.length}.</p>` : ''}` : '<p class="dim" style="margin:0">Nothing has been run on this host yet.</p>'}
    <div class="hd-sec">Quarantine history</div>
    ${r.quarantineLog.length ? `<div class="hd-tablewrap"><table class="bh"><thead><tr><th>When</th><th>Event</th><th>By</th><th>Detail</th></tr></thead><tbody>${r.quarantineLog.map((x) => `<tr><td class="dim nw">${esc(hdWhen(x.t))}</td><td>${esc(x.action)}</td><td class="dim">${esc(x.by || '')}</td><td class="dim">${esc(x.detail || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dim" style="margin:0">This host has never been quarantined.</p>'}
    <div class="hd-sec">Health checks <span class="dim">${r.checkSummary.total ? `(last ${r.checkSummary.total}: ${r.checkSummary.up} up, ${r.checkSummary.total - r.checkSummary.up} down)` : ''}</span></div>
    ${r.checks.length ? `<div class="hd-tablewrap"><table class="bh"><thead><tr><th>When</th><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>${r.checks.map((x) => `<tr><td class="dim nw">${esc(hdWhen(x.t))}</td><td>${esc(x.check)}</td><td class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓ Up' : '✗ Down'}</td><td class="dim">${esc(x.message || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="dim" style="margin:0">No health checks recorded yet. They appear here while monitoring is on.</p>'}`;
}
window.openHostDetail = openHostDetail;
const closeHostModal = () => { $('hostModal').hidden = true; };
$('hdX').onclick = closeHostModal;
$('hostModal').onclick = (e) => { if (e.target.id === 'hostModal') closeHostModal(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('hostModal').hidden) closeHostModal(); });
