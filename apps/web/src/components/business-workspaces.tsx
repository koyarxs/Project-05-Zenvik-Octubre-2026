'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Building2, CalendarDays, ClipboardCheck, Crown, LayoutGrid, List, Plus, ShieldCheck, Users } from 'lucide-react';
import { useWorkspace } from './workspace-provider';
import { Button } from './ui/button';
import { EmptyState } from './empty-state';
import { StatusBadge } from './ui/status-badge';
import { WorkspaceIllustration } from './workspace-illustration';
import { roleLabels, type Business } from '@/lib/types';
import { cn } from '@/lib/utils';

function BusinessCard({ business, list }: { business: Business; list: boolean }) {
  const initials = business.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es');
  const RoleIcon = business.role === 'OWNER' ? Crown : business.role === 'ADMIN' ? ShieldCheck : Users;
  return <Link href={`/app/${business.id}`} aria-label={`Abrir espacio de ${business.name}`} className={cn('business-card group', list && 'business-card--list')}>
    <div className="business-card__cover"><Image src="/images/workspace-cover-v1.png" alt="" fill sizes="(min-width: 1280px) 35vw, (min-width: 768px) 45vw, 100vw" className="object-cover object-center" /><div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0b2830]/20 to-transparent" /><span aria-hidden="true" className="business-card__open"><ArrowUpRight className="size-4" /></span><span aria-hidden="true" className="business-card__avatar">{initials}</span></div>
    <div className="business-card__content"><StatusBadge tone={business.is_active ? 'success' : 'muted'}>{business.is_active ? 'Activo' : 'Inactivo'}</StatusBadge><h3 className="business-card__name">{business.name}</h3><p className="business-card__tax">{business.rut ? `RUT ${business.rut}` : 'RUT no informado'}</p><div className="business-card__footer"><span className="flex items-center gap-2 text-[11px] text-muted-foreground"><RoleIcon className={cn('size-4', business.role === 'OWNER' ? 'text-[#9a7134]' : 'text-[#417f83]')} />{roleLabels[business.role]}</span><span className="flex items-center gap-2 text-[11px] font-semibold text-[#126d70]">Abrir espacio<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" /></span></div></div>
  </Link>;
}

function NewBusinessPanel() {
  return <section className="new-workspace"><div className="new-workspace__main"><div className="relative z-10 max-w-[320px]"><p className="eyebrow mb-2 text-[#427e88]">UN NUEVO COMIENZO</p><h3 className="text-[21px] leading-[1.3] font-semibold tracking-[-.035em]">¿Necesitas un nuevo espacio?</h3><p className="mt-3 max-w-[290px] text-xs leading-6 text-[#527082]">Registra otro negocio y organiza a su equipo en un espacio propio.</p><Button asChild className="workspace-primary mt-5 w-full justify-between"><Link href="/app/nuevo-negocio"><span className="inline-flex items-center gap-2"><Plus className="size-4" />Registrar negocio</span><ArrowRight className="size-4" /></Link></Button></div><WorkspaceIllustration /></div><div className="new-workspace__features">{[{ icon: Users, title: 'Organiza a tu equipo', text: 'Personas e información en su lugar.' }, { icon: CalendarDays, title: 'Planifica turnos', text: 'Una semana clara para todos.' }, { icon: ClipboardCheck, title: 'Gestiona solicitudes', text: 'Permisos y decisiones registrados.' }].map(feature => <div key={feature.title} className="flex items-start gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#d9efee] text-[#217f89]"><feature.icon className="size-4" /></span><div><p className="text-[10px] leading-5 font-semibold text-[#254b60]">{feature.title}</p><p className="mt-0.5 text-[10px] leading-[1.7] text-[#536f80]">{feature.text}</p></div></div>)}</div></section>;
}

export function BusinessWorkspaces() {
  const { businesses } = useWorkspace();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return <>
    <section className="business-hero"><div className="business-hero__photo"><Image src="/images/workspace-hero-v1.png" alt="" fill priority sizes="(min-width: 1024px) calc(100vw - 268px), 100vw" quality={85} className="object-cover object-[70%_0%]" /></div><div aria-hidden="true" className="business-hero__shade" /><div className="business-hero__content"><p className="eyebrow mb-3 text-[#2c737b]">TU ORGANIZACIÓN, CONECTADA</p><h1 className="business-hero__title">Un lugar para cada equipo.</h1><p className="business-hero__description">Elige el negocio en el que vas a trabajar hoy. Cada espacio reúne a sus personas, su planificación y sus solicitudes.</p></div><Button asChild className="workspace-primary business-hero__action"><Link href="/app/nuevo-negocio"><Plus className="size-4" />Registrar negocio</Link></Button></section>
    <div className="business-collection__heading"><div><p className="eyebrow mb-2 text-[#617d97]">ESPACIOS DE TRABAJO</p><h2 className="text-lg font-semibold tracking-tight">Tus negocios</h2></div><div className="flex flex-wrap items-center gap-3"><div className="business-view-switch" aria-label="Presentación de los negocios"><button type="button" aria-label="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid className="size-4" /></button><button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" /></button></div><span className="rounded-lg border border-border bg-white px-3 py-2.5 text-[10px] text-muted-foreground">{businesses.length} {businesses.length === 1 ? 'negocio disponible' : 'negocios disponibles'}</span></div></div>
    {businesses.length ? <div className={cn('business-collection', businesses.length === 1 && 'business-collection--single', view === 'list' && 'business-collection--list')}>{businesses.map(business => <BusinessCard key={business.id} business={business} list={view === 'list'} />)}<NewBusinessPanel /></div> : <div className="surface"><EmptyState icon={Building2} title="Tu primer negocio empieza aquí" description="Registra tu negocio para comenzar a organizar a las personas y dar forma a tu primera semana." action={<Button asChild className="workspace-primary"><Link href="/app/nuevo-negocio"><Plus />Registrar mi primer negocio</Link></Button>} /></div>}
  </>;
}
