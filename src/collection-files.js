const fs = require('fs');
const path = require('path');
const collections = require('./collections');

// Create, edit and delete scripts written by the user: collections (Settings > Collections > Add Collections) and
// actions (Settings > Actions > Add Actions). "User-created" means a file that is not in the
// folder's verified.json, so shipped scripts (even edited ones) can never be changed or deleted here.
// Collections carry $Dependencies; actions carry $Parameters instead and have no dependencies.
const TYPES = { powershell: '.ps1', bash: '.sh' };
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ITEM_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/; // dependency names and tags, valid bare in both languages
const PARAM_RE = { powershell: /^[A-Za-z][A-Za-z0-9]{0,40}$/, bash: /^[A-Z][A-Z0-9_]{0,40}$/ };
const MAX_SCRIPT = 200 * 1024;

const clean = (s) => String(s ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim();
const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean))];
// Quoting that collections.js reads back exactly: '' inside '...' for PowerShell, "..." with \ escapes for bash.
const quote = (s, type) => (type === 'powershell'
  ? `'${s.replace(/'/g, "''")}'`
  : `"${s.replace(/([\\"$`])/g, '\\$1')}"`);

function makeFiles({ root, noun, listAll, resolve }) {
  const isAction = noun === 'action';
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  function validate(b) {
    const type = b.type;
    if (!TYPES[type]) throw new Error('Type must be PowerShell or Linux');
    const file = String(b.file ?? '').trim();
    if (!FILE_RE.test(file)) throw new Error('File name may only use letters, numbers, dot, dash and underscore (and must start with a letter or number)');
    const name = clean(b.name);
    if (!name) throw new Error(`${Noun} name is required`);
    const description = clean(b.description);
    if (!description) throw new Error('Description is required');
    const tags = list(b.tags).map((t) => t.toLowerCase());
    for (const t of tags) if (!ITEM_RE.test(t)) throw new Error(`Invalid tag "${t}": use letters, numbers, dot, dash`);
    let dependencies = [], parameters = [], footprint, returns, kind;
    if (isAction) {
      parameters = list(b.parameters);
      for (const p of parameters) {
        if (!PARAM_RE[type].test(p.replace(/\?$/, ''))) throw new Error(`Invalid parameter "${p}": ${type === 'bash' ? 'use UPPER_SNAKE_CASE such as PROCESS_NAME' : 'use letters and numbers such as ProcessName'} (add ? on the end if it is optional)`);
      }
    } else {
      dependencies = list(b.dependencies);
      for (const d of dependencies) if (!ITEM_RE.test(d)) throw new Error(`Invalid dependency "${d}": use a plain file name such as autorunsc.exe`);
      const oneOf = (v, allowed, label) => { if (!allowed.includes(v)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`); return v; };
      footprint = oneOf(b.footprint ?? 'none', collections.FOOTPRINTS.filter((f) => f !== 'persistent'), 'Footprint (a collection that changes the host belongs in Respond)');
      returns = oneOf(b.returns ?? 'records', collections.RETURNS, 'Returns');
      kind = oneOf(b.kind ?? 'command', collections.KINDS, 'Type');
    }
    const script = String(b.script ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, '').replace(/^(?:[ \t]*\n)+/, '');
    if (!script.trim()) throw new Error('The script is empty');
    if (script.length > MAX_SCRIPT) throw new Error('Script is too large');
    return { type, file, name, description, tags, dependencies, parameters, footprint, returns, kind, script };
  }

  function build({ type, name, description, tags, dependencies, parameters, footprint, returns, kind, script }) {
    const ps = type === 'powershell';
    const arr = (items) => (ps ? `@(${items.map((i) => quote(i, type)).join(', ')})` : `(${items.map((i) => (/[?*]/.test(i) ? `'${i}'` : i)).join(' ')})`);
    const head = ps
      ? [`$Name = ${quote(name, type)}`, `$Description = ${quote(description, type)}`, `$Dependencies = ${arr(dependencies)}`]
      : [`NAME=${quote(name, type)}`, `DESCRIPTION=${quote(description, type)}`, `DEPENDENCIES=${arr(dependencies)}`];
    if (isAction) head.push(ps ? `$Parameters = ${arr(parameters)}` : `PARAMETERS=${arr(parameters)}`);
    else {
      const one = (label, v) => (ps ? `$${label} = ${quote(v, type)}` : `${label.toUpperCase()}=${quote(v, type)}`);
      head.push(one('Footprint', footprint), one('Returns', returns), one('Type', kind));
    }
    head.push(ps ? `$Tags = ${arr(tags)}` : `TAGS=${arr(tags)}`);
    return `${head.join('\n')}\n\n${script}\n`;
  }

  // The target path is built only from a validated bare file name and a fixed type folder.
  function locate(type, file) {
    const full = path.resolve(root, type, file + TYPES[type]);
    if (path.dirname(full) !== path.resolve(root, type)) throw new Error('Invalid file name');
    return full;
  }
  const isShipped = (type, file) => `${type}/${file}${TYPES[type]}` in collections.loadVerified(root);

  function write(full, f) {
    const text = build(f);
    // The platform must be able to read the header back exactly, or the script would list wrongly.
    const p = collections.parseCollection(text, f.type, isAction);
    const same = p.name === f.name && p.description === f.description
      && p.dependencies.join('\n') === f.dependencies.join('\n') && p.tags.join('\n') === f.tags.join('\n')
      && (isAction ? p.parameters.join('\n') === f.parameters.map((x) => x.replace(/\?$/, '')).join('\n') && p.optionalParameters.join('\n') === f.parameters.filter((x) => x.endsWith('?')).map((x) => x.slice(0, -1)).join('\n') : p.footprint === f.footprint && p.returns === f.returns && p.kind === f.kind)
      && p.body === f.script;
    if (!same) throw new Error(`Could not write this ${noun} safely; check the name, description and script for unusual characters`);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const tmp = `${full}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, full);
  }

  const split = (type, fileWithExt) => {
    if (!TYPES[type] || typeof fileWithExt !== 'string' || !fileWithExt.endsWith(TYPES[type])) throw new Error(`Unknown ${noun}`);
    return fileWithExt.slice(0, -TYPES[type].length);
  };

  // A user script with its editable fields and body (no absolute paths).
  function view(type, fileWithExt) {
    const h = resolve(`${type}/${fileWithExt}`);
    if (!h) throw new Error(`${Noun} not found`);
    const { file, text, ...pub } = h;
    return { ...pub, file: fileWithExt, fileBase: fileWithExt.slice(0, -TYPES[type].length) };
  }

  return {
    create(b) {
      const f = validate(b);
      if (isShipped(f.type, f.file)) throw new Error(`That file name belongs to a shipped ${noun}`);
      const full = locate(f.type, f.file);
      if (fs.existsSync(full)) throw new Error(`${f.file}${TYPES[f.type]} already exists`);
      write(full, f);
      return view(f.type, f.file + TYPES[f.type]);
    },
    update(type, fileWithExt, b) {
      const file = split(type, fileWithExt);
      const f = validate({ ...b, type, file });
      if (isShipped(type, file)) throw new Error(`Shipped ${noun}s cannot be edited here`);
      const full = locate(type, file);
      if (!fs.existsSync(full)) throw new Error(`${Noun} not found`);
      write(full, f);
      return view(type, fileWithExt);
    },
    remove(type, fileWithExt) {
      const file = split(type, fileWithExt);
      if (isShipped(type, file)) throw new Error(`Shipped ${noun}s cannot be deleted here`);
      const full = locate(type, file);
      if (!fs.existsSync(full)) throw new Error(`${Noun} not found`);
      fs.unlinkSync(full);
    },
    listUser() {
      const verified = collections.loadVerified(root);
      return listAll().filter((h) => !(h.id in verified)).map((h) => view(h.type, h.file));
    },
  };
}

module.exports = {
  collections: makeFiles({ root: collections.collectionsDir, noun: 'collection', listAll: () => collections.listCollections(), resolve: (id) => collections.resolveCollection(id) }),
  actions: makeFiles({ root: collections.actionsDir, noun: 'action', listAll: () => collections.listActions(), resolve: (id) => collections.resolveAction(id) }),
};
