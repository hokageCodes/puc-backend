/** Normalize for duplicate comparison (case-insensitive, trim, collapse spaces). */
export const normalizeLoose = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const normalizeRef = (value) => String(value || '').trim().toLowerCase();

/**
 * UTC calendar-day bounds for a diary appearance.
 * Prefer raw `YYYY-MM-DD` from the client so it matches the date picker.
 */
export function utcDayRangeFromAppearance(appearanceDateRaw, appearanceDateObj) {
  const str = String(appearanceDateRaw ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return {
      start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
      end: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
    };
  }
  const dt =
    appearanceDateObj instanceof Date && !Number.isNaN(appearanceDateObj.getTime())
      ? appearanceDateObj
      : new Date(str);
  if (Number.isNaN(dt.getTime())) return null;
  return {
    start: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 0, 0, 0, 0)),
    end: new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 23, 59, 59, 999)),
  };
}

/**
 * Same-day semantic duplicate: same matter ref (when both sides have ref), else same court + title.
 */
export function isSemanticDuplicate(candidate, entry) {
  const cRef = normalizeRef(candidate.matterRef);
  const eRef = normalizeRef(entry.matterRef);
  if (cRef && eRef) return cRef === eRef;

  const cCourt = normalizeLoose(candidate.court);
  const cTitle = normalizeLoose(candidate.matterTitle);
  return normalizeLoose(entry.court) === cCourt && normalizeLoose(entry.matterTitle) === cTitle;
}

export function filterSemanticDuplicates(sameDayEntries, candidate, excludeId) {
  const ex = excludeId ? String(excludeId) : null;
  return sameDayEntries.filter((e) => {
    if (ex && String(e._id) === ex) return false;
    return isSemanticDuplicate(candidate, e);
  });
}

/**
 * Calendar day as YYYY-MM-DD in UTC (matches date picker + stored UTC midnight-ish dates).
 */
export function utcCalendarDayKeyFromDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '';
  return dateValue.toISOString().slice(0, 10);
}

/**
 * Normalize appearance time for equality (24h HH:mm). Returns null if empty / unparsable.
 */
export function normalizeAppearanceTime(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  let s = raw.toLowerCase().replace(/\s+/g, '');
  let meridiem = null;
  if (s.endsWith('am')) {
    meridiem = 'am';
    s = s.slice(0, -2);
  } else if (s.endsWith('pm')) {
    meridiem = 'pm';
    s = s.slice(0, -2);
  }

  let hours;
  let minutes;

  if (s.includes(':')) {
    const [a, b] = s.split(':', 2);
    hours = parseInt(String(a).replace(/\D/g, ''), 10);
    minutes = parseInt(String(b).replace(/\D/g, '').slice(0, 2), 10);
  } else {
    const digits = s.replace(/\D/g, '');
    if (digits.length < 3 || digits.length > 4) return null;
    hours = parseInt(digits.slice(0, -2), 10);
    minutes = parseInt(digits.slice(-2), 10);
  }

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59 || minutes < 0) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
  } else if (hours > 23 || hours < 0) {
    return null;
  }

  if (hours > 23 || minutes > 59 || hours < 0 || minutes < 0) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Whether saving should require acknowledgeTeamOverlap (create vs update rules).
 */
export function teamCalendarRequiresAcknowledgement({
  mode,
  othersSameDay,
  candidateTimeNorm,
  candidateDay,
  baselineDay,
  baselineTimeNorm,
}) {
  const others = othersSameDay || [];
  const ct = candidateTimeNorm ?? null;
  const bt = baselineTimeNorm ?? null;

  if (mode === 'create') {
    if (others.length >= 1) return true;
    if (ct && others.some((e) => normalizeAppearanceTime(e.appearanceTime) === ct)) return true;
    return false;
  }

  const baseDay = baselineDay || candidateDay;
  const dayChanged = Boolean(candidateDay) && Boolean(baseDay) && baseDay !== candidateDay;
  if (dayChanged) {
    return others.length >= 1;
  }

  const timeChanged = ct !== bt;
  if (timeChanged && ct) {
    return others.some((e) => normalizeAppearanceTime(e.appearanceTime) === ct);
  }
  return false;
}
