const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { encrypt } = require('./crypto');
const elastic = require('./elastic');

// Importing the dashboards that ship with Kookaburrow (elastic/kibana/kookaburrow-dashboards.ndjson: a data view, saved searches, visualizations
// and dashboards, as Kibana's "saved objects") into a Kibana with its saved objects API. The sign-in is typed when importing and never saved; only
// Kibana's address is kept. Objects have fixed ids, so importing again replaces them (the file is the source; edit a copy in Kibana to change one).
const FILE = path.join(__dirname, '..', 'elastic', 'kibana', 'kookaburrow-dashboards.ndjson');
const err = (m, status = 400) => Object.assign(new Error(m), { status });

function lines() {
  if (!fs.existsSync(FILE)) throw err('The dashboards are not part of this installation (elastic/kibana/kookaburrow-dashboards.ndjson is missing)');
  return fs.readFileSync(FILE, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
}
// What the file holds, for the page: the dashboards (title and description), and counts of the rest.
function contents() {
  const objs = lines();
  const count = (t) => objs.filter((o) => o.type === t).length;
  return {
    dashboards: objs.filter((o) => o.type === 'dashboard').map((o) => ({ id: o.id, title: o.attributes.title, description: o.attributes.description || '' })),
    visualizations: count('visualization'), searches: count('search'), dataViews: count('index-pattern'),
  };
}
// The file as NDJSON with the data view pointing at this installation's index prefix (the default is kookaburrow-*).
function ndjson(prefix) {
  return lines().map((o) => {
    if (o.type === 'index-pattern') o.attributes = { ...o.attributes, title: `${prefix}-*`, name: o.attributes.name || 'Kookaburrow' };
    return JSON.stringify(o);
  }).join('\n') + '\n';
}

function multipart(name, filename, data) {
  const boundary = '----kookaburrow' + crypto.randomBytes(12).toString('hex');
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/ndjson\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { type: `multipart/form-data; boundary=${boundary}`, body: Buffer.concat([head, Buffer.from(data), tail]) };
}

// b: { kibanaUrl, auth: 'apikey' | 'basic', apiKey, username, password, ca, insecure, space }
async function importDashboards(b = {}) {
  const cur = elastic.settings();
  const kibanaUrl = elastic.cleanKibanaUrl(b.kibanaUrl || cur.kibanaUrl);
  if (!kibanaUrl) throw err("Enter Kibana's address first");
  const space = String(b.space || '').trim();
  if (space && !/^[a-z0-9_-]{1,64}$/.test(space)) throw err('A space id uses lowercase letters, digits, - and _');
  const auth = b.auth === 'apikey' || b.auth === 'basic' ? b.auth : 'none';
  if (auth === 'apikey' && !String(b.apiKey || '').trim()) throw err('Enter the API key');
  if (auth === 'basic' && (!String(b.username || '').trim() || !b.password)) throw err('Enter the user name and password');
  // the connection settings used for this one request (the secrets live in memory only, encrypted like the saved ones are)
  const conn = {
    url: kibanaUrl, auth, username: String(b.username || '').trim(), insecure: !!b.insecure, ca: String(b.ca || cur.ca || '').trim(),
    ...(auth === 'apikey' ? { apiKeyEnc: encrypt(String(b.apiKey).trim()) } : {}), ...(auth === 'basic' ? { passwordEnc: encrypt(String(b.password)) } : {}),
  };
  const prefix = cur.index;
  const mp = multipart('file', 'kookaburrow-dashboards.ndjson', ndjson(prefix));
  const p = `${space ? `/s/${space}` : ''}/api/saved_objects/_import?overwrite=true`;
  let r;
  try { r = await elastic.request(conn, 'POST', p, mp.body, mp.type, { 'kbn-xsrf': 'true' }); }
  catch (e) { throw err(elastic.friendly(e).replace('Paste its CA below, or tick "Skip certificate check"', "Paste its CA below, or tick 'Skip certificate check'")); }
  if (r.status === 401) throw err('Kibana refused the sign-in: check the API key or the user name and password');
  if (r.status === 403) throw err('This account is not allowed to import into Kibana. It needs the Kibana privileges Dashboard, Visualize, Discover, Data Views and Saved Objects Management (the elastic user has them)');
  if (r.status === 404) throw err(`Kibana was not found at ${kibanaUrl}${space ? ` (or the space "${space}" does not exist)` : ''}. Check the address, and the base path if Kibana has one`);
  if (r.status !== 200 || !r.json) throw err(`Kibana did not accept the import (HTTP ${r.status}): ${(r.json && (r.json.message || r.json.error)) || r.text.slice(0, 200)}`);
  const errors = (r.json.errors || []).map((e) => ({ id: e.id, type: e.type, title: e.meta && e.meta.title, reason: e.error && (e.error.type || e.error.message) }));
  const out = { ok: !!r.json.success, imported: r.json.successCount || 0, errors, kibanaUrl, space, dashboardsUrl: `${kibanaUrl}${space ? `/s/${space}` : ''}/app/dashboards`, prefix };
  if (out.imported || out.ok) elastic.setSettings({ kibanaUrl }); // remember the address for next time
  return out;
}

module.exports = { contents, importDashboards, ndjson, FILE };
