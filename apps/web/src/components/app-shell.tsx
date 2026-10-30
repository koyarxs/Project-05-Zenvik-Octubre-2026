'use client';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeftToLine, ArrowRightFromLine, Building2, CalendarDays, ChevronRight, ChevronsUpDown, ClipboardCheck, LayoutDashboard, LogOut, Menu, Settings2, Users, X } from 'lucide-react';
import { useSession } from './session-provider';
import { useWorkspace, WorkspaceProvider } from './workspace-provider';
import { api, resetCsrf } from '@/lib/http';
import { cn } from '@/lib/utils';
import { roleLabels } from '@/lib/types';
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
  const navigationBusiness = selected ?? (businesses.length === 1 ? businesses[0] : undefined);
  const employee = navigationBusiness?.role === 'EMPLOYEE';
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
    catch { setError('No se pudo cerrar la sesión. Vuelve a intentarlo.'); } finally { setBusy(false); }
  }
  const links = navigationBusiness ? [
    { href: `/app/${navigationBusiness.id}`, label: employee ? 'Mi día' : 'Resumen', icon: LayoutDashboard },
    { href: `/app/${navigationBusiness.id}/trabajadores`, label: employee ? 'Mi ficha' : 'Trabajadores', icon: Users },
    { href: `/app/${navigationBusiness.id}/turnos`, label: employee ? 'Mis turnos' : 'Turnos', icon: CalendarDays },
    { href: `/app/${navigationBusiness.id}/permisos`, label: employee ? 'Mis solicitudes' : 'Permisos y ausencias', icon: ClipboardCheck },
  ] : [];
  const active = links.find(link => pathname === link.href || (link.href !== `/app/${selected?.id}` && pathname.startsWith(link.href + '/')));
  const compact = collapsed && !open;
  return <div className="min-h-screen">
    <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-[70] focus:rounded-md focus:bg-white focus:p-4">Saltar al contenido</a>
    <aside id="primary-nav" className={cn('fixed inset-y-0 left-0 z-50 flex-col overflow-y-auto bg-[#0d2432] text-[#c7d3df] transition-[width] duration-200 lg:flex', open ? 'flex w-[272px]' : 'hidden', collapsed ? 'lg:w-[84px]' : 'lg:w-[220px]')} aria-label="Navegación principal">
      <div className={cn('flex h-[80px] shrink-0 items-center justify-between px-6 text-white', compact && 'lg:px-[23px]')}><Brand compact={compact} tone="dark" /><Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X /></Button></div>
      <div className={cn('px-4', compact && 'lg:px-3')}>
        <div className={cn('relative rounded-xl border border-white/10 bg-white/[.045]', compact ? 'p-2.5' : 'p-3')}>
          {compact ? <button className="flex w-full justify-center text-white" aria-label="Expandir selector de negocio" onClick={() => setCollapsed(false)}><Building2 className="size-5" /></button> : <><p className="eyebrow mb-2 text-[#92a9bf]">ESPACIO DE TRABAJO</p><div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#284359] text-[#a7ded4]"><Building2 className="size-4" /></span><div className="min-w-0 flex-1"><label className="sr-only" htmlFor="business-select">Negocio activo</label><select id="business-select" className="w-full appearance-none border-0 bg-transparent pr-4 text-[12px] font-semibold text-white outline-none [&>option]:bg-[#14263d]" value={selected?.id ?? ''} onChange={e => { router.push(e.target.value ? `/app/${e.target.value}` : '/app'); setOpen(false); }}><option value="">Mis negocios</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><p className="mt-1 text-[10px] text-[#92a9bf]">{selected ? roleLabels[selected.role] : 'Selecciona un negocio'}</p></div><ChevronsUpDown className="pointer-events-none size-3.5 shrink-0 text-[#92a9bf]" /></div></>}
        </div>
      </div>
      <nav className="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Módulos">
        {!compact && <p className="eyebrow mb-3 px-3 text-[#839bb2]">{employee ? 'TU ESPACIO' : 'GESTIÓN DIARIA'}</p>}
        {links.map(item => { const current = active?.href === item.href; return <Link key={item.href} href={item.href} onClick={() => setOpen(false)} title={compact ? item.label : undefined} aria-current={current ? 'page' : undefined} aria-label={item.label} className={cn('relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-[12px] font-medium transition-colors hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center lg:px-0', current && 'bg-[#254151] text-white before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r before:bg-[#2fd3b7]')}><item.icon className={cn('size-[18px] shrink-0', current && 'text-[#65dfcd]')} />{!compact && item.label}</Link>; })}
        {!compact && <p className="eyebrow pt-7 pb-2 pl-3 text-[#839bb2]">ORGANIZACIÓN</p>}
        <Link href="/app" aria-label="Mis negocios" title={compact ? 'Mis negocios' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app' && 'bg-[#254151] text-white')}><Building2 className="size-[18px] shrink-0" />{!compact && 'Mis negocios'}</Link>
        <Link href="/app/configuracion" aria-label="Configuración" title={compact ? 'Configuración' : undefined} onClick={() => setOpen(false)} className={cn('flex min-h-11 items-center gap-3 rounded-lg p-3 text-xs hover:bg-white/[.06] hover:text-white', compact && 'lg:justify-center', pathname === '/app/configuracion' && 'bg-[#254151] text-white')}><Settings2 className="size-[18px] shrink-0" />{!compact && 'Configuración'}</Link>
      </nav>
      <div className="shrink-0 space-y-4 p-4">
        {!compact && <div className="sidebar-note rounded-xl border border-[#2c475d] bg-[#1a3046] p-4"><p className="text-xs font-semibold text-white">Un equipo, en sintonía.</p><p className="mt-2 text-[11px] leading-5 text-[#9fb3c7]">Personas, turnos y solicitudes.<br />Todo en su lugar.</p></div>}
        <div className="flex items-center gap-2.5 border-t border-white/10 pt-4"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#35506a] text-xs font-bold text-white">{session.user?.username.slice(0, 2).toUpperCase()}</span>{!compact && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{session.user?.username}</p><p className="mt-1 text-[10px] text-[#9fb3c7]">{selected ? roleLabels[selected.role] : 'Tu cuenta'}</p></div><button aria-label="Cerrar sesión desde navegación" disabled={busy} onClick={logout} className="rounded-md p-2 hover:bg-white/10"><LogOut className="size-4" /></button></>}</div>
        <button className="hidden min-h-9 w-full items-center justify-center gap-2 rounded-lg text-[10px] text-[#a2b6c9] hover:bg-white/5 lg:flex" aria-label={collapsed ? 'Expandir menú lateral' : 'Contraer menú lateral'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ArrowRightFromLine className="size-4" /> : <><ArrowLeftToLine className="size-3.5" />Contraer menú</>}</button>
      </div>
    </aside>
    {open && <button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#101e30]/50 lg:hidden" onClick={() => setOpen(false)} />}
    <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:pl-[84px]' : 'lg:pl-[220px]')}>
      <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-border bg-white px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(true)}><Menu /></Button><div className="flex min-w-0 items-center gap-2 text-xs"><span className="hidden text-muted-foreground sm:block">Espacio de trabajo</span><ChevronRight className="hidden size-3 text-[#91a1b2] sm:block" /><span className="max-w-40 truncate font-medium text-[#526779] md:max-w-60">{selected?.name ?? 'Zenvik'}</span>{active && <><ChevronRight className="size-3 text-[#91a1b2]" /><span className="hidden font-semibold text-[#253c52] md:block">{active.label}</span></>}</div></div>
        <div className="flex items-center gap-5"><span className="hidden items-center gap-1.5 rounded-md bg-[#eff8f5] px-2 py-1.5 text-[10px] font-semibold text-[#26735f] sm:flex"><span className="size-1.5 rounded-full bg-[#18a999]" />{selected ? 'Negocio activo' : 'Sesión iniciada'}</span><details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg p-1"><span className="grid size-8 place-items-center rounded-full bg-[#e9eff6] text-[10px] font-bold text-[#345875]">{session.user?.username.slice(0, 2).toUpperCase()}</span><span className="sr-only">Menú de usuario</span></summary><div className="absolute top-12 right-0 z-30 w-64 rounded-xl border border-border bg-white p-3 shadow-lg"><p className="truncate px-2 py-2 text-xs text-muted-foreground">{session.user?.email}</p><Button variant="ghost" asChild className="w-full justify-start"><Link href="/app/configuracion"><Settings2 />Mi cuenta</Link></Button><Button variant="ghost" onClick={logout} disabled={busy} className="w-full justify-start"><LogOut />{busy ? 'Cerrando…' : 'Cerrar sesión'}</Button></div></details></div>
      </header>
      <main id="main" className="page-enter mx-auto max-w-[1600px] px-5 py-7 sm:px-7 lg:px-6 lg:py-6">{error && <ErrorNotice message={error} />}{children}<footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 text-[10px] text-muted-foreground"><span>Zenvik · Tu equipo, en sintonía.</span><span>Hecho para el día a día de tu negocio</span></footer></main>
    </div>
  </div>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession(); const router = useRouter();
  useEffect(() => { if (!session.loading && !session.error && !session.user) router.replace('/iniciar-sesion'); }, [session.loading, session.error, session.user, router]);
  if (session.error) return <div className="mx-auto max-w-lg p-8"><ErrorNotice message={session.error} retry={session.refresh} /></div>;
  if (!session.user || session.loading) return <div className="mx-auto max-w-3xl p-8"><Loading /></div>;
  return <WorkspaceProvider key={session.user.id}><Shell>{children}</Shell></WorkspaceProvider>;
}
