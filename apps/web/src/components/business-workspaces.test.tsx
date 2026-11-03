import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BusinessWorkspaces } from './business-workspaces';
import { WeekAgenda } from './operations-panels';
import type { Business } from '@/lib/types';
const state = vi.hoisted(() => ({ businesses: [] as Business[] }));
vi.mock('./workspace-provider', () => ({ useWorkspace: () => state }));
describe('espacios de trabajo', () => {
  it('muestra un solo registro en el estado vacío', () => {
    state.businesses = [];
    const html = renderToStaticMarkup(<BusinessWorkspaces />);
    expect(html).toContain('Tu primer negocio empieza aquí');
    expect(html.match(/href="\/app\/nuevo-negocio"/g)).toHaveLength(1);
    expect(html).not.toContain('<img');
  });
  it('conserva identidad, rol y destino de cada negocio sin datos inventados', () => {
    state.businesses = [{ id: 'a', name: 'Taller Sur', rut: '76.123.456-0', role: 'ADMIN', is_active: true, created_at: '', updated_at: '' }];
    const html = renderToStaticMarkup(<BusinessWorkspaces />);
    expect(html).toContain('Taller Sur'); expect(html).toContain('Administrador');
    expect(html).toContain('76.123.456-0'); expect(html).toContain('href="/app/a"');
    expect(html).toContain('>TS</span>'); expect(html).not.toContain('<img');
  });
  it('agenda usa conteos agregados y enlaza el día del negocio correcto', () => {
    const html = renderToStaticMarkup(<WeekAgenda days={[{ date: '2026-10-31', count: 93 }, { date: '2026-11-01', count: 0 }]} businessId="b" />);
    expect(html).toContain('93 turnos'); expect(html).toContain('Sin turnos');
    expect(html).toContain('/app/b/turnos?fecha=2026-10-31');
  });
});
