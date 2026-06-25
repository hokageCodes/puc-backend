/**
 * The gender a leave type is restricted to ('male' | 'female'), or null if it
 * applies to everyone.
 *
 * Explicit config (`applicableGender`) wins; otherwise we infer maternity → female
 * and paternity → male from the name as a safety net (so it works even before the
 * leave-type records are explicitly configured).
 */
export const leaveTypeRequiredGender = (type) => {
  if (!type) return null;
  if (type.applicableGender === 'male' || type.applicableGender === 'female') {
    return type.applicableGender;
  }
  const name = (type.name || '').toLowerCase();
  if (name.includes('maternity')) return 'female';
  if (name.includes('paternity')) return 'male';
  return null;
};

/** Whether a staffer of the given gender may use this leave type. */
export const canUseLeaveType = (type, staffGender) => {
  const required = leaveTypeRequiredGender(type);
  return !required || required === staffGender;
};
