'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, History, SlidersHorizontal } from 'lucide-react';
import { useResource } from '@/hooks/use-resource';
import { attendanceRequest } from '@/lib/personal-attendance';
import { attendanceTime, eventLabels, geoLabels, stateLabels, type AttendanceSession, type Receipt } from '@/lib/attendance';
import type { Page } from '@/lib/types';
import { usePersonalBusiness } from './personal-attendance-shell';
import { ErrorNotice, Field, Loading } from './feedback';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
import { Input } from './ui/input';

export function ReceiptDialog({ receipt, close }: { receipt: Receipt | null; close: () => void }) {
  function download() {
    if (!receipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `comprobante-${receipt.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Dialog open={!!receipt} onOpenChange={open => { if (!open) close(); }} title="Comprobante de marcación" description="Registro persistido y confirmado por el servidor.">{receipt && <div className="attendance-receipt"><p className="attendance-receipt__confirmed"><CheckCircle2 aria-hidden="true" />Marcación confirmada</p><dl>{[
    ['Marcación', eventLabels[receipt.event_type]], ['Trabajador', receipt.employee_name], ['Negocio', receipt.business_name],
    ['Hora del servidor', attendanceTime(receipt.recorded_at, receipt.timezone_name)], ['Zona horaria', receipt.timezone_name ?? 'America/Santiago'],
    ['Identificador', receipt.id], ['Jornada', receipt.session], ['Ubicación', geoLabels[receipt.geo_result] ?? receipt.geo_result],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{receipt.exception_reason && <p className="attendance-receipt__note">Incidencia declarada: {receipt.exception_reason}</p>}<p className="attendance-receipt__note">Este comprobante conserva la captura original. Una regularización posterior se consulta por separado en Mis incidencias.</p><Button variant="outline" className="w-full min-h-12" onClick={download}><Download />Descargar comprobante JSON</Button></div>}</Dialog>;
}

export function AttendanceTimeline({ events, openReceipt, zone }: { events: Receipt[]; openReceipt: (id: string) => void; zone?: string }) {
  return events.length ? <ol className="attendance-timeline">{events.map(event => <li key={event.id}><span className="attendance-timeline__dot" aria-hidden="true"><CheckCircle2 /></span><div><h3>{eventLabels[event.event_type]}</h3><p>{attendanceTime(event.recorded_at, event.timezone_name ?? zone)}</p><small>{geoLabels[event.geo_result] ?? event.geo_result}</small></div><Button variant="ghost" className="attendance-receipt-button" aria-label={`Ver comprobante de ${eventLabels[event.event_type]}`} onClick={() => openReceipt(event.id)}><FileCheck2 aria-hidden="true" /><span>Comprobante</span></Button></li>)}</ol> : <div className="attendance-inline-empty"><History aria-hidden="true" /><p>Todavía no hay marcaciones en esta jornada.</p><small>Cuando el servidor confirme una marcación, aparecerá aquí.</small></div>;
}

export function usePersonalReceipt(businessId: string) {
  const [receipt, setReceipt] = useState<Receipt | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const lifecycle = useRef({ alive: true, version: 0 });
  useEffect(() => { const scope = { alive: true, version: 0 }; lifecycle.current = scope; return () => { scope.alive = false; }; }, [businessId]);
  async function open(id: string) {
    const scope = lifecycle.current; const request = ++scope.version; setBusy(true); setError('');
    try { const value = await attendanceRequest<Receipt>(`/api/v1/businesses/${businessId}/attendance/receipts/${id}/`, {}, 8000); if (scope.alive && request === scope.version) setReceipt(value); }
    catch (failure) { if (scope.alive && request === scope.version) setError(failure instanceof Error ? failure.message : 'No pudimos consultar el comprobante.'); }
    finally { if (scope.alive && request === scope.version) setBusy(false); }
  }
  return { receipt, error, busy, open, close: () => { lifecycle.current.version++; setReceipt(null); setBusy(false); } };
}

export function PersonalAttendanceHistory() {
  const business = usePersonalBusiness();
  const [draft, setDraft] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState({ from: '', to: '', page: 1 });
  const params = new URLSearchParams({ page: String(filters.page) });
  if (filters.from) params.set('date_from', filters.from); if (filters.to) params.set('date_to', filters.to);
  const history = useResource<Page<AttendanceSession>>(`/api/v1/businesses/${business.id}/attendance/history/?${params}`);
  const receipt = usePersonalReceipt(business.id);
  const invalid = !!(draft.from && draft.to && draft.from > draft.to);
  return <><header className="attendance-page-heading"><p className="attendance-kicker">REGISTROS Y COMPROBANTES</p><h1>Mi historial</h1><p>Tus jornadas, en orden. Cada hora corresponde a una captura confirmada por el servidor.</p></header>
    <form className="attendance-card attendance-history-filters" onSubmit={event => { event.preventDefault(); if (!invalid) setFilters({ ...draft, page: 1 }); }}><div className="attendance-filter-title"><SlidersHorizontal aria-hidden="true" /><h2>Buscar por fecha laboral</h2></div><Field id="personal-history-from" label="Desde"><Input id="personal-history-from" type="date" value={draft.from} max={draft.to || undefined} onChange={event => setDraft({ ...draft, from: event.target.value })} /></Field><Field id="personal-history-to" label="Hasta"><Input id="personal-history-to" type="date" value={draft.to} min={draft.from || undefined} onChange={event => setDraft({ ...draft, to: event.target.value })} /></Field><div className="attendance-filter-actions"><Button disabled={invalid}>Aplicar fechas</Button><Button type="button" variant="ghost" onClick={() => { setDraft({ from: '', to: '' }); setFilters({ from: '', to: '', page: 1 }); }}>Limpiar filtros</Button></div>{invalid && <p role="alert">La fecha final debe ser igual o posterior a la inicial.</p>}</form>
    {receipt.error && <ErrorNotice message={receipt.error} />}{receipt.busy && <p role="status">Consultando comprobante…</p>}
    {history.error ? <ErrorNotice message={history.error.message} retry={history.retry} /> : !history.data ? <Loading label="Consultando tu historial…" /> : <>
      <div className="attendance-history-summary"><p>{history.data.count} {history.data.count === 1 ? 'jornada registrada' : 'jornadas registradas'}</p><Button variant="ghost" onClick={history.retry}>Actualizar historial</Button></div>
      {!history.data.results.length && <div className="attendance-card attendance-empty"><History aria-hidden="true" /><h2>No hay jornadas para estas fechas</h2><p>Prueba otro período o vuelve a Mi jornada para registrar tu asistencia.</p><Button asChild variant="outline"><Link href={`/asistencia/${business.id}`}>Ir a Mi jornada</Link></Button></div>}
      {history.data.results.map((session, index) => <details key={session.id} className="attendance-card attendance-history-day" open={index === 0}><summary><div><span className="attendance-kicker">FECHA LABORAL</span><h2>{session.work_date}</h2></div><span className="attendance-state">{stateLabels[session.state]}</span></summary><div className="attendance-history-day__content"><p className="attendance-subtle">{session.timezone_name} · La jornada conserva su fecha laboral aunque cruce medianoche.</p><AttendanceTimeline events={session.events} zone={session.timezone_name} openReceipt={id => void receipt.open(id)} /><div className="attendance-history-links"><Link href={`/asistencia/${business.id}/incidencias?session=${session.id}&fecha=${session.work_date}`}>Consultar incidencias</Link><Link href={`/asistencia/${business.id}/incidencias?nueva=1&session=${session.id}&fecha=${session.work_date}`}>Informar un problema de esta jornada</Link></div></div></details>)}
      <div className="attendance-pager"><Button variant="outline" disabled={!history.data.previous} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>Anterior</Button><span>Página {filters.page}</span><Button variant="outline" disabled={!history.data.next} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>Siguiente</Button></div>
    </>}
    <ReceiptDialog receipt={receipt.receipt} close={receipt.close} />
  </>;
}
