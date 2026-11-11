'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowRight, BatteryFull, CalendarDays, Fingerprint, Globe2, Signal, Umbrella, Wifi } from 'lucide-react';
import styles from './landing-mobile.module.css';

const screens = [
  { id: 'inicio', label: 'Tu equipo', icon: CalendarDays, description: 'Personas y turnos del día.', image: 'dashboard-mobile', height: 720, alt: 'Inicio de Zenvik en el navegador móvil con indicadores y turnos del negocio ficticio Café del Sur.' },
  { id: 'asistencia', label: 'Asistencia', icon: Fingerprint, description: 'Marcaciones y estados.', image: 'attendance-detail-mobile', height: 720, alt: 'Vista móvil real de asistencia de Café del Sur, con estados y datos ficticios.' },
  { id: 'solicitudes', label: 'Permisos', icon: Umbrella, description: 'Solicitudes por revisar.', image: 'requests-detail-mobile', height: 400, alt: 'Solicitud de permiso pendiente en la interfaz móvil de Zenvik, con datos ficticios.' },
];

function Phone({ screen, secondary = false }: { screen: typeof screens[number]; secondary?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  return <div className={`${styles.phone} ${secondary ? styles.secondary : styles.primary}`} aria-hidden={secondary || undefined}>
    <div className={styles.sideKey} />
    <div className={styles.phoneInner}>
      <div className={styles.status} aria-hidden="true"><span>9:41</span><i /><span><Signal size={11} /><Wifi size={11} /><BatteryFull size={15} /></span></div>
      <div className={styles.browser} aria-hidden="true"><Globe2 size={10} /><span>Zenvik</span><span>•••</span></div>
      <div ref={viewport} key={screen.id} className={styles.screen} tabIndex={secondary ? undefined : 0} role={secondary ? undefined : 'region'} aria-label={secondary ? undefined : `${screen.label}. Vista de demostración desplazable`}>
        <Image src={`/images/landing/${screen.image}.webp`} width={390} height={screen.height} alt={secondary ? '' : screen.alt} sizes="(max-width: 600px) 240px, 270px" />
      </div>
      <div className={styles.homeIndicator} aria-hidden="true"><span /></div>
    </div>
  </div>;
}

export function LandingMobile() {
  const [index, setIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const screen = screens[index];
  return <section id="en-tu-celular" className={styles.section} aria-labelledby="mobile-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={styles.kicker}>Zenvik móvil</p>
        <h2 id="mobile-title">Tu negocio.<br />También <em>contigo.</em></h2>
        <p className={styles.intro}>Tu equipo, sus turnos y las solicitudes del negocio, desde tu celular.</p>
        <div role="tablist" aria-label="Explorar Zenvik en el celular" className={styles.selector}>
          {screens.map((item, position) => <button key={item.id} ref={element => { buttons.current[position] = element; }} id={`mobile-tab-${item.id}`} role="tab" type="button" tabIndex={index === position ? 0 : -1} aria-selected={index === position} aria-controls={`mobile-panel-${item.id}`} onClick={() => setIndex(position)} onKeyDown={event => {
            const positions: Record<string, number> = { ArrowRight: (position + 1) % screens.length, ArrowLeft: (position + screens.length - 1) % screens.length, Home: 0, End: screens.length - 1 };
            if (event.key in positions) { event.preventDefault(); setIndex(positions[event.key]); buttons.current[positions[event.key]]?.focus(); }
          }}><item.icon size={25} aria-hidden="true" /><span><strong>{item.label}</strong><span>{item.description}</span></span></button>)}
        </div>
        <div className={styles.actions}><Link href="/registrarse" className={styles.cta}>Crear mi cuenta<ArrowRight size={17} /></Link>
          <div className={styles.stores} aria-label="Aplicaciones móviles próximamente">
            <div className={styles.store}><svg viewBox="0 0 24 26" aria-hidden="true"><path fill="#00b879" d="M1 1 14 13 1 25Z"/><path fill="#00a7f1" d="m1 1 16 9-3 3Z"/><path fill="#ffca28" d="m17 10 6 3-6 3-3-3Z"/><path fill="#f44754" d="m1 25 16-9-3-3Z"/></svg><span><small>Próximamente en</small><strong>Google Play</strong></span></div>
            <div className={styles.store}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.4c0-2 1.7-3 1.8-3.1-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8C6.9 7.6 4.5 9.4 4.5 13c0 2.2.8 4.6 1.9 6.1.9 1.3 1.8 2.5 3.2 2.4 1.3-.1 1.8-.8 3.3-.8s1.9.8 3.3.8c1.4 0 2.2-1.2 3.1-2.4.6-.9 1-1.8 1.2-2.3-2.6-1-3.4-3-3.4-4.4ZM14.9 5.9c.7-.9 1.2-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5Z"/></svg><span><small>Próximamente en</small><strong>App Store</strong></span></div>
          </div>
        </div>
        <p className={styles.access}>Hoy puedes usar Zenvik desde el navegador de tu celular.</p>
      </div>
      <div className={styles.visual}>
        <div className={styles.orbit} aria-hidden="true" />
        <div className={styles.devices}>
          <Phone screen={screens[(index + 1) % screens.length]} secondary />
          {screens.map((item, position) => <div key={item.id} id={`mobile-panel-${item.id}`} role="tabpanel" aria-labelledby={`mobile-tab-${item.id}`} hidden={index !== position} className={styles.panel}><Phone screen={item} /></div>)}
        </div>
        <p className={styles.caption}>Vistas de ejemplo · Datos ficticios</p>
        <span className="sr-only" aria-live="polite">Vista seleccionada: {screen.label}</span>
      </div>
    </div>
  </section>;
}
