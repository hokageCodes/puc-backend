export const ROLES = Object.freeze({
  ADMIN: 'admin',
  HR: 'hr',
  LINE_MANAGER: 'lineManager',
  TEAM_LEAD: 'teamLead',
  STAFF: 'staff',
  CMS: 'cms',
});

export const DEFAULT_ROLE = ROLES.STAFF;

export const ALL_ROLES = Object.freeze([
  ROLES.STAFF,
  ROLES.TEAM_LEAD,
  ROLES.LINE_MANAGER,
  ROLES.HR,
  ROLES.ADMIN,
  ROLES.CMS,
]);

export const ALL_ROLES_SET = new Set(ALL_ROLES);

export const SCOPE_ROLE_MAP = Object.freeze({
  cms: new Set([ROLES.ADMIN, ROLES.HR, ROLES.CMS]),
  leave: new Set([
    ROLES.ADMIN,
    ROLES.HR,
    ROLES.LINE_MANAGER,
    ROLES.TEAM_LEAD,
    ROLES.STAFF,
  ]),
  // Unified Hub session: any authenticated staff may hold a hub session.
  // Per-feature authorization is enforced at the route level via requireRoles(...).
  hub: new Set(ALL_ROLES),
});

export const hasAnyRole = (userRoles = [], allowedRoles = []) => {
  if (!Array.isArray(userRoles) || userRoles.length === 0) return false;
  const allowedSet = allowedRoles instanceof Set ? allowedRoles : new Set(allowedRoles);
  return userRoles.some((role) => allowedSet.has(role));
};

