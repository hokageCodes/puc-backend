import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../models/Staff.js', () => ({
  default: {
    findById: vi.fn(),
  },
}));

vi.mock('../models/CourtDiaryEntry.js', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOne: vi.fn(),
  },
}));

import Staff from '../models/Staff.js';
import CourtDiaryEntry from '../models/CourtDiaryEntry.js';
import { getDiaryEntry, listDiaryEntries } from '../controllers/courtDiaryController.js';

const staffChain = (leanResult) => ({
  select: vi.fn().mockReturnValue({
    populate: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(leanResult),
      }),
    }),
  }),
});

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('courtDiaryController team isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks listing when staff has no team', async () => {
    Staff.findById.mockReturnValue(staffChain({ _id: 'staff-1', team: null }));
    const req = { user: { id: 'staff-1' }, query: {} };
    const res = createRes();

    await listDiaryEntries(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toMatch(/team assignment/i);
  });

  it('scopes list query by authenticated team', async () => {
    Staff.findById.mockReturnValue(staffChain({ _id: 'staff-1', team: 'team-A' }));

    const chain = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    };
    CourtDiaryEntry.find.mockReturnValue(chain);
    CourtDiaryEntry.countDocuments.mockResolvedValue(0);

    const req = { user: { id: 'staff-1' }, query: {} };
    const res = createRes();
    await listDiaryEntries(req, res);

    expect(CourtDiaryEntry.find).toHaveBeenCalledWith(expect.objectContaining({ team: 'team-A' }));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.entries)).toBe(true);
  });

  it('scopes single-entry lookup by team', async () => {
    Staff.findById.mockReturnValue(staffChain({ _id: 'staff-1', team: 'team-A' }));

    const findOneChain = {
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(null),
    };
    CourtDiaryEntry.findOne.mockReturnValue(findOneChain);

    const req = { user: { id: 'staff-1' }, params: { id: '507f1f77bcf86cd799439011' } };
    const res = createRes();
    await getDiaryEntry(req, res);

    expect(CourtDiaryEntry.findOne).toHaveBeenCalledWith({
      _id: expect.any(Object),
      team: 'team-A',
    });
    expect(res.statusCode).toBe(404);
  });
});
