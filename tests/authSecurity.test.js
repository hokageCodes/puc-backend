import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Staff.js', () => ({
  default: {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
    decode: vi.fn(),
  },
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
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
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { login, refresh } from '../controllers/authController.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    cookies: [],
    clearedCookies: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
      return this;
    },
  };
  return res;
};

describe('auth security controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('locks account after repeated failed logins', async () => {
    const staffDoc = {
      _id: 'staff-1',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 4,
      tokenVersion: 0,
      save: vi.fn().mockResolvedValue(undefined),
    };

    Staff.findOne.mockResolvedValue(staffDoc);
    bcrypt.compare.mockResolvedValue(false);

    const req = {
      body: { email: 'user@example.com', password: 'wrong', scope: 'leave' },
      ip: '127.0.0.1',
    };
    const res = createRes();

    await login(req, res);

    expect(res.statusCode).toBe(401);
    expect(staffDoc.failedLoginAttempts).toBe(5);
    expect(staffDoc.lockUntil).toBeInstanceOf(Date);
    expect(staffDoc.save).toHaveBeenCalledTimes(1);
  });

  it('rejects login while account is locked', async () => {
    const staffDoc = {
      _id: 'staff-1',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      failedLoginAttempts: 5,
      lockUntil: new Date(Date.now() + 5 * 60 * 1000),
      save: vi.fn().mockResolvedValue(undefined),
    };

    Staff.findOne.mockResolvedValue(staffDoc);

    const req = {
      body: { email: 'user@example.com', password: 'any', scope: 'leave' },
      ip: '127.0.0.1',
    };
    const res = createRes();

    await login(req, res);

    expect(res.statusCode).toBe(423);
    expect(res.body?.message).toMatch(/temporarily locked/i);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('rotates refresh token on successful refresh', async () => {
    const oldRefresh = 'old-refresh-token';
    const oldHash = hashToken(oldRefresh);
    const now = new Date();
    const staffDoc = {
      _id: 'staff-1',
      firstName: 'Test',
      lastName: 'User',
      email: 'user@example.com',
      staffCode: 'PUC001',
      roles: ['staff'],
      division: 'legal',
      leaveEnabled: true,
      profilePhoto: '',
      tokenVersion: 2,
      teamLeadId: null,
      lineManagerId: null,
      hrId: null,
      refreshTokens: [
        {
          scope: 'leave',
          tokenHash: oldHash,
          issuedAt: new Date(now.getTime() - 1000),
          expiresAt: new Date(now.getTime() + 3600000),
        },
      ],
      save: vi.fn().mockResolvedValue(undefined),
    };

    jwt.verify.mockReturnValue({
      sub: 'staff-1',
      scope: 'leave',
      tokenVersion: 2,
      jti: 'old-jti',
    });
    jwt.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');
    jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

    Staff.findById.mockImplementation(async (id) => {
      if (id === 'staff-1') return staffDoc;
      return null;
    });

    const req = {
      body: { scope: 'leave' },
      query: {},
      cookies: { leave_refresh_token: oldRefresh },
      ip: '127.0.0.1',
    };
    const res = createRes();

    await refresh(req, res);

    expect(res.statusCode).toBe(200);
    expect(staffDoc.save).toHaveBeenCalled();
    const oldTokenRecord = staffDoc.refreshTokens.find((token) => token.tokenHash === oldHash);
    expect(oldTokenRecord.revokedAt).toBeInstanceOf(Date);
    expect(oldTokenRecord.revocationReason).toBe('rotated');
    const newHash = hashToken('new-refresh-token');
    const newTokenRecord = staffDoc.refreshTokens.find((token) => token.tokenHash === newHash);
    expect(newTokenRecord).toBeTruthy();
  });

  it('detects reuse of revoked/missing refresh token', async () => {
    const reusedRefresh = 'reused-refresh-token';
    const activeHash = hashToken('active-other-token');
    const staffDoc = {
      _id: 'staff-1',
      email: 'user@example.com',
      roles: ['staff'],
      division: 'legal',
      leaveEnabled: true,
      tokenVersion: 3,
      refreshTokens: [
        {
          scope: 'leave',
          tokenHash: activeHash,
          issuedAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 3600000),
        },
      ],
      save: vi.fn().mockResolvedValue(undefined),
    };

    jwt.verify.mockReturnValue({
      sub: 'staff-1',
      scope: 'leave',
      tokenVersion: 3,
      jti: 'reused-jti',
    });
    Staff.findById.mockResolvedValue(staffDoc);

    const req = {
      body: { scope: 'leave' },
      query: {},
      cookies: { leave_refresh_token: reusedRefresh },
      ip: '127.0.0.1',
    };
    const res = createRes();

    await refresh(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body?.message).toBe('Session expired');
    expect(staffDoc.tokenVersion).toBe(4);
    const revokedActiveToken = staffDoc.refreshTokens.find((token) => token.tokenHash === activeHash);
    expect(revokedActiveToken.revokedAt).toBeInstanceOf(Date);
    expect(revokedActiveToken.revocationReason).toBe('reuse_detected');
    expect(res.clearedCookies.length).toBeGreaterThanOrEqual(2);
  });
});
