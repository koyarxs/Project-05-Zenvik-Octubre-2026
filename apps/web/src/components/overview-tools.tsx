'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Bell, BellOff, ChevronRight, CircleHelp, Search, Store, UserRound } from 'lucide-react';
import { api } from '@/lib/http';
import { useResource } from '@/hooks/use-resource';
import type { Business } from '@/lib/types';
import { NotificationBell } from './attendance-notifications';
import { useSession } from './session-provider';
import { SessionTime } from './session-time';
import { useWorkspace } from './workspace-provider';
import styles from './platform-console.module.css';

type BusinessEvent = {
  id: string;
  business_id: string;
  business_name: string;
  kind: 'created' | 'updated';
  occurred_at: string;
  is_active: boolean;
};

export function RecentBusinessActivity({ business }: { business: Business }) {
  const resource = useResource<BusinessEvent[]>('/api/v1/businesses/activity/');
  const events = resource.data?.filter(event => event.business_id === business.id).slice(0, 4);
  return <section className="surface p-5"><div className="mb-3 flex items-center justify-between gap-2"><h2 className="section-title">Actividad reciente</h2><Store size={17} className="text-primary" aria-hidden="true" /></div>
    {resource.error ? <p className="text-xs text-muted-foreground">No se pudo consultar la actividad. <button type="button" className="text-link" onClick={resource.retry}>Reintentar</button></p>
      : !events ? <p className="text-xs text-muted-foreground">Consultando actividad…</p>
      : !events.length ? <p className="text-xs text-muted-foreground">Aún no hay altas ni cambios registrados para este negocio.</p>
      : <ul className="operations-activity">{events.map(event => <li key={event.id}><span>{event.kind === 'created' ? 'Negocio registrado' : 'Negocio actualizado'}</span><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' })}</time></li>)}</ul>}
  </section>;
}

export function ProfileMenuHeader() {
  const { user } = useSession();
  return <div className="overview-profile-heading">
    <div className="overview-profile-identity">
      <UserRound size={19} aria-hidden="true" />
      <span><strong>{user?.username}</strong><small>{user?.email}</small></span>
    </div>
    <SessionTime />
  </div>;
}

export function BusinessStorefront() {
  return <svg viewBox="0 0 48 48" className="size-8 shrink-0" aria-hidden="true">
    <path fill="var(--shop-side, #174b98)" d="m8 19 23 2 8-5v22l-9 5-22-4z" />
    <path fill="var(--shop-front, #82b1f6)" d="m9 20 22 1v20l-22-4z" />
    <path fill="var(--shop-window, #cfe1fc)" d="m13 25 7 1v9l-7-1z" />
    <path fill="var(--shop-door, #154ca0)" d="m23 26 5 1v13l-5-1z" />
    <path fill="var(--shop-roof, #2a75e6)" d="m5 17 8-10 23 3 7 9-11 6-26-4z" />
    <path fill="var(--shop-awning, #4289f2)" d="m5 17 8-10 23 3-5 11z" />
    <path fill="var(--shop-stripe, #e9f1fd)" d="m11 18 7-10 4 1-6 10zm11 2 6-10h5l-5 11z" />
    <path fill="var(--shop-trim, #3b84f1)" d="m5 17 26 4 12-2v3l-12 4-26-4z" />
    <path fill="var(--shop-edge, #115ccd)" d="m31 21 12-2v3l-12 4z" />
  </svg>;
}

export type OverviewIcon = 'case' | 'team' | 'manager' | 'pulse' | 'layers' | 'settings';

export function OverviewGlyph({ icon }: { icon: OverviewIcon }) {
  const id = useId();
  const accent = `url(#${id})`;
  const people = <><circle cx="17" cy="15" r="8" /><circle cx="33" cy="18" r="6" /><path d="M4 40v-5a13 13 0 0 1 26 0v5Zm29 0v-5a16 16 0 0 0-3-10 10 10 0 0 1 14 9v6Z" /></>;
  const shapes = {
    case: <><path d="M17 13V9a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v4" fill="none" stroke={accent} strokeWidth="4" /><rect x="5" y="12" width="38" height="30" rx="7" /><path d="M5 18a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v7H5Z" fill="var(--glyph-highlight, #609bf4)" /><path d="M21 23h6v5h-6zM10 33h28" fill="var(--glyph-glint, #deeafd)" stroke="var(--glyph-glint, #deeafd)" strokeWidth="2" /></>,
    team: people,
    manager: <><path d="m6 10 10 7 8-12 8 12 10-7-5 17H11Z" /><circle cx="6" cy="9" r="3" /><circle cx="24" cy="5" r="3" /><circle cx="42" cy="9" r="3" /><path d="M7 44c0-9 7-15 16-15h2c9 0 16 6 16 15Z" /><path d="M16 26h16" stroke="var(--glyph-line, #7daef6)" strokeWidth="2" /></>,
    pulse: <path d="M3 24h10l6-15 8 31 7-16h11" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />,
    layers: <><path d="m4 31 20 11 20-11v5L24 47 4 36Z" /><path d="m4 23 20 11 20-11v5L24 39 4 28Z" fill="var(--glyph-layer, #2778f0)" /><path d="m4 15 18-11a4 4 0 0 1 4 0l18 11a2 2 0 0 1 0 3L26 29a4 4 0 0 1-4 0L4 18a2 2 0 0 1 0-3Z" /></>,
    settings: <><path d="m20 3-2 6-5 2-6-2-4 7 4 4v7l-4 4 4 7 6-2 5 2 2 6h8l2-6 5-2 6 2 4-7-4-4v-7l4-4-4-7-6 2-5-2-2-6Z" /><circle cx="24" cy="24" r="11" fill="var(--glyph-center, #c3dafb)" /><circle cx="24" cy="24" r="6" /></>,
  };
  return <svg viewBox="0 0 48 48" fill={accent} aria-hidden="true"><defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor="var(--glyph-light, #448af2)" /><stop offset=".52" stopColor="var(--glyph-mid, #2476f0)" /><stop offset="1" stopColor="var(--glyph-dark, #1067e8)" /></linearGradient></defs>{shapes[icon]}</svg>;
}

export function OverviewHero({ admin = false, photo = false }: { admin?: boolean; photo?: boolean }) {
  return <section className={styles.hero}>
    {photo && <Image className={styles.businessHeroPhoto} src="/images/workspace-hero-v1.png" alt="" fill sizes="(max-width: 1023px) 100vw, 84vw" preload />}
    <svg className={styles.heroWaves} viewBox="0 0 1300 220" preserveAspectRatio="none" aria-hidden="true">
      <path fill="var(--art-paper, #f5f9fe)" d="M0 0h762c-89 30-132 75-175 142-46 71-137 78-285 78H0Z" />
      <path fill="var(--art-paper, #f5f9fe)" d="M0 0h705c-105 41-82 160-190 194-108 34-184 10-255-12-105-33-169 66-260-12Z" />
      <path fill="var(--wave-soft, #80aff6)" d="M0 191c99 45 152-63 257-17 93 41 151 53 258 20 105-33 92-155 190-194h49c-106 48-109 164-226 205-114 40-201 11-264 15H0Z" />
      <path fill="var(--wave-main, #2979f0)" d="M261 219c100 0 197-5 254-25C623 156 599 44 705 0h69c-121 42-113 169-245 209-95 28-194 10-268 10Zm892 1c61-32 82-99 147-111v111Z" />
      <path fill="var(--wave-edge, #4389f2)" d="M1192 220c40-21 62-42 108-55v55Z" />
    </svg>
    {!photo && <span className={styles.heroArt} aria-hidden="true"><BusinessStorefront /></span>}
    <div className={styles.heroCopy}><p>{admin ? 'Administración de plataforma' : 'Tu espacio de trabajo'}</p><h1>{admin ? <>Centro de <em>control</em></> : <>Haz crecer <em>tu negocio</em></>}</h1></div>
  </section>;
}

export function ManagementArtwork() {
  return <svg className={styles.managementArt} viewBox="0 0 240 160" aria-hidden="true">
    <g transform="translate(105 29) rotate(-6 63 63)">
      <rect x="5" y="5" width="122" height="120" rx="15" fill="var(--art-shadow, #87a7d6)" />
      <rect width="122" height="120" rx="15" fill="var(--art-paper, #f5f9fe)" />
      <path d="M19 97h87" stroke="var(--art-line, #d0def3)" strokeWidth="3" />
      <g fill="var(--art-orange, #2878f0)" stroke="var(--art-bar, #5896f3)" strokeWidth="3">
        <rect x="22" y="72" width="14" height="25" rx="3" /><rect x="44" y="60" width="14" height="37" rx="3" />
        <rect x="66" y="45" width="14" height="52" rx="3" /><rect x="88" y="29" width="14" height="68" rx="3" />
      </g>
    </g>
    <g transform="translate(12 21) rotate(6 59 63)">
      <rect x="6" y="7" width="120" height="126" rx="18" fill="var(--calendar-shadow, #6e91c5)" />
      <rect width="120" height="126" rx="18" fill="var(--art-paper, #f5f9fe)" />
      <rect x="4" y="31" width="112" height="90" rx="13" fill="var(--calendar-sheet, #e4ecf7)" stroke="#fff" strokeWidth="4" />
      <path d="M0 31V18C0 8 8 0 18 0h84c10 0 18 8 18 18v13Z" fill="var(--art-orange, #2878f0)" />
      <path d="M23 14V1a6 6 0 0 1 12 0v13M54 14V1a6 6 0 0 1 12 0v13M85 14V1a6 6 0 0 1 12 0v13" fill="none" stroke="var(--calendar-ring, #5091f3)" strokeWidth="8" strokeLinecap="round" />
      <path d="m32 76 17 17 37-42" fill="none" stroke="var(--calendar-check, #1f72ef)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}

export function OverviewTools({ business, onActivity }: { business?: Business; onActivity?: () => void }) {
  const { user } = useSession();
  const { businesses, refresh } = useWorkspace();
  const readKey = 'zenvik:business-activity-read:' + user?.id;
  const [events, setEvents] = useState<BusinessEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(readKey) ?? '[]');
      return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });
  const latest = useRef<string | undefined>(undefined);

  useEffect(() => {
    let request: AbortController | undefined;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const next = await api<BusinessEvent[]>('/api/v1/businesses/activity/', { signal: controller.signal });
        if (controller.signal.aborted) return;
        const eventIds = next.map(event => event.id).join(',');
        if (latest.current !== undefined && eventIds !== latest.current) {
          void refresh();
          onActivity?.();
        }
        latest.current = eventIds;
        setEvents(next);
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    const poll = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(poll, 30_000);
    window.addEventListener('focus', poll);
    return () => {
      request?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
    };
  }, [attempt, onActivity, refresh]);

  const unread = events?.filter(event => !read.includes(event.id)).length ?? 0;

  function markRead() {
    const ids = events?.map(event => event.id) ?? [];
    setRead(ids);
    try { localStorage.setItem(readKey, JSON.stringify(ids)); } catch {}
  }

  return <div className={styles.overviewTools} onKeyDown={event => {
    if (event.key !== 'Escape') return;
    const details = (event.target as HTMLElement).closest('details');
    if (details) {
      details.open = false;
      details.querySelector('summary')?.focus();
    }
  }}>
    <details className={styles.tool} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
      <summary aria-label={unread ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'}><Bell size={19} />{unread > 0 && <span className={styles.unread} aria-hidden="true" />}</summary>
      <div className={`overview-popover ${styles.toolPanel}`}>
        <div className={styles.toolHeading}>
          <div><span className={styles.toolEyebrow}>Tu bandeja</span><strong>Notificaciones</strong><small>{unread ? `${unread} sin leer en actividad de negocios` : 'Actividad de negocios'}</small></div>
          {unread > 0 && <button className={styles.markRead} type="button" onClick={event => {
          event.currentTarget.closest('details')?.querySelector('summary')?.focus();
          markRead();
          }}>Marcar leídas</button>}
        </div>
        {business && <NotificationBell key={business.id} business={business} showLabel />}
        {failed && <p className={styles.toolNotice}>No se pudo actualizar. <button type="button" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></p>}
        {!failed && events === null && <p className={styles.toolNotice}>Consultando actividad…</p>}
        {!failed && events?.length === 0 && <div className={styles.toolEmpty}><BellOff size={22} aria-hidden="true" /><strong>Aún no hay actividad</strong><p>Aquí aparecerán las altas y actualizaciones de tus negocios.</p></div>}
        {!!events?.length && <ul className={styles.eventList}>
          {events?.map(event => {
            const business = businesses.find(item => item.id === event.business_id);
            const copy = <><Store size={18} aria-hidden="true" /><span><strong>{event.kind === 'created' ? 'Negocio registrado' : 'Negocio actualizado'}</strong><small>{event.business_name}</small><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' })}</time></span></>;
            return <li key={event.id} data-unread={!read.includes(event.id)}>{business && event.is_active ? <Link href={`/app/${business.id}`}>{copy}<ChevronRight size={15} className={styles.eventArrow} aria-hidden="true" /></Link> : <div>{copy}</div>}</li>;
          })}
        </ul>}
      </div>
    </details>
    <details className={styles.tool} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}>
      <summary aria-label="Ayuda del panel"><CircleHelp size={19} /></summary>
      <div className={`overview-popover ${styles.toolPanel}`}>
        <div className={styles.toolHeading}><div><span className={styles.toolEyebrow}>Guía rápida</span><strong>Ayuda del panel</strong></div><CircleHelp size={21} aria-hidden="true" /></div>
        <ul className={styles.helpList}>
          <li><Search size={17} aria-hidden="true" /><span><strong>Encuentra un negocio</strong><small>Busca por nombre o RUT.</small></span></li>
          <li><Bell size={17} aria-hidden="true" /><span><strong>Revisa la actividad</strong><small>La campana muestra las altas y los cambios de tus negocios.</small></span></li>
        </ul>
        <Link className={styles.helpLink} href="/app/configuracion">Ir a mi cuenta <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </div>
    </details>
  </div>;
}
