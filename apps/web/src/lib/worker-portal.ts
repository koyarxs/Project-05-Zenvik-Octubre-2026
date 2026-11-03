import type { Business, Shift } from './types';
import { localDateTime } from './shift-time';
export type WorkerSummary = { date: string; server_now: string; timezone: string; worker_profile: { id: string; first_name: string; last_name: string; job_title: string; is_active: boolean } | null; next_shift: Shift | null; upcoming_shifts: Shift[]; request_counts: Record<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED', number>; days: { date: string; count: number }[] };
export function workerDestinations(business?: Pick<Business, 'id' | 'role'>) {
  if (!business || business.role !== 'EMPLOYEE') return [];
  const base = `/app/${business.id}`;
  return [{ id: 'dashboard', label: 'Inicio', href: base }, { id: 'attendance', label: 'Asistencia', href: `${base}/asistencia` }, { id: 'shifts', label: 'Mis turnos', href: `${base}/turnos` }, { id: 'leaves', label: 'Permisos', href: `${base}/permisos` }, { id: 'employees', label: 'Mi perfil', href: `${base}/trabajadores` }] as const;
}
export function plannedShiftState(shift: Shift, serverNow: string) {
  const now = Date.parse(serverNow);
  return Date.parse(shift.ends_at) <= now ? 'Horario finalizado' : Date.parse(shift.starts_at) <= now ? 'Horario en curso' : 'Programado';
}
export function workerShiftHref(business: string, shift: Shift) { return `/app/${business}/turnos?fecha=${localDateTime(shift.starts_at).slice(0, 10)}`; }
