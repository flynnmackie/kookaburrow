const fs = require('fs');
const path = require('path');
const { db, save, id } = require('./store');
const { outputDir } = require('./config');

// IOC lists (Burrow > IOC). A user uploads a file or pastes indicators; each upload is a list that shows as a header on the page.
// Under every list the page shows the hunts whose output contains one of its indicators: the run, and the individual files that
// returned it (the combined All-Hosts files and the log are left out so each hit is listed once).
const MAX_ITEMS = 20000, MAX_FILE_BYTES = 30 * 1024 * 1024;
const lists = () => (db.iocs ||= []);

// ---- reading an upload -------------------------------------------------------------------
const refang = (s) => s.replace(/\[\.\]|\(\.\)|\{\.\}/g, '.').replace(/\[:\]/g, ':').replace(/\[@\]|\[at\]/gi, '@').replace(/^hxxp/i, 'http').replace(/\[:\/\/\]/g, '://');
const HEX = /^[a-f0-9]+$/i;
function typeOf(v) {
  if (/^https?:\/\//i.test(v) || /^[a-z]+:\/\//i.test(v)) return 'url';
  if (HEX.test(v)) { if (v.length === 32) return 'md5'; if (v.length === 40) return 'sha1'; if (v.length === 64) return 'sha256'; }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return 'ip';
  if (/^[0-9a-f:]+$/i.test(v) && v.includes('::') || /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i.test(v)) return 'ip';
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)) return 'email';
  if (/[\\/]/.test(v)) return 'path';
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v) && /\.[a-z]{2,}$/i.test(v) && !/\.(exe|dll|sys|ps1|bat|cmd|vbs|js|lnk|tmp|dat|log|txt|zip|doc|docx|xls|xlsx|pdf|scr|msi|jar|bin)$/i.test(v)) return 'domain';
  if (/\.[a-z0-9]{1,5}$/i.test(v) && !/\s/.test(v)) return 'file';
  return 'string';
}
const VALUE_COLS = /^(value|ioc|iocs|indicator|indicators|observable|observables|artifact|artefact|hash|ip|ip_address|domain|url|sha256|md5|sha1)$/i;
// Text with one indicator per line, or a CSV (the first column, or the column called ioc / indicator / value / hash / ip ...).
// Blank lines and lines starting with # are ignored; defanged indicators (hxxp, [.]) are restored.
function parse(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const split = (l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  let col = 0, header = false;
  const first = lines.find((l) => l.trim() && !l.trim().startsWith('#'));
  if (first && /[,;\t]/.test(first)) { const cells = split(first), at = cells.findIndex((c) => VALUE_COLS.test(c)); if (at >= 0) { col = at; header = true; } }
  const seen = new Set(), items = [];
  let skippedHeader = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    if (header && !skippedHeader) { skippedHeader = true; continue; }
    const cell = /[,;\t]/.test(l) ? split(l)[col] : l;
    const value = refang(String(cell ?? '').trim().replace(/^["']|["']$/g, ''));
    if (value.length < 3 || value.length > 500) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ value, type: typeOf(value) });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

// ---- lists ---------------------------------------------------------------------------------
const summary = (l) => ({ id: l.id, name: l.name, note: l.note || '', count: l.items.length, createdBy: l.createdBy, createdAt: l.createdAt, types: l.items.reduce((m, i) => ((m[i.type] = (m[i.type] || 0) + 1), m), {}) });
const view = (l) => ({ ...summary(l), items: l.items });
function add({ name, text, note }, user) {
  const nm = String(name ?? '').trim();
  if (!nm) throw new Error('Give the list a name');
  if (nm.length > 80) throw new Error('The name is too long (80 characters at most)');
  if (lists().some((l) => l.name.toLowerCase() === nm.toLowerCase())) throw new Error('A list with that name already exists');
  const items = parse(text);
  if (!items.length) throw new Error('No indicators found. Use one per line, or a CSV with an ioc / indicator / value column.');
  const l = { id: id(), name: nm, note: String(note ?? '').slice(0, 500), createdBy: user, createdAt: new Date().toISOString(), items };
  lists().push(l); save();
  return summary(l);
}
function remove(listId) {
  const n = lists().length;
  db.iocs = lists().filter((l) => l.id !== listId);
  if (db.iocs.length === n) throw new Error('List not found');
  cache.delete(listId); save();
}
const get = (listId) => lists().find((l) => l.id === listId);

// ---- finding the indicators in hunt output ------------------------------------------------
// Hashes, IPs and domains are found as whole words (a word is letters, digits, dots, dashes and underscores), so
// 10.1.1.1 does not match 10.1.1.10, and a domain also matches its sub-domains. URLs, paths, file names and other text are found
// anywhere in the text. Everything is case-insensitive.
const WORD = /[a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9]/g, WORD_TYPES = new Set(['md5', 'sha1', 'sha256', 'ip', 'domain']);
function matcher(items) {
  const words = new Map(), subs = [];
  for (const i of items) { const k = i.value.toLowerCase(); if (WORD_TYPES.has(i.type) && !/[^a-z0-9._@-]/.test(k)) words.set(k, i.value); else subs.push([k, i.value]); }
  return (text) => {
    const low = text.toLowerCase(), hits = new Map();
    const bump = (v, n = 1) => hits.set(v, (hits.get(v) || 0) + n);
    if (words.size) {
      for (const [w] of low.matchAll(WORD)) {
        if (words.has(w)) { bump(words.get(w)); continue; }
        // a sub-domain or e-mail host of a listed domain: a.b.evil.com contains evil.com
        for (let at = w.indexOf('.'); at >= 0; at = w.indexOf('.', at + 1)) { const tail = w.slice(at + 1); if (words.has(tail)) { bump(words.get(tail)); break; } }
      }
    }
    for (const [k, v] of subs) { let n = 0; for (let i = low.indexOf(k); i >= 0 && n < 100000; i = low.indexOf(k, i + k.length)) n++; if (n) bump(v, n); }
    return hits;
  };
}

const SKIP_FILE = /(?:^|[\\/])(?:All[-_]Hosts[^\\/]*|[^\\/]*[-_]Log\.csv|hunt-log\.csv|[^\\/]*\.(?:exe|dll|sys|zip|gz|7z|evtx|png|jpe?g|pdf|dmp|mem|bin))$/i;
const tick = () => new Promise((r) => setImmediate(r));
function runFolders() {
  const base = path.join(outputDir, 'hunts');
  let names; try { names = fs.readdirSync(base); } catch { return []; }
  return names.filter((n) => { try { return fs.statSync(path.join(base, n)).isDirectory(); } catch { return false; } });
}
function filesIn(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const name of fs.readdirSync(d)) {
      if (name.startsWith('.') || name.endsWith('.tmp')) continue;
      const full = path.join(d, name), r = rel ? `${rel}/${name}` : name;
      let st; try { st = fs.lstatSync(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) { if (!/^All[-_]Hosts/i.test(name)) walk(full, r); }
      else if (!SKIP_FILE.test(r) && st.size <= MAX_FILE_BYTES) out.push({ full, rel: r, size: st.size, mtime: st.mtimeMs });
    }
  };
  walk(dir, '');
  return out;
}

// listId -> { stamp, runs: Map(folder -> { sig, files }) }; a run is read again only when its files change.
const cache = new Map();
async function matches(listId) {
  const l = get(listId); if (!l) throw new Error('List not found');
  const stamp = `${l.items.length}:${l.createdAt}`;
  let c = cache.get(listId); if (!c || c.stamp !== stamp) { c = { stamp, runs: new Map(), find: matcher(l.items) }; cache.set(listId, c); }
  const out = [];
  let n = 0;
  for (const folder of runFolders()) {
    const dir = path.join(outputDir, 'hunts', folder), files = filesIn(dir);
    const sig = files.map((f) => `${f.rel}|${f.size}|${f.mtime}`).join(';');
    let entry = c.runs.get(folder);
    if (!entry || entry.sig !== sig) {
      const hits = [];
      for (const f of files) {
        let buf; try { buf = fs.readFileSync(f.full); } catch { continue; }
        if (buf.subarray(0, 8192).includes(0)) continue;
        const m = c.find(buf.toString('utf8'));
        if (m.size) hits.push({ rel: f.rel, path: `/output/hunts/${folder}/${f.rel}`, matches: [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count) });
        if (++n % 25 === 0) await tick();
      }
      entry = { sig, hits }; c.runs.set(folder, entry);
    }
    if (!entry.hits.length) continue;
    const rec = db.runs.find((r) => r.outputPath === `hunts/${folder}`);
    let when = rec?.startedAt; if (!when) { try { when = fs.statSync(dir).mtime.toISOString(); } catch { when = null; } }
    const values = new Set(entry.hits.flatMap((h) => h.matches.map((m) => m.value)));
    out.push({ folder, path: `/output/hunts/${folder}`, name: rec?.name || rec?.collectionName || folder, startedAt: when, runId: rec?.id || null, indicators: values.size, files: entry.hits });
  }
  for (const k of [...c.runs.keys()]) if (!runFolders().includes(k)) c.runs.delete(k); // runs that were deleted
  out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return out;
}

module.exports = { parse, add, remove, get, list: () => lists().map(summary), view, matches, typeOf };
