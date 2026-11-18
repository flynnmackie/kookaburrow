const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const yara = require('./yara');

// The YaraRule parameter of the YARA hunts (Yara - Scan Files, Yara - Scan Processes): which rules a hunt scans with.
//   ''  or  'all'      the enabled rule files joined into kb-rules.yar (the default; Settings > Collections > YARA Rules)
//   'file:<id>'        one rule file from the server, enabled or not (the built-in ones are here)
//   'custom:<text>'    rules written for this hunt; the hunt page offers to save them to the server under a name once it has run
// The chosen rules are staged on the host in place of kb-rules.yar for that one hunt, so nothing about the shared rule set changes.
const MAX_BYTES = 200 * 1024;
const bad = (m) => Object.assign(new Error(m), { status: 400 });

// null for the default; otherwise { mode, label, text, fileId, name }. Throws when the choice cannot be used.
function resolve(value) {
  const v = String(value ?? '');
  if (!v || v === 'all') return null;
  if (v.startsWith('file:')) {
    const r = yara.find(v.slice(5));
    if (!r) throw bad('That rule file is not on the server any more');
    return { mode: 'file', fileId: r.id, name: r.name, label: `rule file: ${r.name}`.slice(0, 120), text: yara.text(r) };
  }
  if (v.startsWith('custom:')) {
    const text = v.slice(7).replace(/^﻿/, '');
    if (!text.trim()) throw bad('The YARA rule is empty. Write a rule, or choose one from the list.');
    if (Buffer.byteLength(text) > MAX_BYTES) throw bad('The YARA rule is over 200 KB');
    const p = yara.parse(text);
    if (p.includes) throw bad('include is not supported in a YARA rule here');
    if (!p.rules.length) throw bad('No rule found in that text (a rule starts with: rule Name {)');
    return { mode: 'custom', name: p.rules.join(', ').slice(0, 120), label: `custom rule: ${p.rules[0]}`.slice(0, 120), text };
  }
  throw bad('YaraRule must be all, a rule file, or your own rule');
}

// Writes the chosen rules as <tmp>/kb-yara-<random>/kb-rules.yar (the file name the collections look for) and returns { dir, file }.
function stage(r) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kb-yara-${crypto.randomBytes(3).toString('hex')}-`));
  const file = path.join(dir, 'kb-rules.yar');
  fs.writeFileSync(file, r.text);
  return { dir, file };
}

// Compiles the rules before a hunt starts, so a typing mistake is reported on the spot and not as a failure on every host.
async function validate(value) {
  const r = resolve(value);
  if (!r || r.mode === 'file') return r; // a server file was compiled when it was added
  const s = stage(r);
  try { const c = await yara.check(s.file); if (c.ok === false) throw bad(`The YARA rule does not compile: ${String(c.error || '').replace(s.file, 'line')}`); }
  finally { fs.rmSync(s.dir, { recursive: true, force: true }); }
  return r;
}

// The rule files a hunt or scan can choose from, for the dropdown (no text).
const choices = () => yara.list().map((r) => ({ id: r.id, name: r.name, builtin: !!r.builtin, enabled: !!r.enabled, rules: r.rules.length, note: r.note || '', ok: r.check ? r.check.ok : null }));

module.exports = { MAX_BYTES, resolve, stage, validate, choices };
