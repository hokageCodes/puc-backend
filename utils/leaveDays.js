/**
 * Leave duration is counted in WORKING DAYS (Mon–Fri), inclusive of both endpoints.
 * Weekends (Sat/Sun) do not consume leave. Dates are treated as date-only in UTC to
 * avoid timezone drift on 'YYYY-MM-DD' values.
 *
 * NOTE: public holidays are not yet accounted for — only weekends.
 */

/** Count working days (Mon–Fri) between two dates, inclusive. */
export const countWorkingDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid start or end date');
  }
  if (start > end) {
    throw new Error('Start date must be before end date');
  }

  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  let workingDays = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (day !== 0 && day !== 6) workingDays += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return workingDays;
};

/**
 * Working-day duration for a leave request, applying an optional half-day.
 * A half day only applies when the span contains at least one working day.
 */
export const calculateDurationDays = (startDate, endDate, halfDay) => {
  const workingDays = countWorkingDays(startDate, endDate);

  if (halfDay === 'first' || halfDay === 'second') {
    return workingDays > 0 ? Math.max(workingDays - 0.5, 0.5) : 0;
  }
  return workingDays;
};
