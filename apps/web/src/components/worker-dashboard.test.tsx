import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkerHome } from './worker-dashboard';
import { workerDestinations, plannedShiftState, workerShiftHref, type WorkerSummary } from '@/lib/worker-portal';
import type { Business, Shift } from '@/lib/types';
const business: Business = { id: 'a', name: 'Mi negocio', role: 'EMPLOYEE', rut: '', is_active: true, created_at: '', updated_at: '' };
const shift: Shift = { id: 's', business: 'a', employee: 'p', employee_name: 'Clara Test', starts_at: '2026-11-01T23:00:00-03:00', ends_at: '2026-11-02T07:00:00-03:00', status: 'SCHEDULED', created_at: '', updated_at: '' };
const summary: WorkerSummary = { date: '2026-11-01', server_now: '2026-11-01T12:00:00-03:00', timezone: 'America/Santiago', worker_profile: { id: 'p', first_name: 'Clara', last_name: 'Test', job_title: 'Operadora', is_active: true }, next_shift: shift, upcoming_shifts: [shift], request_counts: { PENDING: 2, APPROVED: 3, REJECTED: 1, CANCELLED: 0 }, days: [] };
describe('portal personal del trabajador', () => {
  it('muestra identidad, turno nocturno y conteos reales sin controles administrativos', () => {
    const html = renderToStaticMarkup(<WorkerHome business={business} data={summary} />);
    for (const text of ['Hola, Clara', 'Mi negocio', '23:00', '07:00', 'America/Santiago', 'Pendientes', 'Aprobadas', 'Rechazadas', 'Solicitar permiso']) expect(html).toContain(text);
    expect(html).toContain('>2</span>'); expect(html).toContain('>3</span>');
    expect(html).not.toContain('Crear turno'); expect(html).toContain('/asistencia');
  });
  it('explica ausencia de ficha y evita ofrecer solicitud sin vínculo', () => {
    const html = renderToStaticMarkup(<WorkerHome business={business} data={{ ...summary, worker_profile: null, next_shift: null, upcoming_shifts: [] }} />);
    expect(html).toContain('Sin próximos turnos programados');
    expect(html).toContain('no tiene una ficha vinculada');
    expect(html).not.toContain('Solicitar permiso');
  });
  it('explica ficha inactiva conservando accesos de consulta', () => {
    const html = renderToStaticMarkup(<WorkerHome business={business} data={{ ...summary, worker_profile: { ...summary.worker_profile!, is_active: false } }} />);
    expect(html).toContain('Tu ficha está inactiva'); expect(html).not.toContain('Solicitar permiso');
    expect(html).toContain('Mi perfil');
  });
  it('navegación solo para EMPLOYEE y con asistencia funcional', () => {
    expect(workerDestinations()).toEqual([]);
    expect(workerDestinations({ id: 'a', role: 'OWNER' })).toEqual([]);
    expect(workerDestinations(business).map(item => item.label)).toEqual(['Inicio', 'Asistencia', 'Mis turnos', 'Permisos', 'Mi perfil']);
    expect(workerDestinations({ id: 'b', role: 'EMPLOYEE' }).every(item => item.href.startsWith('/app/b'))).toBe(true);
  });
  it('calcula estado horario sin afirmar asistencia y usa fecha local del turno', () => {
    expect(plannedShiftState(shift, '2026-11-01T12:00:00-03:00')).toBe('Programado');
    expect(plannedShiftState(shift, shift.starts_at)).toBe('Horario en curso');
    expect(plannedShiftState(shift, shift.ends_at)).toBe('Horario finalizado');
    expect(workerShiftHref('a', shift)).toBe('/app/a/turnos?fecha=2026-11-01');
  });
});
