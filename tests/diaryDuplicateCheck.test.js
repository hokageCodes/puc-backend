import { describe, expect, it } from 'vitest';
import {
  filterSemanticDuplicates,
  isSemanticDuplicate,
  normalizeAppearanceTime,
  normalizeLoose,
  teamCalendarRequiresAcknowledgement,
  utcDayRangeFromAppearance,
} from '../utils/diaryDuplicateCheck.js';

describe('diaryDuplicateCheck', () => {
  it('utcDayRangeFromAppearance uses YYYY-MM-DD as calendar day in UTC', () => {
    const r = utcDayRangeFromAppearance('2026-03-09', new Date('2026-03-09T12:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-03-09T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-09T23:59:59.999Z');
  });

  it('isSemanticDuplicate matches by matter ref when both have refs', () => {
    expect(
      isSemanticDuplicate(
        { matterRef: 'SUIT/1', matterTitle: 'A', court: 'B' },
        { matterRef: 'suit/1', matterTitle: 'Other', court: 'Other' }
      )
    ).toBe(true);
  });

  it('isSemanticDuplicate falls back to court + title when refs missing', () => {
    expect(
      isSemanticDuplicate(
        { matterRef: '', matterTitle: '  Lease dispute ', court: 'Lagos High Court' },
        { matterRef: '', matterTitle: 'lease  dispute', court: 'lagos high court' }
      )
    ).toBe(true);
  });

  it('isSemanticDuplicate does not match title+court when both refs exist and differ', () => {
    expect(
      isSemanticDuplicate(
        { matterRef: 'A/1', matterTitle: 'Same', court: 'Same' },
        { matterRef: 'B/2', matterTitle: 'Same', court: 'Same' }
      )
    ).toBe(false);
  });

  it('filterSemanticDuplicates excludes id', () => {
    const rows = [
      { _id: 'a', matterRef: 'x', matterTitle: 't', court: 'c' },
      { _id: 'b', matterRef: 'x', matterTitle: 't', court: 'c' },
    ];
    const out = filterSemanticDuplicates(rows, { matterRef: 'x', matterTitle: 't', court: 'c' }, 'a');
    expect(out.map((e) => e._id)).toEqual(['b']);
  });

  it('normalizeLoose collapses inner spaces', () => {
    expect(normalizeLoose('  Foo   Bar  ')).toBe('foo bar');
  });

  it('normalizeAppearanceTime parses 24h and am/pm', () => {
    expect(normalizeAppearanceTime(' 14:30 ')).toBe('14:30');
    expect(normalizeAppearanceTime('2:30pm')).toBe('14:30');
    expect(normalizeAppearanceTime('12:15am')).toBe('00:15');
  });

  it('teamCalendarRequiresAcknowledgement create when any other same-day row', () => {
    expect(
      teamCalendarRequiresAcknowledgement({
        mode: 'create',
        othersSameDay: [{ _id: '1' }],
        candidateTimeNorm: null,
        candidateDay: '2026-05-16',
        baselineDay: '',
        baselineTimeNorm: null,
      })
    ).toBe(true);
    expect(
      teamCalendarRequiresAcknowledgement({
        mode: 'create',
        othersSameDay: [],
        candidateTimeNorm: '10:00',
        candidateDay: '2026-05-16',
        baselineDay: '',
        baselineTimeNorm: null,
      })
    ).toBe(false);
  });

  it('teamCalendarRequiresAcknowledgement update ignores busy day if date and time unchanged', () => {
    expect(
      teamCalendarRequiresAcknowledgement({
        mode: 'update',
        othersSameDay: [{ _id: 'x', appearanceTime: '10:00' }],
        candidateTimeNorm: '10:00',
        candidateDay: '2026-05-16',
        baselineDay: '2026-05-16',
        baselineTimeNorm: '10:00',
      })
    ).toBe(false);
  });

  it('teamCalendarRequiresAcknowledgement update when time changes into collision', () => {
    expect(
      teamCalendarRequiresAcknowledgement({
        mode: 'update',
        othersSameDay: [{ _id: 'x', appearanceTime: '11:00' }],
        candidateTimeNorm: '11:00',
        candidateDay: '2026-05-16',
        baselineDay: '2026-05-16',
        baselineTimeNorm: '10:00',
      })
    ).toBe(true);
  });
});
