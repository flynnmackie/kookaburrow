const { db, save, id } = require('./store');

// Workflows (Burrow > Workflow): a saved recipe that follows a hunt: collect artefacts, run server-side tools on them (post-processing),
// then send the results on (Elastic, Splunk, ...). This is the skeleton: workflows can be saved, listed and deleted, but they have no
// steps yet and nothing runs them.
//   id, name, description, createdBy, createdAt
//   stages   reserved for the steps; each will be { type: 'processor' | 'destination', ... }
const err = (m, status = 400) => Object.assign(new Error(m), { status });

const view = (w) => ({ id: w.id, name: w.name, description: w.description || '', stages: w.stages || [], createdBy: w.createdBy || null, createdAt: w.createdAt });
const list = () => db.workflows.map(view);

function create({ name, description, createdBy }) {
  const n = String(name || '').trim();
  if (!n) throw err('Give the workflow a name');
  if (n.length > 80) throw err('The name is too long (80 characters at most)');
  if (db.workflows.some((w) => w.name.toLowerCase() === n.toLowerCase())) throw err('A workflow with that name already exists');
  const w = { id: id(), name: n, description: String(description || '').trim().slice(0, 500), stages: [], createdBy: createdBy || null, createdAt: new Date().toISOString() };
  db.workflows.push(w);
  save();
  return view(w);
}
function remove(wid) {
  const i = db.workflows.findIndex((w) => w.id === wid);
  if (i < 0) throw err('Workflow not found', 404);
  db.workflows.splice(i, 1);
  save();
}

module.exports = { list, create, remove };
