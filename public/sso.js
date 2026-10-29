// Settings > External > Single Sign-On (the server side is src/sso.js). The client secret is never sent back to the browser: leaving the box blank keeps it.
function ssoMsg(t, cls) { $('ssoMsg').className = 'um-msg ' + (cls || ''); $('ssoMsg').textContent = t; }
const sso = { hasSecret: false };
const ssoOn = () => $('ssoEnabled').getAttribute('aria-checked') === 'true';
function ssoBody() {
  const b = {
    enabled: ssoOn(), issuer: $('ssoIssuer').value, clientId: $('ssoClientId').value, publicUrl: $('ssoPublicUrl').value, name: $('ssoName').value,
    scopes: $('ssoScopes').value, usernameClaim: $('ssoClaim').value, ca: $('ssoCa').value, linkExisting: $('ssoLink').checked, createUsers: $('ssoCreate').checked,
  };
  if ($('ssoSecret').value) b.clientSecret = $('ssoSecret').value;
  return b;
}
function ssoShowSwitch() {
  const on = ssoOn();
  $('ssoEnabledLabel').textContent = `Single sign-on: ${on ? 'On' : 'Off'}`;
  $('ssoEnabledNote').textContent = on ? 'The sign-in page shows the button once this is saved.' : 'Only local accounts can sign in.';
}
function ssoShowRedirect() {
  const u = $('ssoPublicUrl').value.trim().replace(/\/+$/, '');
  $('ssoRedirect').value = u ? u + '/api/auth/sso/callback' : '';
}
async function loadSso() {
  let r;
  try { r = await api('GET', '/api/settings/sso'); } catch (e) { ssoMsg(e.message, 'bad'); return; }
  const s = r.settings, editable = can('system.manage');
  sso.hasSecret = s.hasSecret;
  setSwitch('ssoEnabled', s.enabled);
  $('ssoIssuer').value = s.issuer; $('ssoClientId').value = s.clientId; $('ssoSecret').value = ''; $('ssoPublicUrl').value = s.publicUrl; $('ssoName').value = s.name;
  $('ssoScopes').value = s.scopes; $('ssoClaim').value = s.usernameClaim; $('ssoCa').value = s.ca; $('ssoLink').checked = s.linkExisting; $('ssoCreate').checked = s.createUsers;
  $('ssoSecret').placeholder = s.hasSecret ? '(saved: type to replace)' : '';
  for (const id of ['ssoIssuer', 'ssoClientId', 'ssoSecret', 'ssoPublicUrl', 'ssoName', 'ssoScopes', 'ssoClaim', 'ssoCa', 'ssoLink', 'ssoCreate']) $(id).disabled = !editable;
  ssoShowSwitch(); ssoShowRedirect();
  $('ssoAdvice').innerHTML = ''; ssoMsg('');
}
$('ssoEnabled').onclick = () => { if (!can('system.manage')) return; setSwitch('ssoEnabled', !ssoOn()); ssoShowSwitch(); ssoMsg('Not saved yet', 'dim'); };
$('ssoPublicUrl').oninput = ssoShowRedirect;
$('ssoCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('ssoRedirect').value); $('ssoCopy').textContent = 'Copied'; } catch { $('ssoRedirect').select(); }
  setTimeout(() => { $('ssoCopy').textContent = 'Copy'; }, 1500);
};
$('ssoSave').onclick = async () => {
  ssoMsg('Saving…', 'dim');
  try { await api('PUT', '/api/settings/sso', ssoBody()); } catch (e) { ssoMsg(e.message, 'bad'); return; }
  await loadSso(); ssoMsg('Saved', 'ok');
};
$('ssoTest').onclick = async () => {
  ssoMsg('Testing…', 'dim'); $('ssoAdvice').innerHTML = '';
  let t;
  try { t = await api('POST', '/api/settings/sso/test', ssoBody()); } catch (e) { ssoMsg(e.message, 'bad'); return; }
  ssoMsg('');
  $('ssoAdvice').innerHTML = [
    `<div class="rs-adv ok">✓ Found the provider ${esc(t.issuer)} (${t.keys} signing key${t.keys === 1 ? '' : 's'}${t.algs.length ? `, ${esc(t.algs.join(', '))}` : ''})</div>`,
    ...t.warnings.map((w) => `<div class="rs-adv bad">${esc(w)}</div>`),
    ...t.notes.map((n) => `<div class="rs-adv">${esc(n)}</div>`),
  ].join('');
};
window.loadSso = loadSso;
