import { describe, expect, it } from 'vitest';
import { canManageReview, canAdministerPerformance } from '../utils/performanceAccess.js';

const review = {
  lineManager: 'lm-1',
  teamLead: 'tl-1',
  staff: 'emp-1',
};

describe('canManageReview', () => {
  it('lets HR and admin manage any review', () => {
    expect(canManageReview(review, { id: 'someone', roles: ['hr'] })).toBe(true);
    expect(canManageReview(review, { id: 'someone', roles: ['admin'] })).toBe(true);
  });

  it("lets a line manager manage only their own report's review", () => {
    expect(canManageReview(review, { id: 'lm-1', roles: ['lineManager'] })).toBe(true);
    expect(canManageReview(review, { id: 'lm-2', roles: ['lineManager'] })).toBe(false);
  });

  it("lets a team lead manage only their own report's review", () => {
    expect(canManageReview(review, { id: 'tl-1', roles: ['teamLead'] })).toBe(true);
    expect(canManageReview(review, { id: 'tl-2', roles: ['teamLead'] })).toBe(false);
  });

  it('requires the managing role, not just the id match', () => {
    // Right person, but only a plain staff role → cannot manage.
    expect(canManageReview(review, { id: 'lm-1', roles: ['staff'] })).toBe(false);
  });

  it('denies unrelated staff and bad input', () => {
    expect(canManageReview(review, { id: 'rando', roles: ['staff'] })).toBe(false);
    expect(canManageReview(null, { id: 'lm-1', roles: ['lineManager'] })).toBe(false);
    expect(canManageReview(review, null)).toBe(false);
  });

  it('handles populated (object) manager refs', () => {
    const populated = { lineManager: { _id: 'lm-1' }, teamLead: { _id: 'tl-1' } };
    expect(canManageReview(populated, { id: 'lm-1', roles: ['lineManager'] })).toBe(true);
  });
});

describe('canAdministerPerformance', () => {
  it('is true only for HR/admin', () => {
    expect(canAdministerPerformance({ roles: ['hr'] })).toBe(true);
    expect(canAdministerPerformance({ roles: ['admin'] })).toBe(true);
    expect(canAdministerPerformance({ roles: ['lineManager'] })).toBe(false);
    expect(canAdministerPerformance(null)).toBe(false);
  });
});
