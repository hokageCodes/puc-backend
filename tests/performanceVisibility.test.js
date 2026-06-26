import { describe, expect, it } from 'vitest';
import { filterReviewForViewer, viewerRoleFor } from '../utils/performanceVisibility.js';

// A review mid-cycle: both employee and manager have written mid entries, but
// nothing has been shared/returned yet.
const baseReview = () => ({
  staff: { _id: 'emp-1' },
  sharedFlags: { midShared: false, midReturned: false, halfShared: false, halfReturned: false },
  objectives: [
    {
      performanceArea: 'Billing',
      entries: [
        { stage: 'mid', author: 'employee', status: 'On Plan', comments: 'emp note' },
        { stage: 'mid', author: 'manager', status: 'Behind Plan', comments: 'mgr note' },
      ],
    },
  ],
  behaviours: [
    {
      key: 'teamwork',
      entries: [
        { stage: 'mid', author: 'employee', rating: 'Sometimes Demonstrates' },
        { stage: 'mid', author: 'manager', rating: 'Rarely or Never Demonstrates' },
      ],
    },
  ],
});

const authorsOf = (review, path) => review[path][0].entries.map((e) => e.author).sort();

describe('D6 visibility — before any hand-off', () => {
  it('employee sees only their own entries (not the manager draft)', () => {
    const v = filterReviewForViewer(baseReview(), 'employee');
    expect(authorsOf(v, 'objectives')).toEqual(['employee']);
    expect(authorsOf(v, 'behaviours')).toEqual(['employee']);
  });

  it('manager sees only their own entries (not the employee draft)', () => {
    const v = filterReviewForViewer(baseReview(), 'manager');
    expect(authorsOf(v, 'objectives')).toEqual(['manager']);
  });

  it('moderator (HR/admin) sees both voices', () => {
    const v = filterReviewForViewer(baseReview(), 'moderator');
    expect(authorsOf(v, 'objectives')).toEqual(['employee', 'manager']);
  });
});

describe('D6 visibility — after hand-off', () => {
  it('once the employee shares mid, the manager can see the employee entry', () => {
    const r = baseReview();
    r.sharedFlags.midShared = true;
    const v = filterReviewForViewer(r, 'manager');
    expect(authorsOf(v, 'objectives')).toEqual(['employee', 'manager']);
  });

  it('once the manager returns mid, the employee can see the manager entry', () => {
    const r = baseReview();
    r.sharedFlags.midReturned = true;
    const v = filterReviewForViewer(r, 'employee');
    expect(authorsOf(v, 'objectives')).toEqual(['employee', 'manager']);
  });

  it('a mid share does not leak the half stage', () => {
    const r = baseReview();
    r.objectives[0].entries.push({ stage: 'half', author: 'manager', status: 'Achieved' });
    r.sharedFlags.midShared = true; // half still not returned
    const v = filterReviewForViewer(r, 'employee');
    const half = v.objectives[0].entries.filter((e) => e.stage === 'half');
    expect(half).toHaveLength(0); // employee can't see manager's half entry yet
  });

  it('does not mutate the input review', () => {
    const r = baseReview();
    filterReviewForViewer(r, 'manager');
    expect(r.objectives[0].entries).toHaveLength(2); // original untouched
  });
});

describe('viewerRoleFor', () => {
  it('classifies HR/admin as moderator, the owner as employee, others as manager', () => {
    const r = { staff: { _id: 'emp-1' } };
    expect(viewerRoleFor(r, { id: 'x', roles: ['hr'] })).toBe('moderator');
    expect(viewerRoleFor(r, { id: 'emp-1', roles: ['staff'] })).toBe('employee');
    expect(viewerRoleFor(r, { id: 'mgr-9', roles: ['lineManager'] })).toBe('manager');
  });
});
