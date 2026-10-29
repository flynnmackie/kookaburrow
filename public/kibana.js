// Settings > External > Elastic: the index template and importing the Kibana dashboards (the server side is src/elastic.js and src/kibana.js).
const kb = { template: null };

// the form values of the connection part of the page (a blank secret falls back to the saved one on the server)
const kbConn = () => (typeof elBody === 'function' ? elBody() : {});

async function loadElasticExtras(s) {
  if (!can('system.manage')) { $('elTemplate').textContent = ''; $('elDashInfo').textContent = ''; return; }
  $('elTmplInstall').disabled = $('elDashOpen').disabled = !s.url;
  try {
    const [t, d] = await Promise.all([api('GET', '/api/settings/elastic/template'), api('GET', '/api/settings/elastic/dashboards')]);
    kb.template = t;
    $('elTmplReq').textContent = t.request;
    const st = t.status;
    $('elTemplate').innerHTML = !st.configured ? 'Set the Elasticsearch address and save first.'
      : st.installed === true ? `<span class="ok">Installed</span> for ${esc((st.patterns || []).join(', '))}${st.upToDate === false ? ` <span class="bad">(the saved index prefix is now ${esc(s.index)}: install again to update it)</span>` : ''}.`
      : st.installed === false ? '<span class="st-warn">Not installed.</span> New indexes are created with guessed (text) fields until it is.'
      : esc(st.note || 'Not known.');
    $('elDashInfo').textContent = `${d.dashboards.length} dashboards (${d.dashboards.map((x) => x.title.replace(/^Kookaburrow - /, '')).join(', ')}), ${d.visualizations} visualizations, ${d.searches} saved searches and a data view. Needs Kibana.`;
  } catch (e) { $('elTemplate').textContent = e.message; }
}
window.loadElasticExtras = loadElasticExtras;

$('elTmplShow').onclick = (e) => { e.preventDefault(); $('elTmplReq').hidden = !$('elTmplReq').hidden; $('elTmplShow').textContent = $('elTmplReq').hidden ? 'Show the request' : 'Hide the request'; };
$('elTmplInstall').onclick = async () => {
  $('elTemplate').textContent = 'Installing…';
  try {
    const r = await api('POST', '/api/settings/elastic/template', kbConn());
    $('elTemplate').innerHTML = `<span class="ok">Installed</span> for ${esc(r.patterns.join(', '))}.`;
  } catch (e) { $('elTemplate').innerHTML = `<span class="bad">${esc(e.message)}</span> You can paste the request (Show the request) into Kibana Dev Tools instead.`; }
};

// ---- the import dialog ----
function kbShowAuth() {
  const a = $('kbAuth').value;
  $('kbBasic').hidden = a !== 'basic'; $('kbKeyRow').hidden = a !== 'apikey';
}
function kbOpen() {
  $('kbUrl').value = (kb.template && kb.template.kibanaUrl) || ($('elUrl').dataset.kibana || '');
  $('kbPass').value = ''; $('kbKey').value = ''; $('kbResult').innerHTML = ''; $('kbGo').disabled = false; $('kbGo').textContent = 'Import';
  kbShowAuth();
  $('kbModal').hidden = false;
  $('kbUrl').focus();
}
const kbClose = () => { $('kbModal').hidden = true; };
$('elDashOpen').onclick = async () => {
  // the saved Kibana address, if any
  try { const r = await api('GET', '/api/settings/elastic'); $('elUrl').dataset.kibana = r.settings.kibanaUrl || ''; kb.template = { ...(kb.template || {}), kibanaUrl: r.settings.kibanaUrl || '' }; } catch { /* the field stays as it was */ }
  kbOpen();
};
$('kbX').onclick = $('kbCancel').onclick = kbClose;
$('kbAuth').onchange = kbShowAuth;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('kbModal').hidden) kbClose(); });
$('kbGo').onclick = async () => {
  $('kbResult').innerHTML = '<span class="dim">Importing…</span>'; $('kbGo').disabled = true;
  const auth = $('kbAuth').value;
  const body = { kibanaUrl: $('kbUrl').value, auth, space: $('kbSpace').value, insecure: $('kbInsecure').checked, ca: $('elCa').value };
  if (auth === 'basic') { body.username = $('kbUser').value; body.password = $('kbPass').value; }
  if (auth === 'apikey') body.apiKey = $('kbKey').value;
  try {
    const r = await api('POST', '/api/settings/elastic/dashboards/import', body);
    $('kbPass').value = ''; $('kbKey').value = '';
    const bad = r.errors.length ? `<div class="rs-adv bad">${r.errors.length} object${r.errors.length === 1 ? '' : 's'} could not be imported:<ul style="margin:4px 0 0 18px">${r.errors.slice(0, 8).map((x) => `<li>${esc(x.title || x.id)} (${esc(x.type)}): ${esc(x.reason || 'error')}</li>`).join('')}</ul></div>` : '';
    $('kbResult').innerHTML = `${r.ok ? `<div class="rs-adv ok">✓ Imported ${r.imported} objects into Kibana${r.space ? ` (space ${esc(r.space)})` : ''}. The data view points at <code>${esc(r.prefix)}-*</code>.</div><div style="margin-top:6px"><a class="doclink" href="${esc(r.dashboardsUrl)}" target="_blank" rel="noopener noreferrer">Open the dashboards in Kibana</a></div>` : ''}${bad}`;
  } catch (e) { $('kbResult').innerHTML = `<div class="rs-adv bad">${esc(e.message)}</div>`; }
  $('kbGo').disabled = false; $('kbGo').textContent = 'Import again';
};
