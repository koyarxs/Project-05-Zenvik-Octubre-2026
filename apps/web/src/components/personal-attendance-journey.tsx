'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Coffee, FileCheck2, LoaderCircle, LogIn, LogOut, MapPin, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { usePersonalMark } from '@/hooks/use-personal-mark';
import { attendanceTime, eventLabels, stateLabels, type EventType } from '@/lib/attendance';
import type { PersonalCurrent } from '@/lib/personal-attendance';
import { usePersonalBusiness } from './personal-attendance-shell';
import { useSession } from './session-provider';
import { AttendanceTimeline, ReceiptDialog, usePersonalReceipt } from './personal-attendance-records';
import { ErrorNotice, Field, Loading } from './feedback';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

const actionIcons = { CLOCK_IN: LogIn, BREAK_START: Coffee, BREAK_END: Clock3, CLOCK_OUT: LogOut };
const stageLabels = { idle: '', locating: 'Obteniendo una ubicación puntual…', sending: 'Enviando al servidor. Espera la confirmación…', checking: 'Consultando el resultado en el servidor…' };

export function PersonalAttendanceJourney() {
  const business = usePersonalBusiness(); const { user } = useSession();
  const current = useResource<PersonalCurrent>(`/api/v1/businesses/${business.id}/attendance/personal/current/`);
  const { retry: refreshCurrent } = current;
  const marking = usePersonalMark(business.id, user!.id, current.retry);
  const consulted = usePersonalReceipt(business.id);
  const [choice, setChoice] = useState<{ type: EventType; fresh: boolean; snapshot: PersonalCurrent } | null>(null);
  const [reason, setReason] = useState('');
  const data = current.data;
  useEffect(() => {
    const update = () => { if (document.visibilityState === 'visible' && !marking.busy && !choice) refreshCurrent(); };
    const timer = setInterval(update, 60000); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [refreshCurrent, marking.busy, choice]);
  function choose(type: EventType, fresh = false) {
    if (!data || marking.busy) return;
    marking.prepare(); setReason(''); setChoice({ type, fresh, snapshot: data });
  }
  async function confirm(exception = false) {
    if (!choice) return;
    const receipt = await marking.confirm(choice.type, choice.fresh, choice.snapshot, reason, exception);
    if (receipt) setChoice(null);
  }
  const last = data?.session?.events.at(-1) ?? data?.today_events[0];
  const planned = data?.session?.shift_snapshot.starts_at ? data.session.shift_snapshot : data?.planned_shift;
  const disabled = marking.busy || !marking.ready || !!marking.pending || !marking.online;
  const rejected = marking.error.startsWith('Marcación rechazada:');
  return <>
    <header className="attendance-page-heading attendance-page-heading--journey"><div><p className="attendance-kicker">TU TIEMPO, CON CLARIDAD</p><h1>Mi jornada</h1><p>Marca con tranquilidad. Conserva cada confirmación.</p></div><Button variant="outline" aria-label="Actualizar mi jornada" disabled={marking.busy} onClick={current.retry}><RefreshCw />Actualizar</Button></header>
    {!marking.online && <div role="status" className="attendance-warning"><WifiOff aria-hidden="true" /><div><strong>Estás sin conexión</strong><p>No se guardan marcaciones offline. Conéctate para consultar o enviar al servidor.</p></div></div>}
    {marking.storageWarning && <div role="status" className="attendance-warning"><ShieldCheck aria-hidden="true" /><p>El navegador no permite conservar la referencia de recuperación. Si un envío queda sin confirmar, mantén esta pantalla abierta hasta consultar su resultado.</p></div>}
    {marking.pending && <section className="attendance-pending" aria-labelledby="pending-heading"><div><Clock3 aria-hidden="true" /><div><h2 id="pending-heading">Resultado pendiente de confirmar</h2><p>{eventLabels[marking.pending.event_type]} · {business.name}</p><p>No significa que la marcación haya sido rechazada. Conservamos el mismo identificador para evitar duplicados.</p><small>Referencia: {marking.pending.request_id}</small></div></div><div className="attendance-pending__actions"><Button disabled={marking.busy || !marking.online} onClick={() => void marking.recover()}>Consultar resultado</Button><Button variant="outline" disabled={marking.busy || !marking.online || !data} onClick={() => choose(marking.pending!.event_type)}>Reintentar marcación pendiente</Button></div></section>}
    {marking.error && !choice && <ErrorNotice message={marking.error} />}{consulted.error && <ErrorNotice message={consulted.error} />}
    {marking.busy && !choice && <p role="status" className="attendance-progress"><LoaderCircle aria-hidden="true" />{stageLabels[marking.stage]}</p>}
    {current.error ? <ErrorNotice message={current.error.message} retry={current.retry} /> : !data ? <Loading label="Consultando tu jornada en el servidor…" /> : <>
      <section className={`attendance-journey-banner attendance-journey-banner--${data.state.toLowerCase()}`}><div className="attendance-journey-banner__person"><span className="attendance-kicker">TU REGISTRO PERSONAL</span><h2>{data.employee_name ?? 'Cuenta sin ficha vinculada'}</h2><span className="attendance-state"><span aria-hidden="true" />{stateLabels[data.state]}</span>{data.session && <p>Fecha laboral: {data.session.work_date}</p>}</div><div className="attendance-server-time"><Clock3 aria-hidden="true" /><strong>{new Intl.DateTimeFormat('es-CL', { timeZone: data.timezone, hourCycle: 'h23', timeStyle: 'short' }).format(new Date(data.server_now))}</strong><span>{new Intl.DateTimeFormat('es-CL', { timeZone: data.timezone, dateStyle: 'long' }).format(new Date(data.server_now))}</span><small><span>{data.timezone}</span><span>Hora del servidor al consultar</span></small></div></section>
      {!data.eligible ? <section className="attendance-card attendance-empty"><ShieldCheck aria-hidden="true" /><h2>Tu ficha necesita estar habilitada</h2><p>Para marcar necesitas una ficha activa vinculada a tu cuenta en {business.name}. Contacta a la administración; no hace falta crear otra cuenta.</p><p>Puedes consultar los registros personales que ya tengas.</p></section> : <div className="attendance-journey-grid"><section className="attendance-card attendance-mark-card"><div className="attendance-section-heading"><span className="attendance-icon-tile"><Clock3 aria-hidden="true" /></span><div><p className="attendance-kicker">SIGUIENTE PASO</p><h2>{data.state === 'FINISHED' ? 'Jornada completada' : 'Registrar una marcación'}</h2></div></div><p className="attendance-mark-card__hint">{data.state === 'ON_BREAK' ? 'Cuando termine tu colación, registra tu regreso.' : data.state === 'WORKING' ? 'Registra tu colación o el término de turno cuando corresponda.' : data.state === 'FINISHED' ? 'Tus registros están disponibles en el historial y sus comprobantes.' : 'Todo listo para comenzar. La hora se confirma en el servidor.'}</p><div className="attendance-mark-actions">{data.allowed_actions.map((action, index) => { const Icon = actionIcons[action]; return <Button key={action} variant={index === 0 ? 'default' : 'outline'} className={index === 0 ? 'attendance-primary-action' : 'attendance-secondary-action'} disabled={disabled} onClick={() => choose(action)}><Icon aria-hidden="true" /><span>{eventLabels[action]}</span><ArrowRight aria-hidden="true" /></Button>; })}{data.state === 'FINISHED' && <Button className="attendance-primary-action" disabled={disabled} onClick={() => choose('CLOCK_IN', true)}><LogIn aria-hidden="true" />Comenzar otra jornada<ArrowRight aria-hidden="true" /></Button>}</div><div className="attendance-location-note"><MapPin aria-hidden="true" /><p>Solicitamos una ubicación puntual al confirmar. Nunca seguimos tu recorrido ni tu ubicación en segundo plano.</p></div><p className="attendance-subtle">{data.policy.location_required ? 'Ubicación requerida en el flujo ordinario; se conserva la vía de excepción declarada.' : 'Si la ubicación no está disponible, puedes declarar una incidencia.'} Precisión deseada: hasta {data.policy.max_accuracy_meters} m.</p></section>
        <aside className="attendance-journey-aside"><section className="attendance-card attendance-plan"><div className="attendance-section-heading"><CalendarDays aria-hidden="true" /><h2>Turno programado</h2></div><span className="attendance-plan__label">PLANIFICACIÓN · NO ES UNA MARCACIÓN</span>{planned?.starts_at && planned.ends_at ? <><p>{attendanceTime(planned.starts_at, data.timezone)}</p><p>hasta {attendanceTime(planned.ends_at, data.timezone)}</p></> : <><h3>Sin turno asociado</h3><p>Puedes registrar tu jornada con una ficha activa. No se infiere un atraso ni una ausencia.</p></>}</section><section className="attendance-card attendance-last"><div className="attendance-section-heading"><FileCheck2 aria-hidden="true" /><h2>Última marcación confirmada</h2></div>{last ? <><h3>{eventLabels[last.event_type]}</h3><p>{attendanceTime(last.recorded_at, last.timezone_name ?? data.timezone)}</p><Button variant="ghost" disabled={consulted.busy} onClick={() => void consulted.open(last.id)}>Ver comprobante<ArrowRight aria-hidden="true" /></Button></> : <p>Aún no hay marcaciones confirmadas en la jornada consultada.</p>}</section></aside>
      </div>}
      <section className="attendance-card attendance-today"><div className="attendance-section-heading"><CheckCircle2 aria-hidden="true" /><div><h2>Marcaciones de la jornada</h2><p>Registros originales · {data.session?.timezone_name ?? data.timezone}</p></div></div><AttendanceTimeline events={data.session?.events ?? []} zone={data.session?.timezone_name ?? data.timezone} openReceipt={id => void consulted.open(id)} /><div className="attendance-card-footer"><Link href={`/asistencia/${business.id}/historial`}>Consultar todo mi historial<ArrowRight aria-hidden="true" /></Link><Link href={`/asistencia/${business.id}/incidencias?nueva=1${data.session ? `&session=${data.session.id}&fecha=${data.session.work_date}` : `&fecha=${data.date}`}`}>Informar un problema</Link></div></section>
    </>}
    <p className="attendance-product-note">Módulo técnico en evaluación. No se presenta como reloj control certificado o autorizado. Las capturas originales y los ajustes posteriores se conservan por separado.</p>
    <Dialog open={!!choice} onOpenChange={open => { if (!open && !marking.busy) setChoice(null); }} title={choice ? eventLabels[choice.type] : 'Confirmar marcación'} description={`Esta acción corresponde a ${business.name}. La hora válida será la registrada por el servidor.`}>
      <div className="attendance-confirm"><div className="attendance-confirm__privacy"><MapPin aria-hidden="true" /><p>Al confirmar solicitaremos tu ubicación actual una sola vez, para asociarla a esta marcación con acceso restringido.</p></div>{marking.error && <ErrorNotice message={marking.error} />}{marking.location?.message && <p role="status" className="attendance-confirm__location">{marking.location.message}</p>}
        {marking.busy && <p role="status" className="attendance-progress"><LoaderCircle aria-hidden="true" />{stageLabels[marking.stage]}</p>}
        {rejected ? <Button className="w-full min-h-12" onClick={() => setChoice(null)}>Volver a Mi jornada</Button> : <><Button className="w-full min-h-12" disabled={marking.busy || !marking.online} onClick={() => void confirm()}>{marking.busy ? 'Espera la confirmación…' : marking.pending ? 'Confirmar reintento' : 'Confirmar y obtener ubicación'}</Button>{marking.location && !marking.location.location && <div className="attendance-confirm__exception"><Field id="personal-exception-reason" label="Explica la incidencia" hint="Al menos 10 caracteres. Evita datos médicos o sensibles."><textarea id="personal-exception-reason" rows={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field><Button variant="outline" className="w-full min-h-12 whitespace-normal" disabled={marking.busy || !marking.online || reason.trim().length < 10} onClick={() => void confirm(true)}>Registrar incidencia sin ubicación</Button></div>}</>}
        <p className="attendance-confirm__foot">No cierres esta pantalla durante el envío. Si la respuesta se pierde, podrás consultar el mismo intento sin duplicar el registro.</p>
      </div>
    </Dialog>
    <ReceiptDialog receipt={choice ? null : consulted.receipt ?? marking.receipt} close={() => { consulted.close(); marking.closeReceipt(); }} />
  </>;
}
