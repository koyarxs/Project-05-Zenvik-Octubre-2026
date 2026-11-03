 'use client';
import { useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { api } from '@/lib/http';
import { addDays, dateLabel, weekStart } from '@/lib/shift-time';
import { copyWeekRows } from '@/lib/planning';
import type { Shift } from '@/lib/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog } from '../ui/dialog';
import { ErrorNotice, Field, Loading } from '../feedback';
type Settings = { planning_max_minutes: number | null; planning_block_leave: boolean; planning_timezone: string };
export function PlanningTools({ businessId, week, shifts, onSaved }: { businessId: string; week: string; shifts: Shift[]; onSaved: () => void }) {
  const settings = useResource<Settings>(`/api/v1/businesses/${businessId}/planning-settings/`);
  const [panel, setPanel] = useState<'copy' | 'settings' | null>(null);
  const [destination, setDestination] = useState(addDays(week, 7));
  const [limit, setLimit] = useState(''); const [block, setBlock] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const retry = useRef({ payload: '', id: '' });
  const count = shifts.filter(shift => shift.status === 'SCHEDULED').length;
  async function save() {
    setBusy(true); setError('');
    try {
      if (panel === 'settings') {
        await api(`/api/v1/businesses/${businessId}/planning-settings/`, { method: 'PATCH', body: { planning_max_minutes: limit === '' ? null : Number(limit), planning_block_leave: block } });
        settings.retry();
      } else {
        if (!destination || weekStart(destination) === week) throw new Error('Selecciona una semana de destino diferente.');
        const rows = copyWeekRows(shifts, week, weekStart(destination));
        if (!rows.length) throw new Error('No hay turnos programados que comiencen en la semana seleccionada.');
        if (rows.length > 100) throw new Error('Puedes copiar hasta 100 turnos por operación. Filtra por trabajador.');
        const payload = JSON.stringify(rows);
        if (retry.current.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
        await api(`/api/v1/businesses/${businessId}/shifts/batch/`, { method: 'POST', body: { request_id: retry.current.id, shifts: rows } });
      }
      setPanel(null); onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar la planificación.'); } finally { setBusy(false); }
  }
  return <><div className="mb-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={!count} onClick={() => { setError(''); setDestination(addDays(week, 7)); setPanel('copy'); }}>Copiar semana</Button><Button variant="outline" size="sm" disabled={!settings.data} onClick={() => { setError(''); setLimit(settings.data?.planning_max_minutes?.toString() ?? ''); setBlock(settings.data?.planning_block_leave ?? true); setPanel('settings'); }}>Reglas de planificación</Button></div>{settings.error && <ErrorNotice message={settings.error.message} retry={settings.retry} />}
    <Dialog open={panel !== null} onOpenChange={open => { if (!open && !busy) setPanel(null); }} title={panel === 'copy' ? 'Copiar planificación semanal' : 'Reglas del negocio'} description="Los cambios se aplican únicamente al negocio actual.">
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>{error && <ErrorNotice message={error} />}
        {panel === 'copy' ? <><p className="text-sm leading-6">Origen: {dateLabel(week)}. Se copian los turnos programados que comienzan en esta semana, respetando el filtro de trabajador. Se mantienen las horas locales, la colación y las observaciones.</p><Field id="copy-week" label="Semana de destino"><Input id="copy-week" required type="date" value={destination} onChange={event => setDestination(event.target.value)} /></Field><p className="text-xs text-muted-foreground">Si hay conflictos, no se crea ningún turno. Las horas ambiguas por cambio de horario deben planificarse individualmente.</p></> : <><Field id="planning-limit" label="Duración máxima por turno (minutos)" hint="Déjalo vacío para no imponer un límite. Se valida la duración total, incluida la colación."><Input id="planning-limit" type="number" min="1" max="44640" step="1" value={limit} onChange={event => setLimit(event.target.value)} /></Field><label className="flex gap-3 text-sm"><input type="checkbox" checked={block} onChange={event => setBlock(event.target.checked)} />Bloquear nuevas asignaciones que coincidan con permisos aprobados</label><p className="text-xs leading-6 text-muted-foreground">Al desactivar el bloqueo, el calendario muestra una advertencia. Los turnos existentes y las decisiones de permisos se conservan. Zona del negocio: America/Santiago. Estas reglas no certifican cumplimiento legal.</p></>}
        <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={busy} onClick={() => setPanel(null)}>Volver</Button><Button disabled={busy}>{busy ? 'Guardando…' : panel === 'copy' ? 'Confirmar copia' : 'Guardar reglas'}</Button></div>
      </form>
    </Dialog></>;
}
type Revision = { id: string; action: string; actor_name: string | null; created_at: string; snapshot: Record<string, string> };
export function ShiftHistory({ businessId, shiftId }: { businessId: string; shiftId: string }) {
  const history = usePagedResource<Revision>(`/api/v1/businesses/${businessId}/shifts/${shiftId}/history/`);
  return <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Historial del turno</summary>{history.error ? <ErrorNotice message={history.error.message} retry={history.reload} /> : !history.data ? <Loading label="Cargando historial…" /> : <ol className="mt-3 max-h-64 space-y-3 overflow-auto">{history.data.map(row => <li key={row.id} className="border-t border-border pt-3 text-xs"><strong>{{ CREATE: 'Creación', UPDATE: 'Modificación', CANCEL: 'Cancelación', BASELINE: 'Registro previo' }[row.action] ?? row.action}</strong><p>{new Date(row.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p><p>{row.actor_name ?? 'Sin autor registrado'} · {row.snapshot.employee_name ?? 'Trabajador registrado'}</p><p>{new Date(row.snapshot.starts_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })} → {new Date(row.snapshot.ends_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p><p>Colación: {row.snapshot.break_minutes} min · {row.snapshot.break_included === 'True' ? 'Incluida' : 'Descontada'}</p>{row.snapshot.notes && <p className="break-words">{row.snapshot.notes}</p>}</li>)}</ol>}</details>;
}
