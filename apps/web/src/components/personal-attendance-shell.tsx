'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { createContext, useContext, useState } from 'react';
import { ArrowRight, Bell, Building2, CalendarDays, ChevronDown, ClipboardCheck, Clock3, History, LogOut, ShieldCheck } from 'lucide-react';
import { api, resetCsrf } from '@/lib/http';
import { attendanceDestination, attendanceSections } from '@/lib/personal-attendance';
import type { Business } from '@/lib/types';
import { LoginFields } from './auth-form';
import { useSession } from './session-provider';
import { WorkspaceProvider, useWorkspace } from './workspace-provider';
import { ErrorNotice, Loading } from './feedback';
import { Button } from './ui/button';

type PersonalContext = { business?: Business; navigationLocked: boolean; setNavigationLocked: (locked: boolean) => void };
const Context = createContext<PersonalContext | null>(null);
export function usePersonalAttendance() {
  const value = useContext(Context);
  if (!value) throw new Error('El portal de asistencia requiere su contexto personal.');
  return value;
}
export function usePersonalBusiness() {
  const { business } = usePersonalAttendance();
  if (!business) throw new Error('Selecciona un negocio para consultar tu asistencia.');
  return business;
}
function AttendanceBrand() {
  return <span className="attendance-brand"><span>Zenvik<small>ASISTENCIA</small></span></span>;
}

export function PersonalAttendanceLayout({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  if (session.error) return <div className="attendance-login"><ErrorNotice message={session.error} retry={session.refresh} /></div>;
  if (session.loading) return <div className="attendance-login"><Loading label="Verificando tu acceso a asistencia…" /></div>;
  if (!session.user) return <div className="attendance-entry"><div className="attendance-entry__brand"><AttendanceBrand /></div><main className="attendance-login auth-screen"><span className="attendance-login__symbol"><Clock3 aria-hidden="true" /></span><p className="attendance-kicker">TU JORNADA, CON CLARIDAD</p><h1>Tu asistencia.<br />En un solo lugar.</h1><p className="attendance-login__description">Marca tu jornada, consulta tus comprobantes y sigue tus solicitudes con tu cuenta de Zenvik.</p><LoginFields destination={attendanceDestination(pathname)} /><p className="attendance-login__help"><ShieldCheck aria-hidden="true" />Usa la cuenta habilitada por tu empresa. Si no tienes acceso, contacta a su administración.</p></main><p className="attendance-entry__foot">Sin seguimiento de ubicación en segundo plano.</p></div>;
  return <WorkspaceProvider key={session.user.id}><AttendanceChrome>{children}</AttendanceChrome></WorkspaceProvider>;
}

function AttendanceChrome({ children }: { children: React.ReactNode }) {
  const { businesses } = useWorkspace();
  const { businessId } = useParams<{ businessId?: string }>();
  const pathname = usePathname();
  const session = useSession();
  const business = businesses.find(item => item.id === businessId);
  const [navigationLocked, setNavigationLocked] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setLoggingOut(true); setError('');
    try { await api('/api/v1/auth/logout/', { method: 'POST', body: {} }); resetCsrf(); session.accept(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos cerrar la sesión.'); }
    finally { setLoggingOut(false); }
  }
  const icons = [Clock3, History, ClipboardCheck, CalendarDays, Bell];
  return <Context.Provider value={{ business, navigationLocked, setNavigationLocked }}><div className="attendance-app private-theme" onClickCapture={event => { if (navigationLocked && (event.target as HTMLElement).closest('a')) { event.preventDefault(); event.stopPropagation(); } }}>
    <a href="#attendance-main" className="attendance-skip">Saltar al contenido</a>
    <header className="attendance-topbar"><Link href="/asistencia" aria-label="Zenvik Asistencia, elegir negocio" aria-disabled={navigationLocked}><AttendanceBrand /></Link><div className="attendance-topbar__account"><span className="attendance-user-name">{session.user?.username}</span><span className="attendance-user-avatar" aria-hidden="true">{session.user?.username.slice(0, 2).toUpperCase()}</span><Button variant="ghost" size="icon" disabled={loggingOut || navigationLocked} onClick={() => void logout()} aria-label="Cerrar sesión de asistencia"><LogOut /></Button></div></header>
    {business && <div className="attendance-context"><div><Building2 aria-hidden="true" /><div><small>ESTÁS MARCANDO PARA</small><strong>{business.name}</strong></div></div><Link href="/asistencia" aria-disabled={navigationLocked}>Cambiar negocio<ChevronDown aria-hidden="true" /></Link></div>}
    {business && <nav className="attendance-navigation" aria-label="Navegación personal de asistencia">{attendanceSections.map((item, index) => {
      const Icon = icons[index]; const href = `/asistencia/${business.id}${item.segment}`;
      return <Link key={item.segment} href={href} aria-label={item.label} aria-current={pathname === href ? 'page' : undefined} aria-disabled={navigationLocked}><Icon aria-hidden="true" /><span className="attendance-nav-long">{item.label}</span><span className="attendance-nav-short" aria-hidden="true">{item.short}</span></Link>;
    })}</nav>}
    <main id="attendance-main" tabIndex={-1} className="attendance-main">{error && <ErrorNotice message={error} />}{businessId && !business ? <section className="attendance-card attendance-empty"><Building2 aria-hidden="true" /><h1>Negocio no disponible</h1><p>No tienes acceso activo a este espacio. Elige uno de los negocios habilitados para tu cuenta.</p><Button asChild><Link href="/asistencia">Elegir negocio</Link></Button></section> : <div key={`${session.user?.id}:${businessId ?? 'selection'}:${pathname}`}>{children}</div>}</main>
    <footer className="attendance-footer"><ShieldCheck aria-hidden="true" /><span>Tu espacio personal · Zenvik Asistencia</span></footer>
  </div></Context.Provider>;
}

export function AttendanceBusinessPicker() {
  const { businesses } = useWorkspace();
  const { user } = useSession();
  return <section className="attendance-picker"><p className="attendance-kicker">BIENVENIDO A TU ESPACIO PERSONAL</p><h1>Hola, {user?.username}.<br />¿Dónde trabajas hoy?</h1><p>Elige tu negocio para consultar o registrar tu asistencia. Cada espacio conserva sus propias jornadas y comprobantes.</p>{businesses.length ? <div className="attendance-picker__grid">{businesses.map(business => <Link key={business.id} href={`/asistencia/${business.id}`} className="attendance-business-option" aria-label={`Elegir ${business.name}`}><span className="attendance-business-option__icon"><Building2 aria-hidden="true" /></span><div><h2>{business.name}</h2><p>Entrar a mi asistencia</p></div><ArrowRight aria-hidden="true" /></Link>)}</div> : <div className="attendance-card attendance-empty"><Building2 aria-hidden="true" /><h2>No tienes negocios habilitados</h2><p>Solicita a la administración que vincule tu cuenta y habilite tu acceso. No necesitas crear una empresa para marcar.</p></div>}<p className="attendance-picker__privacy"><ShieldCheck aria-hidden="true" />Solo verás tu información personal, también si administras un negocio.</p></section>;
}
