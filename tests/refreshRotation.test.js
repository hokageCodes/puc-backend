/**
 * Refresh-token rotation + reuse detection (security hardening).
 * Verifies the contract added to authController.refresh / respondWithTokens.
 */
import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Staff.js', () => ({
  default: { findOne: vi.fn(), findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('jsonwebtoken', () => ({
  default: { sign: vi.fn(), verify: vi.fn(), decode: vi.fn() },
}));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock('../utils/email.js', () => ({
  sendEmail: vi.fn(), buildActivationEmail: vi.fn(), buildPasswordResetEmail: vi.fn(),
}));
vi.mock('../utils/auditLogger.js', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import Staff from '../models/Staff.js';
import jwt from 'jsonwebtoken';
import { refresh } from '../controllers/authController.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const createRes = () => ({
  statusCode: 200,
  body: null,
  cookies: [],
  clearedCookies: [],
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
});

// Staff.findById is used both as `await Staff.findById(id)` (returns the doc) and as
// `Staff.findById(id).populate().populate().lean()` (in respondWithTokens). This
// thenable-chainable shim satisfies both call shapes, always resolving to `doc`.
const queryShim = (doc) => {
  const q = {
    populate() { return q; },
    select() { return Promise.resolve(doc); },
    lean() { return Promise.resolve(doc); },
    then(resolve, reject) { return Promise.resolve(doc).then(resolve, reject); },
  };
  return q;
};

const baseStaff = (overrides = {}) => ({
  _id: 's1',
  email: 'user@example.com',
  firstName: 'Test',
  lastName: 'User',
  staffCode: 'PUC001',
  roles: ['staff'],
  division: 'legal',
  leaveEnabled: true,
  profilePhoto: '',
  tokenVersion: 1,
  refreshTokens: [],
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const future = () => new Date(Date.now() + 3600_000);
const past = () => new Date(Date.now() - 3600_000);

const runRefresh = async (staffDoc, presentedToken, tokenVersion = staffDoc.tokenVersion) => {
  jwt.verify.mockReturnValue({ sub: 's1', scope: 'leave', tokenVersion });
  jwt.sign.mockReturnValueOnce('new-access').mockReturnValueOnce('new-refresh');
  Staff.findById.mockImplementation(() => queryShim(staffDoc));
  const req = { body: { scope: 'leave' }, query: {}, cookies: { leave_refresh_token: presentedToken }, ip: '127.0.0.1' };
  const res = createRes();
  await refresh(req, res);
  return res;
};

describe('refresh-token rotation & reuse detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('rotates a valid active token: revokes the old, records the new', async () => {
    const staffDoc = baseStaff({
      refreshTokens: [{ scope: 'leave', tokenHash: hashToken('rt-old'), issuedAt: new Date(), expiresAt: future() }],
    });

    const res = await runRefresh(staffDoc, 'rt-old');

    expect(res.statusCode).toBe(200);
    const oldRec = staffDoc.refreshTokens.find((r) => r.tokenHash === hashToken('rt-old'));
    expect(oldRec.revokedAt).toBeInstanceOf(Date);
    expect(oldRec.revocationReason).toBe('rotated');
    const newRec = staffDoc.refreshTokens.find((r) => r.tokenHash === hashToken('new-refresh'));
    expect(newRec).toBeTruthy();
    expect(newRec.revokedAt).toBeUndefined();
  });

  it('detects reuse: replaying a revoked token kills the family and bumps tokenVersion', async () => {
    const staffDoc = baseStaff({
      tokenVersion: 3,
      refreshTokens: [
        { scope: 'leave', tokenHash: hashToken('rt-revoked'), revokedAt: past(), revocationReason: 'rotated', expiresAt: future() },
        { scope: 'leave', tokenHash: hashToken('rt-active'), issuedAt: new Date(), expiresAt: future() },
      ],
    });

    const res = await runRefresh(staffDoc, 'rt-revoked', 3);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Session expired');
    expect(staffDoc.tokenVersion).toBe(4);
    const active = staffDoc.refreshTokens.find((r) => r.tokenHash === hashToken('rt-active'));
    expect(active.revokedAt).toBeInstanceOf(Date);
    expect(active.revocationReason).toBe('reuse_detected');
    expect(res.clearedCookies.length).toBeGreaterThanOrEqual(2); // access + refresh cleared
  });

  it('adopts a valid but untracked (legacy) token without logging the user out', async () => {
    const staffDoc = baseStaff({ refreshTokens: [] });

    const res = await runRefresh(staffDoc, 'legacy-rt');

    expect(res.statusCode).toBe(200);
    expect(staffDoc.tokenVersion).toBe(1); // NOT bumped — no reuse
    const newRec = staffDoc.refreshTokens.find((r) => r.tokenHash === hashToken('new-refresh'));
    expect(newRec).toBeTruthy();
  });

  it('rejects an expired tracked token', async () => {
    const staffDoc = baseStaff({
      refreshTokens: [{ scope: 'leave', tokenHash: hashToken('rt-exp'), issuedAt: past(), expiresAt: past() }],
    });

    const res = await runRefresh(staffDoc, 'rt-exp');

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Session expired');
    const rec = staffDoc.refreshTokens.find((r) => r.tokenHash === hashToken('rt-exp'));
    expect(rec.revocationReason).toBe('expired');
  });
});
