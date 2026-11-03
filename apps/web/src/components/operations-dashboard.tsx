'use client';
import Link from 'next/link';
import { AttendanceSummary } from './attendance-supervision';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, CalendarDays, ClipboardCheck, Clock3, Plus, RefreshCw, Users } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useClock } from '@/hooks/use-clock';
import { useSession } from './session-provider';
import { canManage, type Business, type Shift } from '@/lib/types';
import type { LeaveRequest } from '@/lib/leave';
import { dateLabel, localDateTime, todayInSantiago } from '@/lib/shift-time';
import { Button } from './ui/button';
import { ErrorNotice, Loading, SuccessNotice } from './feedback';
import { SectionHeader, PendingList, ShiftList, WeekAgenda } from './operations-panels';

type DashboardSummary = { date: string; active_employees: number | null; today_count: number; week_count: number; pending_count: number; today_shifts: Shift[]; upcoming_shifts: Shift[]; pending_requests: Pick<LeaveRequest, 'id' | 'employee_name' | 'request_type' | 'start_date' | 'end_date'>[]; days: { date: string; count: number }[] };

function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: number | undefined; note: string; icon: typeof Users; tone: 'teal' | 'blue' | 'amber' | 'slate' }) {
  const colors = { teal: 'bg-[#e4f5f0] text-[#168275]', blue: 'bg-[#eaf0fb] text-[#4c71b3]', amber: 'bg-[#fff5e3] text-[#a47222]', slate: 'bg-[#edf1f6] text-[#61758b]' };
  return <div className="surface min-w-0 p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-[11px] font-medium text-muted-foreground">{label}</p><span className={`hidden size-8 shrink-0 place-items-center sm:grid rounded-[9px] ${colors[tone]}`}><Icon className="size-4" /></span></div>{value === undefined ? <div className="skeleton mt-3 h-9 w-12" /> : <p className="mt-2 font-display text-[31px] font-extrabold tracking-[-.06em] tabular-nums">{value}</p>}<p className="mt-1.5 text-[10px] text-muted-foreground">{note}</p></div>;
}
export function OperationsDashboard({ business }: { business: Business }) {
  const manager = canManage(business.role); const session = useSession(); const params = useSearchParams();
  const now = useClock(); const localToday = todayInSantiago(new Date(now)); const base = `/app/${business.id}`;
  const summary = useResource<DashboardSummary>(`/api/v1/businesses/${business.id}/dashboard/?day=${localToday}`);
  const data = summary.data;
  const today = data?.date ?? localToday;
  const hour = Number(localDateTime(new Date(now)).slice(11, 13));
  const greeting = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  return <>
    {params.get('creado') === '1' && <SuccessNotice>Negocio registrado correctamente. Ya puedes comenzar.</SuccessNotice>}
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0 flex-1"><p className="eyebrow mb-2.5 text-primary">{manager ? 'CENTRO DE OPERACIONES' : 'TU ESPACIO PERSONAL'}</p><p className="mb-1 text-[13px] text-muted-foreground">{greeting}, {session.user?.username}.</p><h1 className="break-words font-display text-[28px] font-extrabold tracking-[-.04em] sm:text-[32px]">{business.name}</h1><p className="mt-2 text-xs text-muted-foreground">{dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="icon" aria-label="Actualizar resumen" title="Actualizar resumen" disabled={!data && !summary.error} onClick={summary.retry}><RefreshCw className="size-4" /></Button><Button variant="outline" asChild><Link href={`${base}/turnos`}><CalendarDays />{manager ? 'Ver calendario' : 'Mis turnos'}</Link></Button><Button asChild><Link href={manager ? `${base}/trabajadores/nuevo` : `${base}/permisos?nuevo=1`}><Plus />{manager ? 'Registrar trabajador' : 'Solicitar permiso'}</Link></Button></div></div>
    {summary.error ? <ErrorNotice message={summary.error.message} retry={summary.retry} /> : !data ? <Loading label="Consultando resumen del negocio…" /> : <>
      {manager && <AttendanceSummary business={business} />}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Trabajadores activos" value={data?.active_employees ?? undefined} note="Fichas de este negocio" icon={Users} tone="teal" /><Metric label="Turnos de hoy" value={data?.today_count} note="Incluye turnos de noche" icon={CalendarDays} tone="blue" /><Metric label="Solicitudes pendientes" value={data?.pending_count} note="Por revisar en tu negocio" icon={ClipboardCheck} tone="amber" /><Metric label="Próximos 7 días" value={data?.week_count} note="Turnos programados únicos" icon={Clock3} tone="slate" /></div>

      <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="surface min-w-0 overflow-hidden"><SectionHeader title="Turnos de hoy" note="Vista previa de hasta seis turnos de la jornada." href={`${base}/turnos?fecha=${today}`} link="Ver calendario" /><ShiftList shifts={data.today_shifts} businessId={business.id} /></section>
        <section className="surface min-w-0 overflow-hidden"><SectionHeader title="Necesitan tu atención" note={`${data.pending_count} solicitudes pendientes de revisión · hasta cuatro visibles`} href={`${base}/permisos?estado=PENDING`} link="Revisar solicitudes" /><PendingList requests={data.pending_requests} businessId={business.id} /></section>
      </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><section className="surface min-w-0 overflow-hidden"><SectionHeader title={manager ? 'Los próximos días' : 'Tu semana, en orden'} note="Agenda de turnos · horario de Santiago" href={`${base}/turnos`} link="Planificar" /><WeekAgenda days={data.days} businessId={business.id} /></section><section className="rounded-2xl border border-[#c6e0dc] bg-[#edf7f5] p-5"><p className="eyebrow text-primary">A UN PASO</p><h2 className="mt-2 text-[17px] font-extrabold tracking-tight">{manager ? 'Acciones rápidas' : 'Mis gestiones'}</h2><div className="mt-5 space-y-1">{(manager ? [{ label: 'Crear turno', href: `${base}/turnos?nuevo=1`, icon: Plus }, { label: 'Revisar solicitudes', href: `${base}/permisos?estado=PENDING`, icon: ClipboardCheck }, { label: 'Ver trabajadores', href: `${base}/trabajadores`, icon: Users }] : [{ label: 'Solicitar permiso', href: `${base}/permisos?nuevo=1`, icon: Plus }, { label: 'Consultar mi ficha', href: `${base}/trabajadores`, icon: Users }]).map(action => <Link key={action.label} href={action.href} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#205f58] transition hover:bg-[#dcefea]"><action.icon className="size-4" />{action.label}<ArrowUpRight className="ml-auto size-3.5" /></Link>)}</div></section></div>
    {manager && <section className="surface mt-6 overflow-hidden"><SectionHeader title="Próximos turnos" note="Hasta seis turnos, incluidos los que están en curso." href={`${base}/turnos`} link="Ver todos" /><ShiftList shifts={data.upcoming_shifts} businessId={business.id} showDate grid /></section>}
    </>}
  </>;
}
