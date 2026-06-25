import { describe, expect, it } from 'vitest';
import { leaveTypeRequiredGender, canUseLeaveType } from '../utils/leaveTypeGender.js';

describe('gender-restricted leave types', () => {
  it('infers maternity → female and paternity → male from the name', () => {
    expect(leaveTypeRequiredGender({ name: 'Maternity Leave' })).toBe('female');
    expect(leaveTypeRequiredGender({ name: 'Paternity Leave' })).toBe('male');
  });

  it('respects explicit applicableGender over the name', () => {
    expect(leaveTypeRequiredGender({ name: 'Special', applicableGender: 'female' })).toBe('female');
    expect(leaveTypeRequiredGender({ name: 'Maternity', applicableGender: 'all' })).toBe('female'); // name fallback when 'all'
  });

  it('treats ordinary types as unrestricted', () => {
    expect(leaveTypeRequiredGender({ name: 'Annual Leave' })).toBeNull();
    expect(leaveTypeRequiredGender({ name: 'Sick Leave', applicableGender: 'all' })).toBeNull();
  });

  it('male sees paternity, not maternity', () => {
    expect(canUseLeaveType({ name: 'Paternity Leave' }, 'male')).toBe(true);
    expect(canUseLeaveType({ name: 'Maternity Leave' }, 'male')).toBe(false);
  });

  it('female sees maternity, not paternity', () => {
    expect(canUseLeaveType({ name: 'Maternity Leave' }, 'female')).toBe(true);
    expect(canUseLeaveType({ name: 'Paternity Leave' }, 'female')).toBe(false);
  });

  it('unspecified gender sees neither maternity nor paternity', () => {
    expect(canUseLeaveType({ name: 'Maternity Leave' }, undefined)).toBe(false);
    expect(canUseLeaveType({ name: 'Paternity Leave' }, undefined)).toBe(false);
  });

  it('everyone can use ordinary leave types', () => {
    expect(canUseLeaveType({ name: 'Annual Leave' }, undefined)).toBe(true);
    expect(canUseLeaveType({ name: 'Annual Leave' }, 'male')).toBe(true);
    expect(canUseLeaveType({ name: 'Annual Leave' }, 'female')).toBe(true);
  });
});
