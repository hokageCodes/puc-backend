import { describe, expect, it } from 'vitest';
import {
  BEHAVIOURS,
  BEHAVIOUR_KEYS,
  OBJECTIVE_WEIGHTINGS,
  FINAL_RATINGS,
  RATING_DESCRIPTIONS,
  LIMITS,
  buildPerformanceMeta,
} from '../utils/performanceEnums.js';

describe('performance enums (transcribed from the firm form)', () => {
  it('has exactly the 5 fixed firm behaviours with statements', () => {
    expect(BEHAVIOURS).toHaveLength(5);
    expect(BEHAVIOUR_KEYS).toEqual(['teamwork', 'integrity', 'mastery', 'excellence', 'entrepreneurial']);
    for (const b of BEHAVIOURS) {
      expect(b.statement.length).toBeGreaterThan(0);
    }
  });

  it('weightings are the discrete % options and allow a valid 100% plan', () => {
    expect(OBJECTIVE_WEIGHTINGS).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50]);
    // e.g. 30 + 30 + 40 = 100 — a buildable plan within ≤6 objectives.
    const sample = [30, 30, 40];
    expect(sample.reduce((a, b) => a + b, 0)).toBe(LIMITS.TOTAL_WEIGHTING);
    expect(sample.every((w) => OBJECTIVE_WEIGHTINGS.includes(w))).toBe(true);
  });

  it('final rating scale is the 1–5 band with matching descriptions', () => {
    expect(FINAL_RATINGS).toHaveLength(5);
    expect(RATING_DESCRIPTIONS.map((r) => r.rating).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('structural limits match the form (≤6 objectives, ≥2 goals, weights total 100)', () => {
    expect(LIMITS.MAX_OBJECTIVES).toBe(6);
    expect(LIMITS.MIN_DEVELOPMENT_GOALS).toBe(2);
    expect(LIMITS.TOTAL_WEIGHTING).toBe(100);
  });
});

describe('GET /meta payload shape', () => {
  it('exposes every vocabulary the frontend needs', () => {
    const meta = buildPerformanceMeta();
    expect(Object.keys(meta).sort()).toEqual(
      [
        'behaviourRatings',
        'behaviours',
        'charLimits',
        'cycleStages',
        'finalRatings',
        'limits',
        'objectiveStatus',
        'objectiveWeightings',
        'ratingDescriptions',
      ].sort()
    );
    expect(meta.objectiveStatus.mid.length).toBeGreaterThan(0);
    expect(meta.objectiveStatus.half.length).toBeGreaterThan(0);
    expect(meta.charLimits.FINAL_RATIONALE).toBe(3500);
  });
});
