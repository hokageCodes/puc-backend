/**
 * Court diary visibility:
 * - `team`: entries are isolated per Staff.team (e.g. Litigation sub-teams). Team assignment is required.
 * - `department`: entries are shared across everyone in the same department (optional team on staff).
 */

export const COURT_DIARY_SCOPES = ['team', 'department'];

/**
 * Whether a department uses the court diary at all. Court diary is a Litigation tool,
 * so only departments with a courtDiaryScope set (or named "Litigation") qualify.
 * Staff in any other department have no court diary.
 */
export function isCourtDiaryDepartment(department) {
  if (!department) return false;
  if (department.courtDiaryScope === 'team' || department.courtDiaryScope === 'department') return true;
  return String(department.name || '').toLowerCase().includes('litigation');
}

export function isTeamScopedDiaryDepartment(department) {
  if (!department) return false;
  if (department.courtDiaryScope === 'team') return true;
  if (department.courtDiaryScope === 'department') return false;
  const n = String(department.name || '').toLowerCase();
  return n.includes('litigation');
}

/**
 * Mongo filter for entries the staff member may read/write (excluding _id and extra filters).
 * @returns {object|null} null = caller should reject (team-scoped dept without team).
 */
export function diaryEntriesBaseFilter(staff) {
  const teamId = staff?.team?._id || staff?.team || null;
  const deptId = staff?.department?._id || staff?.department || null;
  const dept = staff?.department;

  if (isTeamScopedDiaryDepartment(dept)) {
    if (!teamId) return null;
    return { team: teamId };
  }
  if (deptId) {
    return { department: deptId };
  }
  return { createdBy: staff._id };
}
