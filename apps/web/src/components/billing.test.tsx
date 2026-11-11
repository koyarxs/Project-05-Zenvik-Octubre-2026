import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { SubscriptionWorkspace } from './subscription-workspace';
import { PlanCards, PublicPlans } from './plan-catalog';
import { useResource } from '@/hooks/use-resource';
import { safeCheckout, type PlanCatalog, type Subscription } from '@/lib/billing';
import type { Business } from '@/lib/types';
vi.mock('@/hooks/use-resource', () => ({ useResource: vi.fn() }));
const business: Business = { id: 'a', name: 'Negocio sintético', role: 'OWNER', rut: '', is_active: true, created_at: '', updated_at: '' };
const catalog: PlanCatalog = { plans: [{ id: 'test', code: 'test', name: 'Plan de prueba', description: 'Descripción de prueba', version_id: 'v', version: 1, features: ['employees', 'shifts'], limits: {}, trial_days: 0, prices: [] }], checkout_enabled: false, payment_environment: 'disabled' };
const subscription: Subscription = { id: 's', legacy_access: true, plan: null, price: null, version_id: null, state: 'PENDING', revision: 0, period_start: null, period_end: null, cancel_at_period_end: false, writable: true, features: ['employees'], limits: {}, usage: { active_employees: 2 }, checkout_enabled: false, changes: [] };
describe('suscripción y catálogo comercial', () => {
  it.each(['ADMIN', 'EMPLOYEE'] as const)('no monta consultas financieras para %s', role => {
    vi.mocked(useResource).mockClear();
    expect(renderToStaticMarkup(<SubscriptionWorkspace business={{ ...business, role }} />)).toContain('Acceso restringido');
    expect(useResource).not.toHaveBeenCalled();
  });
  it('no inventa precios ni ofrece pagos activos cuando no hay precios', () => {
    const html = renderToStaticMarkup(<PlanCards catalog={catalog} />);
    expect(html).toContain('Precio por definir'); expect(html).toContain('Sin contratación activa');
    expect(html).not.toContain('$'); expect(html).not.toContain('Comprar');
  });
  it('presenta catálogo vacío sin simular contratación', () => {
    expect(renderToStaticMarkup(<PlanCards catalog={{ ...catalog, plans: [] }} />)).toContain('Estamos preparando nuestros planes');
  });
  it('ofrece comparación semántica y herramientas desde datos de API', () => {
    const html = renderToStaticMarkup(<PlanCards catalog={catalog} />);
    expect(html).toContain('Planificación de turnos'); expect(html).toContain('<article'); expect(html).toContain('/app?plan=test');
  });
  it('muestra errores recuperables del catálogo', () => {
    vi.mocked(useResource).mockReturnValue({ error: new Error('Conexión interrumpida'), retry: vi.fn(), data: undefined });
    expect(renderToStaticMarkup(<PublicPlans />)).toContain('Conexión interrumpida');
  });
  it('muestra acceso conservado, consumo y pagos vacíos sin cifras financieras ficticias', () => {
    vi.mocked(useResource).mockImplementation((path: string) => ({ data: path.endsWith('/billing/') ? subscription : path.includes('payments') ? { count: 0, results: [], next: null } : catalog, error: undefined, retry: vi.fn() }));
    const html = renderToStaticMarkup(<SubscriptionWorkspace business={business} />);
    expect(html).toContain('Acceso local conservado'); expect(html).toContain('sin cuota definida');
    expect(html).toContain('todavía no tiene pagos registrados'); expect(html).not.toContain('Cancelar al finalizar');
  });
  it('rechaza redirecciones de checkout manipuladas', () => {
    for (const url of ['http://sandbox.flow.cl/x', 'https://flow.cl/x', 'https://sandbox.flow.cl.evil.test', 'javascript:alert(1)', 'https://a:b@sandbox.flow.cl', 'https://sandbox.flow.cl:444/x']) expect(safeCheckout(url)).toBe(false);
    expect(safeCheckout('https://sandbox.flow.cl/payment?token=test')).toBe(true);
  });
});
