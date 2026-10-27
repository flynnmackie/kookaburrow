// Which permission each API route needs (see src/permissions.js). The first matching rule wins. A list means "any of these";
// admin (full access) passes everything. A route that matches no rule is refused, so a new route is locked until it is added here.
// Several read-only routes accept more than one permission because other features need that data: the host list for
// shells and hunts, the collection list for hunts.
const OPEN = 'open';
const RULES = [
  ['*', /^\/api\/auth\/(login|logout|me)$/, OPEN],
  ['GET', /^\/api\/(permissions|about)$/, OPEN],
  ['*', /^\/api\/favourites(\/|$)/, OPEN], // your own list; the handler only touches the signed-in user
  ['PUT', /^\/api\/users\/[^/]+\/password$/, OPEN], // checked in the handler: your own needs the current password, others need Manage users

  ['GET', /^\/api\/hosts\/[^/]+\/history$/, ['hosts.view']],
  ['GET', /^\/api\/(hosts|lists)$/, ['hosts.view', 'shell.open', 'hunts.run', 'actions.run']],
  ['GET', /^\/api\/(profiles|assignments)$/, ['hosts.view']],
  ['*', /^\/api\/(scans|profiles|assignments|lists|hosts|auth\/test)(\/|$)/, ['hosts.manage']],

  ['*', /^\/api\/dependencies(\/|$)/, ['system.view']],
  ['GET', /^\/api\/binaries$/, ['collections.view']],
  ['*', /^\/api\/binaries(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/collections\/user$/, ['collections.manage']],
  ['GET', /^\/api\/collections(\/|$)/, ['collections.view', 'hunts.run']],
  ['*', /^\/api\/collections(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/actions\/user$/, ['actions.manage']],
  ['GET', /^\/api\/actions(\/|$)/, ['actions.view']],
  ['*', /^\/api\/actions(\/|$)/, ['actions.manage']],

  ['POST', /^\/api\/responses$/, ['actions.run']],
  ['POST', /^\/api\/responses\/[^/]+\/cancel$/, ['actions.run']],
  ['POST', /^\/api\/runs\/[^/]+\/cancel$/, ['hunts.run']],
  ['DELETE', /^\/api\/responses\/[^/]+$/, ['actions.run']],
  ['GET', /^\/api\/workflows$/, ['workflows.view']],
  ['*', /^\/api\/workflows(\/|$)/, ['workflows.manage']],
  ['GET', /^\/api\/schedules$/, ['hunts.view', 'actions.view']],
  ['DELETE', /^\/api\/schedules\/[^/]+$/, ['hunts.run', 'actions.run']],
  ['PUT', /^\/api\/schedules\/[^/]+$/, ['hunts.run', 'actions.run']], // pause / resume; the kind of schedule is checked in the handler // the kind of schedule is checked in the handler
  ['GET', /^\/api\/responses(\/|$)/, ['actions.view']],
  ['GET', /^\/api\/reports$/, ['hunts.view']],
  ['POST', /^\/api\/runs\/[^/]+\/report$/, ['hunts.export']],
  ['GET', /^\/api\/runs\/[^/]+\/report$/, ['hunts.export']],
  ['DELETE', /^\/api\/runs\/[^/]+\/report$/, ['hunts.run']],
  ['POST', /^\/api\/(runs|hunts)$/, ['hunts.run']],
  ['DELETE', /^\/api\/runs\/[^/]+$/, ['hunts.run']],
  ['GET', /^\/api\/runs\/[^/]+\/(log\.csv|download)$/, ['hunts.export']],
  ['GET', /^\/api\/runs(\/|$)/, ['hunts.view']],
  ['GET', /^\/api\/browse\/download$/, ['hunts.export']],
  ['DELETE', /^\/api\/browse$/, ['hunts.run', 'actions.run']], // output, reports and pulled files only; the server refuses anything else
  ['*', /^\/api\/(pins|diff|compare)(\/|$)/, ['hunts.view']],
  ['GET', /^\/api\/baselines$/, ['hunts.view']],
  ['*', /^\/api\/baselines(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/iocs(\/|$)/, ['hunts.view']],
  ['*', /^\/api\/iocs(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/browse(\/|$)/, ['hunts.view']],

  ['*', /^\/api\/shell\/[^/]+\/(ls|pull|send)$/, ['shell.files']],
  ['*', /^\/api\/shell(\/|$)/, ['shell.open']],

  ['GET', /^\/api\/quarantine(\/log)?$/, ['system.view']],
  ['*', /^\/api\/quarantine\/[^/]+$/, ['actions.run']], // isolating a host runs the Host - Isolate action
  ['*', /^\/api\/monitor(\/|$)/, ['system.view']],
  ['GET', /^\/api\/settings\/(health|shell|runs|server|elastic|certificate(\/ca\.pem)?)$/, ['system.view']],
  ['*', /^\/api\/settings(\/|$)/, ['system.manage']],

  ['GET', /^\/api\/(users|roles)$/, ['users.view']],
  ['POST', /^\/api\/users$/, ['users.manage']],
  ['DELETE', /^\/api\/users\/[^/]+$/, ['users.manage']],
  ['PUT', /^\/api\/users\/[^/]+$/, ['roles.manage']],
  ['*', /^\/api\/roles(\/|$)/, ['roles.manage']],
];

// 'open', a list of permissions (any one is enough), or 'deny' for a route nobody has described.
function required(method, path) {
  for (const [m, re, need] of RULES) if ((m === '*' || m === method) && re.test(path)) return need;
  return 'deny';
}

module.exports = { required, OPEN };
