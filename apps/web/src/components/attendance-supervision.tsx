'use client';
import Link from 'next/link';
import { ArrowRight, Fingerprint } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/http';
import { canManage, type Business } from '@/lib/types';
import { attendanceTime, eventLabels, geoLabels, type AttendanceSession } from '@/lib/attendance';
import { todayInSantiago } from '@/lib/shift-time';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { ErrorNotice, Loading } from './feedback';
import { AttendanceStateChart } from './attendance-state-chart';

export const operationalLabels: Record<string, string> = { WORKING: 'Trabajando', ON_BREAK: 'En colación', FINISHED: 'Jornada finalizada', LEAVE: 'Permiso aprobado', PENDING: 'Entrada pendiente', FUTURE: 'Turno futuro', UNSCHEDULED: 'Sin turno programado' };
const indicatorLabels: Record<string, string> = { rejected_attempts: 'Con intentos rechazados', registered: 'Con entrada registrada', possible_late: 'Posibles atrasos', location_incidents: 'Incidencias de ubicación', pending_review: 'Por revisar' };
const incidentLabels: Record<string, string> = { ...geoLabels, POSSIBLE_LATE: 'Posible atraso (sin tolerancia configurada)', INCOMPLETE: 'Salida pendiente tras el turno', EXCEPTION: 'Excepción justificada por trabajador', TEMPORAL: 'Inconsistencia temporal' };
type ReviewSession = Omit<AttendanceSession, 'events'> & { incidents: string[]; start_difference_minutes: number | null; end_difference_minutes: number | null; review_state: string; review_version: number; reviews: { id: number; actor: string; recorded_at: string; previous_state: string; state: string; reason: string }[]; events: (AttendanceSession['events'][number] & { sites: { name: string; radius_meters: number; distance_meters: number | null }[] })[] };
type Row = { employee_id: string; name: string; job_title: string; state: string; approved_leave: boolean; rejected_attempt?: boolean; planned_start: string | null; planned_end: string | null; session: ReviewSession | null; date?: string };
export type AttendanceDashboard = { entries: { hour: number; count: number }[]; completed_shifts: number };
type Result = { count: number; next: string | null; previous: string | null; results: Row[]; summary?: Record<string, number>; indicators?: Record<string, number>; generated_at: string; timezone: string; dashboard?: AttendanceDashboard };
const field = 'min-h-10 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm';
const stamp = (value?: string | null) => value ? attendanceTime(value) : 'Sin registro';

export function AttendanceSummary({ business, date, onDashboard }: { business: Business; date?: string; onDashboard?: (data: AttendanceDashboard | undefined) => void }) {
  const query = date ? `?${new URLSearchParams({ date, dashboard: 'true', page: '1' })}` : '';
  const resource = useResource<Result>(`/api/v1/businesses/${business.id}/attendance/supervision/${query}`);
  const dashboard = resource.data?.dashboard;
  useEffect(() => { onDashboard?.(dashboard); }, [dashboard, onDashboard]);
  if (!resource.data) return resource.error ? <ErrorNotice message={resource.error.message} retry={resource.retry} /> : null;
  const counts = resource.data.summary ?? {};
  return <section className="surface operations-attendance p-4"><div className="operations-panel-heading"><span className="operations-heading-icon"><Fingerprint size={25} aria-hidden="true" /></span><div><h2 className="section-title">Asistencia de hoy</h2><p>Según marcaciones. No acredita presencia física.</p></div><Button asChild size="sm"><Link href={`/app/${business.id}/asistencia/supervision`}>Supervisar asistencia <ArrowRight size={15} /></Link></Button></div><div className="operations-attendance-grid"><AttendanceStateChart counts={counts} showRate={!!date} />{dashboard && <AttendanceTimeline entries={dashboard.entries} />}</div></section>;
}

function AttendanceTimeline({ entries }: { entries: AttendanceDashboard['entries'] }) {
  const gradient = useId();
  const max = Math.max(1, ...entries.map(entry => entry.count));
  const points = entries.map((entry, index) => ({ x: 12 + 396 * index / Math.max(1, entries.length - 1), y: 85 - entry.count / max * 60, ...entry }));
  const line = points.map((point, index) => {
    const previous = points[index - 1];
    if (!previous) return `M${point.x},${point.y}`;
    const mid = (previous.x + point.x) / 2;
    return `C${mid},${previous.y} ${mid},${point.y} ${point.x},${point.y}`;
  }).join(' ');
  return <figure className="operations-timeline">
    <figcaption>Entradas por franja de 2 horas</figcaption>
    <svg viewBox="0 0 420 104" role="img" aria-label={entries.map(entry => `${entry.hour}:00, ${entry.count} entradas`).join('. ')}>
      <path d="M12 85H408M12 55H408M12 25H408" stroke="#dce8fa" strokeWidth="1" />
      <defs><linearGradient id={gradient} x2="0" y2="1"><stop stopColor="#8ac3ff" /><stop offset="1" stopColor="#e5f1ff" /></linearGradient></defs>
      {line && <path d={`${line} L${points.at(-1)?.x},85 L12,85Z`} fill={`url(#${gradient})`} />}
      <path d={line} fill="none" stroke="#0876f9" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map(({ x, y, hour, count }, index) => <g key={hour}><circle cx={x} cy={y} r="2.8" fill="#fff" stroke="#0876f9"><title>{String(hour).padStart(2, '0')}:00 · {count} entradas</title></circle>{index % 2 === 0 && <text x={x} y="101" textAnchor="middle" fontSize="9" fill="#071d49">{String(hour).padStart(2, '0')}:00</text>}</g>)}
    </svg>
  </figure>;
}

export function AttendanceSupervision({ business }: { business: Business }) {
  const query = useSearchParams();
  const period = query?.get('periodo');
  const initialPeriod = period === 'daily' || period === 'weekly' || period === 'monthly' ? period : 'live';
  if (!canManage(business.role)) return <ErrorNotice message="Acceso restringido: solo la administración puede supervisar asistencia." />;
  return <Supervisor key={`${business.id}:${initialPeriod}`} business={business} initialPeriod={initialPeriod} />;
}
function Supervisor({ business, initialPeriod }: { business: Business; initialPeriod: 'live' | 'daily' | 'weekly' | 'monthly' }) {
  const [date, setDate] = useState(() => todayInSantiago(new Date()));
  const [search, setSearch] = useState(''); const [query, setQuery] = useState('');
  const [job, setJob] = useState(''); const [state, setState] = useState(''); const [ordering, setOrdering] = useState('last_name');
  const [period, setPeriod] = useState<string>(initialPeriod); const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null); const [exportError, setExportError] = useState(''); const [exporting, setExporting] = useState(false);
  const exportRequest = useRef<AbortController | null>(null);
  useEffect(() => () => exportRequest.current?.abort(), []);
  const base = `/api/v1/businesses/${business.id}/attendance/supervision`;
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 350); return () => clearTimeout(timer); }, [search]);
  const params = new URLSearchParams({ date, page: String(page), ordering, period: period === 'live' ? 'daily' : period });
  if (query) params.set('search', query); if (job) params.set('job_title', job); if (state) params.set('state', state);
  const resource = useResource<Result>(`${base}/${period === 'live' ? '' : 'reports/'}?${params}`);
  const { retry } = resource;
  useEffect(() => { if (period !== 'live' || selected) return; const timer = setInterval(() => { if (document.visibilityState === 'visible') retry(); }, 60000); return () => clearInterval(timer); }, [period, selected, retry]);
  async function download() {
    setExporting(true); setExportError('');
    const controller = new AbortController(); exportRequest.current = controller;
    try { const response = await fetch(`${base}/export/?${params}`, { credentials: 'include', cache: 'no-store', signal: controller.signal }); if (!response.ok) throw new Error('No se pudo exportar. Revisa el acceso y acota los filtros (máximo 10.000 filas).'); const blob = await response.blob(); if (controller.signal.aborted) return; const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'asistencia.csv'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (error) { setExportError((error as Error).message); } finally { setExporting(false); }
  }
  const data = resource.data;
  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-primary">SUPERVISIÓN OPERATIVA</p><h1 className="mt-2 text-3xl font-extrabold">Asistencia</h1><p className="mt-2 text-sm text-muted-foreground">{business.name} · America/Santiago</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href={`/app/${business.id}/incidencias`}>Incidencias</Link></Button><Button variant="outline" onClick={retry}>Actualizar asistencia</Button><Button onClick={download} disabled={exporting}>{exporting ? 'Exportando…' : 'Exportar CSV'}</Button></div></div>
    <p className="mb-4 text-xs text-muted-foreground">Estados según marcaciones, sin seguimiento continuo. Las diferencias requieren revisión y no implican una infracción.</p>
    <form id="reportes" className="surface mb-5 grid min-w-0 scroll-mt-24 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={event => event.preventDefault()}>
      <label className="text-xs">Fecha<input className={field} type="date" value={date} onChange={event => { setDate(event.target.value); setPage(1); }} /></label>
      <label className="text-xs">Vista<select aria-label="Vista" className={field} value={period} onChange={event => { setPeriod(event.target.value); setPage(1); }}><option value="live">Panel diario</option><option value="daily">Reporte diario</option><option value="weekly">Reporte semanal</option><option value="monthly">Reporte mensual</option></select></label>
      <label className="text-xs">Buscar trabajador<input className={field} value={search} onChange={event => setSearch(event.target.value)} maxLength={100} /></label>
      <label className="text-xs">Estado<select aria-label="Estado" className={field} value={state} onChange={event => { setState(event.target.value); setPage(1); }}><option value="">Todos</option>{Object.entries(operationalLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Cargo exacto<input className={field} value={job} onChange={event => { setJob(event.target.value); setPage(1); }} maxLength={120} /></label>
      <label className="text-xs">Orden<select aria-label="Orden" className={field} value={ordering} onChange={event => { setOrdering(event.target.value); setPage(1); }}><option value="last_name">Apellido A–Z</option><option value="-last_name">Apellido Z–A</option><option value="job_title">Cargo</option></select></label>
    </form>
    {exportError && <ErrorNotice message={exportError} />}
    {resource.error ? <ErrorNotice message={resource.error.message} retry={retry} /> : !data ? <Loading label="Consultando asistencia…" /> : <>
      {data.summary && <section className="surface mb-4 p-4"><AttendanceStateChart counts={data.summary} /></section>}
      {data.summary && <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(operationalLabels).filter(([key]) => key !== 'UNSCHEDULED').map(([key, label]) => <div className="surface p-3" key={key}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{data.summary?.[key] ?? 0}</p></div>)}</div>}
      {data.indicators && <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(indicatorLabels).map(([key, label]) => <div className="surface p-3" key={key}><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{data.indicators?.[key] ?? 0}</p></div>)}</div>}
      <p className="mb-3 text-xs text-muted-foreground" role="status">{data.count} resultados · Última actualización: {attendanceTime(data.generated_at)}{period === 'live' ? ' · Refresco cada 60 segundos' : ''}</p>
      {!data.results.length ? <div className="surface p-8 text-center">No hay registros para estos filtros.</div> : <div className="grid min-w-0 gap-3">{data.results.map(row => <article key={`${row.employee_id}-${row.date ?? date}-${row.session?.id ?? "pending"}`} className="surface grid min-w-0 gap-3 p-4 lg:grid-cols-[1fr_1fr_2fr_auto]">
        <div className="min-w-0"><h2 className="break-words font-bold">{row.name}</h2><p className="text-xs text-muted-foreground">{row.job_title || 'Sin cargo informado'}{row.date ? ` · ${row.date}` : ''}</p><p className="mt-2 text-sm font-semibold text-primary">{operationalLabels[row.state]}</p>{row.rejected_attempt && <p className="text-xs">Intentos rechazados: revisar detalle</p>}{row.approved_leave && <p className="text-xs">Permiso aprobado</p>}</div>
        <div className="text-xs"><p className="font-semibold">Turno programado</p><p>{row.planned_start ? stamp(row.planned_start) : 'Sin turno para esta fecha'}</p>{row.planned_end && <p>{stamp(row.planned_end)}</p>}{row.session && <p className="mt-2">Fecha laboral: {row.session.work_date}</p>}</div>
        <div className="grid grid-cols-2 gap-2 text-xs">{Object.entries(eventLabels).map(([key, label]) => <div key={key}><p className="font-semibold">{label}</p><p>{row.session?.events.filter(e => e.event_type === key).map(e => stamp(e.recorded_at)).join(' · ') || 'Sin registro'}</p></div>)}</div>
        <div className="min-w-0"><p className="mb-2 text-xs">{row.session?.incidents.length ? `${row.session.incidents.length} incidencias · ${row.session.review_state}` : 'Sin incidencias detectadas'}</p><Button variant="outline" onClick={() => setSelected(row)}>Ver jornada</Button></div>
      </article>)}</div>}
      <div className="my-4 flex items-center justify-between gap-2"><Button variant="outline" disabled={!data.previous} onClick={() => setPage(page - 1)}>Anterior</Button><span className="text-sm">Página {page}</span><Button variant="outline" disabled={!data.next} onClick={() => setPage(page + 1)}>Siguiente</Button></div>
    </>}
    {selected && <Dialog open onOpenChange={open => { if (!open) { setSelected(null); retry(); } }} title={selected.name} description={`${business.name} · ${selected.job_title || 'Sin cargo'} · Jornadas y marcaciones originales`}><PersonDetail key={`${selected.employee_id}-${selected.date ?? date}`} base={base} row={selected} date={selected.session?.work_date ?? selected.date ?? date} /></Dialog>}
  </>;
}
function PersonDetail({ base, row, date }: { base: string; row: Row; date: string }) {
  const [page, setPage] = useState(1);
  const resource = useResource<{ results: ReviewSession[]; rejections: { id: number; event_type: keyof typeof eventLabels; code: string; recorded_at: string }[]; rejection_count: number; next: string | null; previous: string | null }>(`${base}/people/${row.employee_id}/?date=${date}&page=${page}`);
  if (resource.error) return <ErrorNotice message={resource.error.message} retry={resource.retry} />;
  if (!resource.data) return <Loading />;
  return <div className="space-y-5"><p className="text-sm">Fecha laboral: {date} · {operationalLabels[row.state]}</p>{!resource.data.results.length && <p>Sin marcaciones registradas para esta fecha.</p>}<p className="text-xs">Intentos rechazados: {resource.data.rejection_count} (hasta 20 recientes). Se registran desde esta etapa, sin reconstruir intentos anteriores.</p>{resource.data.rejections.map(item => <p key={item.id} className="rounded border p-2 text-xs">{stamp(item.recorded_at)} ? {eventLabels[item.event_type]} ? {item.code === "DUPLICATE_REJECTED" ? "Clave duplicada rechazada" : "Estado o transición incompatible"}</p>)}{resource.data.results.map(session => <Journey key={session.id} session={session} base={base} retry={resource.retry} />)}<div className="flex justify-between"><Button variant="outline" disabled={!resource.data.previous} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" disabled={!resource.data.next} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>;
}
function Journey({ session, base, retry }: { session: ReviewSession; base: string; retry: () => void }) {
  const [state, setState] = useState(session.review_state); const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(''); try { await api(`${base}/reviews/${session.id}/`, { method: 'POST', body: { state, reason, expected_review: session.review_version } }); retry(); } catch (error) { setError((error as Error).message); } finally { setSaving(false); } }
  return <section className="space-y-4 border-t pt-4 text-sm">
    <p className="break-all text-xs text-muted-foreground">Jornada {session.id}</p><Link className="block text-primary underline" href={`${base.replace("/api/v1/businesses/", "/app/").replace("/attendance/supervision", "/incidencias")}?session=${session.id}&fecha=${session.work_date}`}>Incidencias y regularizaciones de esta jornada</Link><p>{session.work_date} · {operationalLabels[session.state]}</p>
    <p>Horario conservado al marcar: {session.shift_snapshot.starts_at ? `${stamp(session.shift_snapshot.starts_at)} — ${stamp(session.shift_snapshot.ends_at)}` : 'Sin turno asociado'}</p>
    <p>Diferencia entrada: {session.start_difference_minutes === null ? 'No disponible' : `${session.start_difference_minutes} min`} · Salida: {session.end_difference_minutes === null ? 'No disponible' : `${session.end_difference_minutes} min`}</p>
    {session.incidents.map(code => <p key={code} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">{incidentLabels[code] ?? code}</p>)}
    <ol className="space-y-3 border-l-2 border-primary/20 pl-4">{session.events.map(event => <li key={event.id} className="space-y-1"><p className="font-semibold">{eventLabels[event.event_type]}</p><p>{stamp(event.recorded_at)} · hora del servidor</p><p className="break-all text-[11px] text-muted-foreground">{event.id}</p><p>{geoLabels[event.geo_result] ?? event.geo_result}</p><p>Precisión: {event.accuracy_meters === null ? 'No disponible' : `${event.accuracy_meters} m`}</p>{event.sites.map((site, index) => <p className="text-xs" key={index}>{site.name} · radio {site.radius_meters} m · distancia {site.distance_meters ?? 'No disponible'} m</p>)}{event.exception_reason && <p>{event.exception_reason}</p>}</li>)}</ol>
    {Object.entries(eventLabels).filter(([key]) => !session.events.some(event => event.event_type === key)).map(([key, label]) => <p key={key} className="text-xs text-muted-foreground">{label}: sin registro{key.startsWith('BREAK') ? ' (la jornada puede no requerir colación)' : ''}.</p>)}
    <form onSubmit={save} className="space-y-3"><h3 className="font-bold">Revisión administrativa</h3><label className="block">Estado de revisión<select aria-label="Estado de revisión" className={field} value={state} onChange={event => setState(event.target.value)}><option value="PENDING">Pendiente</option><option value="REVIEWING">En revisión</option><option value="RESOLVED">Revisada</option></select></label><label className="block">Observación y justificación<textarea className={`${field} py-2`} minLength={10} maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} /></label>{error && <ErrorNotice message={error} />}<Button disabled={saving} type="submit">Guardar revisión</Button></form>
    <h3 className="font-bold">Historial de revisión</h3>{!session.reviews.length && <p>Sin revisiones administrativas.</p>}{session.reviews.map(review => <div key={review.id} className="rounded-lg bg-muted p-3"><p>{review.actor} · {stamp(review.recorded_at)}</p><p>{review.previous_state} → {review.state}</p><p className="break-words">{review.reason}</p></div>)}
  </section>;
}
