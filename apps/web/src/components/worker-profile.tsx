 'use client';
import Link from 'next/link';
import { UserRound, BriefcaseBusiness, Settings2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { employeePath } from '@/lib/data';
import { dateLabel } from '@/lib/shift-time';
import { roleLabels, type Business, type Employee, type Page } from '@/lib/types';
import { ErrorNotice, Loading } from './feedback';
import { StatusBadge } from './ui/status-badge';
import { Button } from './ui/button';
import { EmployeeActivity } from './employee-activity';
export function WorkerProfile({ business }: { business: Business }) {
  const resource = useResource<Page<Employee>>(employeePath(business.id));
  if (resource.error) return <ErrorNotice message={resource.error.message} retry={resource.retry} />;
  if (!resource.data) return <Loading label="Consultando tu perfil…" />;
  const employee = resource.data.results[0];
  if (!employee) return <section className="surface p-5"><h1 className="text-xl font-bold">Mi perfil</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Aún no tienes una ficha vinculada en este negocio. Contacta a la administración.</p><Button variant="outline" asChild className="mt-4"><Link href="/app/configuracion">Consultar mi cuenta</Link></Button></section>;
  return <WorkerProfileContent business={business} employee={employee} />;
}
export function WorkerProfileContent({ business, employee }: { business: Business; employee: Employee }) {
  return <div className="mx-auto max-w-5xl"><header className="mb-5 flex items-center gap-3"><span className="avatar">{employee.first_name[0]}{employee.last_name[0]}</span><div className="min-w-0"><p className="eyebrow mb-1 text-primary">MI PERFIL</p><h1 className="break-words font-display text-xl font-bold">{employee.first_name} {employee.last_name}</h1></div></header><div className="grid gap-4 md:grid-cols-2"><section className="surface p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><UserRound className="size-4 text-primary" />Información personal</h2><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">Correo de contacto</dt><dd className="mt-1 break-all">{employee.email || 'No informado'}</dd></div><div><dt className="text-xs text-muted-foreground">Teléfono</dt><dd className="mt-1">{employee.phone || 'No informado'}</dd></div></dl><p className="mt-4 border-t border-border pt-3 text-xs leading-6 text-muted-foreground">Para corregir tus datos, contacta a la administración. Tu perfil es de consulta.</p></section><section className="surface p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><BriefcaseBusiness className="size-4 text-primary" />Información laboral</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-xs">{[{ label: 'Negocio', value: business.name }, { label: 'Cargo', value: employee.job_title || 'No informado' }, { label: 'Incorporación', value: employee.hire_date ? dateLabel(employee.hire_date) : 'No informada' }, { label: 'Jornada', value: employee.work_schedule || 'No informada' }].map(row => <div key={row.label}><dt className="text-muted-foreground">{row.label}</dt><dd className="mt-1 break-words font-medium">{row.value}</dd></div>)}</dl><div className="mt-4"><StatusBadge tone={employee.is_active ? 'success' : 'muted'}>{employee.is_active ? 'Activo' : 'Inactivo'}</StatusBadge></div></section></div><section className="surface mt-4 p-5"><h2 className="flex items-center gap-2 text-sm font-bold"><Settings2 className="size-4 text-primary" />Mi cuenta</h2><p className="mt-3 break-words text-sm">{employee.account_name || 'Cuenta vinculada'} · {employee.access_role ? roleLabels[employee.access_role] : 'Trabajador'}</p><p className="mt-2 text-xs text-muted-foreground">El acceso y el cargo laboral se administran por separado.</p><Link className="text-link mt-4" href="/app/configuracion">Ver configuración de mi cuenta</Link></section><EmployeeActivity business={business} employee={employee} /></div>;
}
