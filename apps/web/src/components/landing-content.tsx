'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { useResource } from '@/hooks/use-resource';
import { type PlanCatalog } from '@/lib/billing';
import { PlanCards, PlanCapacity, PlanConditions } from './plan-catalog';
import styles from '@/app/landing.module.css';

const views = [
  { id: 'equipo', label: 'Equipo y turnos', image: 'dashboard', title: 'Tu equipo, con una jornada por delante.', text: 'Revisa los turnos de hoy y de los próximos días. Desde el mismo panel puedes registrar personas, abrir el calendario y consultar sus fichas.', alt: 'Dashboard real de Zenvik con equipo, turnos del día y solicitudes del negocio ficticio Café del Sur.' },
  { id: 'asistencia', label: 'Asistencia', image: 'attendance', title: 'Cada marcación, en su contexto.', text: 'La administración puede supervisar los registros del equipo. Cada trabajador consulta su propia jornada y sus comprobantes desde su acceso personal.', alt: 'Supervisión de asistencia en Zenvik con estados de trabajadores ficticios de Café del Sur.' },
  { id: 'permisos', label: 'Permisos e incidencias', image: 'requests', title: 'Las solicitudes tienen un lugar.', text: 'Revisa las solicitudes de permiso, consulta su estado y abre los detalles antes de decidir. Las incidencias cuentan con su propio módulo para darles seguimiento.', alt: 'Historial real de permisos y ausencias de Zenvik con una solicitud ficticia pendiente.' },
];

export function LandingNavigation() {
  return <>
    <Link href="/" className={styles.navBrand} aria-label="Zenvik, inicio"><BrandMark tone="orange" /><span>envik</span></Link>
    <nav className={styles.desktopNav} aria-label="Navegación principal">
      <Link href="/" className={styles.activeNav} aria-current="page">Inicio</Link>
      <details className={styles.solutions} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }}>
        <summary>Soluciones<ChevronDown size={15} /></summary>
        <div onClick={event => { if (event.target instanceof Element && event.target.closest('a')) event.currentTarget.parentElement?.removeAttribute('open'); }}>
          <Link href="/#producto">Equipo y turnos</Link><Link href="/#control-asistencia">Asistencia</Link><Link href="/#producto">Permisos e incidencias</Link><Link href="/#en-tu-celular">En tu celular</Link>
        </div>
      </details>
      <Link href="/#producto">Módulos</Link><Link href="/planes">Planes</Link><Link href="/#nosotros">Nosotros</Link><Link href="/#contacto">Contacto</Link>
    </nav>
    <div className={styles.navActions}><Link href="/iniciar-sesion" className={styles.login}>Iniciar sesión</Link><Link href="/registrarse" className={styles.navCta}>Crear cuenta<ArrowRight size={18} /></Link><MobileNavigation /></div>
  </>;
}

function MobileNavigation() {
  const menu = useRef<HTMLDetailsElement>(null);
  return <details ref={menu} className={styles.mobileMenu} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current) {
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }}>
    <summary aria-label="Abrir navegación"><span /><span /></summary>
    <nav aria-label="Navegación móvil" onClick={event => {
      if (event.target instanceof Element && event.target.closest('a') && menu.current) menu.current.open = false;
    }}><Link href="/">Inicio</Link><Link href="/#producto">Soluciones y módulos</Link><Link href="/#control-asistencia">Asistencia</Link><Link href="/#en-tu-celular">En tu celular</Link><Link href="/planes">Planes</Link><Link href="/#nosotros">Nosotros</Link><Link href="/#contacto">Contacto</Link><Link href="/registrarse">Crear cuenta</Link></nav>
  </details>;
}

export function ProductTour() {
  const [index, setIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className={styles.tour}>
    <div className={styles.tabs} role="tablist" aria-label="Explorar el producto">
      {views.map((item, position) => <button key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={index === position}
        aria-controls={`vista-${item.id}`} tabIndex={index === position ? 0 : -1}
        ref={element => { tabs.current[position] = element; }} onClick={() => setIndex(position)}
        onKeyDown={event => {
          const destinations: Record<string, number> = { ArrowRight: (position + 1) % views.length, ArrowLeft: (position + views.length - 1) % views.length, Home: 0, End: views.length - 1 };
          if (event.key in destinations) {
            event.preventDefault();
            const next = destinations[event.key];
            setIndex(next);
            tabs.current[next]?.focus();
          }
        }}>{item.label}</button>)}
    </div>
    {views.map((view, position) => <div key={view.id} role="tabpanel" id={`vista-${view.id}`} aria-labelledby={`tab-${view.id}`} tabIndex={0} hidden={index !== position} className={styles.tourPanel}>
      <div className={styles.tourCopy}><h3>{view.title}</h3><p>{view.text}</p><Link href="/registrarse" className={styles.textLink}>Empezar en Zenvik<ArrowRight size={16} /></Link><small>Café del Sur · Datos ficticios</small></div>
      <figure className={styles.tourFigure}>
        <Image className={styles.desktopImage} src={`/images/landing/${view.image}-desktop.webp`} width={1198} height={680} alt={view.alt} sizes="(min-width: 900px) 70vw, 100vw" />
        <Image className={styles.mobileImage} src={`/images/landing/${view.image}${view.id === 'equipo' ? '' : '-detail'}-mobile.webp`} width={390} height={view.id === 'permisos' ? 400 : 720} alt={view.alt} sizes="100vw" />
      </figure>
    </div>)}
  </div>;
}

export function LandingPlans() {
  const { data, error, retry } = useResource<PlanCatalog>('/api/v1/billing/plans/');
  if (error) return <div className={styles.planMessage} role="status"><h3>No pudimos consultar los planes.</h3><p>Intenta nuevamente para ver el catálogo actualizado.</p><button type="button" className={styles.textLink} onClick={retry}>Volver a intentar<ArrowRight size={16} /></button></div>;
  if (!data) return <div className={styles.planMessage} role="status">Consultando los planes de Zenvik…</div>;
  if (!data.plans.length) return <div className={styles.planMessage}><h3>Estamos preparando nuestros planes.</h3><p>Publicaremos aquí sus funciones, precios y condiciones cuando estén definidos.</p></div>;
  return <><PlanCapacity catalog={data} /><PlanCards catalog={data} compact /><PlanConditions catalog={data} /></>;
}
