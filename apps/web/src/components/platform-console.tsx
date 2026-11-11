'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { Activity, ArrowRight, Building2, ChevronRight, Crown, House, Layers3, LogOut, Search, Settings, ShieldCheck, UserRound, Users } from 'lucide-react';
import { api, resetCsrf } from '@/lib/http';
import { selectedPlan } from '@/lib/billing';
import { BusinessWorkspaces } from './business-workspaces';
import { ErrorNotice, Loading } from './feedback';
import { BusinessStorefront, ManagementArtwork, OverviewHero, OverviewTools, ProfileMenuHeader } from './overview-tools';
import { SessionTime } from './session-time';
import { useSession } from './session-provider';
import { useWorkspace } from './workspace-provider';
import styles from './platform-console.module.css';

const destinations = [
  { id: 'home', label: 'Inicio', icon: House },
  { id: 'businesses', label: 'Negocios', icon: Building2 },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'plans', label: 'Planes', icon: Layers3 },
  { id: 'settings', label: 'Configuración', icon: Settings },
  { id: 'audit', label: 'Auditoría', icon: ShieldCheck },
] as const;
type Section = typeof destinations[number]['id'] | 'workspaces';
type Overview = {
  totals: Record<'businesses' | 'users' | 'plans', number>;
  businesses: { id: string; name: string; rut: string; is_active: boolean }[];
  users: { id: string; username: string; is_active: boolean }[];
  plans: { id: string; name: string; code: string; published: boolean }[];
  audit: { id: string; action: string; created_at: string }[];
};

export function PlatformConsole() {
  const session = useSession();
  const { businesses } = useWorkspace();
  const router = useRouter();
  const [section, setSection] = useState<Section>(() => selectedPlan() ? 'workspaces' : 'home');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [health, setHealth] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [busy, setBusy] = useState(false);
  const username = session.user?.username ?? '';
  const initials = username.slice(0, 2).toUpperCase();
  const destination = destinations.find(item => item.id === section);
  const refreshOnActivity = useCallback(() => setRevision(current => current + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const search = new URLSearchParams({ q: query });
    void api<Overview>('/api/v1/auth/platform-overview/?' + search, { signal }).then(
      data => { if (!signal.aborted) { setOverview(data); setError(''); } },
      failure => { if (!signal.aborted) setError(failure.message); },
    );
    void fetch('/health/ready', { cache: 'no-store', signal }).then(
      response => { if (!signal.aborted) setHealth(response.ok); },
      () => { if (!signal.aborted) setHealth(false); },
    );
    return () => controller.abort();
  }, [query, revision]);

  function navigate(next: Section) {
    setSection(next);
    setDraft('');
    if (query) {
      setOverview(null);
      setError('');
      setQuery('');
    }
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    if (next !== query) {
      setOverview(null);
      setError('');
      setQuery(next);
    }
    setSection('businesses');
  }

  function refresh() {
    setError('');
    setOverview(null);
    setHealth(null);
    setRevision(current => current + 1);
  }

  async function logout() {
    setBusy(true);
    setLogoutError('');
    try {
      await api('/api/v1/auth/logout/', { method: 'POST', body: {} });
      resetCsrf();
      session.accept(null);
      router.replace('/iniciar-sesion');
    } catch (failure) {
      setLogoutError(failure instanceof Error ? failure.message : 'No se pudo cerrar la sesión.');
      setBusy(false);
    }
  }

  function navigateFromProfile(event: MouseEvent<HTMLButtonElement>, next: Section) {
    const disclosure = event.currentTarget.closest('details');
    disclosure?.querySelector('summary')?.focus();
    disclosure?.removeAttribute('open');
    navigate(next);
  }

  function profile(sidebar = false) {
    return <details className={styles.profile} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary className={sidebar ? styles.account : styles.headerAvatar} aria-label="Menú de usuario">
        <span className={styles.avatar}>{initials}</span>
        {sidebar && <><strong className="overview-sidebar-name truncate">{username}</strong><ChevronRight size={16} aria-hidden="true" /></>}
      </summary>
      <div className={`overview-popover ${styles.profileMenu}`} data-overview-profile>
        <ProfileMenuHeader />
        <Link href="/app/configuracion"><UserRound />Mi cuenta</Link>
        <button type="button" onClick={event => navigateFromProfile(event, 'workspaces')}><Building2 />Mis espacios de trabajo</button>
        <button type="button" onClick={event => navigateFromProfile(event, 'settings')}><Settings />Configuración de plataforma</button>
        <button type="button" onClick={event => navigateFromProfile(event, 'audit')}><ShieldCheck />Auditoría de facturación</button>
        <button type="button" className="overview-signout" onClick={logout} disabled={busy}><LogOut />{busy ? 'Cerrando…' : 'Cerrar sesión'}</button>
      </div>
    </details>;
  }

  function businessRows(limit: number) {
    return overview?.businesses.slice(0, limit).map(business => {
      const accessible = businesses.some(workspace => workspace.id === business.id);
      const identity = <><span className={styles.rowIcon}><BusinessStorefront /></span><span className={styles.rowText}><strong>{business.name}</strong><small>{business.rut ? 'RUT ' + business.rut : 'RUT no informado'}</small></span><span className={styles.badge} data-positive={business.is_active}>{business.is_active ? 'Activo' : 'Inactivo'}</span></>;
      return accessible
        ? <Link key={business.id} href={'/app/' + business.id} className={styles.row}>{identity}<ChevronRight className="ml-auto shrink-0" size={19} /></Link>
        : <div key={business.id} className={styles.row}>{identity}</div>;
    });
  }

  return <div className={`private-theme ${styles.console}`}>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4">Saltar al contenido</a>
    <aside className={styles.sidebar}>
      <button className={styles.brand} type="button" onClick={() => navigate('home')}>
        <strong>Zenvik</strong>
      </button>
      <nav className={styles.nav} aria-label="Administración de plataforma">
        {destinations.map(item => <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon />{item.label}</button>)}
      </nav>
      <div className={styles.sidebarAccount}>{profile(true)}</div>
    </aside>
    <div className={styles.content}>
      <header className={styles.header}>
        <p><Building2 />Administración general</p>
        <form className={styles.search} role="search" onSubmit={search}>
          <button type="submit" aria-label="Buscar"><Search size={20} /></button>
          <input aria-label="Buscar negocio, usuario o RUT" placeholder="Buscar negocio, usuario o RUT…" value={draft} maxLength={150} onChange={event => setDraft(event.target.value)} />
        </form>
        <OverviewTools onActivity={refreshOnActivity} />
        <SessionTime className="hidden xl:flex" />
        {profile()}
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        {logoutError && <ErrorNotice message={logoutError} />}
        {section === 'home' && <>
          <OverviewHero admin />
          <div className={styles.metrics}>
            {destinations.slice(1, 4).map((item, index) => <button key={item.id} type="button" className={styles.metric} onClick={() => navigate(item.id)}><span className={styles.tile} data-tone={index}><item.icon /></span><span>{item.label}<strong>{overview?.totals[item.id as keyof Overview['totals']].toLocaleString('es-CL') ?? '—'}</strong></span></button>)}
            <div className={styles.metric}><span className={styles.tile}><Activity /></span><span>Plataforma <strong className={styles.health} data-positive={health === true}>{health === null ? 'Consultando' : health ? 'Operativa' : 'Sin conexión'}</strong></span></div>
          </div>
          <div className={styles.panels}>
            <section className={styles.panel}>
              <div className={styles.panelTitle}><h2><Building2 />Negocios en la plataforma</h2><button type="button" onClick={() => navigate('businesses')}>Ver todos <ArrowRight size={17} /></button></div>
              {error ? <ErrorNotice message={error} retry={refresh} /> : overview ? businessRows(1) : <Loading />}
              {overview && !overview.businesses.length && <p>Aún no hay negocios registrados.</p>}
            </section>
            <section className={styles.management}>
              <Crown className="text-amber-600" /><h2>Gestión centralizada</h2><p>Consulta negocios, cuentas y planes desde un solo lugar.</p>
              <ManagementArtwork />
            </section>
          </div>
          <div className={styles.shortcuts}>
            {destinations.slice(1, 5).map((item, index) => <button key={item.id} type="button" onClick={() => navigate(item.id)}><span className={styles.tile} data-tone={index}>{index === 0 ? <BusinessStorefront /> : <item.icon />}</span><strong>{item.label}</strong><ChevronRight className={styles.shortcutArrow} /></button>)}
          </div>
        </>}
        {section === 'workspaces' && <BusinessWorkspaces />}
        {section !== 'home' && destination && <section className={styles.panel}>
          <div className={styles.panelTitle}><h1><destination.icon />{destination.label}</h1><button type="button" onClick={() => navigate('home')}>Volver al inicio</button></div>
          {section === 'settings' ? <div className={styles.settings}>
            <Link href="/app/configuracion"><UserRound />Mi cuenta <ChevronRight /></Link>
            <button type="button" onClick={() => navigate('workspaces')}><Building2 />Mis espacios de trabajo <ChevronRight className="ml-auto" /></button>
            <Link href="/app/nuevo-negocio"><Building2 />Registrar negocio <ChevronRight /></Link>
            <Link href="/planes"><Layers3 />Catálogo público de planes <ChevronRight /></Link>
            <button type="button" onClick={refresh}><Activity />Comprobar disponibilidad <small>{health === null ? 'Consultando…' : health ? 'Operativa' : 'Sin conexión'}</small></button>
          </div> : error ? <ErrorNotice message={error} retry={refresh} /> : !overview ? <Loading /> : <>
            {section === 'businesses' && <>
              {query && <p className={styles.listHint}>Resultados para «{query}» en negocios y usuarios <button type="button" onClick={() => navigate('businesses')}>Limpiar búsqueda</button></p>}
              {businessRows(20)}
              {!overview.businesses.length && <p>No se encontraron negocios.</p>}
              {query && <><h2 className="my-4 text-lg font-bold">Usuarios</h2>{overview.users.map(user => <div key={user.id} className={styles.row}><UserRound size={18} />{user.username}</div>)}{!overview.users.length && <p>No se encontraron usuarios.</p>}</>}
            </>}
            {section === 'users' && overview.users.map(user => <div key={user.id} className={styles.row}><UserRound size={18} /><strong>{user.username}</strong><span className={styles.badge} data-positive={user.is_active}>{user.is_active ? 'Activo' : 'Inactivo'}</span></div>)}
            {section === 'plans' && overview.plans.map(plan => <div key={plan.id} className={styles.row}><Layers3 size={18} /><span className={styles.rowText}><strong>{plan.name}</strong><small>{plan.code}</small></span><span className={styles.badge} data-positive={plan.published}>{plan.published ? 'Publicado' : 'Borrador'}</span></div>)}
            {section === 'audit' && <><p className={styles.listHint}>Últimos eventos de facturación</p>{overview.audit.map(event => <div key={event.id} className={styles.row}><ShieldCheck size={18} /><span className={styles.rowText}><strong>{event.action.replaceAll('_', ' ')}</strong><small>{new Date(event.created_at).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</small></span></div>)}{!overview.audit.length && <p>Aún no hay eventos registrados.</p>}</>}
            {section !== 'audit' && <p className={styles.listHint}>Se muestran hasta 20 resultados por listado.</p>}
          </>}
        </section>}
      </main>
    </div>
  </div>;
}
