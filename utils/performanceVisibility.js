/**
 * D6 visibility gating — the two "voices" (employee self-assessment vs manager
 * assessment) stay hidden from each other until handed off:
 *   - the employee's stage entries become visible to the manager only after the
 *     employee SHARES that stage (sharedFlags.{stage}Shared);
 *   - the manager's stage entries become visible to the employee only after the
 *     manager RETURNS that stage (sharedFlags.{stage}Returned).
 *
 * HR/admin moderators see everything (they calibrate). Pure functions — no DB.
 * See PERFORMANCE-REVIEW-BUILD.md §D Phase 4.
 */

const SHARED_FLAG = { mid: 'midShared', half: 'halfShared' };
const RETURNED_FLAG = { mid: 'midReturned', half: 'halfReturned' };

// Is a single assessment entry visible to this viewer ('employee' | 'manager' | 'moderator')?
const entryVisible = (entry, viewer, flags = {}) => {
  if (viewer === 'moderator') return true; // HR/admin see both voices
  if (entry.author === viewer) return true; // your own voice is always visible

  // Viewing the *other* author's entry depends on the hand-off flag for its stage.
  if (viewer === 'manager') return Boolean(flags[SHARED_FLAG[entry.stage]]); // employee entry → needs share
  return Boolean(flags[RETURNED_FLAG[entry.stage]]); // employee viewing manager entry → needs return
};

const filterEntries = (entries = [], viewer, flags) =>
  (Array.isArray(entries) ? entries : []).filter((e) => entryVisible(e, viewer, flags));

/**
 * Return a copy of the review with objective/behaviour entries the viewer may not
 * see stripped out. Accepts a plain object (lean / toObject). Does not mutate input.
 */
export const filterReviewForViewer = (review, viewer) => {
  if (!review) return review;
  const flags = review.sharedFlags || {};

  const out = {
    ...review,
    objectives: (review.objectives || []).map((o) => ({ ...o, entries: filterEntries(o.entries, viewer, flags) })),
    behaviours: (review.behaviours || []).map((b) => ({ ...b, entries: filterEntries(b.entries, viewer, flags) })),
  };

  // The final ratings follow the same hand-off rule: the employee sees the manager's
  // proposed rating only after the half-year is returned, and vice-versa. Moderators
  // (HR/admin) see both.
  if (viewer === 'employee' && !flags.halfReturned) {
    out.managerFinalRating = undefined;
    out.managerFinalRationale = undefined;
  }
  if (viewer === 'manager' && !flags.halfShared) {
    out.employeeFinalRating = undefined;
    out.employeeFinalRationale = undefined;
  }

  return out;
};

export const viewerRoleFor = (review, user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('hr') || roles.includes('admin')) return 'moderator';
  if (review && String(review.staff?._id || review.staff) === String(user?.id)) return 'employee';
  return 'manager';
};
