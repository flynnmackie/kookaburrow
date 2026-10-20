// Which permission each API route needs (see src/permissions.js). The first matching rule wins. A list means "any of these";
// admin (full access) passes everything. A route that matches no rule is refused, so a new route is locked until it is added here.
// Several read-only routes accept more than one permission because other features need that data: the host list for
// shells and hunts, the collection list for hunts.
const OPEN = 'open';
const RULES = [
  ['*', /^\/api\/auth\/(login|logout|me)$/, OPEN],
  ['GET', /^\/api\/(permissions|about)$/, OPEN],

  ['GET', /^\/api\/(hosts|lists)$/, ['hosts.view', 'shell.open', 'hunts.run']],
  ['GET', /^\/api\/(profiles|assignments)$/, ['hosts.view']],
  ['*', /^\/api\/(scans|profiles|assignments|lists|hosts|auth\/test)(\/|$)/, ['hosts.manage']],

  ['GET', /^\/api\/binaries$/, ['collections.view']],
  ['*', /^\/api\/binaries(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/collections\/user$/, ['collections.manage']],
  ['GET', /^\/api\/collections(\/|$)/, ['collections.view', 'hunts.run']],
  ['*', /^\/api\/collections(\/|$)/, ['collections.manage']],
  ['GET', /^\/api\/actions\/user$/, ['actions.manage']],
  ['GET', /^\/api\/actions(\/|$)/, ['actions.view']],
  ['*', /^\/api\/actions(\/|$)/, ['actions.manage']],

  ['POST', /^\/api\/(runs|hunts)$/, ['hunts.run']],
  ['DELETE', /^\/api\/runs\/[^/]+$/, ['hunts.run']],
  ['GET', /^\/api\/runs\/[^/]+\/log\.csv$/, ['hunts.export']],
  ['GET', /^\/api\/runs(\/|$)/, ['hunts.view']],
  ['GET', /^\/api\/browse\/download$/, ['hunts.export']],
  ['GET', /^\/api\/browse(\/|$)/, ['hunts.view']],

  ['*', /^\/api\/shell\/[^/]+\/(ls|pull|send)$/, ['shell.files']],
  ['*', /^\/api\/shell(\/|$)/, ['shell.open']],

  ['*', /^\/api\/monitor(\/|$)/, ['system.view']],

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
