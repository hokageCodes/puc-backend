import { describe, expect, it } from 'vitest';
import {
  nextCycleStage,
  canTransitionReview,
  seedBehaviours,
  AGREED_OR_LATER,
  reviewStatusRank,
} from '../utils/performanceWorkflow.js';

describe('cycle stage progression', () => {
  it('advances strictly planning → mid_term → half_year → moderation → closed', () => {
    expect(nextCycleStage('planning')).toBe('mid_term');
    expect(nextCycleStage('mid_term')).toBe('half_year');
    expect(nextCycleStage('half_year')).toBe('moderation');
    expect(nextCycleStage('moderation')).toBe('closed');
  });

  it('cannot advance past closed, or from an unknown stage', () => {
    expect(nextCycleStage('closed')).toBeNull();
    expect(nextCycleStage('nonsense')).toBeNull();
  });
});

describe('review state machine', () => {
  it('allows the legal forward transitions', () => {
    expect(canTransitionReview('draft', 'plan_submitted')).toBe(true);
    expect(canTransitionReview('plan_submitted', 'plan_agreed')).toBe(true);
    expect(canTransitionReview('plan_agreed', 'mid_employee')).toBe(true);
    expect(canTransitionReview('half_manager_returned', 'moderation')).toBe(true);
    expect(canTransitionReview('moderation', 'closed')).toBe(true);
  });

  it('lets a manager bounce a submitted plan back to draft', () => {
    expect(canTransitionReview('plan_submitted', 'draft')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransitionReview('draft', 'plan_agreed')).toBe(false);
    expect(canTransitionReview('draft', 'closed')).toBe(false);
    expect(canTransitionReview('plan_agreed', 'closed')).toBe(false);
    expect(canTransitionReview('closed', 'draft')).toBe(false);
  });
});

describe('behaviour seeding', () => {
  it('seeds exactly the 5 firm behaviours with empty entries', () => {
    const seeded = seedBehaviours();
    expect(seeded).toHaveLength(5);
    expect(seeded.map((b) => b.key)).toEqual(['teamwork', 'integrity', 'mastery', 'excellence', 'entrepreneurial']);
    expect(seeded.every((b) => b.statement.length > 0 && Array.isArray(b.entries) && b.entries.length === 0)).toBe(true);
  });
});

describe('cycle progress accounting', () => {
  it('counts plan_agreed and later as "agreed"', () => {
    expect(AGREED_OR_LATER).toContain('plan_agreed');
    expect(AGREED_OR_LATER).toContain('closed');
    expect(AGREED_OR_LATER).not.toContain('draft');
    expect(AGREED_OR_LATER).not.toContain('plan_submitted');
  });

  it('ranks statuses in forward order', () => {
    expect(reviewStatusRank('draft')).toBeLessThan(reviewStatusRank('plan_agreed'));
    expect(reviewStatusRank('plan_agreed')).toBeLessThan(reviewStatusRank('closed'));
  });
});
