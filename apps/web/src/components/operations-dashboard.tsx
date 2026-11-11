'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, CalendarCheck, CalendarDays, ChevronRight, ClipboardCheck, Clock3, Layers3, Plus, RefreshCw, TriangleAlert, UserPlus, Users, Zap, type LucideIcon } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { useClock } from '@/hooks/use-clock';
import type { Business, Shift } from '@/lib/types';
import type { LeaveRequest } from '@/lib/leave';
import { dateLabel, localDateTime, todayInSantiago } from '@/lib/shift-time';
import { AttendanceSummary, type AttendanceDashboard } from './attendance-supervision';
import { useSession } from './session-provider';
import { Button } from './ui/button';
import { ErrorNotice, Loading, SuccessNotice } from './feedback';
import { SectionHeader, PendingList, ShiftList } from './operations-panels';

type DashboardSummary = {
  date: string;
  active_employees: number;
  today_count: number;
  week_count: number;
  pending_count: number;
  today_shifts: Shift[];
  upcoming_shifts: Shift[];
  days: { date: string; count: number }[];
  pending_requests: Pick<LeaveRequest, 'id' | 'employee_name' | 'request_type' | 'start_date' | 'end_date'>[];
};

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: LucideIcon; tone: string }) {
  return <article className="operations-metric" data-tone={tone}>
    <span className="operations-metric-icon"><Icon size={29} aria-hidden="true" /></span>
    <div><p>{label}</p><strong>{value}</strong></div>
  </article>;
}

function BusinessHeroArtwork() {
  return <svg className="operations-hero-art" viewBox="0 0 400 170" aria-hidden="true">
    <ellipse cx="211" cy="151" rx="175" ry="15" fill="#a6c9f0" opacity=".55" />
    <path d="M57 146V80M51 110l-17-16m24 24 20-24" fill="none" stroke="#407b58" strokeWidth="6" strokeLinecap="round" />
    <g fill="#38ab63"><circle cx="47" cy="79" r="28" /><circle cx="66" cy="60" r="25" /><circle cx="34" cy="58" r="22" /></g>
    <g fill="#89d95c"><circle cx="37" cy="50" r="15" /><circle cx="60" cy="49" r="18" /><circle cx="66" cy="72" r="18" /></g>
    <path d="M101 48h191l32 18v80l-32 10H101Z" fill="#e6f2ff" /><path d="m292 56 32 12v78l-32 10Z" fill="#91b9e7" />
    <path d="m88 42 188-23 58 20v26l-58-13L88 66Z" fill="#075cf5" /><path d="m276 19 58 20v26l-58-13Z" fill="#043996" />
    <path d="M110 79h171v71H110Z" fill="#0b3276" /><path d="M118 84h44v57h-44zm52 0h42v57h-42zm50 0h53v57h-53Z" fill="#ffdd96" />
    <path d="M123 95l27 35m26-39 28 43m27-40 34 42" stroke="#fff3ca" strokeWidth="8" opacity=".7" />
    <path d="m104 65 174-13 10 25-193 10Z" fill="#f2f7ff" />
    <path d="m115 64 23-2-4 24-24 1zm47-3 22-2-3 25-24 1zm46-4 24-2 2 26-25 2zm48-3 22-2 10 25-25 2Z" fill="#1688f8" />
    <path d="M304 88l11 3v28l-11 2Z" fill="#275ea7" />
    <path d="M346 147c-1-23 7-43 26-56-1 20-12 37-26 56Zm-2 1c-12-4-26-17-26-34 16 6 26 17 26 34Zm1 1c7-15 22-19 36-18-5 11-20 19-36 18Z" fill="#24a779" />
    <path d="M333 150h26l-5 13h-17Z" fill="#e6f2ff" />
  </svg>;
}

function ProgressArtwork({ kind }: { kind: 'calendar' | 'inbox' }) {
  return <svg className="operations-progress-art" viewBox="0 0 150 105" aria-hidden="true">
    <ellipse cx="75" cy="94" rx="68" ry="7" fill="#d4e5fb" />
    {kind === 'calendar' ? <>
      <path d="M34 92C18 77 7 51 12 39c14 10 22 28 22 53Zm0 0C19 90 7 84 5 74c12 0 24 6 29 18Z" fill="#56bb73" />
      <rect x="30" y="16" width="85" height="77" rx="10" fill="#a9cbff" />
      <rect x="27" y="12" width="85" height="77" rx="10" fill="#eff6ff" />
      <path d="M27 23c0-6 4-11 10-11h65c6 0 10 5 10 11v10H27Z" fill="#5164f0" />
      <path d="M47 20V6m44 14V6" stroke="#564ef4" strokeWidth="7" strokeLinecap="round" />
      <path d="m43 48 5 5 10-10m15 5 5 5 10-10M43 67l5 5 10-10m15 5 5 5 10-10" fill="none" stroke="#1688f8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="114" cy="74" r="21" fill="#fff8eb" stroke="#ffb237" strokeWidth="4" />
      <path d="M114 61v13h9" fill="none" stroke="#075cf5" strokeWidth="3" strokeLinecap="round" />
    </> : <>
      <path d="m24 49 48-34 48 34v34c0 7-4 11-11 11H35c-7 0-11-4-11-11Z" fill="#1378ed" />
      <rect x="40" y="8" width="65" height="65" rx="7" fill="#fff" stroke="#d7e7fc" strokeWidth="2" />
      <path d="M51 24h40M51 35h35M51 46h29" stroke="#75b0fa" strokeWidth="4" strokeLinecap="round" />
      <path d="M24 49l48 31 48-31v33c0 7-4 12-11 12H35c-7 0-11-5-11-12Z" fill="#1688f8" />
      <path d="m25 90 47-24 47 24c-2 3-6 4-10 4H35c-4 0-8-1-10-4Z" fill="#075cf5" />
      <path d="M115 21c6 0 10 4 10 10v6l5 7h-30l5-7v-6c0-6 4-10 10-10Zm-4 26h8a4 4 0 0 1-8 0Z" fill="#ffba33" stroke="#e59a14" />
    </>}
  </svg>;
}

function UpcomingOperations({ data, business, base }: { data: DashboardSummary; business: Business; base: string }) {
  const tones = ['blue', 'violet', 'mint', 'amber', 'blue', 'rose', 'violet'];
  const actions = [
    { title: 'Crear turno', note: 'Programa nuevos turnos', href: `${base}/turnos?fecha=${data.date}&nuevo=1`, icon: CalendarCheck, tone: 'blue' },
    { title: 'Revisar solicitudes', note: 'Permisos y ausencias', href: `${base}/permisos?estado=PENDING`, icon: ClipboardCheck, tone: 'violet' },
    { title: 'Ver trabajadores', note: 'Gestión del equipo', href: `${base}/trabajadores`, icon: Users, tone: 'mint' },
  ];

  return <>
    <section className="surface operations-agenda">
      <SectionHeader title="Los próximos días" note="Agenda de turnos · horario de Santiago" href={`${base}/turnos?fecha=${data.date}`} link="Planificar turnos" icon={<CalendarCheck size={25} />} />
      <div className="operations-days">
        {data.days.map(({ date, count }, index) => <Link key={date} href={`${base}/turnos?fecha=${date}`} data-tone={tones[index]} className="operations-day">
          <span className="operations-day-icon"><CalendarDays size={19} aria-hidden="true" /></span>
          <div><strong>{dateLabel(date, { weekday: 'short' })}</strong><time dateTime={date}>{dateLabel(date)}</time></div>
          {date === data.date && <span className="operations-day-today">Hoy</span>}
          <small>{count === 0 ? 'Sin turnos' : count === 1 ? '1 turno' : `${count} turnos`}</small>
        </Link>)}
      </div>
    </section>
    <section className="surface operations-next-actions">
      <div className="operations-panel-heading"><span className="operations-heading-icon"><Zap size={25} aria-hidden="true" /></span><div><p>A un paso</p><h2 className="section-title">Acciones rápidas</h2></div></div>
      <div className="operations-next-links">
        {actions.map(action => <Link key={action.title} href={action.href} data-tone={action.tone}>
          <span className="operations-day-icon"><action.icon size={23} aria-hidden="true" /></span>
          <span><strong>{action.title}</strong><small>{action.note}</small></span>
          <ChevronRight size={17} aria-hidden="true" />
        </Link>)}
      </div>
    </section>
    <section className="surface operations-upcoming">
      <SectionHeader title="Próximos turnos" note="Hasta seis turnos, incluidos los que están en curso." href={`${base}/turnos`} link="Ver todos" icon={<CalendarDays size={25} />} />
      {data.upcoming_shifts.length ? <ShiftList shifts={data.upcoming_shifts} businessId={business.id} showDate grid /> : <div className="operations-upcoming-empty">
        <ProgressArtwork kind="calendar" />
        <h3>Sin turnos programados</h3>
        <p>La planificación aparecerá aquí cuando haya turnos en este intervalo.</p>
        <Button asChild size="sm"><Link href={`${base}/turnos?fecha=${data.date}&nuevo=1`}><Plus size={17} />Planificar turno</Link></Button>
      </div>}
    </section>
  </>;
}

export function OperationsDashboard({ business }: { business: Business }) {
  const { user } = useSession();
  const params = useSearchParams();
  const now = new Date(useClock());
  const day = todayInSantiago(now);
  const base = `/app/${business.id}`;
  const summary = useResource<DashboardSummary>(`/api/v1/businesses/${business.id}/dashboard/?day=${day}`);
  const [attendance, setAttendance] = useState<AttendanceDashboard>();
  const hour = Number(localDateTime(now).slice(11, 13));
  const greeting = hour >= 6 && hour < 12 ? 'Buenos días' : hour >= 12 && hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  const data = summary.data;
  const completed = data?.today_count === 0 ? 0 : attendance?.completed_shifts;
  const progress = data?.today_count && completed !== undefined ? Math.min(100, Math.round(completed / data.today_count * 100)) : 0;
  const actions = [
    { label: 'Registrar trabajador', href: `${base}/trabajadores/nuevo`, icon: UserPlus, tone: 'blue' },
    { label: 'Ver calendario', href: `${base}/turnos`, icon: CalendarCheck, tone: 'violet' },
    { label: 'Gestionar turnos', href: `${base}/turnos?nuevo=1`, icon: Layers3, tone: 'mint' },
    { label: 'Crear incidencia', href: `${base}/incidencias?nueva=1`, icon: TriangleAlert, tone: 'amber' },
  ];

  return <div className="operations-home">
    {params.get('creado') === '1' && <SuccessNotice>Negocio registrado correctamente. Ya puedes comenzar.</SuccessNotice>}
    <section className="operations-hero">
      <svg className="operations-hero-waves" viewBox="0 0 1150 150" preserveAspectRatio="none" aria-hidden="true"><path fill="#cfe6ff" d="M0 140C160 167 251 78 329 57c103-28 167 52 255 26 83-25 122-60 205-38 107 28 168-52 361-45v150H0Z" /><path fill="#b5d8ff" d="M280 150c106-10 149-80 243-80 86 0 130 72 223 39C861 69 910 9 982 16c52 5 97 35 168 17v117Z" /></svg>
      <div className="operations-hero-copy"><h1 aria-label={business.name}>¡{greeting}, <strong>{user?.username}!</strong> <span aria-hidden="true">👋</span></h1><p>Gestiona tu negocio, equipo y turnos desde un solo lugar.</p></div>
      <BusinessHeroArtwork />
      <Button variant="ghost" size="icon-sm" className="operations-refresh" aria-label="Actualizar resumen" title="Actualizar resumen" disabled={!data && !summary.error} onClick={summary.retry}><RefreshCw className="size-4" /></Button>
    </section>
    {summary.error ? <ErrorNotice message={summary.error.message} retry={summary.retry} /> : !data ? <Loading label="Consultando resumen del negocio…" /> : <>
      <div className="operations-metrics">
        <Metric label="Trabajadores activos" value={data.active_employees} icon={Users} tone="primary" />
        <Metric label="Turnos de hoy" value={data.today_count} icon={CalendarCheck} tone="blue" />
        <Metric label="Solicitudes pendientes" value={data.pending_count} icon={Layers3} tone="violet" />
        <Metric label="Próximos 7 días" value={data.week_count} icon={Clock3} tone="mint" />
      </div>

      <div className="operations-middle">
        <AttendanceSummary business={business} date={data.date} onDashboard={setAttendance} />
        <section className="surface operations-actions p-4">
          <div className="operations-panel-heading"><span className="operations-heading-icon"><Zap size={25} aria-hidden="true" /></span><h2 className="section-title">Acciones rápidas</h2></div>
          <div className="operations-shortcuts">{actions.map(action => <Link key={action.href} href={action.href} className="operations-shortcut" data-tone={action.tone}><action.icon size={30} aria-hidden="true" /><span>{action.label}</span></Link>)}</div>
        </section>
      </div>

      <div className="operations-bottom">
        <section className="surface min-w-0 overflow-hidden">
          <SectionHeader title="Turnos de hoy" note="Vista previa de hasta seis turnos de la jornada." href={`${base}/turnos?fecha=${data.date}`} link="Ver calendario" icon={<CalendarCheck size={26} />} />
          <div className="operations-progress">
            <ProgressArtwork kind="calendar" />
            <div>
              <div className="operations-progress-label"><span>{completed === undefined ? `${data.today_count} turnos programados` : `${completed} de ${data.today_count} turnos realizados`}</span>{completed !== undefined && <strong>{progress}%</strong>}</div>
              {completed !== undefined && <progress max={100} value={progress} aria-label="Turnos realizados" />}
              <Button asChild size="sm"><Link href={`${base}/turnos?fecha=${data.date}&nuevo=1`}><Plus size={17} />Crear turno</Link></Button>
            </div>
          </div>
          {!!data.today_shifts.length && <ShiftList shifts={data.today_shifts} businessId={business.id} />}
        </section>
        <section className="surface min-w-0 overflow-hidden">
          <SectionHeader title="Necesitan tu atención" href={`${base}/permisos?estado=PENDING`} link="Revisar solicitudes" icon={<Activity size={26} />} />
          <div className="operations-progress">
            <ProgressArtwork kind="inbox" />
            <div><div className="operations-progress-label"><span>{data.pending_count} {data.pending_count === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}</span>{data.pending_count === 0 && <strong>0%</strong>}</div>{data.pending_count === 0 && <progress max={100} value={0} aria-label="Solicitudes pendientes" />}</div>
          </div>
          {!!data.pending_requests.length && <PendingList requests={data.pending_requests} businessId={business.id} />}
        </section>
      </div>
      <UpcomingOperations data={data} business={business} base={base} />
    </>}
  </div>;
}
