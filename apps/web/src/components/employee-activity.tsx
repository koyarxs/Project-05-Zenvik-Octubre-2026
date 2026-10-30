'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { addDays, dateLabel, todayInSantiago } from '@/lib/shift-time';
import { leaveStatuses, leaveTypes, type LeaveRequest } from '@/lib/leave';
import type { Business, Employee, Page, Shift } from '@/lib/types';
import { SectionHeader, ShiftList } from './operations-panels';
import { ErrorNotice, Loading } from './feedback';
import { StatusBadge } from './ui/status-badge';
import { Dialog } from './ui/dialog';
import { LeavePanel } from './leaves/leave-panel';
export function EmployeeActivity({ business, employee }: { business: Business; employee: Employee }) {
  const today = todayInSantiago(); const base = `/app/${business.id}`;
  const shifts = useResource<Page<Shift>>(`/api/v1/businesses/${business.id}/shifts/?status=SCHEDULED&employee=${employee.id}&date_from=${today}&date_to=${addDays(today, 7)}`);
  const requests = useResource<Page<LeaveRequest>>(`/api/v1/businesses/${business.id}/leave-requests/?employee=${employee.id}`);
  const [panel, setPanel] = useState<string | null>(null);
  return <div className="mt-6 grid gap-5 xl:grid-cols-2"><section className="surface overflow-hidden"><SectionHeader title="Próximos turnos" note="Programados en los próximos siete días." href={`${base}/turnos?trabajador=${employee.id}`} link="Ver calendario" />{shifts.error ? <div className="p-4"><ErrorNotice message={shifts.error.message} retry={shifts.retry} /></div> : shifts.data ? <ShiftList shifts={shifts.data.results.filter(shift => shift.status === 'SCHEDULED')} businessId={business.id} showDate /> : <Loading label="Consultando turnos relacionados…" />}</section><section className="surface overflow-hidden"><SectionHeader title="Solicitudes relacionadas" note="Las últimas solicitudes disponibles para tu cuenta." href={`${base}/permisos?trabajador=${employee.id}`} link="Ver historial" />{requests.error ? <div className="p-4"><ErrorNotice message={requests.error.message} retry={requests.retry} /></div> : !requests.data ? <Loading label="Consultando solicitudes…" /> : requests.data.results.length ? <div className="divide-y divide-border">{requests.data.results.slice(0, 4).map(request => <button key={request.id} onClick={() => setPanel(request.id)} className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left hover:bg-muted"><div><p className="text-xs font-semibold">{leaveTypes[request.request_type]}</p><p className="mt-1.5 text-[11px] text-muted-foreground">{dateLabel(request.start_date)} — {dateLabel(request.end_date)}</p></div><StatusBadge tone={request.status === 'PENDING' ? 'pending' : request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'danger' : 'muted'}>{leaveStatuses[request.status]}</StatusBadge></button>)}</div> : <div className="px-6 py-10"><p className="text-xs font-semibold">Sin solicitudes relacionadas</p><p className="mt-2 text-xs leading-6 text-muted-foreground">Las solicitudes de esta ficha aparecerán aquí cuando estén disponibles.</p></div>}</section><Dialog open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }} title="Detalle de la solicitud" description="Historial, decisión y planificación relacionada.">{panel && <LeavePanel key={panel} businessId={business.id} id={panel} onSaved={() => { setPanel(null); requests.retry(); }} />}</Dialog><p className="sr-only"><Link href={`${base}/permisos`}>Consultar solicitudes autorizadas</Link></p></div>;
}
