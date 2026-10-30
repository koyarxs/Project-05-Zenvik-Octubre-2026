'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Pencil, ArrowLeft, CalendarDays, Mail, ShieldCheck, Building2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { employeePath } from '@/lib/data';
import { dateLabel } from '@/lib/shift-time';
import { ApiError } from '@/lib/http';
import { canManage, type Business, type Employee } from '@/lib/types';
import { EmployeeForm } from './employee-form';
import { EmployeeActivity } from './employee-activity';
import { Loading, ErrorNotice, SuccessNotice } from './feedback';
import { PageHeading } from './page-heading';
import { Button } from './ui/button';
import { StatusBadge } from './ui/status-badge';
export function EmployeeDetail({ business, edit = false }: { business: Business; edit?: boolean }) {
  const { employeeId } = useParams<{ employeeId: string }>(); const params = useSearchParams();
  const { data, error, retry } = useResource<Employee>(employeePath(business.id, employeeId)); const base = `/app/${business.id}/trabajadores`;
  if (error) return <><PageHeading title={error instanceof ApiError && error.status === 404 ? 'Ficha no disponible' : 'No pudimos cargar la ficha'} description="La ficha puede no existir o no estar disponible para tu cuenta." /><ErrorNotice message={error.message} retry={retry} /><Button asChild variant="outline"><Link href={base}>Volver a trabajadores</Link></Button></>;
  if (!data) return <Loading label="Cargando ficha…" />;
  if (edit) return <EmployeeForm business={business} employee={data} />;
  return <>{params.get('guardado') === '1' && <SuccessNotice>Ficha guardada correctamente.</SuccessNotice>}<Link href={base} className="text-link mb-5"><ArrowLeft className="size-3.5" />Volver al listado</Link><PageHeading eyebrow="PERSONAS / PERFIL" title={`${data.first_name} ${data.last_name}`} description="La información esencial y la actividad disponible de esta persona." action={canManage(business.role) && <Button variant="outline" asChild><Link href={`${base}/${data.id}/editar`}><Pencil />Editar trabajador</Link></Button>} />
  <section className="surface overflow-hidden"><div className="h-16 border-b border-[#c9dfdf] bg-[#e3efef]" /><div className="px-6 pb-6 sm:px-8"><div className="-mt-8 mb-7 flex flex-wrap items-end justify-between gap-4"><div className="flex items-end gap-4"><span className="grid size-[76px] place-items-center rounded-[20px] border-[5px] border-white bg-[#25465e] font-display text-xl font-bold text-white">{data.first_name[0]}{data.last_name[0]}</span><div className="pb-1"><p className="text-sm font-bold">{data.first_name} {data.last_name}</p><p className="mt-1 text-xs text-muted-foreground">{business.name}</p></div></div><StatusBadge tone={data.is_active ? 'success' : 'muted'}>{data.is_active ? 'Activo' : 'Inactivo'}</StatusBadge></div>
  <dl className="grid gap-6 border-t border-border pt-6 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Correo electrónico', value: data.email || 'No informado', icon: Mail }, { label: 'Fecha de incorporación', value: data.hire_date ? dateLabel(data.hire_date, { day: 'numeric', month: 'long', year: 'numeric' }) : 'No informada', icon: CalendarDays }, { label: 'Negocio', value: business.name, icon: Building2 }, { label: 'Cuenta de acceso', value: data.user ? 'Cuenta vinculada' : 'Sin cuenta vinculada', icon: ShieldCheck }].map(field => <div key={field.label}><dt className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground"><field.icon className="size-3.5" />{field.label}</dt><dd className="mt-2.5 break-words text-xs font-semibold">{field.value}</dd></div>)}</dl></div></section>
  <EmployeeActivity key={data.id} business={business} employee={data} />
  </>;
}
