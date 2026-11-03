import type { Business, Role } from './types';

type Module = {
  id: 'dashboard' | 'employees' | 'shifts' | 'leaves' | 'attendance' | 'supervision' | 'incidents' | 'notifications';
  segment: string;
  label: string;
  employeeLabel: string;
  roles: readonly Role[];
};

// Register only implemented modules. Future modules must
// supply real routes and backend authorization before being added here.
export const workspaceModules: readonly Module[] = [
  { id: 'dashboard', segment: '', label: 'Inicio', employeeLabel: 'Mi día', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'employees', segment: '/trabajadores', label: 'Trabajadores', employeeLabel: 'Mi ficha', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'shifts', segment: '/turnos', label: 'Turnos', employeeLabel: 'Mis turnos', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'leaves', segment: '/permisos', label: 'Permisos y ausencias', employeeLabel: 'Mis solicitudes', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'incidents', segment: '/incidencias', label: 'Incidencias', employeeLabel: 'Mis incidencias', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'notifications', segment: '/notificaciones', label: 'Notificaciones', employeeLabel: 'Notificaciones', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
  { id: 'supervision', segment: '/asistencia/supervision', label: 'Asistencia', employeeLabel: 'Asistencia', roles: ['OWNER', 'ADMIN'] },
  { id: 'attendance', segment: '/asistencia', label: 'Mi asistencia', employeeLabel: 'Mi asistencia', roles: ['OWNER', 'ADMIN', 'EMPLOYEE'] },
];

export function businessNavigation(business?: Pick<Business, 'id' | 'role'>) {
  if (!business) return [];
  return workspaceModules.filter(module => module.roles.includes(business.role)).map(module => ({
    id: module.id,
    href: `/app/${business.id}${module.segment}`,
    label: business.role === 'EMPLOYEE' ? module.employeeLabel : module.label,
  }));
}

export type Breadcrumb = { label: string; href?: string };
export function workspaceLocation(pathname: string, business?: Pick<Business, 'id' | 'name' | 'role'>) {
  const links = businessNavigation(business);
  const active = links.find(link => pathname === link.href || (link.id !== 'dashboard' && pathname.startsWith(`${link.href}/`)));
  const root: Breadcrumb = { label: 'Mis negocios', href: '/app' };
  if (!business || !active) {
    const title = pathname === '/app' ? 'Tus negocios' : pathname === '/app/configuracion' ? 'Configuración' : pathname === '/app/nuevo-negocio' ? 'Registrar negocio' : 'Negocio no disponible';
    return { title, active: undefined, breadcrumbs: pathname === '/app' ? [{ label: title }] : [root, { label: title }] };
  }
  const base = `/app/${business.id}`;
  const breadcrumbs: Breadcrumb[] = [root, { label: business.name, href: base }];
  let title = active.label;
  if (active.id === 'employees' && pathname !== active.href) {
    breadcrumbs.push({ label: active.label, href: active.href });
    const tail = pathname.slice(active.href.length + 1).split('/');
    title = tail[0] === 'nuevo' ? 'Registrar trabajador' : tail[1] === 'editar' ? 'Editar trabajador' : 'Ficha del trabajador';
    if (tail[1] === 'editar') breadcrumbs.push({ label: 'Ficha del trabajador', href: `${active.href}/${tail[0]}` });
    if (business.role === 'EMPLOYEE' && (tail[0] === 'nuevo' || tail[1] === 'editar')) title = 'Acceso restringido';
  }
  breadcrumbs.push({ label: title });
  return { title, active, breadcrumbs };
}
