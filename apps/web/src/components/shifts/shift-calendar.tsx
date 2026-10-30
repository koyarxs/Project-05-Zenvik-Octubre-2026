'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Columns3, List, Moon, Plus, Users } from 'lucide-react';
import { usePagedResource } from '@/hooks/use-paged-resource';
import { canManage, type Business, type Employee, type Shift } from '@/lib/types';
import { addDays, dateLabel, dayBoundary, localDateTime, shiftTimeLabel, todayInSantiago, weekStart } from '@/lib/shift-time';
import { api } from '@/lib/http';
import { cn } from '@/lib/utils';
import { PageHeading } from '../page-heading';
import { Button } from '../ui/button';
import { StatusBadge } from '../ui/status-badge';
import { Dialog } from '../ui/dialog';
import { ErrorNotice, Loading, SuccessNotice } from '../feedback';
import { EmptyState } from '../empty-state';
import { ShiftForm } from './shift-form';
type Panel = { kind: 'create'; date: string } | { kind: 'details' | 'edit' | 'cancel'; shift: Shift } | null;
const statusLabel = (shift: Shift) => shift.status === 'CANCELLED' ? 'Cancelado' : 'Programado';
function calendarDate(value: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : todayInSantiago(); }
function ShiftBlock({ shift, date, onClick }: { shift: Shift; date: string; onClick: () => void }) {
  const night = localDateTime(shift.starts_at).slice(0, 10) !== localDateTime(shift.ends_at).slice(0, 10);
  const cancelled = shift.status === 'CANCELLED';
  return <button type="button" onClick={onClick} className={cn('group w-full rounded-xl border border-[#cee7e3] bg-[#eef8f5] p-3 text-left transition hover:border-[#65b6a6] hover:bg-[#e5f4ef]', cancelled && 'border-[#e4e8ed] bg-[#f4f6f8] text-muted-foreground hover:border-[#c7d0d9] hover:bg-[#eef1f4]')} aria-label={`${shift.employee_name}, ${shiftTimeLabel(shift.starts_at, shift.ends_at)}, ${statusLabel(shift)}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><span className={cn('grid size-6 place-items-center rounded-lg bg-[#d3eee5] text-[8px] font-bold text-[#23675b]', cancelled && 'bg-[#e3e9ef] text-[#65768a]')}>{shift.employee_name.split(' ').filter(Boolean).map(name => name[0]).slice(0, 2).join('')}</span>{night && <Moon className="size-3 text-[#4a7c76]" aria-label="Turno nocturno" />}</div>
    <span className="block break-words text-[11px] leading-5 font-bold">{shift.employee_name}</span><span className={cn('mt-2 block text-[10px] leading-5 font-medium tabular-nums', cancelled && 'line-through')}>{shiftTimeLabel(shift.starts_at, shift.ends_at)}</span>
    {localDateTime(shift.starts_at).slice(0, 10) !== date && <span className="mt-1 block text-[9px] leading-4 text-muted-foreground">Continúa desde {dateLabel(localDateTime(shift.starts_at).slice(0, 10))}</span>}
    <span className="mt-3 inline-block text-[9px] font-medium">{cancelled ? 'Cancelado' : '● Programado'}</span>
  </button>;
}
export function ShiftCalendar({ business }: { business: Business }) {
  const query = useSearchParams(); const initialDate = calendarDate(query.get('fecha'));
  const manager = canManage(business.role);
  const [week, setWeek] = useState(() => weekStart(initialDate));
  const [employee, setEmployee] = useState(() => /^[a-f0-9-]{36}$/.test(query.get('trabajador') ?? '') ? query.get('trabajador')! : '');
  const [view, setView] = useState<'week' | 'agenda'>('week'); const [showCancelled, setShowCancelled] = useState(true);
  const [panel, setPanel] = useState<Panel>(() => query.get('nuevo') === '1' && manager ? { kind: 'create', date: initialDate } : null);
  const [notice, setNotice] = useState(''); const [cancelError, setCancelError] = useState<string | null>(null); const [cancelling, setCancelling] = useState(false);
  const shifts = usePagedResource<Shift>(`/api/v1/businesses/${business.id}/shifts/?date_from=${week}&date_to=${addDays(week, 7)}${employee ? `&employee=${employee}` : ''}`);
  const employees = usePagedResource<Employee>(`/api/v1/businesses/${business.id}/employees/`);
  const days = Array.from({ length: 7 }, (_, index) => { const date = addDays(week, index); return { date, start: dayBoundary(date), end: dayBoundary(addDays(date, 1)) }; });
  function navigate(date: string) { if (!date) return; setWeek(weekStart(date)); setNotice(''); setPanel(null); }
  function saved() { setPanel(null); setNotice('Turno guardado correctamente.'); shifts.reload(); }
  async function cancel() {
    if (!panel || panel.kind !== 'cancel') return;
    setCancelling(true); setCancelError(null);
    try { await api(`/api/v1/businesses/${business.id}/shifts/${panel.shift.id}/`, { method: 'DELETE' }); setPanel(null); setNotice('Turno cancelado. El registro se conserva en el calendario.'); shifts.reload(); }
    catch (error) { setCancelError(error instanceof Error ? error.message : 'No pudimos cancelar el turno.'); } finally { setCancelling(false); }
  }
  const currentShift = panel && panel.kind !== 'create' ? panel.shift : undefined;
  const panelTitle = panel?.kind === 'create' ? 'Nuevo turno' : panel?.kind === 'edit' ? 'Editar turno' : panel?.kind === 'cancel' ? '¿Cancelar este turno?' : 'Detalle del turno';
  return <>
    <PageHeading eyebrow="PLANIFICACIÓN / CALENDARIO" title={manager ? 'Planificación de turnos' : 'Mis turnos'} description={manager ? 'Una semana bien organizada empieza con una visión clara de tu equipo.' : 'Tu semana de trabajo, sin perder de vista lo que viene.'} action={manager && <Button onClick={() => setPanel({ kind: 'create', date: week === weekStart(todayInSantiago()) ? todayInSantiago() : week })}><Plus />Crear turno</Button>} />
    {notice && <SuccessNotice>{notice}</SuccessNotice>}
    <section className="surface mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4"><div className="flex flex-wrap items-center gap-3"><div className="flex gap-1"><Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => navigate(addDays(week, -7))}><ChevronLeft /></Button><Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => navigate(addDays(week, 7))}><ChevronRight /></Button></div><div className="min-w-0"><h2 className="font-display text-[14px] font-bold tracking-tight" data-testid="week-heading">{dateLabel(week)} — {dateLabel(addDays(week, 6), { day: 'numeric', month: 'short', year: 'numeric' })}</h2><p className="mt-1 text-[10px] text-muted-foreground">Lunes a domingo · hora de Santiago</p></div><Button variant="outline" size="sm" onClick={() => navigate(todayInSantiago())}>Hoy</Button></div><div className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Vista del calendario"><button className={cn('flex min-h-9 items-center gap-2 rounded-md px-3 text-[11px] font-semibold', view === 'week' && 'bg-white shadow-xs')} onClick={() => setView('week')} aria-pressed={view === 'week'}><Columns3 className="size-3.5" />Semana</button><button className={cn('flex min-h-9 items-center gap-2 rounded-md px-3 text-[11px] font-semibold', view === 'agenda' && 'bg-white shadow-xs')} onClick={() => setView('agenda')} aria-pressed={view === 'agenda'}><List className="size-3.5" />Agenda</button></div></div>
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4"><div className="flex w-full flex-wrap gap-3 sm:w-auto"><div className="min-w-0 flex-1 sm:w-44"><label htmlFor="calendar-week" className="mb-2 block text-[10px] font-semibold text-muted-foreground">Semana que incluye</label><input id="calendar-week" type="date" value={week} onChange={e => navigate(e.target.value)} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-xs" /></div>{manager && <div className="min-w-0 flex-1 sm:w-52"><label htmlFor="calendar-employee" className="mb-2 block text-[10px] font-semibold text-muted-foreground">Trabajador</label><select id="calendar-employee" className="h-10 w-full rounded-lg border border-input bg-white px-3 text-xs" value={employee} onChange={e => setEmployee(e.target.value)}><option value="">Todo el equipo</option>{employees.data?.map(person => <option key={person.id} value={person.id}>{person.first_name} {person.last_name}{!person.is_active ? ' · Inactivo' : ''}</option>)}</select></div>}</div><label className="flex min-h-10 items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="size-4 accent-primary" />Mostrar cancelados</label></div>
    </section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-2"><Clock3 className="size-3.5" />America/Santiago · los turnos nocturnos aparecen en ambos días</span><span className="font-semibold">{shifts.data ? `${shifts.data.filter(shift => shift.status === 'SCHEDULED').length} turnos programados en este intervalo` : 'Consultando semana…'}</span></div>
    {employees.error && <ErrorNotice message="No pudimos cargar el listado de trabajadores." retry={employees.reload} />}
    {shifts.error ? <ErrorNotice message={shifts.error.message} retry={shifts.reload} /> : !shifts.data ? <Loading label="Cargando turnos de la semana…" /> : <>
      {shifts.data.length === 0 && <div className="surface mb-5"><EmptyState compact icon={CalendarDays} title={manager ? 'Una semana por organizar' : 'No tienes turnos en esta semana'} description={manager ? 'Crea el primer turno para dar forma a la semana de tu equipo.' : 'Consulta otras semanas o revisa la planificación con la administración.'} /></div>}
      <div className={view === 'week' ? 'calendar-columns overflow-hidden rounded-2xl border border-border bg-white max-xl:border-0' : 'space-y-3'} aria-label="Calendario semanal">
        {days.map(day => {
          const entries = shifts.data!.filter(shift => Date.parse(shift.starts_at) < day.end && Date.parse(shift.ends_at) > day.start && (showCancelled || shift.status !== 'CANCELLED'));
          const today = day.date === todayInSantiago();
          return <section key={day.date} aria-label={dateLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} className={view === 'week' ? 'calendar-day xl:min-h-[390px]' : 'surface overflow-hidden'}>
            <div className={cn('flex items-center justify-between gap-2 border-b border-border px-3 py-4', today ? 'bg-[#eff8f5]' : 'bg-[#fafbfd]')}><div className="flex items-center gap-2.5"><span className={cn('grid size-9 place-items-center rounded-xl font-display text-lg font-extrabold', today ? 'bg-primary text-white' : 'text-[#41576e]')}>{day.date.slice(8)}</span><div><h3 className="text-[10px] font-semibold text-muted-foreground capitalize">{dateLabel(day.date, { weekday: 'short' })}</h3>{today && <span className="mt-1 block text-[8px] font-bold text-primary">HOY</span>}</div></div>{manager && <button className="grid size-9 place-items-center rounded-lg text-[#5f7b85] transition hover:bg-[#dceee8] hover:text-primary" aria-label={`Crear turno el ${day.date}`} onClick={() => setPanel({ kind: 'create', date: day.date })}><Plus className="size-3.5" /></button>}</div>
            <div className={cn('space-y-2 p-2.5', view === 'agenda' && 'sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0 lg:grid-cols-3')}>{entries.map(shift => <ShiftBlock key={shift.id} shift={shift} date={day.date} onClick={() => setPanel({ kind: 'details', shift })} />)}{entries.length === 0 && <div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#e6ecf2] text-[#8494a5]"><span aria-hidden="true" className="h-px w-4 bg-[#c9d3de]" /><p className="text-[10px]">Sin turnos</p></div>}</div>
          </section>;
        })}
      </div>
    </>}
    <Dialog open={panel !== null} onOpenChange={open => { if (!open && !cancelling) setPanel(null); }} title={panelTitle} description={panel?.kind === 'cancel' ? 'El registro se conservará como cancelado y no podrá reactivarse.' : 'Fechas y horarios expresados en America/Santiago.'}>
      {(panel?.kind === 'create' || panel?.kind === 'edit') && (employees.data ? employees.data.some(person => person.is_active) ? <ShiftForm key={panel.kind === 'create' ? panel.date : panel.shift.id} businessId={business.id} employees={employees.data} date={panel.kind === 'create' ? panel.date : week} shift={panel.kind === 'edit' ? panel.shift : undefined} onSaved={saved} onClose={() => setPanel(null)} /> : <EmptyState icon={Users} title="Primero, una persona para el turno" description="Necesitas al menos un trabajador activo para crear turnos." action={<Button asChild><Link href={`/app/${business.id}/trabajadores/nuevo`}>Registrar trabajador</Link></Button>} /> : employees.error ? <ErrorNotice message="No pudimos cargar los trabajadores." retry={employees.reload} /> : <Loading label="Cargando trabajadores…" />)}
      {panel?.kind === 'details' && currentShift && <div className="space-y-6"><div className="flex items-center gap-3"><span className="avatar">{currentShift.employee_name.slice(0, 2).toUpperCase()}</span><div><p className="mb-2 text-sm font-bold">{currentShift.employee_name}</p><StatusBadge tone={currentShift.status === 'CANCELLED' ? 'muted' : 'info'}>{statusLabel(currentShift)}</StatusBadge></div></div><dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-[#f8fafc] p-4">{(['starts_at', 'ends_at'] as const).map((field, index) => <div key={field}><dt className="text-[10px] font-semibold text-muted-foreground">{index === 0 ? 'INICIO' : 'TÉRMINO'}</dt><dd className="mt-2"><span className="block text-xl font-bold tabular-nums">{localDateTime(currentShift[field]).slice(11)}</span><span className="mt-1 block text-[11px] text-muted-foreground">{dateLabel(localDateTime(currentShift[field]).slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}</span></dd></div>)}</dl>{manager && currentShift.status === 'SCHEDULED' && <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-5"><Button variant="outline" className="text-red-700" onClick={() => { setCancelError(null); setPanel({ kind: 'cancel', shift: currentShift }); }}>Cancelar turno</Button><Button onClick={() => setPanel({ kind: 'edit', shift: currentShift })}>Editar turno</Button></div>}</div>}
      {panel?.kind === 'cancel' && currentShift && <div className="space-y-5"><p className="rounded-xl bg-muted p-4 text-sm leading-7"><strong>{currentShift.employee_name}</strong><br />{dateLabel(localDateTime(currentShift.starts_at).slice(0, 10))} · {shiftTimeLabel(currentShift.starts_at, currentShift.ends_at)}</p>{cancelError && <ErrorNotice message={cancelError} />}<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={cancelling} onClick={() => setPanel({ kind: 'details', shift: currentShift })}>Volver</Button><Button variant="destructive" disabled={cancelling} onClick={cancel}>{cancelling ? 'Cancelando…' : 'Confirmar cancelación'}</Button></div></div>}
    </Dialog>
  </>;
}
