import { describe, expect, it } from 'vitest';
import { countWorkingDays, calculateDurationDays } from '../utils/leaveDays.js';

// Reference weekdays (2026): Mon 2026-06-22 ... Fri 2026-06-26, Sat 27, Sun 28, Mon 29.
describe('leave working-day counting', () => {
  it('counts a single weekday as 1', () => {
    expect(countWorkingDays('2026-06-22', '2026-06-22')).toBe(1); // Monday
  });

  it('counts a full Mon–Fri week as 5', () => {
    expect(countWorkingDays('2026-06-22', '2026-06-26')).toBe(5);
  });

  it('excludes the weekend in a 6-day span (4 working days)', () => {
    // Wed 24 -> Mon 29 = Wed,Thu,Fri,Sat,Sun,Mon -> 4 working days
    expect(countWorkingDays('2026-06-24', '2026-06-29')).toBe(4);
  });

  it('counts Fri–Mon as 2 working days', () => {
    expect(countWorkingDays('2026-06-26', '2026-06-29')).toBe(2);
  });

  it('returns 0 for a weekend-only span', () => {
    expect(countWorkingDays('2026-06-27', '2026-06-28')).toBe(0); // Sat–Sun
  });

  it('applies a half day on a working span', () => {
    expect(calculateDurationDays('2026-06-22', '2026-06-26', 'first')).toBe(4.5);
  });

  it('half day on a weekend-only span is 0', () => {
    expect(calculateDurationDays('2026-06-27', '2026-06-28', 'first')).toBe(0);
  });

  it('throws when start is after end', () => {
    expect(() => countWorkingDays('2026-06-26', '2026-06-22')).toThrow();
  });
});
