import { describe, expect, it } from 'vitest';
import { businessNavigation, workspaceLocation } from './workspace-navigation';
import type { Role } from './types';

const business = { id: 'business-a', name: 'Taller Sur', role: 'OWNER' as Role };
describe('navegación del espacio privado', () => {
  it('no habilita módulos sin selección explícita', () => {
    expect(businessNavigation()).toEqual([]);
    expect(workspaceLocation('/app').title).toBe('Tus negocios');
    expect(workspaceLocation('/app/foreign').title).toBe('Negocio no disponible');
  });
  it.each(['OWNER', 'ADMIN', 'EMPLOYEE'] as Role[])('genera solo rutas reales del negocio para %s', role => {
    const links = businessNavigation({ ...business, role });
    expect(links.map(link => link.href)).toEqual(['/app/business-a', '/app/business-a/trabajadores', '/app/business-a/turnos', '/app/business-a/permisos', '/app/business-a/incidencias', '/app/business-a/notificaciones', ...(role === 'EMPLOYEE' ? [] : ['/app/business-a/asistencia/supervision']), '/app/business-a/asistencia', ...(role === 'OWNER' ? ['/app/business-a/suscripcion'] : [])]);
    expect(links[0].label).toBe(role === 'EMPLOYEE' ? 'Mi día' : 'Inicio');
    expect(links[1].label).toBe(role === 'EMPLOYEE' ? 'Mi ficha' : 'Trabajadores');
  });
  it('resuelve ficha y edición con padres navegables sin exponer UUID en etiquetas', () => {
    const location = workspaceLocation('/app/business-a/trabajadores/person-id/editar', business);
    expect(location.title).toBe('Editar trabajador');
    expect(location.active?.id).toBe('employees');
    expect(location.breadcrumbs.at(-2)).toEqual({ label: 'Ficha del trabajador', href: '/app/business-a/trabajadores/person-id' });
    expect(location.breadcrumbs.at(-1)).toEqual({ label: 'Editar trabajador' });
  });
  it('no activa una ruta con prefijo parecido ni otra empresa', () => {
    expect(workspaceLocation('/app/business-a/turnos-falso', business).active).toBeUndefined();
    expect(workspaceLocation('/app/business-b/turnos', business).active).toBeUndefined();
  });
  it('identifica un formulario restringido al trabajador', () => {
    expect(workspaceLocation('/app/business-a/trabajadores/nuevo', { ...business, role: 'EMPLOYEE' }).title).toBe('Acceso restringido');
  });
  it('mantiene la configuración fuera del negocio seleccionado', () => {
    const location = workspaceLocation('/app/configuracion');
    expect(location.title).toBe('Configuración');
    expect(location.breadcrumbs).toEqual([{ label: 'Mis negocios', href: '/app' }, { label: 'Configuración' }]);
  });
});
