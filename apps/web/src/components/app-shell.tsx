'use client';
import Link from 'next/link';
import { NotificationBell } from './attendance-notifications';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeftToLine, ArrowRightFromLine, Building2, Clock3, CalendarDays, ChevronsUpDown, ClipboardCheck, LayoutDashboard, LogOut, Menu, Settings2, Users, X } from 'lucide-react';
import { useSession } from './session-provider';
import { useWorkspace, WorkspaceProvider } from './workspace-provider';
import { api, ApiError, resetCsrf } from '@/lib/http';
import { cn } from '@/lib/utils';
import { roleLabels } from '@/lib/types';
import { workerDestinations } from '@/lib/worker-portal';
import { businessNavigation, workspaceLocation } from '@/lib/workspace-navigation';
import { WorkspaceBreadcrumbs } from './workspace-breadcrumbs';
import { BrandMark } from './brand-mark';
import { Button } from './ui/button';
import { ErrorNotice, Loading } from './feedback';
export function Brand({ compact = false, tone = 'light' }: { compact?: boolean; tone?: 'light' | 'dark' }) {
  return <Link href="/app" aria-label="Zenvik, mis negocios" className="inline-flex items-center gap-2"><BrandMark tone={tone} className="size-10 shrink-0" />{!compact && <span className="font-display text-[25px] font-bold tracking-[-.065em]">zenvik<span className="text-[#28b4b5]">.</span></span>}</Link>;
}
function Shell({ children }: { children: React.ReactNode }) {
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
    const targets = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),select') ?? []).filter(element => element.getClientRects().length > 0);
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
  const icons = { dashboard: LayoutDashboard, employees: Users, shifts: CalendarDays, leaves: ClipboardCheck, attendance: Clock3, supervision: ClipboardCheck, incidents: ClipboardCheck, notifications: ClipboardCheck };
  const links = businessNavigation(selected).map(link => ({ ...link, icon: icons[link.id] }));
  const location = workspaceLocation(pathname, selected);
  const active = location.active;
  const compact = collapsed && !open;
  return <div className="min-h-screen">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-[70] focus:rounded-md focus:bg-white focus:p-4">Saltar al contenido</a>
    <aside id="primary-nav" className={cn('fixed inset-y-0 left-0 z-50 flex-col overflow-y-auto bg-[#14263d] text-[#c7d3df] transition-[width] duration-200 lg:flex', open ? 'flex w-[272px]' : 'hidden', collapsed ? 'lg:w-[84px]' : 'lg:w-[248px]')} aria-label="Navegación principal">
      <div className={cn('flex h-[80px] shrink-0 items-center justify-between px-6 text-white', compact && 'lg:px-[23px]')}><Brand compact={compact} tone="dark" /><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X /></Button></div>
      <div className={cn('px-4', compact && 'lg:px-3')}>
        <div className={cn('relative rounded-xl border border-white/10 bg-white/[.045]', compact ? 'p-2.5' : 'p-3')}>
          {compact ? <button className="flex w-full justify-center text-white" aria-label="Expandir selector de negocio" title="Cambiar negocio" onClick={toggleSidebar}><Building2 className="size-5" /></button> : <><p className="eyebrow mb-2 text-[#92a9bf]">ESPACIO DE TRABAJO</p><div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#284359] text-[#a7ded4]"><Building2 className="size-4" /></span><div className="min-w-0 flex-1"><label className="sr-only" htmlFor="business-select">Negocio activo</label><select id="business-select" className="w-full appearance-none border-0 bg-transparent pr-4 text-[12px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 [&>option]:bg-[#14263d]" title={selected?.name ?? 'Mis negocios'} value={selected?.id ?? ''} onChange={e => { router.push(e.target.value ? `/app/${e.target.value}` : '/app'); setOpen(false); }}><option value="">Mis negocios</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><p className="mt-1 text-[10px] text-[#92a9bf]">{selected ? roleLabels[selected.role] : 'Selecciona un negocio'}</p></div><ChevronsUpDown className="pointer-events-none size-3.5 shrink-0 text-[#92a9bf]" /></div></>}
        </div>
      </div>
      <nav className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Módulos">
        {!compact && links.length > 0 && <p className="eyebrow mb-3 px-3 text-[#839bb2]">{employee ? 'TU ESPACIO' : 'GESTIÓN DIARIA'}</p>}
        {links.map(item => { const current = active?.href === item.href; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={compact ? item.label : undefined} aria-current={current ? 'page' : undefined} aria-label={item.label} className={cn('relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-[12px] font-medium transition-colors hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center lg:px-0', current && 'bg-[#254151] text-white before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r before:bg-[#2fd3b7]')}><item.icon className={cn('size-[18px] shrink-0', current && 'text-[#65dfcd]')} />{!compact && item.label}</Link>; })}
        {!compact && <p className="eyebrow pt-7 pb-2 pl-3 text-[#839bb2]">ORGANIZACIÓN</p>}
        <Link href="/app" aria-current={pathname === '/app' ? 'page' : undefined} aria-label="Mis negocios" title={compact ? 'Mis negocios' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app' && 'bg-[#254151] text-white')}><Building2 className="size-[18px] shrink-0" />{!compact && 'Mis negocios'}</Link>
        <Link href="/app/configuracion" aria-current={pathname === '/app/configuracion' ? 'page' : undefined} aria-label="Configuración" title={compact ? 'Configuración' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app/configuracion' && 'bg-[#254151] text-white')}><Settings2 className="size-[18px] shrink-0" />{!compact && 'Configuración'}</Link>
      </nav>
      <div className="shrink-0 space-y-4 p-4">

        <div className="flex items-center gap-2.5 border-t border-white/10 pt-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#35506a] text-xs font-bold text-white">{session.user?.username.slice(0, 2).toUpperCase()}</span>{!compact && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{session.user?.username}</p><p className="mt-1 text-[10px] text-[#9fb3c7]">{selected ? roleLabels[selected.role] : 'Tu cuenta'}</p></div><button aria-label="Cerrar sesión desde navegación" disabled={busy} onClick={logout} className="rounded-md p-2 hover:bg-white/10"><LogOut className="size-4" /></button></>}</div>
        <button className="hidden min-h-9 w-full items-center justify-center gap-2 rounded-lg text-[10px] text-[#a2b6c9] hover:bg-white/5 lg:flex" aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'} onClick={toggleSidebar}>{collapsed ? <ArrowRightFromLine className="size-4" /> : <><ArrowLeftToLine className="size-3.5" />Contraer menú</>}</button>
      </div>
    </aside>
    {open && <button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#101e30]/50 lg:hidden" onClick={() => setOpen(false)} />}
    <div inert={open} className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[84px]' : 'lg:pl-[248px]')}>
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-border bg-white px-5 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3"><Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Abrir menú" aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(true)}><Menu /></Button><div className="min-w-0 py-3"><p className="mb-1 text-sm font-semibold tracking-tight">{location.title}</p><WorkspaceBreadcrumbs items={location.breadcrumbs} /></div></div>
        <div className="flex items-center gap-3">{selected && <NotificationBell key={selected.id} business={selected} />}<span className="hidden items-center gap-1.5 rounded-md bg-[#eff8f5] px-2 py-1.5 text-[10px] font-semibold text-[#26735f] sm:flex"><span className="size-1.5 rounded-full bg-[#18a999]" />{selected ? 'Negocio activo' : 'Sesión iniciada'}</span><details className="relative" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1"><span className="grid size-8 place-items-center rounded-full bg-[#e9eff6] text-[10px] font-bold text-[#345875]">{session.user?.username.slice(0, 2).toUpperCase()}</span><span className="sr-only">Menú de usuario</span></summary><div className="absolute top-12 right-0 z-30 w-64 rounded-xl border border-border bg-white p-3 shadow-lg"><p className="truncate px-2 py-2 text-xs text-muted-foreground">{session.user?.email}</p><Button variant="ghost" asChild className="w-full justify-start"><Link href="/app/configuracion"><Settings2 />Mi cuenta</Link></Button><Button variant="ghost" onClick={logout} disabled={busy} className="w-full justify-start"><LogOut />{busy ? 'Cerrando…' : 'Cerrar sesión'}</Button></div></details></div>
      </header>
      <main id="main" tabIndex={-1} className={cn('page-enter mx-auto max-w-[1600px] px-5 py-7 sm:px-7 lg:px-6 lg:py-6', employee && 'worker-portal !pb-28 lg:!pb-6')}>{error && <ErrorNotice message={error} />}{children}<footer className="mt-8 border-t border-border pt-4 text-[11px] text-muted-foreground">Zenvik · Espacio de trabajo</footer></main>
    </div>
    {employee && <nav inert={open} aria-label="Navegación del trabajador" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-white/95 px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-3px_18px_#14263d08] backdrop-blur lg:hidden">{workerDestinations(selected).map(item => { const Icon = icons[item.id]; const current = active?.id === item.id; return <Link key={item.id} href={item.href} aria-current={current ? 'page' : undefined} className={cn('flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-semibold', current ? 'bg-[#edf7f5] text-primary' : 'text-muted-foreground')}><Icon className="size-5" /><span>{item.label}</span></Link>; })}</nav>}
  </div>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession(); const router = useRouter();
  useEffect(() => { if (!session.loading && !session.error && !session.user) router.replace('/iniciar-sesion'); }, [session.loading, session.error, session.user, router]);
  if (session.error) return <div className="mx-auto max-w-lg p-8"><ErrorNotice message={session.error} retry={session.refresh} /></div>;
  if (!session.user || session.loading) return <div className="mx-auto max-w-3xl p-8"><Loading /></div>;
  return <WorkspaceProvider key={session.user.id}><Shell>{children}</Shell></WorkspaceProvider>;
}
