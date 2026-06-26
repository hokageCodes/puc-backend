/**
 * Performance authorization — "may this user manage (assess/moderate) this review?"
 *
 * Modelled on the leave module's `canApprove`. HR and admin can manage any review;
 * a line manager or team lead can manage the reviews of their own reports (matched
 * against the manager-of-record snapshot stored on the review). The employee's own
 * self-service access is handled separately via the `/me` endpoints.
 * See PERFORMANCE-REVIEW-BUILD.md §C.
 */

const idOf = (ref) => {
  if (!ref) return null;
  if (typeof ref === 'string') return ref;
  if (ref._id) return String(ref._id);
  return String(ref);
};

export const canManageReview = (review, user) => {
  if (!review || !user) return false;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.includes('admin') || roles.includes('hr')) return true;

  const uid = String(user.id);
  const lineManagerId = idOf(review.lineManager);
  const teamLeadId = idOf(review.teamLead);

  // Must actually hold the managing role AND be the person of record for this review.
  if (roles.includes('lineManager') && uid === lineManagerId) return true;
  if (roles.includes('teamLead') && uid === teamLeadId) return true;

  return false;
};

// Only HR/admin run cycle administration and moderation.
export const canAdministerPerformance = (user) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.includes('admin') || roles.includes('hr');
};
