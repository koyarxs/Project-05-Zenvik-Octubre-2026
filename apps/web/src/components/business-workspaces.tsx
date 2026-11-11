'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUp, ChevronRight, Crown, LayoutGrid, List, Plus, Search, Store } from 'lucide-react';
import { selectedPlan } from '@/lib/billing';
import { roleLabels } from '@/lib/types';
import { businessNavigation } from '@/lib/workspace-navigation';
import { BusinessStorefront, ManagementArtwork, OverviewGlyph, OverviewHero, type OverviewIcon } from './overview-tools';
import { useWorkspace } from './workspace-provider';
import styles from './platform-console.module.css';

export function BusinessWorkspaces() {
  const { businesses } = useWorkspace();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [plan, setPlan] = useState<string | null>(null);
  const [recentCutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);
  useEffect(() => { queueMicrotask(() => setPlan(selectedPlan())); }, []);

  const active = businesses.filter(business => business.is_active);
  const managed = active.filter(business => business.role !== 'EMPLOYEE');
  const team = managed.length === 1 ? businessNavigation(managed[0]).find(item => item.id === 'employees') : undefined;
  const term = query.trim().toLocaleLowerCase('es');
  const matching = businesses.filter(business => business.name.toLocaleLowerCase('es').includes(term) || business.rut.toLowerCase().includes(term));
  const metrics = [
    { label: 'Negocios', value: businesses.length, icon: 'case', group: businesses },
    { label: 'Activos', value: active.length, icon: 'team', group: active },
    { label: 'Administras', value: managed.length, icon: 'manager' },
    { label: 'Tu acceso', value: managed.length ? 'Gestión' : 'Personal', icon: 'pulse' },
  ] satisfies { label: string; value: number | string; icon: OverviewIcon; group?: typeof businesses }[];
  const shortcuts = [
    { label: 'Negocios', href: '#tus-negocios' },
    ...(team ? [{ label: 'Trabajadores', href: team.href, icon: 'team' as const }] : []),
    { label: 'Planes', href: '/planes', icon: 'layers' },
    { label: 'Configuración', href: '/app/configuracion', icon: 'settings' },
  ] satisfies { label: string; href: string; icon?: OverviewIcon }[];

  return <div className={`business-theme ${styles.workspaceOverview}`}>
    <OverviewHero photo />
    <div className={styles.metrics}>
      {metrics.map((metric, index) => {
        const earlier = metric.group?.filter(business => Date.parse(business.created_at) < recentCutoff).length ?? 0;
        const growth = earlier ? Math.round(((metric.group?.length ?? 0) - earlier) / earlier * 100) : null;
        return <div className={styles.metric} key={metric.label}>
        <span className={styles.tile}><OverviewGlyph icon={metric.icon} /></span>
        <span>{metric.label}<strong className={index === 3 ? styles.metricText : undefined}>{metric.value}</strong></span>
        {growth !== null && <span className={styles.growth} title="Altas en los últimos 30 días sobre los negocios anteriores de esta vista"><ArrowUp size={14} aria-hidden="true" />{growth}%</span>}
      </div>; })}
    </div>
    <div className={styles.panels}>
      <section id="tus-negocios" className={styles.panel}>
        <div className={styles.panelTitle}>
          <h2><Store aria-hidden="true" />Tus negocios</h2>
          <Link href="/app/nuevo-negocio" className={styles.newBusiness}><Plus size={16} />{businesses.length ? 'Registrar negocio' : 'Registrar mi primer negocio'}</Link>
        </div>
        {businesses.length > 0 ? <>
          <div className={styles.workspaceTools}>
            <label className={styles.workspaceSearch}><Search size={17} aria-hidden="true" /><input id="buscar-negocio" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar negocio o RUT…" aria-label="Buscar negocio o RUT" /></label>
            <div className={styles.workspaceViews} aria-label="Presentación de los negocios" role="group">
              <button type="button" aria-label="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></button>
              <button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} /></button>
            </div>
          </div>
          {plan && <p className={styles.listHint}>Selecciona un negocio propio para revisar el plan elegido.</p>}
          <div className={styles.workspaceResults} data-view={view}>
          {matching.map(business => {
            const href = plan && business.role === 'OWNER' ? `/app/${business.id}/suscripcion?plan=${encodeURIComponent(plan)}` : `/app/${business.id}`;
            return <Link key={business.id} href={href} aria-label={`Abrir espacio de ${business.name}`} className={styles.row}>
              <span className={styles.rowIcon} aria-hidden="true"><BusinessStorefront /></span>
              <span className={styles.rowText}><strong>{business.name}</strong><small>{business.rut ? `RUT ${business.rut}` : 'RUT no informado'} · {roleLabels[business.role]}</small></span>
              <span className={styles.badge} data-positive={business.is_active}>{business.is_active ? 'Activo' : 'Inactivo'}</span>
              <ChevronRight size={18} className="ml-auto shrink-0" aria-hidden="true" />
            </Link>;
          })}
          </div>
          {!matching.length && <p className={styles.listHint} role="status">No se encontraron negocios.</p>}
        </> : <p className={styles.listHint}>Tu primer negocio empieza aquí. Regístralo para organizar a tu equipo, los turnos y la asistencia.</p>}
      </section>
      <section className={styles.management}>
        <Crown className="text-amber-600" aria-hidden="true" />
        <h2>Gestión centralizada</h2>
        <p>Personas, asistencia y turnos en un solo lugar.</p>
        <Link href="/planes" className={styles.managementLink}>Explorar planes <ArrowRight size={16} /></Link>
        <ManagementArtwork />
      </section>
    </div>
    <nav className={styles.shortcuts} aria-label="Accesos rápidos">
      {shortcuts.map(item => <Link key={item.label} href={item.href}>
        <span className={styles.tile}>{item.icon ? <OverviewGlyph icon={item.icon} /> : <BusinessStorefront />}</span>
        <strong>{item.label}</strong><ChevronRight className={styles.shortcutArrow} aria-hidden="true" />
      </Link>)}
    </nav>
  </div>;
}
