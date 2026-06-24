/**
 * Phase 1 — unified `hub` session.
 * Verifies the additive scope plumbing without altering legacy cms/leave behavior.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Staff.js', () => ({
  default: { findOne: vi.fn(), findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('../models/Admin.js', () => ({
  default: { findById: vi.fn() },
}));
vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn(), verify: vi.fn(), decode: vi.fn() },
}));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
}));
vi.mock('../utils/email.js', () => ({
  sendEmail: vi.fn(),
  buildActivationEmail: vi.fn(),
  buildPasswordResetEmail: vi.fn(),
}));
vi.mock('../utils/auditLogger.js', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

import Staff from '../models/Staff.js';
import Admin from '../models/Admin.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { login } from '../controllers/authController.js';

const createRes = () => ({
  statusCode: 200,
  body: null,
  cookies: [],
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie() { return this; },
});

const staffUser = (overrides = {}) => ({
  _id: 'staff-1',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  staffCode: 'PUC001',
  roles: ['staff'],
  division: 'legal',
  leaveEnabled: true,
  profilePhoto: '',
  tokenVersion: 0,
  ...overrides,
});

describe('Phase 1 — hub scope (additive)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  describe('requireAuth multi-scope', () => {
    const callMiddleware = async ({ scope, tokenScope, roles = ['staff'] }) => {
      jwt.verify.mockReturnValue({ sub: 'staff-1', scope: tokenScope, tokenVersion: 0 });
      Staff.findById.mockResolvedValue(staffUser({ roles }));
      const req = { headers: { authorization: 'Bearer abc' }, cookies: {} };
      const res = createRes();
      const next = vi.fn();
      await requireAuth({ scope })(req, res, next);
      return { req, res, next };
    };

    it('accepts a hub token on a route allowing ["hub","leave"]', async () => {
      const { res, next, req } = await callMiddleware({ scope: ['hub', 'leave'], tokenScope: 'hub' });
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.id).toBe('staff-1');
    });

    it('still accepts a legacy leave token on ["hub","leave"] (backward compatible)', async () => {
      const { next } = await callMiddleware({ scope: ['hub', 'leave'], tokenScope: 'leave' });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects a hub token on a cms-only route (scope mismatch → 403)', async () => {
      const { res, next } = await callMiddleware({ scope: 'cms', tokenScope: 'hub' });
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('reads the hub cookie when no Authorization header is present', async () => {
      jwt.verify.mockReturnValue({ sub: 'staff-1', scope: 'hub', tokenVersion: 0 });
      Staff.findById.mockResolvedValue(staffUser());
      const req = { headers: {}, cookies: { hub_access_token: 'cookie-token' } };
      const res = createRes();
      const next = vi.fn();
      await requireAuth({ scope: ['hub'] })(req, res, next);
      expect(jwt.verify).toHaveBeenCalledWith('cookie-token', 'test-access-secret');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('preserves the legacy Admin fallback when "cms" is in the allowed scopes', async () => {
      jwt.verify.mockReturnValue({ sub: 'admin-1', scope: 'cms', tokenVersion: 0 });
      Staff.findById.mockResolvedValue(null);
      Admin.findById.mockResolvedValue({ _id: 'admin-1', email: 'a@x.com', isAdmin: true });
      const req = { headers: { authorization: 'Bearer abc' }, cookies: {} };
      const res = createRes();
      const next = vi.fn();
      await requireAuth({ scope: ['hub', 'cms'] })(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user.roles).toContain('admin');
    });
  });

  describe('login with scope:"hub"', () => {
    it('issues hub-scoped access + refresh cookies for any authenticated staff', async () => {
      const staffDoc = staffUser({ passwordHash: 'hashed', save: vi.fn().mockResolvedValue(undefined) });
      Staff.findOne.mockResolvedValue(staffDoc);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValueOnce('hub-access').mockReturnValueOnce('hub-refresh');
      // respondWithTokens re-reads the user for team/department names.
      Staff.findById.mockReturnValue({
        populate() { return this; },
        lean: async () => ({ team: null, department: null }),
      });

      const req = { body: { email: 'user@example.com', password: 'pw', scope: 'hub' }, ip: '127.0.0.1' };
      const res = createRes();
      await login(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.scope).toBe('hub');
      const cookieNames = res.cookies.map((c) => c.name);
      expect(cookieNames).toContain('hub_access_token');
      expect(cookieNames).toContain('hub_refresh_token');
    });
  });
});
