import { describe, expect, it } from 'vitest';
import { copyWeekRows, monthDays, monthStart, moveMonth } from './planning';
import type { Shift } from './types';
const shift: Shift = { id: 'id', business: 'b', employee: 'e', employee_name: 'Test', status: 'SCHEDULED', starts_at: '2026-10-27T01:00:00Z', ends_at: '2026-10-27T09:00:00Z', created_at: '', updated_at: '', break_minutes: 30, break_included: false, notes: 'Noche' };
describe('monthly planning', () => {
  it('starts on the first calendar day', () => expect(monthStart('2026-10-31')).toBe('2026-10-01'));
  it('crosses year boundaries', () => expect(moveMonth('2026-12-31', 1)).toBe('2027-01-01'));
  it('navigates backwards', () => expect(moveMonth('2026-01-31', -1)).toBe('2025-12-01'));
  it('supports leap years', () => expect(monthDays('2028-02-12')).toBe(29));
  it('supports short months', () => expect(monthDays('2026-02-12')).toBe(28));
  it('supports long months', () => expect(monthDays('2026-10-12')).toBe(31));
});
describe('copy planning', () => {
  it('preserves overnight dates, employee, breaks and notes', () => {
    const rows = copyWeekRows([shift], '2026-10-26', '2026-11-02');
    expect(rows).toEqual([{ employee: 'e', starts_at: '2026-11-03T01:00:00.000Z', ends_at: '2026-11-03T09:00:00.000Z', break_minutes: 30, break_included: false, notes: 'Noche' }]);
  });
  it('omits cancelled shifts', () => expect(copyWeekRows([{ ...shift, status: 'CANCELLED' }], '2026-10-26', '2026-11-02')).toEqual([]));
  it('does not duplicate a carryover from the previous week', () => expect(copyWeekRows([{ ...shift, starts_at: '2026-10-26T02:00:00Z' }], '2026-10-26', '2026-11-02')).toEqual([]));
  it('preserves local time across daylight saving', () => {
    const rows = copyWeekRows([{ ...shift, starts_at: '2026-08-31T13:00:00Z', ends_at: '2026-08-31T21:00:00Z' }], '2026-08-31', '2026-09-07');
    expect(rows[0].starts_at).toBe('2026-09-07T12:00:00.000Z');
  });
  it('rejects nonexistent local time on the destination date', () => {
    expect(() => copyWeekRows([{ ...shift, starts_at: '2026-08-30T04:30:00Z', ends_at: '2026-08-30T06:00:00Z' }], '2026-08-24', '2026-08-31')).toThrow();
  });
});
