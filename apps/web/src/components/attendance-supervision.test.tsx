import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { AttendanceSupervision, AttendanceSummary } from './attendance-supervision';
import { useResource } from '@/hooks/use-resource';
import type { Business } from '@/lib/types';
vi.mock('@/hooks/use-resource', () => ({ useResource: vi.fn() }));
const business: Business = { id: 'a', name: 'Negocio real', role: 'OWNER', rut: '', is_active: true, created_at: '', updated_at: '' };
describe('supervisión administrativa', () => {
  it('impide que EMPLOYEE monte consultas administrativas', () => {
    vi.mocked(useResource).mockClear();
    expect(renderToStaticMarkup(<AttendanceSupervision business={{ ...business, role: 'EMPLOYEE' }} />)).toContain('Acceso restringido');
    expect(useResource).not.toHaveBeenCalled();
  });
  it('muestra carga y filtros de servidor', () => {
    vi.mocked(useResource).mockReturnValue({ data: undefined, error: undefined, retry: vi.fn() });
    const html = renderToStaticMarkup(<AttendanceSupervision business={business} />);
    for (const text of ['Consultando asistencia', 'Buscar trabajador', 'Reporte mensual', 'Cargo exacto']) expect(html).toContain(text);
  });
  it('muestra error recuperable', () => {
    vi.mocked(useResource).mockReturnValue({ data: undefined, error: new Error('Conexión interrumpida'), retry: vi.fn() });
    expect(renderToStaticMarkup(<AttendanceSupervision business={business} />)).toContain('Conexión interrumpida');
  });
  it('presenta vacío real y resumen sin porcentajes', () => {
    vi.mocked(useResource).mockReturnValue({ data: { count: 0, results: [], summary: { WORKING: 3 }, generated_at: '2026-11-02T15:00:00Z' }, error: undefined, retry: vi.fn() });
    expect(renderToStaticMarkup(<AttendanceSupervision business={business} />)).toContain('No hay registros para estos filtros');
    expect(renderToStaticMarkup(<AttendanceSummary business={business} />)).toContain('Trabajando: 3');
  });
});
