/**
 * Suggested performance score (GUIDANCE ONLY — D1).
 *
 * The firm's form uses a manual 1–5 final rating; this helper computes a suggested
 * score from the half-year assessment so the chooser has a data point. The
 * status→number mapping below is a DOCUMENTED ASSUMPTION (the spreadsheet states
 * the 60/40 split but not the per-status numbers). It's isolated here so that if HR
 * later defines the official mapping, only this file changes — no schema/UI rework.
 *
 * Final = 60% objectives (weighted by each objective's %) + 40% behaviours (mean),
 * rounded and clamped to the 1–5 band. Returns null when there's nothing to score.
 */
const OBJ_STATUS_NUM = {
  Exceeded: 5,
  Achieved: 4,
  'Partially Achieved': 3,
  'Did Not Achieve': 2,
  'Did Not Start': 1,
};

const BEH_RATING_NUM = {
  'Demonstrates most if not all of the time': 5,
  'Sometimes Demonstrates': 3,
  'Rarely or Never Demonstrates': 1,
};

const round2 = (n) => Number(n.toFixed(2));

export const computeSuggestedScore = (review, author = 'manager') => {
  if (!review) return null;

  let weightSum = 0;
  let weightedStatus = 0;
  let objCount = 0;
  for (const o of review.objectives || []) {
    const e = (o.entries || []).find((x) => x.stage === 'half' && x.author === author && OBJ_STATUS_NUM[x.status]);
    if (e) {
      const w = Number(o.weighting) || 0;
      weightSum += w;
      weightedStatus += w * OBJ_STATUS_NUM[e.status];
      objCount += 1;
    }
  }

  const behNums = [];
  for (const b of review.behaviours || []) {
    const e = (b.entries || []).find((x) => x.stage === 'half' && x.author === author && BEH_RATING_NUM[x.rating]);
    if (e) behNums.push(BEH_RATING_NUM[e.rating]);
  }

  if (objCount === 0 && behNums.length === 0) return null;

  const objectiveScore = weightSum > 0 ? weightedStatus / weightSum : null;
  const behaviourScore = behNums.length ? behNums.reduce((a, b) => a + b, 0) / behNums.length : null;

  // 60/40 when both voices present; otherwise whichever exists.
  let weighted;
  if (objectiveScore != null && behaviourScore != null) weighted = 0.6 * objectiveScore + 0.4 * behaviourScore;
  else weighted = objectiveScore != null ? objectiveScore : behaviourScore;

  return {
    author,
    objectiveScore: objectiveScore != null ? round2(objectiveScore) : null,
    behaviourScore: behaviourScore != null ? round2(behaviourScore) : null,
    weighted: round2(weighted),
    band: Math.min(5, Math.max(1, Math.round(weighted))),
  };
};
