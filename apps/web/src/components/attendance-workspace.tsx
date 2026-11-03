'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Clock3, MapPin, RefreshCw, Download, Settings2, CheckCircle2 } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { api, ApiError } from '@/lib/http';
import { canManage, type Business, type Page } from '@/lib/types';
import { attendanceTime, eventLabels, geoLabels, locateOnce, stateLabels, type AttendanceCurrent, type AttendanceSession, type EventType, type LocationResult, type MarkInput, type Receipt } from '@/lib/attendance';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog } from './ui/dialog';
import { Loading, ErrorNotice, Field, SuccessNotice } from './feedback';
import { StatusBadge } from './ui/status-badge';
import { AttendancePolicyForm } from './attendance-policy';

export function AttendanceActions({ allowed, busy, onAction }: { allowed: EventType[]; busy: boolean; onAction: (action: EventType) => void }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(Object.keys(eventLabels) as EventType[]).map(type => <Button key={type} className="min-h-16 justify-start whitespace-normal text-left" variant={type === 'CLOCK_OUT' ? 'outline' : 'default'} disabled={busy || !allowed.includes(type)} onClick={() => onAction(type)}><Clock3 className="shrink-0" />{eventLabels[type]}</Button>)}</div>;
}
function EventList({ events, onReceipt }: { events: Receipt[]; onReceipt: (id: string) => void }) {
  return events.length ? <ol className="divide-y divide-border">{events.map(event => <li className="flex flex-wrap items-center justify-between gap-3 py-4" key={event.id}><div className="min-w-0"><p className="text-sm font-semibold">{eventLabels[event.event_type]}</p><p className="mt-1 text-xs text-muted-foreground">{attendanceTime(event.recorded_at)}</p><p className="mt-2 max-w-sm text-xs leading-5">{geoLabels[event.geo_result]}</p></div><Button variant="outline" size="sm" onClick={() => onReceipt(event.id)} aria-label={`Ver comprobante de ${eventLabels[event.event_type]}`}>Comprobante</Button></li>)}</ol> : <p className="py-4 text-sm text-muted-foreground">Aún no hay marcaciones en esta jornada.</p>;
}
function downloadReceipt(receipt: Receipt) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `comprobante-${receipt.id}.json`; link.click(); URL.revokeObjectURL(url);
}

export function AttendanceWorkspace({ business }: { business: Business }) {
  const base = `/api/v1/businesses/${business.id}/attendance`;
  const current = useResource<AttendanceCurrent>(`${base}/current/`);
  const [page, setPage] = useState(1); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const history = useResource<Page<AttendanceSession>>(`${base}/history/?page=${page}${from ? `&date_from=${from}` : ''}${to ? `&date_to=${to}` : ''}`);
  const [action, setAction] = useState<EventType | null>(null); const [newSession, setNewSession] = useState(false);
  const [busy, setBusy] = useState(false); const locked = useRef(false);
  const pending = useRef<MarkInput | null>(null); const [uncertain, setUncertain] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null); const [reason, setReason] = useState('');
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null); const [receiptBusy, setReceiptBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  function refresh() { current.retry(); history.retry(); }
  function choose(type: EventType, fresh = false) { setAction(type); setNewSession(fresh); setLocation(null); setReason(''); setError(''); setSuccess(''); pending.current = null; setUncertain(false); }
  async function send(input: MarkInput) {
    pending.current = input;
    try {
      const result = await api<{ receipt: Receipt; replayed: boolean }>(`${base}/events/`, { method: 'POST', body: input });
      pending.current = null; setUncertain(false); setAction(null); setReceipt(result.receipt);
      setSuccess(`${eventLabels[result.receipt.event_type]} registrado. Hora del servidor: ${attendanceTime(result.receipt.recorded_at)}.`); refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se confirmó el registro.');
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && failure.status !== 429) { pending.current = null; setUncertain(false); if (failure.status === 409) { setAction(null); refresh(); } }
      else { setUncertain(true); }
    }
  }
  async function mark(exception = false) {
    if (locked.current || !action || !current.data) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (pending.current) { await send(pending.current); return; }
      const result = exception ? location : await locateOnce();
      if (!result) return;
      setLocation(result);
      if (!result.location && !exception) return;
      if (!result.location && reason.trim().length < 10) { setError('Explica la incidencia con al menos 10 caracteres.'); return; }
      const session = newSession ? null : current.data.session;
      await send({ event_type: action, request_id: crypto.randomUUID(), session_id: session?.id ?? null, expected_version: session?.version ?? 0, location: result.location, location_status: result.location_status, exception_reason: result.location ? '' : reason.trim() });
    } finally { locked.current = false; setBusy(false); }
  }
  async function openReceipt(id: string) { setReceiptBusy(true); setError(''); try { setReceipt(await api<Receipt>(`${base}/receipts/${id}/`)); } catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos consultar el comprobante.'); } finally { setReceiptBusy(false); } }
  const data = current.data;
  return <div className="mx-auto max-w-5xl"><header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow mb-2 text-primary">TU JORNADA / REGISTRO PERSONAL</p><Link href={`/app/${business.id}/incidencias`} className="mb-2 block text-xs font-semibold text-primary underline">Mis incidencias y regularizaciones</Link><h1 className="font-display text-2xl font-bold">Mi asistencia</h1><p className="mt-2 text-sm text-muted-foreground">{business.name}</p></div><Button variant="outline" size="icon" aria-label="Actualizar asistencia" disabled={busy || uncertain} onClick={refresh}><RefreshCw /></Button></header>
    {success && <SuccessNotice>{success}</SuccessNotice>}{error && !action && <ErrorNotice message={error} />}{current.error ? <ErrorNotice message={current.error.message} retry={current.retry} /> : !data ? <Loading label="Consultando tu asistencia…" /> : <>
      <section className="surface mb-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{data.employee_name ?? 'Cuenta sin ficha vinculada'}</h2><p className="mt-1 text-xs text-muted-foreground">{data.date} · {data.timezone}</p></div><StatusBadge tone={data.state === 'WORKING' ? 'success' : data.state === 'ON_BREAK' ? 'pending' : 'muted'}>{stateLabels[data.state]}</StatusBadge></div>
      {data.session && <p className="mt-3 text-xs">Fecha laboral: {data.session.work_date}. Se conserva durante toda la jornada, aunque cruce medianoche.</p>}
      {(data.session?.shift_snapshot.starts_at || data.planned_shift.starts_at) ? <p className="mt-4 rounded-xl bg-muted p-3 text-xs leading-6">Turno programado: {attendanceTime((data.session?.shift_snapshot.starts_at || data.planned_shift.starts_at)!)} — {attendanceTime((data.session?.shift_snapshot.ends_at || data.planned_shift.ends_at)!)}. Las marcaciones se registran por separado.</p> : <p className="mt-4 text-xs text-muted-foreground">Sin turno programado asociado. Puedes registrar tu jornada si tienes una ficha activa.</p>}
      {!data.eligible && <p role="status" className="mt-4 text-sm">Necesitas una ficha activa vinculada en este negocio. Contacta a la administración.</p>}</section>
      <section className="surface mb-5 p-5"><h2 className="mb-4 text-sm font-bold">Registrar una marcación</h2><AttendanceActions allowed={data.allowed_actions} busy={busy || uncertain} onAction={choose} />{data.state === 'FINISHED' && data.eligible && <Button variant="outline" className="mt-4 w-full" onClick={() => choose('CLOCK_IN', true)}>Comenzar otra jornada</Button>}<p className="mt-4 flex gap-2 text-xs leading-6 text-muted-foreground"><MapPin className="mt-1 size-4 shrink-0" />Solo se solicitará una ubicación puntual al confirmar cada acción. No se registra tu recorrido ni tu ubicación en segundo plano.</p><p className="mt-2 text-xs leading-6 text-muted-foreground">{data.policy.location_required ? 'Ubicación requerida en el flujo ordinario; hay una vía de excepción si no está disponible.' : 'Si la ubicación no está disponible, puedes registrar una incidencia.'} Precisión deseada: hasta {data.policy.max_accuracy_meters} m. Fuera de zona se registra una incidencia, sin bloquear por distancia.</p></section>
      <section className="surface mb-5 p-5"><h2 className="text-sm font-bold">Marcaciones de la jornada</h2><EventList events={data.session?.events ?? []} onReceipt={id => void openReceipt(id)} /></section>
      <section className="surface mb-5 p-5"><h2 className="text-sm font-bold">Marcaciones de hoy</h2><p className="mt-2 text-xs text-muted-foreground">Últimas 50 marcaciones de la fecha local, incluidas jornadas nocturnas. Consulta el historial para otras jornadas.</p><EventList events={data.today_events} onReceipt={id => void openReceipt(id)} /></section>
      {canManage(business.role) && <Button variant="outline" className="mb-5" onClick={() => setSettings(true)}><Settings2 />Configurar ubicación y geocercas</Button>}
    </>}
    <section className="surface p-5"><h2 className="text-lg font-bold">Mi historial de jornadas</h2><div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-2"><Field id="attendance-from" label="Desde"><Input id="attendance-from" type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></Field><Field id="attendance-to" label="Hasta"><Input id="attendance-to" type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></Field></div>{history.error ? <ErrorNotice message={history.error.message} retry={history.retry} /> : !history.data ? <Loading label="Consultando jornadas…" /> : <>{!history.data.results.length && <p className="py-5 text-sm text-muted-foreground">No hay jornadas para estas fechas.</p>}{history.data.results.map(session => <details key={session.id} className="mb-3 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">{session.work_date} · {stateLabels[session.state]}<span className="mt-1 block text-xs font-normal text-muted-foreground">Inicio registrado: {attendanceTime(session.created_at)}</span></summary><EventList events={session.events} onReceipt={id => void openReceipt(id)} /><Link className="mt-3 block text-xs text-primary underline" href={`/app/${business.id}/incidencias?session=${session.id}&fecha=${session.work_date}`}>Incidencias de esta jornada</Link><Link className="mt-2 block text-xs text-primary underline" href={`/app/${business.id}/incidencias?nueva=1&session=${session.id}&fecha=${session.work_date}`}>Solicitar regularización de esta jornada</Link></details>)}<div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span>Página {page} · {history.data.count} jornadas</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!history.data.previous} onClick={() => setPage(value => value - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={!history.data.next} onClick={() => setPage(value => value + 1)}>Siguiente</Button></div></div></>}</section>
    {receiptBusy && <Loading label="Consultando comprobante…" />}<p className="mt-5 text-xs leading-6 text-muted-foreground">Módulo técnico en evaluación. No se presenta como reloj control certificado o autorizado por la Dirección del Trabajo. La ubicación declarada por el dispositivo no es una prueba infalible de presencia.</p>
    <Dialog open={!!action} onOpenChange={open => { if (!open && !busy && !uncertain) setAction(null); }} title={action ? eventLabels[action] : 'Registrar marcación'} description="Al confirmar se solicitarán latitud, longitud y precisión de tu ubicación actual para asociarlas únicamente a esta marcación.">
      <p className="mb-4 text-sm leading-6">La hora válida será la del servidor al recibir el registro. El dato de ubicación se conserva con acceso restringido para revisar incidencias. No se realiza seguimiento continuo.</p>{error && <ErrorNotice message={error} />}{location?.message && <p role="status" className="mb-4 rounded-xl bg-muted p-3 text-sm leading-6">{location.message}</p>}
      {uncertain ? <><p className="mb-4 text-sm">El servidor no confirmó la respuesta. Reintenta el mismo envío; no se duplicará una marcación ya recibida.</p><Button className="w-full" disabled={busy} onClick={() => void mark()}>Reintentar envío</Button></> : <><Button className="w-full min-h-12" disabled={busy} onClick={() => void mark()}>{busy ? 'Obteniendo ubicación y registrando…' : 'Confirmar y obtener ubicación'}</Button>{location && !location.location && <div className="mt-5 space-y-3 border-t border-border pt-4"><Field id="exception-reason" label="Explica la incidencia" hint="No incluyas información médica ni otros datos sensibles."><textarea id="exception-reason" className="min-h-24 w-full rounded-lg border border-border p-3 text-sm" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button variant="outline" className="min-h-12 w-full whitespace-normal" disabled={busy || reason.trim().length < 10} onClick={() => void mark(true)}>Registrar incidencia sin ubicación</Button></div>}</>}
    </Dialog>
    <Dialog open={!!receipt} onOpenChange={open => { if (!open) setReceipt(null); }} title="Comprobante de marcación" description="Registro persistido y confirmado por el servidor.">{receipt && <div className="space-y-4 text-sm"><p className="flex items-center gap-2 font-semibold text-primary"><CheckCircle2 className="size-5" />Registro confirmado</p><dl className="space-y-3">{[{ label: 'Identificador', value: receipt.id }, { label: 'Trabajador', value: receipt.employee_name }, { label: 'Negocio', value: receipt.business_name }, { label: 'Marcación', value: eventLabels[receipt.event_type] }, { label: 'Hora oficial', value: attendanceTime(receipt.recorded_at) }, { label: 'Ubicación', value: geoLabels[receipt.geo_result] }, ...(receipt.accuracy_meters !== null ? [{ label: 'Precisión declarada', value: `${receipt.accuracy_meters} m` }] : []), ...(receipt.exception_reason ? [{ label: 'Incidencia declarada', value: receipt.exception_reason }] : [])].map(row => <div key={row.label}><dt className="text-xs text-muted-foreground">{row.label}</dt><dd className="mt-1 break-words">{row.value}</dd></div>)}</dl><Button variant="outline" className="w-full" onClick={() => downloadReceipt(receipt)}><Download />Descargar comprobante JSON</Button></div>}</Dialog>
    <Dialog open={settings} onOpenChange={setSettings} title="Política de ubicación" description="Configuración del negocio; los cambios conservan una revisión auditada.">{data && <AttendancePolicyForm key={data.policy.version} businessId={business.id} initial={data.policy} onSaved={() => { setSettings(false); setSuccess('Política de ubicación guardada.'); refresh(); }} />}</Dialog>
  </div>;
}
