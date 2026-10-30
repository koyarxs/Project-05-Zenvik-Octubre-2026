'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Building2, Check, ShieldCheck } from 'lucide-react';
import { businessSchema, type BusinessInput } from '@/lib/schemas';
import { api } from '@/lib/http';
import type { Business } from '@/lib/types';
import { useWorkspace } from '@/components/workspace-provider';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorNotice, Field } from '@/components/feedback';
export default function Page() {
  const router = useRouter(); const { refresh } = useWorkspace(); const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<BusinessInput>({ resolver: zodResolver(businessSchema), defaultValues: { name: '', rut: '' } });
  async function submit(data: BusinessInput) { setError(null); try { const business = await api<Business>('/api/v1/businesses/', { method: 'POST', body: data }); await refresh(); router.push(`/app/${business.id}?creado=1`); } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos crear el negocio.'); } }
  return <><Link href="/app" className="text-link mb-5"><ArrowLeft className="size-3.5" />Volver a mis negocios</Link><PageHeading eyebrow="ORGANIZACIÓN / NUEVO NEGOCIO" title="Un nuevo espacio para tu equipo" description="Comienza con lo esencial. La organización de tu negocio sigue desde aquí." /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><form onSubmit={handleSubmit(submit)} className="surface overflow-hidden" noValidate><div className="section-header"><div className="flex items-center gap-3"><span className="avatar"><Building2 className="size-4" /></span><div><h2 className="text-sm font-bold">Identidad del negocio</h2><p className="mt-1 text-[11px] text-muted-foreground">Nombre e identificación opcional.</p></div></div></div><div className="space-y-6 p-6 sm:p-8">{error && <ErrorNotice message={error} />}<Field id="name" label="Nombre comercial" error={errors.name?.message}><Input id="name" {...register('name')} placeholder="El nombre de tu negocio" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} /></Field><Field id="rut" label="RUT del negocio (opcional)" error={errors.rut?.message} hint="Puedes agregarlo con o sin puntos. Si lo informas, debe ser válido."><Input id="rut" {...register('rut')} aria-invalid={!!errors.rut} aria-describedby={errors.rut ? 'rut-error rut-hint' : 'rut-hint'} /></Field><p className="flex items-start gap-3 rounded-xl border border-[#cfe5df] bg-[#f0f8f5] p-4 text-xs leading-6 text-[#35675b]"><ShieldCheck className="mt-1 size-4 shrink-0" />Tu cuenta quedará como propietaria de este negocio.</p></div><div className="flex flex-wrap justify-end gap-3 border-t border-border bg-[#fafbfd] px-6 py-5"><Button variant="outline" asChild><Link href="/app">Cancelar</Link></Button><Button disabled={isSubmitting}>{isSubmitting ? 'Registrando…' : 'Registrar negocio'}</Button></div></form><aside className="self-start rounded-2xl bg-[#203b52] p-7 text-white"><p className="eyebrow text-[#8bdbcf]">DESPUÉS DE ESTE PASO</p><h2 className="mt-4 text-xl leading-7 font-extrabold tracking-tight">Dale forma a una mejor semana.</h2><div className="mt-6 space-y-5">{['Registra a las personas de tu equipo.', 'Planifica los primeros turnos.', 'Centraliza las solicitudes y decisiones.'].map(text => <div key={text} className="flex gap-3 text-xs leading-6 text-[#c1d1df]"><Check className="mt-1 size-3.5 shrink-0 text-[#6dd5bd]" />{text}</div>)}</div></aside></div></>;
}
