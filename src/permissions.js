// The permissions a role can hold, bundled by area so there are a few meaningful choices instead of dozens of switches.
// Within an area the options build on each other: a higher option includes the ones it lists in `implies`, so giving
// someone "Manage hosts" also gives them "View hosts" (ticking one ticks what it includes; unticking a lower one would
// untick everything that depends on it). The built-in admin role holds '*' (everything, including options added later).
// Nothing enforces these yet: this describes what each role will be allowed to do.
const P = (key, label, desc, implies = []) => ({ key, label, desc, implies });
const GROUPS = [
  { id: 'users', name: 'Users and roles', permissions: [
    P('users.view', 'View users and roles', 'See the users, their roles and what each role allows.'),
    P('users.manage', 'Manage users', 'Create, edit and delete users and reset their passwords.', ['users.view']),
    P('roles.manage', 'Manage roles', 'Create roles, change what a role allows and assign roles to users.', ['users.manage']),
  ] },
  { id: 'hosts', name: 'Hosts', permissions: [
    P('hosts.view', 'View hosts', 'See the saved hosts, groups and credential profiles.'),
    P('hosts.manage', 'Manage hosts', 'Run discovery scans, authenticate and add hosts, edit profiles and groups, and delete hosts.', ['hosts.view']),
  ] },
  { id: 'collections', name: 'Collections', permissions: [
    P('collections.view', 'View collections', 'See the collection library and the binaries they depend on.'),
    P('collections.manage', 'Manage collections', 'Create, edit and delete collections, and upload or remove binaries.', ['collections.view']),
  ] },
  { id: 'actions', name: 'Actions (Respond)', permissions: [
    P('actions.view', 'View actions', 'See the action library.'),
    P('actions.manage', 'Manage actions', 'Create, edit and delete actions.', ['actions.view']),
    P('actions.run', 'Run actions', 'Run actions on hosts. These change the hosts they run on.', ['actions.view']),
  ] },
  { id: 'hunts', name: 'Hunts and results', permissions: [
    P('hunts.view', 'View hunts and results', 'See hunts, the activity log, collected data, reports and the output files.'),
    P('hunts.run', 'Run hunts', 'Create and run hunts on hosts and delete hunt records.', ['hunts.view']),
    P('hunts.export', 'Export results', 'Export logs and collected data and download output files.', ['hunts.view']),
  ] },
  { id: 'shell', name: 'Shell', permissions: [
    P('shell.open', 'Open shells', 'Open an interactive shell on a host and run commands in it.'),
    P('shell.files', 'Transfer files', 'Send files to hosts and pull files from them through a shell.', ['shell.open']),
  ] },
  { id: 'system', name: 'System', permissions: [
    P('system.view', 'View system', 'See server information and the health monitor, and run health checks.'),
    P('system.manage', 'Manage system', 'Change system settings.', ['system.view']),
  ] },
];
const ALL = GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
const BY_KEY = Object.fromEntries(GROUPS.flatMap((g) => g.permissions).map((p) => [p.key, p]));

// A set of permissions with everything each one includes added (the "inherit the lower options" rule).
function withIncluded(keys) {
  const out = new Set();
  const add = (k) => { if (BY_KEY[k] && !out.has(k)) { out.add(k); BY_KEY[k].implies.forEach(add); } };
  keys.forEach(add);
  return [...out];
}

// The permissions a role grants, with '*' expanded to every permission and included options added.
const expand = (role) => (role.permissions.includes('*') ? ALL : withIncluded(role.permissions));

module.exports = { GROUPS, ALL, expand, withIncluded };
