import { describe, expect, it } from 'vitest';
import { diaryEntriesBaseFilter, isTeamScopedDiaryDepartment } from '../utils/courtDiaryScope.js';

describe('courtDiaryScope', () => {
  it('treats litigation by name when scope field missing', () => {
    expect(isTeamScopedDiaryDepartment({ name: 'Litigation Department' })).toBe(true);
    expect(isTeamScopedDiaryDepartment({ name: 'Transactions Department', courtDiaryScope: 'department' })).toBe(false);
  });

  it('respects courtDiaryScope when set', () => {
    expect(isTeamScopedDiaryDepartment({ name: 'Custom', courtDiaryScope: 'team' })).toBe(true);
    expect(isTeamScopedDiaryDepartment({ name: 'Custom', courtDiaryScope: 'department' })).toBe(false);
  });

  it('department diary filter uses department id', () => {
    const staff = {
      _id: 's1',
      team: null,
      department: { _id: 'd1', name: 'Transactions Department', courtDiaryScope: 'department' },
    };
    expect(diaryEntriesBaseFilter(staff)).toEqual({ department: 'd1' });
  });

  it('team diary filter uses team id for litigation', () => {
    const staff = {
      _id: 's1',
      team: 't1',
      department: { _id: 'd1', name: 'Litigation Department' },
    };
    expect(diaryEntriesBaseFilter(staff)).toEqual({ team: 't1' });
  });

  it('returns null when litigation staff has no team', () => {
    const staff = {
      _id: 's1',
      team: null,
      department: { _id: 'd1', name: 'Litigation Department' },
    };
    expect(diaryEntriesBaseFilter(staff)).toBe(null);
  });
});
