import { addDays, localDateTime, localToInstant } from './shift-time';
import type { Shift } from './types';
export function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
export function moveMonth(date: string, delta: number) {
  const value = new Date(`${monthStart(date)}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 10);
}
export function monthDays(date: string) {
  return Math.round((Date.parse(moveMonth(date, 1)) - Date.parse(monthStart(date))) / 86400000);
}
export function copyWeekRows(shifts: Shift[], source: string, destination: string) {
  const delta = Math.round((Date.parse(destination) - Date.parse(source)) / 86400000);
  const move = (instant: string) => { const wall = localDateTime(instant); return localToInstant(`${addDays(wall.slice(0, 10), delta)}${wall.slice(10)}`); };
  return shifts.filter(shift => shift.status === 'SCHEDULED' && localDateTime(shift.starts_at).slice(0, 10) >= source && localDateTime(shift.starts_at).slice(0, 10) < addDays(source, 7)).map(shift => ({ employee: shift.employee, starts_at: move(shift.starts_at), ends_at: move(shift.ends_at), break_minutes: shift.break_minutes ?? 0, break_included: shift.break_included ?? true, notes: shift.notes ?? '' }));
}
