'use client';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/http';
import { localDateTime, localToInstant, occurrenceFor, offsetLabel, possibleInstants } from '@/lib/shift-time';
import type { Employee, Shift } from '@/lib/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ErrorNotice, Field } from '../feedback';

const schema = z.object({ employee: z.string().min(1, 'Selecciona un trabajador.'), start: z.string().min(1, 'Indica el inicio.'), end: z.string().min(1, 'Indica el término.'), startOccurrence: z.string(), endOccurrence: z.string() });
type Values = z.infer<typeof schema>;
const selectClass = 'h-11 w-full rounded-lg border border-input bg-white px-3 text-sm';

export function ShiftForm({ businessId, employees, date, shift, template, onSaved, onClose }: { businessId: string; employees: Employee[]; date: string; shift?: Shift; template?: Shift; onSaved: () => void; onClose: () => void }) {
  const source = shift ?? template;
  const [breakMinutes, setBreakMinutes] = useState(source?.break_minutes ?? 0);
  const [included, setIncluded] = useState(source?.break_included ?? true);
  const [notes, setNotes] = useState(source?.notes ?? '');
  const [extra, setExtra] = useState<string[]>([]);
  const retry = useRef({ payload: '', id: '' });
  const [error, setError] = useState<string | null>(null);
  const { register, control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema), defaultValues: {
      employee: source?.employee ?? '', start: source ? localDateTime(source.starts_at) : `${date}T09:00`,
      end: source ? localDateTime(source.ends_at) : `${date}T17:00`,
      startOccurrence: source ? occurrenceFor(source.starts_at) : '', endOccurrence: source ? occurrenceFor(source.ends_at) : '',
    },
  });
  const [start, end] = useWatch({ control, name: ['start', 'end'] });
  const startOptions = possibleInstants(start); const endOptions = possibleInstants(end);
  async function submit(values: Values) {
    setError(null);
    try {
      const starts_at = localToInstant(values.start, values.startOccurrence);
      const ends_at = localToInstant(values.end, values.endOccurrence);
      if (Date.parse(ends_at) <= Date.parse(starts_at)) throw new Error('El término debe ser posterior al inicio. Para un turno nocturno, selecciona el día siguiente.');
      const row = { employee: values.employee, starts_at, ends_at, break_minutes: breakMinutes, break_included: included, notes };
      const people = [...new Set([values.employee, ...extra])];
      const rows = people.map(employee => ({ ...row, employee }));
      const payload = JSON.stringify(rows);
      if (retry.current.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
      await api(`/api/v1/businesses/${businessId}/shifts/${shift ? shift.id + '/' : people.length > 1 ? 'batch/' : ''}`, { method: shift ? 'PATCH' : 'POST', body: shift ? { ...row, expected_updated_at: shift.updated_at } : people.length > 1 ? { request_id: retry.current.id, shifts: rows } : { ...row, request_id: retry.current.id } });
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar el turno.'); }
  }
  return <form onSubmit={event => { void handleSubmit(submit)(event); }} className="space-y-5" noValidate>
    {error && <ErrorNotice message={error} />}
    <Field id="shift-employee" label="Trabajador" error={errors.employee?.message}>
      <select id="shift-employee" {...register('employee')} className={selectClass} aria-invalid={!!errors.employee}><option value="">Seleccionar trabajador</option>{employees.map(e => <option key={e.id} value={e.id} disabled={!e.is_active}>{e.first_name} {e.last_name}{!e.is_active ? ' · Inactivo' : ''}</option>)}</select>
    </Field>
    <Field id="shift-start" label="Inicio del turno" error={errors.start?.message}><Input id="shift-start" type="datetime-local" {...register('start')} aria-invalid={!!errors.start} /></Field>
    {startOptions.length > 1 && <Field id="start-occurrence" label="Esta hora de inicio se repite. ¿Cuál corresponde?"><select id="start-occurrence" className={selectClass} {...register('startOccurrence')}><option value="">Seleccionar horario</option><option value="earlier">Primera ocurrencia · {offsetLabel(startOptions[0])}</option><option value="later">Segunda ocurrencia · {offsetLabel(startOptions[1])}</option></select></Field>}
    <Field id="shift-end" label="Término del turno" error={errors.end?.message} hint="Para un turno nocturno, elige la fecha del día siguiente."><Input id="shift-end" type="datetime-local" {...register('end')} aria-invalid={!!errors.end} aria-describedby="shift-end-hint" /></Field>
    {endOptions.length > 1 && <Field id="end-occurrence" label="Esta hora de término se repite. ¿Cuál corresponde?"><select id="end-occurrence" className={selectClass} {...register('endOccurrence')}><option value="">Seleccionar horario</option><option value="earlier">Primera ocurrencia · {offsetLabel(endOptions[0])}</option><option value="later">Segunda ocurrencia · {offsetLabel(endOptions[1])}</option></select></Field>}
    {!shift && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer text-sm font-medium">Asignar también a otros trabajadores</summary><p className="my-2 text-xs text-muted-foreground">Se guardan todos juntos; si existe un conflicto, no se crea ninguno.</p><div className="max-h-40 space-y-2 overflow-auto">{employees.filter(person => person.is_active).map(person => <label key={person.id} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={extra.includes(person.id)} onChange={event => setExtra(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} />{person.first_name} {person.last_name}</label>)}</div></details>}
    <Field id="shift-break" label="Colación o descanso (minutos)"><Input id="shift-break" type="number" min="0" step="1" value={breakMinutes} onChange={event => setBreakMinutes(Number(event.target.value))} /></Field>
    <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={included} onChange={event => setIncluded(event.target.checked)} />Incluir la colación en el tiempo programado</label>
    <p className="text-xs text-muted-foreground">{included ? 'La colación no se descuenta del tiempo programado.' : 'La colación se descuenta del tiempo programado.'} Esta elección representa la regla aplicable al turno.</p>
    <Field id="shift-notes" label="Observaciones (opcional)"><textarea id="shift-notes" maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} className="min-h-20 w-full rounded-lg border border-input p-3 text-sm" /></Field>
    <p className="rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground">Horarios de Santiago de Chile (America/Santiago), independientemente de la zona horaria de tu dispositivo.</p>
    <div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Volver</Button><Button disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : shift ? 'Guardar cambios' : 'Crear turno'}</Button></div>
  </form>;
}
