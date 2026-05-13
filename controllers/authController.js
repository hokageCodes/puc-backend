import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Staff from '../models/Staff.js';
import { sendEmail, buildActivationEmail, buildPasswordResetEmail } from '../utils/email.js';
import { logAudit } from '../utils/auditLogger.js';

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_EXPIRES_IN || '24h';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

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

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    const err = new Error('Password must contain at least one letter and one number');
    err.status = 400;
    throw err;
  }
};

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

const createPasswordToken = async (staff, { markInviteSent = false } = {}) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  staff.passwordResetToken = hashToken(rawToken);
  staff.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 60 minutes
  if (markInviteSent) staff.lastInviteSentAt = new Date();
  await staff.save({ validateBeforeSave: false, timestamps: false });
  return rawToken;
};

const respondWithTokens = async (res, staff, scope) => {
  const accessToken = createAccessToken(staff, scope);
  const refreshToken = createRefreshToken(staff, scope);
  setAccessCookie(res, accessToken, scope);
  setRefreshCookie(res, refreshToken, scope);

  // Team / department names come from Team + Department collections (Staff.team → Team).
  const org = await Staff.findById(staff._id).populate('team', 'name').populate('department', 'name').lean();

  // Resolve reporting relationships so the leave frontend can display approver names
  const teamLead = staff.teamLeadId ? await Staff.findById(staff.teamLeadId).select('firstName lastName email') : null;
  const lineManager = staff.lineManagerId ? await Staff.findById(staff.lineManagerId).select('firstName lastName email') : null;
  const hr = staff.hrId ? await Staff.findById(staff.hrId).select('firstName lastName email') : null;

  const teamPayload = org?.team
    ? { id: org.team._id, name: org.team.name }
    : null;
  const departmentPayload = org?.department
    ? { id: org.department._id, name: org.department.name }
    : null;

  const userProfile = {
    ...pickUserProfile(staff),
    team: teamPayload,
    department: departmentPayload,
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

    // Always run bcrypt even when staff not found to prevent timing attacks
    const passwordOk = await comparePasswords(password, staff?.passwordHash);

    if (!staff || !staff.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check account lockout
    if (staff.lockUntil && staff.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((staff.lockUntil - Date.now()) / 60000);
      return res.status(429).json({
        message: `Account locked. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
      });
    }

    if (!passwordOk) {
      const attempts = (staff.failedLoginAttempts || 0) + 1;
      const update = { failedLoginAttempts: attempts, lastFailedLoginAt: new Date() };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        update.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        update.failedLoginAttempts = 0;
      }
      await Staff.findByIdAndUpdate(staff._id, update);
      await logAudit('AUTH_LOGIN_FAILURE', {
        actorEmail: loginEmail,
        scope: req.body.scope || 'leave',
        outcome: 'failure',
        metadata: { reason: 'invalid_password', attempts },
        req,
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    validateScopeAccess(staff, scope);

    // Successful login — clear lockout state and record login
    staff.failedLoginAttempts = 0;
    staff.lockUntil = undefined;
    staff.lastLoginAt = new Date();
    staff.lastLoginProvider = 'local';
    await staff.save({ validateBeforeSave: false });

    await logAudit('AUTH_LOGIN_SUCCESS', {
      actorId: staff._id.toString(),
      actorEmail: loginEmail,
      scope,
      req,
    });
    return respondWithTokens(res, staff, scope);
  } catch (err) {
    if (err?.status === 403) {
      await logAudit('AUTH_LOGIN_FAILURE', {
        actorEmail: loginEmail,
        scope: req.body.scope || 'leave',
        outcome: 'failure',
        metadata: { reason: 'scope_access_denied' },
        req,
      }).catch(() => {});
    }
    console.error('Login error:', err.message);
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
  const refreshToken = req.cookies[scopeCookieName(scope)] || req.body.refreshToken;
  const accessToken = req.cookies[scopeAccessCookieName(scope)]
    || req.headers.authorization?.replace('Bearer ', '');

  // Try refresh token first (preferred); fall back to access token so
  // logout always increments tokenVersion and invalidates outstanding tokens.
  let userId = null;
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, getRefreshSecret());
      userId = decoded.sub;
    } catch { /* expired or invalid — fall through to access token */ }
  }
  if (!userId && accessToken) {
    try {
      const decoded = jwt.verify(accessToken, getAccessSecret());
      userId = decoded.sub;
    } catch { /* ignore */ }
  }

  if (userId) {
    await Staff.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
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

    const token = await createPasswordToken(staff, { markInviteSent: true });
    const emailContent = buildActivationEmail(staff, token);
    await sendEmail({ to: staff.email, ...emailContent });

    res.json({ message: 'Activation email sent' });
  } catch (err) {
    console.error('Send invite error:', err?.message || err);

    let statusCode = 500;
    let message = 'Unable to send activation email at the moment';

    if (err?.code === 'SMTP_NOT_CONFIGURED') {
      statusCode = 503;
      message =
        'Email is not configured on this server. Set RESEND_API_KEY (recommended — resend.com) or configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in the backend .env, then restart the API.';
    } else if (err?.code === 'ETIMEDOUT') {
      statusCode = 503;
      message =
        'Email could not be sent: connection to the mail server timed out. Check network/firewall or use Resend (RESEND_API_KEY) instead of SMTP.';
    } else if (err?.code === 'EAUTH' || err?.responseCode === 535) {
      message =
        'Email server rejected login. Check SMTP_USER / SMTP_PASS (use an app password for Microsoft 365 or Gmail).';
    } else if (err?.code === 'RESEND_API_ERROR' && err?.statusCode === 403) {
      statusCode = 502;
      message =
        'Resend refused this send (often: unverified domain or using a from-address that is not allowed). Check the Resend dashboard, RESEND_FROM, and domain verification.';
    } else if (err?.code === 'RESEND_API_ERROR') {
      statusCode = 502;
      message =
        `Resend error: ${typeof err?.response?.message === 'string' ? err.response.message : err?.message || 'check API key and from-address'}`;
    } else if (process.env.NODE_ENV === 'development') {
      message = `Unable to send activation email (${err?.message || err?.code || 'unknown'})`;
    }

    res.status(statusCode).json({ message, code: err?.code });
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
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }
    validatePasswordStrength(password);

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
    const token = String(req.body?.token || '').trim();
    const password = req.body?.password;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }
    validatePasswordStrength(password);

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
