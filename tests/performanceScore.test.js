import { describe, expect, it } from 'vitest';
import { computeSuggestedScore } from '../utils/performanceScore.js';

// Helper to build a review with half-year manager entries.
const review = ({ objectives = [], behaviours = [] }) => ({
  objectives: objectives.map(({ weighting, status }) => ({
    weighting,
    entries: status ? [{ stage: 'half', author: 'manager', status }] : [],
  })),
  behaviours: behaviours.map((rating) => ({
    entries: rating ? [{ stage: 'half', author: 'manager', rating }] : [],
  })),
});

describe('computeSuggestedScore', () => {
  it('returns null when there is nothing to score', () => {
    expect(computeSuggestedScore(review({}), 'manager')).toBeNull();
    expect(computeSuggestedScore(null, 'manager')).toBeNull();
  });

  it('computes a weighted objective score', () => {
    // 50% Exceeded(5) + 50% Achieved(4) → 4.5 objective score; no behaviours.
    const r = review({ objectives: [{ weighting: 50, status: 'Exceeded' }, { weighting: 50, status: 'Achieved' }] });
    const s = computeSuggestedScore(r, 'manager');
    expect(s.objectiveScore).toBe(4.5);
    expect(s.behaviourScore).toBeNull();
    expect(s.weighted).toBe(4.5);
    expect(s.band).toBe(5); // 4.5 rounds to 5
  });

  it('blends 60/40 when both objectives and behaviours exist', () => {
    // objectiveScore = 4 (Achieved), behaviourScore = 5 (most of the time)
    // weighted = 0.6*4 + 0.4*5 = 2.4 + 2.0 = 4.4 → band 4
    const r = review({
      objectives: [{ weighting: 100, status: 'Achieved' }],
      behaviours: ['Demonstrates most if not all of the time'],
    });
    const s = computeSuggestedScore(r, 'manager');
    expect(s.objectiveScore).toBe(4);
    expect(s.behaviourScore).toBe(5);
    expect(s.weighted).toBe(4.4);
    expect(s.band).toBe(4);
  });

  it('clamps the band to 1–5', () => {
    const low = review({ objectives: [{ weighting: 100, status: 'Did Not Start' }], behaviours: ['Rarely or Never Demonstrates'] });
    const s = computeSuggestedScore(low, 'manager');
    expect(s.band).toBe(1);
  });

  it('only scores the requested author', () => {
    const r = review({ objectives: [{ weighting: 100, status: 'Exceeded' }] });
    // The entry is authored by 'manager'; asking for 'employee' finds nothing.
    expect(computeSuggestedScore(r, 'employee')).toBeNull();
    expect(computeSuggestedScore(r, 'manager').band).toBe(5);
  });
});
