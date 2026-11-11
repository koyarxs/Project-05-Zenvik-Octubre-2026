'use client';
import Link from 'next/link';
import { OverviewTools, ProfileMenuHeader } from './overview-tools';
import { WorkspaceSearch } from './workspace-search';
import { useClock } from '@/hooks/use-clock';
import { SessionTime } from './session-time';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeftToLine, ArrowRightFromLine, Building2, Clock3, BarChart3, CalendarDays, ChevronDown, ChevronRight, ClipboardCheck, Fingerprint, House, Layers3, LayoutDashboard, LayoutGrid, LogOut, Menu, Plus, Search, Settings, Settings2, Store, TriangleAlert, Umbrella, Users, X } from 'lucide-react';
import { useSession } from './session-provider';
import { useWorkspace, WorkspaceProvider } from './workspace-provider';
import { api, ApiError, resetCsrf } from '@/lib/http';
import { cn } from '@/lib/utils';
import { roleLabels } from '@/lib/types';
import { workerDestinations } from '@/lib/worker-portal';
import { businessNavigation, workspaceLocation } from '@/lib/workspace-navigation';
import { WorkspaceBreadcrumbs } from './workspace-breadcrumbs';
import { BrandMark } from './brand-mark';
import { ZenvikLogo } from './zenvik-logo';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './feedback';
export function Brand({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  return <Link href="/app" aria-label="Zenvik, mis negocios" className="inline-flex items-center gap-2"><BrandMark tone={tone} className="size-10 shrink-0" />{!compact && <span className="font-display text-[25px] font-bold tracking-[-.065em]">zenvik<span className="text-[#28b4b5]">.</span></span>}</Link>;
}
function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const pathname = usePathname();
  if (user?.is_platform_admin && pathname === '/app') return children;
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const session = useSession(); const { businesses } = useWorkspace();
  const params = useParams<{ businessId?: string }>(); const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const selected = businesses.find(b => b.id === params.businessId);

  useEffect(() => {
    // Store only a visual preference; storage may be unavailable in private mode.
    try { if (sessionStorage.getItem('zenvik:sidebar') === 'collapsed') queueMicrotask(() => setCollapsed(true)); } catch {}
  }, []);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeMobile = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', closeMobile);
    return () => desktop.removeEventListener('change', closeMobile);
  }, []);
  function toggleSidebar() {
    const next = !collapsed; setCollapsed(next);
    try { sessionStorage.setItem('zenvik:sidebar', next ? 'collapsed' : 'expanded'); } catch {}
  }
  const employee = selected?.role === 'EMPLOYEE';
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById('primary-nav');
    const targets = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select,summary') ?? []).filter(element => element.getClientRects().length > 0 && !element.closest('details:not([open]) > :not(summary)'));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; targets()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const elements = targets(); const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);
  async function logout() {
    setBusy(true); setError(null);
    try { await api('/api/v1/auth/logout/', { method: 'POST', body: {} }); resetCsrf(); session.accept(null); router.replace('/iniciar-sesion'); }
    catch (error) { setError(error instanceof ApiError ? error.message : 'No se pudo cerrar la sesión. Revisa la conexión y vuelve a intentarlo.'); } finally { setBusy(false); }
  }
  const icons = { dashboard: LayoutDashboard, employees: Users, shifts: CalendarDays, leaves: Umbrella, attendance: Clock3, supervision: Fingerprint, incidents: TriangleAlert, notifications: ClipboardCheck, subscription: Settings2 };
  const links = businessNavigation(selected).map(link => ({ ...link, icon: icons[link.id] }));
  const location = workspaceLocation(pathname, selected);
  const active = location.active;
  const workersSection = active?.id === 'employees';
  const compact = collapsed && !open;
  const overview = pathname === '/app';
  const now = useClock();
  const time = new Date(now);
  const clockOptions = { timeZone: 'America/Santiago' };
  function businessSelector() {
    return <label className="private-business-picker">
      <Store size={18} aria-hidden="true" />
      <span className="sr-only">Negocio activo</span>
      <select value={selected?.id ?? ''} onChange={event => {
        router.push(event.target.value ? '/app/' + event.target.value : '/app');
        setOpen(false);
      }}>
        <option value="">Mis negocios</option>
        {businesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
      </select>
      {selected?.is_active && <span className="private-business-status">Activo</span>}
    </label>;
  }
  const managers = businesses.filter(business => business.is_active && business.role !== 'EMPLOYEE');
  const team = managers.length === 1 ? businessNavigation(managers[0]).find(item => item.id === 'employees') : undefined;
  function overviewAccount(sidebar = false) {
    return <details className={cn('overview-account', sidebar && 'overview-account--sidebar')} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }} onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary aria-label="Menú de usuario">
        <span className="overview-account__avatar">{session.user?.username.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>
        {!sidebar && <>{!overview && <span className="private-account-label"><strong>{session.user?.username}</strong><small>{selected ? roleLabels[selected.role] : 'Mi cuenta'}</small></span>}<ChevronDown className="size-4" aria-hidden="true" /></>}
        {sidebar && !compact && <><strong className="overview-sidebar-name truncate">{session.user?.username}</strong><ChevronRight className="size-4 shrink-0" aria-hidden="true" /></>}
      </summary>
      <div className="overview-popover overview-account__menu">
        <ProfileMenuHeader />
        <Link href="/app/configuracion" onClick={() => setOpen(false)}><Settings2 />Mi cuenta y configuración</Link>
        <a href={overview ? '#tus-negocios' : '/app'} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); setOpen(false); }}><Building2 />Mis negocios</a>
        <Link href="/app/nuevo-negocio" onClick={() => setOpen(false)}><Plus />Registrar negocio</Link>
        {team && <Link href={team.href} onClick={() => setOpen(false)}><Users />Gestionar trabajadores</Link>}
        <Link href="/planes" onClick={() => setOpen(false)}><Layers3 />Planes y precios</Link>
        {sidebar && <button type="button" className="overview-collapse" onClick={event => {
          event.currentTarget.closest('details')?.removeAttribute('open');
          toggleSidebar();
        }}>{compact ? <ArrowRightFromLine /> : <ArrowLeftToLine />}{compact ? 'Expandir barra lateral' : 'Contraer barra lateral'}</button>}
        <button type="button" className="overview-signout" disabled={busy} onClick={logout}><LogOut />{busy ? 'Cerrando…' : 'Cerrar sesión'}</button>
      </div>
    </details>;
  }
  return <div className={cn('min-h-screen app-shell private-theme', (overview || pathname === '/app/nuevo-negocio') && 'business-theme', overview && 'workspace-shell--overview', compact && 'app-shell--compact', workersSection && 'workspace-shell--workers')}>
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-[70] focus:rounded-md focus:bg-white focus:p-4">Saltar al contenido</a>
    <aside id="primary-nav" role={open ? 'dialog' : undefined} aria-modal={open || undefined} className={cn('private-sidebar fixed inset-y-0 left-0 z-50 flex-col overflow-y-auto transition-[width] duration-200 lg:flex', open ? 'flex w-[272px]' : 'hidden', collapsed ? 'lg:w-[84px]' : 'lg:w-[248px]')} aria-label="Navegación principal">
      {(overview || open) && <div className={cn('private-drawer-head', overview ? 'business-sidebar-brand' : 'lg:hidden')}><Link href="/app" aria-label="Zenvik, mis negocios" onClick={() => setOpen(false)}>{overview && <BrandMark tone="orange" />}{(!overview || !compact) && 'Zenvik'}</Link>{open && <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X /></Button>}</div>}
      {open && <div className="px-3 pb-2 lg:hidden">{businessSelector()}</div>}
      {overview && businesses.length > 1 && <div className="hidden px-3 pb-2 lg:block">{compact ? <button type="button" aria-label="Expandir selector de negocio" className="mx-auto grid size-9 place-items-center text-primary" onClick={toggleSidebar}><Store size={18} /></button> : businessSelector()}</div>}
      <nav className="private-nav min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Módulos">
        {!compact && links.length > 0 && <p className="eyebrow mb-3 px-3 text-[#839bb2]">{employee ? 'TU ESPACIO' : 'GESTIÓN DIARIA'}</p>}
        {links.map(item => { const current = active?.href === item.href; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={compact ? item.label : undefined} aria-current={current ? 'page' : undefined} aria-label={item.label} className={cn('relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-[12px] font-medium transition-colors hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center lg:px-0', current && 'text-white')}><item.icon className="size-[18px] shrink-0" />{!compact && item.label}</Link>; })}
        {selected && !employee && (compact ? <Link href={`/app/${selected.id}/asistencia/supervision?periodo=daily#reportes`} title="Reportes" aria-label="Reportes" className="flex items-center justify-center"><BarChart3 size={18} /></Link> : <details className="private-nav-group"><summary><BarChart3 size={18} />Reportes<ChevronDown size={14} /></summary><div>{[
          ['daily', 'Reporte diario'], ['weekly', 'Reporte semanal'], ['monthly', 'Reporte mensual'],
        ].map(([period, label]) => <Link key={period} href={`/app/${selected.id}/asistencia/supervision?periodo=${period}#reportes`} onClick={() => setOpen(false)}>{label}</Link>)}</div></details>)}
        {!workersSection && !overview && !compact && <p className="eyebrow pt-7 pb-2 pl-3 text-[#839bb2]">ORGANIZACIÓN</p>}
        {!workersSection && <Link href="/app" aria-current={pathname === '/app' ? 'page' : undefined} aria-label={overview ? 'Inicio' : 'Mis negocios'} title={compact ? (overview ? 'Inicio' : 'Mis negocios') : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app' && 'text-white')}>{overview ? <House className="size-[18px] shrink-0" /> : <Building2 className="size-[18px] shrink-0" />}{!compact && (overview ? 'Inicio' : 'Mis negocios')}</Link>}
        {overview && <>
          <a href="#tus-negocios" aria-label="Negocios" title={compact ? 'Negocios' : undefined} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 hover:bg-white/10', compact && 'lg:justify-center')}><Store className="size-[18px] shrink-0" />{!compact && 'Negocios'}</a>
          {team && <Link href={team.href} aria-label="Trabajadores" title={compact ? 'Trabajadores' : undefined} onClick={() => setOpen(false)} className={cn('flex items-center gap-3 hover:bg-white/10', compact && 'lg:justify-center')}><Users className="size-[18px] shrink-0" />{!compact && 'Trabajadores'}</Link>}
          <Link href="/planes" aria-label="Planes" title={compact ? 'Planes' : undefined} className={cn('flex items-center gap-3 hover:bg-white/10', compact && 'lg:justify-center')}><Layers3 className="size-[18px] shrink-0" />{!compact && 'Planes'}</Link>
        </>}
        {selected?.role === 'OWNER' && !compact ? <details className="private-nav-group"><summary><Settings size={18} />Configuración<ChevronDown size={14} /></summary><div><Link href="/app/configuracion" onClick={() => setOpen(false)}>Mi cuenta</Link><Link href={`/app/${selected.id}/suscripcion`} onClick={() => setOpen(false)}>Suscripción del negocio</Link></div></details> : <Link href="/app/configuracion" aria-current={pathname === '/app/configuracion' ? 'page' : undefined} aria-label="Configuración" title={compact ? 'Configuración' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app/configuracion' && 'text-white')}><Settings className="size-[18px] shrink-0" />{!compact && 'Configuración'}</Link>}
      </nav>
      <div className="shell-account shrink-0 space-y-4 p-4">

        {workersSection && <div className="workers-organization">
          {!compact && <p className="eyebrow">Organización</p>}
          <Link href="/app" aria-label="Mis negocios" title={compact ? 'Mis negocios' : undefined} onClick={() => setOpen(false)}>
            <Building2 size={18} aria-hidden="true" />{!compact && 'Mis negocios'}
          </Link>
        </div>}
        {overviewAccount(true)}
        {!overview && <button className="hidden min-h-9 w-full items-center justify-center gap-2 rounded-lg text-[11px] text-white/80 hover:bg-white/10 lg:flex" aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'} onClick={toggleSidebar}>{collapsed ? <ArrowRightFromLine className="size-4" /> : <><ArrowLeftToLine className="size-3.5" />Contraer menú</>}</button>}
      </div>
    </aside>
    {open && <button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#101e30]/50 lg:hidden" onClick={() => setOpen(false)} />}
    <div inert={open} className={cn('shell-content transition-[padding] duration-200', collapsed ? 'lg:pl-[84px]' : 'lg:pl-[248px]')}>
      {overview ? <header className="business-topbar">
        <div className="flex min-w-0 flex-1 items-center gap-3"><Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menú" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(true)}><Menu /></Button><LayoutGrid size={24} className="hidden text-primary sm:block" aria-hidden="true" /><p>Panel general</p></div>
        {!!businesses.length && <button type="button" className="business-search-trigger" aria-label="Buscar negocio o RUT" onClick={() => document.getElementById('buscar-negocio')?.focus()}><Search size={16} /><span>Buscar negocio o RUT</span></button>}
        <OverviewTools />
        <SessionTime className="hidden xl:flex" />
        {overviewAccount()}
      </header> : <header className="private-topbar">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Abrir menú" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(true)}><Menu /></Button>
        <Link href="/app" className={selected ? 'flex shrink-0' : 'private-wordmark'} aria-label="Zenvik, mis negocios">
          {selected ? <ZenvikLogo /> : 'Zenvik'}
        </Link>
        {!open && businessSelector()}
        <WorkspaceSearch business={selected} businesses={businesses} />
        <div className="private-wall-clock" aria-label="Fecha y hora actual en Santiago">
          <CalendarDays size={21} aria-hidden="true" /><span><small>{time.toLocaleDateString('es-CL', { ...clockOptions, weekday: 'short', month: 'short', day: 'numeric' })}</small><strong>{time.toLocaleTimeString('es-CL', { ...clockOptions, hour: '2-digit', minute: '2-digit' })}</strong></span>
        </div>
        <OverviewTools business={selected} />
        <SessionTime className="hidden 2xl:flex" />
        {overviewAccount()}
      </header>}
      <main id="main" tabIndex={-1} className={cn('page-enter mx-auto max-w-[1600px] px-5 py-7 sm:px-7 lg:px-6 lg:py-6', employee && 'worker-portal !pb-28 lg:!pb-6')}>{error && <ErrorNotice message={error} />}{!overview && <WorkspaceBreadcrumbs items={location.breadcrumbs} />}{children}<footer className="mt-8 border-t border-border pt-4 text-[11px] text-muted-foreground">Zenvik · Espacio de trabajo</footer></main>
    </div>
    {employee && <nav inert={open} aria-label="Navegación del trabajador" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-white/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-3px_18px_#14263d08] backdrop-blur lg:hidden">{workerDestinations(selected).map(item => { const Icon = icons[item.id]; const current = active?.id === item.id; return <Link key={item.id} href={item.href} aria-current={current ? 'page' : undefined} className={cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold', current ? 'bg-muted text-primary' : 'text-muted-foreground')}><Icon className="size-5" /><span>{item.label}</span></Link>; })}</nav>}
  </div>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession(); const router = useRouter();
  useEffect(() => { if (!session.loading && !session.error && !session.user) router.replace('/iniciar-sesion'); }, [session.loading, session.error, session.user, router]);
  if (session.error) return <div className="mx-auto max-w-lg p-8"><ErrorNotice message={session.error} retry={session.refresh} /></div>;
  if (!session.user || session.loading) return <div className="mx-auto max-w-3xl p-8"><Loading /></div>;
  return <WorkspaceProvider key={session.user.id}><Shell>{children}</Shell></WorkspaceProvider>;
}
