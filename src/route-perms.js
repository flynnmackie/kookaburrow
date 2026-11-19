// Which permission each API route needs (see src/permissions.js). The first matching rule wins. A list means "any of these";
// admin (full access) passes everything. A route that matches no rule is refused, so a new route is locked until it is added here.
// Several read-only routes accept more than one permission because other features need that data: the host list for
// shells and hunts, the collection list for hunts.
const OPEN = 'open';
const RULES = [
  ['*', /^\/api\/auth\/(login|logout|me)$/, OPEN],
  ['GET', /^\/api\/(permissions|about)$/, OPEN],
  ['GET', /^\/api\/auth\/sso\/(status|login|callback)$/, OPEN],
  ['GET', /^\/api\/docs(\/|$)/, OPEN], // the offline documentation is for everyone who is signed in
  ['*', /^\/api\/favourites(\/|$)/, OPEN], // your own list; the handler only touches the signed-in user
  ['PUT', /^\/api\/users\/[^/]+\/password$/, OPEN], // checked in the handler: your own needs the current password, others need Manage users

  ['GET', /^\/api\/hosts\/[^/]+\/history$/, ['hosts.view']],
  ['GET', /^\/api\/(hosts|lists)$/, ['hosts.view', 'shell.open', 'hunts.run', 'actions.run']],
  ['GET', /^\/api\/(profiles|assignments)$/, ['hosts.view']],
  ['*', /^\/api\/(scans|profiles|assignments|lists|hosts|auth\/test)(\/|$)/, ['hosts.manage']],

  ['*', /^\/api\/dependencies(\/|$)/, ['system.view']],
  ['GET', /^\/api\/binaries$/, ['collections.view']],
  ['*', /^\/api\/binaries(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/yara\/choices(\/[^/]+\/text)?$/, ['hunts.run', 'collections.view']], // the rule picker of a YARA hunt
  ['POST', /^\/api\/runs\/[^/]+\/yara-save$/, ['collections.manage']], // saving a rule written for a hunt adds a rule file
  ['GET', /^\/api\/yara$/, ['collections.view']],
  ['*', /^\/api\/yara(\/|$)/, ['collections.manage']], // includes reading a rule file's text
  ['GET', /^\/api\/collections\/user$/, ['collections.manage']],
  ['GET', /^\/api\/collections(\/|$)/, ['collections.view', 'hunts.run']],
  ['*', /^\/api\/collections(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/actions\/user$/, ['actions.manage']],
  ['GET', /^\/api\/actions(\/|$)/, ['actions.view']],
  ['*', /^\/api\/actions(\/|$)/, ['actions.manage']],

  ['POST', /^\/api\/responses$/, ['actions.run']],
  ['GET', /^\/api\/approvals(\/count)?$/, ['actions.approve', 'actions.run']], // approvers see every request, others only their own (checked in the handler)
  ['GET', /^\/api\/approvals\/[^/]+$/, ['actions.approve', 'actions.run']],
  ['POST', /^\/api\/approvals\/[^/]+\/(approve|reject)$/, ['actions.approve']],
  ['POST', /^\/api\/approvals\/[^/]+\/cancel$/, ['actions.approve', 'actions.run']],
  ['POST', /^\/api\/responses\/[^/]+\/cancel$/, ['actions.run']],
  ['POST', /^\/api\/runs\/[^/]+\/cancel$/, ['hunts.run']],
  ['DELETE', /^\/api\/responses\/[^/]+$/, ['actions.run']],
  ['GET', /^\/api\/workflows$/, ['workflows.view']],
  ['*', /^\/api\/workflows(\/|$)/, ['workflows.manage']],
  ['GET', /^\/api\/schedules$/, ['hunts.view', 'actions.view']],
  ['POST', /^\/api\/schedules\/[^/]+\/seen$/, ['hunts.view', 'actions.view']], // the kind of schedule is checked in the handler
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
  ['*', /^\/api\/diff\/(reports|drift-report)$/, ['hunts.export']], // makes the reports of both runs, and the drift report
  ['*', /^\/api\/(pins|diff|compare)(\/|$)/, ['hunts.view']],
  ['GET', /^\/api\/baselines(\/changes)?$/, ['hunts.view']],
  ['GET', /^\/api\/baselines\/[^/]+\/download$/, ['hunts.export']],
  ['*', /^\/api\/baselines(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/watch(\/|$)/, ['hunts.view', 'system.view']],
  ['POST', /^\/api\/watch\/events\/seen$/, ['hunts.view', 'system.view']], // marking what you have read
  ['*', /^\/api\/watch(\/|$)/, ['hunts.run']], // a watch runs collections on hosts
  ['GET', /^\/api\/validate(\/|$)/, ['hunts.view', 'system.view']],
  ['*', /^\/api\/validate(\/|$)/, ['hunts.run']], // the command condition also needs actions.run, checked in src/validate.js
  ['GET', /^\/api\/yara-scans\/[^/]+\/csv$/, ['hunts.export']],
  ['GET', /^\/api\/yara-scans$/, ['hunts.view']],
  ['*', /^\/api\/yara-scans(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/expected$/, ['hunts.view']],
  ['*', /^\/api\/expected(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/iocs(\/|$)/, ['hunts.view']],
  ['*', /^\/api\/iocs(\/|$)/, ['hunts.run']],
  ['GET', /^\/api\/browse(\/|$)/, ['hunts.view']],

  ['*', /^\/api\/shell\/[^/]+\/(ls|pull|send)$/, ['shell.files']],
  ['*', /^\/api\/shell(\/|$)/, ['shell.open']],

  ['GET', /^\/api\/quarantine(\/log)?$/, ['system.view']],
  ['*', /^\/api\/quarantine\/[^/]+$/, ['actions.run']], // isolating a host runs the Host - Isolate action
  ['*', /^\/api\/monitor(\/|$)/, ['system.view']],
  ['GET', /^\/api\/settings\/(health|shell|runs|approvals|server|elastic|sso|certificate(\/ca\.pem)?)$/, ['system.view']],
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
