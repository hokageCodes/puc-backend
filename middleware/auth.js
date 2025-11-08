// middleware/auth.js
import jwt from 'jsonwebtoken';
import Staff from '../models/Staff.js';
import Admin from '../models/Admin.js';
import { SCOPE_ROLE_MAP, DEFAULT_ROLE, hasAnyRole, ROLES } from '../config/rbac.js';

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT access secret is not configured');
  }
  return secret;
};

const getTokenFromRequest = (req, scope) => {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  const cookieName = scope === 'cms' ? 'admin_token' : null;
  const legacyCookieToken = cookieName ? req.cookies?.[cookieName] : null;

  return headerToken || legacyCookieToken;
};

export const requireAuth = ({ scope = 'leave' } = {}) => async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req, scope);
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, getAccessSecret());
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    if (decoded.scope && decoded.scope !== scope) {
      return res.status(403).json({ message: 'Invalid token scope for this resource' });
    }

    const userId = decoded.sub || decoded.id;
    let staff = await Staff.findById(userId);

    if (staff) {
      if (staff.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ message: 'Session expired, please sign in again' });
      }

      const roles = Array.isArray(staff.roles) && staff.roles.length ? staff.roles : [DEFAULT_ROLE];

      req.user = {
        id: staff._id,
        email: staff.email,
        roles,
        division: staff.division,
        staffCode: staff.staffCode,
        leaveEnabled: staff.leaveEnabled !== false,
        teamLeadId: staff.teamLeadId,
        lineManagerId: staff.lineManagerId,
      };
    } else if (scope === 'cms') {
      const legacyAdmin = await Admin.findById(userId);
      if (!legacyAdmin || !legacyAdmin.isAdmin) {
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = {
        id: legacyAdmin._id,
        email: legacyAdmin.email,
        roles: [ROLES.ADMIN, ROLES.CMS],
        division: 'legal',
        staffCode: undefined,
        leaveEnabled: true,
      };
    } else {
      return res.status(401).json({ message: 'User not found' });
    }

    validateScopeAccess(req.user, scope);

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Not authorized' });
  }
};

const validateScopeAccess = (user, scope) => {
  const allowedRoles = SCOPE_ROLE_MAP[scope];
  if (allowedRoles && !hasAnyRole(user.roles, allowedRoles)) {
    const error = new Error('Not authorized for this resource');
    error.status = 403;
    throw error;
  }

  if (scope === 'leave' && user.leaveEnabled === false) {
    const error = new Error('Leave access disabled for this user');
    error.status = 403;
    throw error;
  }
};

export const requireRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const normalizedAllowed = allowedRoles.flat().filter(Boolean);
  const hasAllowed = hasAnyRole(req.user.roles, normalizedAllowed);
  if (!hasAllowed) {
    return res.status(403).json({ message: 'Insufficient permissions' });
  }

  next();
};

export const ensureLeaveEnrolled = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  if (!req.user.leaveEnabled) {
    return res.status(403).json({ message: 'Leave management is disabled for this user' });
  }

  next();
};

export const canApprove = (request, user) => {
  if (!request || !user) return false;

  const roles = Array.isArray(user.roles) ? user.roles : [];

  if (roles.includes('admin') || roles.includes('hr')) {
    return true;
  }

  if (request.staff?.division === 'admin') {
    return false;
  }

  let currentStep;
  if (Array.isArray(request.approverChain) && request.approverChain.length) {
    currentStep = request.approverChain.find((step) => step.status === 'pending');
  }

  if (!currentStep) {
    return false;
  }

  if (currentStep.role === 'teamLead') {
    const expectedId = request.staff?.teamLeadId?.toString();
    return roles.includes('teamLead') && user.id.toString() === expectedId;
  }

  if (currentStep.role === 'lineManager') {
    const expectedId = request.staff?.lineManagerId?.toString();
    return roles.includes('lineManager') && user.id.toString() === expectedId;
  }

  return false;
};

export const protect = requireAuth({ scope: 'cms' });