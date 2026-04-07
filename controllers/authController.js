import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Staff from '../models/Staff.js';
import { sendEmail, buildActivationEmail, buildPasswordResetEmail } from '../utils/email.js';

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes

const getAccessSecret = () => {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT access secret is not configured');
  }
  return secret;
};

const getRefreshSecret = () => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT refresh secret is not configured');
  }
  return secret;
};

const scopeCookieName = (scope) => (scope === 'cms' ? 'cms_refresh_token' : 'leave_refresh_token');
const scopeAccessCookieName = (scope) => (scope === 'cms' ? 'admin_token' : 'leave_access_token');

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const hashPassword = async (password) => bcrypt.hash(password, 12);

const comparePasswords = async (candidate, hashed) => bcrypt.compare(candidate, hashed || '');

const pickUserProfile = (staff) => ({
  id: staff._id,
  firstName: staff.firstName,
  lastName: staff.lastName,
  email: staff.email,
  staffCode: staff.staffCode,
  roles: staff.roles,
  division: staff.division,
  leaveEnabled: staff.leaveEnabled,
  profilePhoto: staff.profilePhoto || '',
});

const validateScopeAccess = (staff, scope) => {
  if (scope === 'cms') {
    const rawRoles = Array.isArray(staff.roles)
      ? staff.roles
      : typeof staff.roles === 'string'
      ? staff.roles.split(',')
      : [];

    const normalizedRoles = rawRoles
      .map((role) => String(role).trim().toLowerCase())
      .filter(Boolean);

    const allowed = normalizedRoles.includes('admin')
      || normalizedRoles.includes('hr')
      || normalizedRoles.includes('cms');

    if (!allowed) {
      const error = new Error('Not authorized for CMS access. Account must have admin, hr, or cms role.');
      error.status = 403;
      error.meta = { rawRoles, normalizedRoles };
      throw error;
    }
    return;
  }

  if (!staff.leaveEnabled) {
    const error = new Error('Leave portal access is disabled');
    error.status = 403;
    throw error;
  }
};

const createAccessToken = (staff, scope) =>
  jwt.sign(
    {
      sub: staff._id.toString(),
      roles: staff.roles,
      scope,
      division: staff.division,
      staffCode: staff.staffCode,
      tokenVersion: staff.tokenVersion,
    },
    getAccessSecret(),
    { expiresIn: ACCESS_TOKEN_TTL }
  );

const createRefreshToken = (staff, scope) =>
  jwt.sign(
    {
      sub: staff._id.toString(),
      scope,
      tokenVersion: staff.tokenVersion,
    },
    getRefreshSecret(),
    { expiresIn: REFRESH_TOKEN_TTL }
  );

const setRefreshCookie = (res, token, scope) => {
  res.cookie(scopeCookieName(scope), token, {
    ...cookieOptions,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
};

const setAccessCookie = (res, token, scope) => {
  res.cookie(scopeAccessCookieName(scope), token, {
    ...cookieOptions,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
};

const clearRefreshCookie = (res, scope) => {
  res.clearCookie(scopeCookieName(scope), cookieOptions);
};

const clearAccessCookie = (res, scope) => {
  res.clearCookie(scopeAccessCookieName(scope), cookieOptions);
};

const createPasswordToken = async (staff) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  staff.passwordResetToken = hashToken(rawToken);
  staff.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 60 minutes
  await staff.save({ validateBeforeSave: false, timestamps: false });
  return rawToken;
};

const respondWithTokens = async (res, staff, scope) => {
  const accessToken = createAccessToken(staff, scope);
  const refreshToken = createRefreshToken(staff, scope);
  setAccessCookie(res, accessToken, scope);
  setRefreshCookie(res, refreshToken, scope);

  // Resolve reporting relationships so the leave frontend can display approver names
  const teamLead = staff.teamLeadId ? await Staff.findById(staff.teamLeadId).select('firstName lastName email') : null;
  const lineManager = staff.lineManagerId ? await Staff.findById(staff.lineManagerId).select('firstName lastName email') : null;
  const hr = staff.hrId ? await Staff.findById(staff.hrId).select('firstName lastName email') : null;

  const userProfile = {
    ...pickUserProfile(staff),
    teamLead: teamLead
      ? { id: teamLead._id, firstName: teamLead.firstName, lastName: teamLead.lastName, email: teamLead.email }
      : null,
    lineManager: lineManager
      ? { id: lineManager._id, firstName: lineManager.firstName, lastName: lineManager.lastName, email: lineManager.email }
      : null,
    hr: hr ? { id: hr._id, firstName: hr.firstName, lastName: hr.lastName, email: hr.email } : null,
  };

  return res.json({
    accessToken,
    scope,
    user: userProfile,
  });
};

export const login = async (req, res) => {
  let loginEmail = '';
  try {
    const { email, password, scope = 'leave' } = req.body;
    loginEmail = String(email || '').toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const staff = await Staff.findOne({ email: loginEmail });
    if (!staff || !staff.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordOk = await comparePasswords(password, staff.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (scope === 'cms' && process.env.NODE_ENV !== 'production') {
      console.info('[Auth] CMS login attempt', {
        email: loginEmail,
        roles: Array.isArray(staff.roles) ? staff.roles : staff.roles ? [staff.roles] : [],
      });
    }

    validateScopeAccess(staff, scope);

    staff.lastLoginAt = new Date();
    staff.lastLoginProvider = 'local';
    await staff.save({ validateBeforeSave: false });

    return respondWithTokens(res, staff, scope);
  } catch (err) {
    if (err?.status === 403 && process.env.NODE_ENV !== 'production') {
      console.warn('[Auth] CMS login denied', {
        email: loginEmail,
        roles: err?.meta?.normalizedRoles || [],
      });
    }
    console.error('Login error:', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Unable to login' });
  }
};

export const refresh = async (req, res) => {
  try {
    const requestedScope = req.body.scope || req.query.scope || 'leave';
    const cookieName = scopeCookieName(requestedScope);
    const refreshToken = req.cookies[cookieName] || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token missing' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, getRefreshSecret());
    } catch (err) {
      clearRefreshCookie(res, requestedScope);
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    if (decoded.scope !== requestedScope) {
      clearRefreshCookie(res, requestedScope);
      return res.status(401).json({ message: 'Scope mismatch for refresh token' });
    }

    const staff = await Staff.findById(decoded.sub);
    if (!staff) {
      clearRefreshCookie(res, requestedScope);
      return res.status(401).json({ message: 'User no longer exists' });
    }

    if (staff.tokenVersion !== decoded.tokenVersion) {
      clearRefreshCookie(res, requestedScope);
      return res.status(401).json({ message: 'Session expired' });
    }

    validateScopeAccess(staff, requestedScope);

    return respondWithTokens(res, staff, requestedScope);
  } catch (err) {
    console.error('Refresh error:', err);
    const status = err.status || 500;
    return res.status(status).json({ message: err.message || 'Unable to refresh session' });
  }
};

export const logout = async (req, res) => {
  const scope = req.body.scope || req.query.scope || 'leave';
  const cookieName = scopeCookieName(scope);
  const refreshToken = req.cookies[cookieName] || req.body.refreshToken;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, getRefreshSecret());
      await Staff.findByIdAndUpdate(decoded.sub, { $inc: { tokenVersion: 1 } });
    } catch (err) {
      console.warn('Failed to decode refresh token on logout:', err.message);
    }
  }

  clearRefreshCookie(res, scope);
  clearAccessCookie(res, scope);
  res.json({ message: 'Logged out successfully' });
};

export const sendInvite = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const staff = await Staff.findOne({ email: email.toLowerCase().trim() });
    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const token = await createPasswordToken(staff);
    staff.lastInviteSentAt = new Date();
    await staff.save({ validateBeforeSave: false, timestamps: false });
    const emailContent = buildActivationEmail(staff, token);
    await sendEmail({ to: staff.email, ...emailContent });

    res.json({ message: 'Activation email sent' });
  } catch (err) {
    console.error('Send invite error:', err?.message || err);
    const statusCode = err?.code === 'SMTP_NOT_CONFIGURED' ? 503 : 500;
    res.status(statusCode).json({ message: 'Unable to send activation email at the moment' });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const staff = await Staff.findOne({ email: email.toLowerCase().trim() });
    if (!staff) {
      return res.json({ message: 'If the account exists, a reset email has been sent.' });
    }

    const token = await createPasswordToken(staff);
    const emailContent = buildPasswordResetEmail(staff, token);
    await sendEmail({ to: staff.email, ...emailContent });

    res.json({ message: 'If the account exists, a reset email has been sent.' });
  } catch (err) {
    console.error('Password reset request error:', err);
    res.status(500).json({ message: 'Unable to process reset request' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    const hashedToken = hashToken(token);
    const staff = await Staff.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!staff) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    staff.passwordHash = await hashPassword(password);
    staff.passwordSetAt = new Date();
    staff.passwordResetToken = undefined;
    staff.passwordResetExpires = undefined;
    staff.tokenVersion += 1;

    await staff.save({ validateBeforeSave: false });

    clearRefreshCookie(res, 'leave');
    clearRefreshCookie(res, 'cms');
    clearAccessCookie(res, 'leave');
    clearAccessCookie(res, 'cms');

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ message: 'Unable to reset password' });
  }
};

export const activateAccount = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    const hashedToken = hashToken(token);
    const staff = await Staff.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!staff) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    if (staff.passwordHash) {
      return res.status(400).json({ message: 'Account already activated' });
    }

    staff.passwordHash = await hashPassword(password);
    staff.passwordSetAt = new Date();
    staff.passwordResetToken = undefined;
    staff.passwordResetExpires = undefined;
    staff.tokenVersion += 1;

    await staff.save({ validateBeforeSave: false });

    clearRefreshCookie(res, 'leave');
    clearRefreshCookie(res, 'cms');
    clearAccessCookie(res, 'leave');
    clearAccessCookie(res, 'cms');

    res.json({ message: 'Account activated successfully' });
  } catch (err) {
    console.error('Account activation error:', err);
    res.status(500).json({ message: 'Unable to activate account' });
  }
};
