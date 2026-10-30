'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/http';
import { leaveStatuses, leaveTypes, type LeaveDetail } from '@/lib/leave';
import { dateLabel, localDateTime, shiftTimeLabel } from '@/lib/shift-time';
import { Button } from '../ui/button';
import { ErrorNotice, Loading } from '../feedback';

type Action = 'approve' | 'reject' | 'cancel';
const actionLabels: Record<Action, string> = { approve: 'aprobar', reject: 'rechazar', cancel: 'cancelar' };
export function LeavePanel({ businessId, id, onSaved }: { businessId: string; id: string; onSaved: (message: string) => void }) {
  const path = `/api/v1/businesses/${businessId}/leave-requests/${id}/`;
  const resource = useResource<LeaveDetail>(path);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide() {
    if (!action) return;
    setBusy(true); setError(null);
    try {
      const result = await api<LeaveDetail>(`${path}${action}/`, { method: 'POST', body: action === 'cancel' ? {} : { review_note: note } });
      onSaved(`Solicitud ${leaveStatuses[result.status].toLowerCase()}.${result.status === 'APPROVED' && result.affected_shifts.count ? ` Hay ${result.affected_shifts.count} turnos afectados que siguen programados; revisa el calendario.` : ''}`);
    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar la decisión.'); resource.retry(); }
    finally { setBusy(false); }
  }
  if (resource.error) return <ErrorNotice message={resource.error.message} retry={resource.retry} />;
  if (!resource.data) return <Loading label="Consultando solicitud y turnos…" />;
  const leave = resource.data;
  const actionAllowed = action === 'cancel' ? leave.can_cancel : leave.can_review;
  return <div className="space-y-5">
    <div><p className="font-semibold">{leave.employee_name}</p><p className="mt-1 text-sm text-muted-foreground">{leaveTypes[leave.request_type]} · {leaveStatuses[leave.status]}</p></div>
    <dl className="space-y-4 text-sm"><div><dt className="text-muted-foreground">Fechas solicitadas</dt><dd className="mt-1">{dateLabel(leave.start_date, { day: 'numeric', month: 'long', year: 'numeric' })} — {dateLabel(leave.end_date, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt className="text-muted-foreground">Motivo</dt><dd className="mt-1 whitespace-pre-wrap break-words">{leave.reason || 'Sin motivo adicional.'}</dd></div>{leave.reviewed_at && <div className="rounded-lg bg-muted p-4"><dt className="font-medium">Decisión registrada</dt><dd className="mt-2">{leave.reviewed_by_name} · {localDateTime(leave.reviewed_at).replace('T', ' ')} (Santiago)<p className="mt-2 whitespace-pre-wrap break-words">{leave.review_note || 'Sin observación adicional.'}</p></dd></div>}</dl>
    {leave.affected_shifts.visible && <div className={leave.affected_shifts.count ? 'rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950' : 'rounded-lg bg-muted p-4 text-sm text-muted-foreground'}>
      <p className="font-medium">{leave.affected_shifts.count ? `${leave.affected_shifts.count} turnos afectados` : 'Sin turnos programados en estas fechas'}</p>
      <p className="mt-1">Aprobar no modifica ni cancela turnos. La planificación debe revisarse por separado.</p>
      {leave.affected_shifts.count > 0 && <><ul className="mt-3 space-y-1">{leave.affected_shifts.results.map(shift => <li key={shift.id}>{dateLabel(localDateTime(shift.starts_at).slice(0, 10))} · {shiftTimeLabel(shift.starts_at, shift.ends_at)}</li>)}</ul>{leave.affected_shifts.count > leave.affected_shifts.results.length && <p className="mt-2">Se muestran los primeros 20 turnos.</p>}<Link className="mt-3 inline-block font-medium underline" href={`/app/${businessId}/turnos`}>Revisar calendario de turnos</Link></>}
    </div>}
    {error && <ErrorNotice message={error} />}
    {action && actionAllowed ? <div className="space-y-4 border-t border-border pt-4"><h3 className="font-semibold">¿Confirmas {actionLabels[action]} esta solicitud?</h3><p className="text-sm text-muted-foreground">La decisión quedará registrada y no podrá modificarse desde este módulo.</p>{action !== 'cancel' && <div><label htmlFor="review-note" className="mb-2 block text-sm font-medium">Observación administrativa (opcional)</label><textarea id="review-note" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} rows={3} className="w-full rounded-md border border-input bg-white p-3 text-sm" /></div>}<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setAction(null)}>Volver</Button><Button variant={action === 'approve' ? 'default' : 'destructive'} disabled={busy} onClick={decide}>{busy ? 'Guardando…' : `Confirmar ${actionLabels[action]}`}</Button></div></div> : <div className="flex flex-wrap justify-end gap-3">{leave.can_cancel && <Button variant="outline" onClick={() => setAction('cancel')}>Cancelar solicitud</Button>}{leave.can_review && <><Button variant="outline" onClick={() => setAction('reject')}>Rechazar</Button><Button onClick={() => setAction('approve')}>Aprobar</Button></>}</div>}
  </div>;
}
