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
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findById: vi.fn(),
  },
}));

import Staff from '../models/Staff.js';
import CourtDiaryEntry from '../models/CourtDiaryEntry.js';
import { createDiaryEntry, getDiaryEntry, listDiaryEntries, updateDiaryEntry } from '../controllers/courtDiaryController.js';

const staffChain = (leanResult) => ({
  select: vi.fn().mockReturnValue({
    populate: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(leanResult),
      }),
    }),
  }),
});

/** Matches controller `find().select().populate().lean()` for same-day conflict loads */
const mockSameDayFind = (rows) => {
  CourtDiaryEntry.find.mockReturnValue({
    select: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
};

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

describe('courtDiaryController team / department isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when litigation staff has no team', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: null,
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );
    const req = { user: { id: 'staff-1' }, query: {} };
    const res = createRes();

    await listDiaryEntries(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body?.message).toMatch(/team assignment/i);
    expect(CourtDiaryEntry.find).not.toHaveBeenCalled();
  });

  it('scopes list by department when not team-scoped and staff has no team', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: null,
        department: { _id: 'dept-tx', name: 'Transactions Department', courtDiaryScope: 'department' },
      })
    );

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

    expect(CourtDiaryEntry.find).toHaveBeenCalledWith(expect.objectContaining({ department: 'dept-tx' }));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body?.entries)).toBe(true);
  });

  it('scopes list query by team for litigation with team', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

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

  it('scopes single-entry lookup by team for litigation', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

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

  it('scopes single-entry lookup by department for non-litigation', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: null,
        department: { _id: 'dept-tx', name: 'Transactions Department', courtDiaryScope: 'department' },
      })
    );

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
      department: 'dept-tx',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 on create when a semantic duplicate exists and not acknowledged', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

    mockSameDayFind([
      {
        _id: 'existing-1',
        matterTitle: 'Lease',
        matterRef: 'REF-99',
        court: 'Lagos',
        appearanceTime: '10:00',
        createdBy: { _id: 'other-staff', firstName: 'Pat', lastName: 'Lee' },
      },
    ]);

    const req = {
      user: { id: 'staff-1' },
      body: {
        matterTitle: 'Lease dispute',
        matterRef: 'REF-99',
        court: 'Lagos',
        appearanceDate: '2026-02-01',
        status: 'adjourned',
      },
    };
    const res = createRes();
    await createDiaryEntry(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('DIARY_DUPLICATE');
    expect(Array.isArray(res.body?.conflicts)).toBe(true);
    expect(CourtDiaryEntry.create).not.toHaveBeenCalled();
  });

  it('creates when duplicate exists but acknowledgeDuplicate is true', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

    mockSameDayFind([
      { _id: 'existing-1', matterTitle: 'Lease', matterRef: 'REF-99', court: 'Lagos', appearanceTime: '', createdBy: null },
    ]);

    const created = { _id: 'new-1' };
    CourtDiaryEntry.create.mockResolvedValue(created);
    CourtDiaryEntry.findById.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ ...created, matterTitle: 'Lease' }),
    });

    const req = {
      user: { id: 'staff-1' },
      body: {
        matterTitle: 'Lease',
        matterRef: 'REF-99',
        court: 'Lagos',
        appearanceDate: '2026-02-01',
        status: 'adjourned',
        acknowledgeDuplicate: true,
        acknowledgeTeamOverlap: true,
      },
    };
    const res = createRes();
    await createDiaryEntry(req, res);

    expect(CourtDiaryEntry.create).toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('returns 409 on update when merged row conflicts with another id', async () => {
    const oid = '507f1f77bcf86cd799439011';
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

    CourtDiaryEntry.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: oid,
          matterTitle: 'Old',
          matterRef: '',
          court: 'Court A',
          appearanceDate: new Date('2026-02-01T00:00:00.000Z'),
          appearanceTime: '',
        }),
      }),
    });

    mockSameDayFind([
      {
        _id: 'other-1',
        matterTitle: 'Target',
        matterRef: 'R1',
        court: 'Court B',
        appearanceTime: '',
        createdBy: { _id: 'x', firstName: 'A', lastName: 'B' },
      },
    ]);

    const req = {
      user: { id: 'staff-1' },
      params: { id: oid },
      body: {
        matterTitle: 'Target',
        matterRef: 'R1',
        court: 'Court B',
      },
    };
    const res = createRes();
    await updateDiaryEntry(req, res);

    expect(res.statusCode).toBe(409);
    expect(CourtDiaryEntry.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 DIARY_TEAM_CALENDAR on create when another matter exists same day', async () => {
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

    mockSameDayFind([
      {
        _id: 'existing-1',
        matterTitle: 'OPC vs Amotekun',
        matterRef: '',
        court: 'FHC, Ikoyi',
        appearanceTime: '',
        createdBy: { _id: 'colleague-1', firstName: 'Chris', lastName: 'Okon' },
      },
    ]);

    const req = {
      user: { id: 'staff-1' },
      body: {
        matterTitle: 'APC vs PDP',
        matterRef: '',
        court: 'FHC, Ikoyi',
        appearanceDate: '2026-05-16',
        status: 'adjourned',
      },
    };
    const res = createRes();
    await createDiaryEntry(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('DIARY_TEAM_CALENDAR');
    expect(CourtDiaryEntry.create).not.toHaveBeenCalled();
  });

  it('returns 409 on update when moving to a day that already has entries', async () => {
    const oid = '507f1f77bcf86cd799439011';
    Staff.findById.mockReturnValue(
      staffChain({
        _id: 'staff-1',
        team: 'team-A',
        department: { _id: 'dept-lit', name: 'Litigation Department', courtDiaryScope: 'team' },
      })
    );

    CourtDiaryEntry.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: oid,
          matterTitle: 'Solo',
          matterRef: '',
          court: 'Court A',
          appearanceDate: new Date('2026-01-10T00:00:00.000Z'),
          appearanceTime: '',
        }),
      }),
    });

    mockSameDayFind([
      {
        _id: 'busy-1',
        matterTitle: 'Other',
        matterRef: '',
        court: 'Court B',
        appearanceTime: '09:00',
        createdBy: { _id: 'busy-staff', firstName: 'Sam', lastName: 'Jones' },
      },
    ]);

    const req = {
      user: { id: 'staff-1' },
      params: { id: oid },
      body: {
        appearanceDate: '2026-05-16',
      },
    };
    const res = createRes();
    await updateDiaryEntry(req, res);

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe('DIARY_TEAM_CALENDAR');
    expect(CourtDiaryEntry.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
