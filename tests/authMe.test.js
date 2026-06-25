/**
 * Phase 2 — GET /api/auth/me (getMe controller).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Staff.js', () => ({
  default: { findOne: vi.fn(), findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('jsonwebtoken', () => ({ default: { sign: vi.fn(), verify: vi.fn(), decode: vi.fn() } }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(), compare: vi.fn() } }));
vi.mock('../utils/email.js', () => ({
  sendEmail: vi.fn(), buildActivationEmail: vi.fn(), buildPasswordResetEmail: vi.fn(),
}));
vi.mock('../utils/auditLogger.js', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import Staff from '../models/Staff.js';
import { getMe } from '../controllers/authController.js';

const createRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(payload) { this.body = payload; return this; },
});

// findById is awaited directly and also chained (.populate().populate().lean());
// this shim satisfies both, resolving to `doc`.
const queryShim = (doc) => {
  const q = {
    populate() { return q; },
    select() { return Promise.resolve(doc); },
    lean() { return Promise.resolve(doc); },
    then(resolve, reject) { return Promise.resolve(doc).then(resolve, reject); },
  };
  return q;
};

describe('GET /auth/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 when no authenticated user is attached', async () => {
    const res = createRes();
    await getMe({}, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns the full Staff profile for a Staff-backed session', async () => {
    const staffDoc = {
      _id: 's1', email: 'user@example.com', firstName: 'Test', lastName: 'User',
      staffCode: 'PUC001', roles: ['hr'], division: 'admin', leaveEnabled: true, profilePhoto: '',
    };
    Staff.findById.mockImplementation(() => queryShim(staffDoc));

    const req = { user: { id: 's1', email: 'user@example.com', roles: ['hr'] } };
    const res = createRes();
    await getMe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('user@example.com');
    expect(res.body.user.roles).toEqual(['hr']);
    expect(res.body.user.team).toBeNull();
  });

  it('falls back to the basic profile for a legacy Admin (no Staff record)', async () => {
    Staff.findById.mockImplementation(() => queryShim(null));

    const req = { user: { id: 'admin-1', email: 'superadmin@paulusoro.com', roles: ['admin', 'cms'], division: 'legal', leaveEnabled: true } };
    const res = createRes();
    await getMe(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe('superadmin@paulusoro.com');
    expect(res.body.user.roles).toContain('admin');
  });
});
