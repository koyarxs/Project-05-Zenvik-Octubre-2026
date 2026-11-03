'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Building2, Crown, LayoutGrid, List, Plus, ShieldCheck, Users } from 'lucide-react';
import { useWorkspace } from './workspace-provider';
import { Button } from './ui/button';
import { EmptyState } from './empty-state';
import { StatusBadge } from './ui/status-badge';
import { roleLabels, type Business } from '@/lib/types';
import { cn } from '@/lib/utils';

function BusinessCard({ business, list }: { business: Business; list: boolean }) {
  const initials = business.name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('es');
  const RoleIcon = business.role === 'OWNER' ? Crown : business.role === 'ADMIN' ? ShieldCheck : Users;
  return <Link href={`/app/${business.id}`} aria-label={`Abrir espacio de ${business.name}`} className={cn('business-card group', list && 'business-card--list')}>
    <div className="business-card__identity"><span aria-hidden="true" className="business-card__avatar">{initials}</span><StatusBadge tone={business.is_active ? 'success' : 'muted'}>{business.is_active ? 'Activo' : 'Inactivo'}</StatusBadge><ArrowUpRight aria-hidden="true" className="ml-auto size-5 text-muted-foreground" /></div>
    <div className="business-card__content"><h2 className="business-card__name">{business.name}</h2><p className="business-card__tax">{business.rut ? `RUT ${business.rut}` : 'RUT no informado'}</p><div className="business-card__footer"><span className="flex items-center gap-2 text-xs text-muted-foreground"><RoleIcon className="size-4" />{roleLabels[business.role]}</span><span className="flex items-center gap-2 text-xs font-semibold text-primary">Abrir espacio<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span></div></div>
  </Link>;
}

export function BusinessWorkspaces() {
  const { businesses } = useWorkspace();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return <div className="workspaces-page">
    <section className="workspace-intro"><div><p className="eyebrow mb-3 text-primary">ESPACIOS DE TRABAJO</p><h1>Tus negocios</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Elige dónde trabajar hoy. Accede a las personas, los turnos y las solicitudes de cada negocio.</p></div><Button asChild className="workspace-primary"><Link href="/app/nuevo-negocio"><Plus className="size-4" />{businesses.length ? 'Registrar negocio' : 'Registrar mi primer negocio'}</Link></Button></section>
    <div className="business-collection__heading"><p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{businesses.length}</span> {businesses.length === 1 ? 'negocio disponible' : 'negocios disponibles'}</p>{businesses.length > 0 && <div className="business-view-switch" aria-label="Presentación de los negocios"><button type="button" aria-label="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid className="size-4" /></button><button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" /></button></div>}</div>
    {businesses.length ? <div className={cn('business-collection', view === 'list' && 'business-collection--list')}>{businesses.map(business => <BusinessCard key={business.id} business={business} list={view === 'list'} />)}</div> : <div className="surface"><EmptyState icon={Building2} title="Tu primer negocio empieza aquí" description="Registra tu negocio para comenzar a organizar a las personas y dar forma a tu primera semana." /></div>}
  </div>;
}
