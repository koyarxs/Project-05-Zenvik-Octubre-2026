'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/http';
import { leaveSchema, leaveTypes, type LeaveInput } from '@/lib/leave';
import { todayInSantiago } from '@/lib/shift-time';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ErrorNotice } from '../feedback';

export function LeaveForm({ businessId, onSaved, onClose }: { businessId: string; onSaved: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LeaveInput>({ resolver: zodResolver(leaveSchema), defaultValues: { request_type: 'PERSONAL', start_date: todayInSantiago(), end_date: todayInSantiago(), reason: '' } });
  async function submit(values: LeaveInput) {
    setError(null);
    try { await api(`/api/v1/businesses/${businessId}/leave-requests/`, { method: 'POST', body: values }); onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos enviar la solicitud.'); }
  }
  return <form onSubmit={handleSubmit(submit)} className="space-y-5" noValidate>
    <p className="text-sm text-muted-foreground">Se enviará para tu ficha de trabajador en este negocio. Las fechas incluyen ambos días completos, según el calendario de Santiago.</p>
    {error && <ErrorNotice message={error} />}
    <div><label className="mb-2 block text-sm font-medium" htmlFor="leave-type">Tipo de solicitud</label><select id="leave-type" {...register('request_type')} className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm">{Object.entries(leaveTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="grid gap-4 sm:grid-cols-2">{(['start_date', 'end_date'] as const).map((field, index) => <div key={field}><label className="mb-2 block text-sm font-medium" htmlFor={`leave-${field}`}>{index === 0 ? 'Fecha inicial' : 'Fecha final'}</label><Input id={`leave-${field}`} type="date" {...register(field)} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} />{errors[field] && <p id={`${field}-error`} role="alert" className="mt-2 text-sm text-red-700">{errors[field]?.message}</p>}</div>)}</div>
    <div><label className="mb-2 block text-sm font-medium" htmlFor="leave-reason">Motivo (opcional)</label><textarea id="leave-reason" rows={3} maxLength={1000} {...register('reason')} className="w-full rounded-md border border-input bg-white p-3 text-sm" aria-describedby="reason-help" /><p id="reason-help" className="mt-1 text-xs text-muted-foreground">Hasta 1000 caracteres. Evita incluir información médica o personal que no sea necesaria.</p>{errors.reason && <p role="alert" className="text-sm text-red-700">{errors.reason.message}</p>}</div>
    <p className="text-xs text-muted-foreground">Estas categorías son operativas; no calculan vacaciones ni derechos laborales.</p>
    <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>Volver</Button><Button disabled={isSubmitting}>{isSubmitting ? 'Enviando…' : 'Enviar solicitud'}</Button></div>
  </form>;
}
