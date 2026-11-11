'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import styles from '@/app/landing.module.css';

const slides = [
  { image: 'entrepreneurs', title: <>Organiza tu equipo.<br /><em>Haz espacio<br />para crecer.</em></>, text: 'Trabajadores, turnos y asistencia. Todo lo que necesitas organizar, en un solo lugar.', cta: 'Crear mi cuenta', href: '/registrarse', alt: 'Emprendedores compartiendo un momento con su equipo en una cafetería.' },
  { image: 'shop', title: <>Empieza hoy.<br />Tu cuenta,<br /><em>sin tarjeta.</em></>, text: 'Crear tu cuenta no tiene costo ni exige tarjeta. Revisa los planes y sus condiciones antes de contratar.', cta: 'Crear mi cuenta', href: '/registrarse', alt: 'Emprendedora en una tienda de artículos de diseño y cerámica.' },
  { image: 'team', title: <>Menos pendientes.<br /><em>Más tiempo<br />para tu negocio.</em></>, text: 'Revisa la jornada, organiza los turnos y responde las solicitudes de tu equipo desde Zenvik.', cta: 'Conocer Zenvik', href: '/#producto', alt: 'Equipo de un pequeño negocio conversando en su taller creativo.' },
];

export function LandingHero() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReduced(preference.matches);
    const syncVisibility = () => setVisible(document.visibilityState === 'visible');
    syncMotion(); syncVisibility();
    preference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => { preference.removeEventListener('change', syncMotion); document.removeEventListener('visibilitychange', syncVisibility); };
  }, []);

  useEffect(() => {
    if (!playing || hovered || focused || !visible || reduced) return;
    const timer = window.setInterval(() => setIndex(current => (current + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing, hovered, focused, visible, reduced, index]);

  const slide = slides[index];
  const change = (next: number) => setIndex((next + slides.length) % slides.length);

  return <section className={styles.promoHero} aria-roledescription="carrusel" aria-label="Conoce Zenvik" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className={styles.promoPhotos} aria-hidden="true">{slides.map((item, position) => <div className={styles.promoPhoto} data-active={index === position} data-photo={item.image} key={item.image}><Image src={`/images/landing/promo-${item.image}.webp`} alt="" fill sizes="(max-width: 600px) 100vw, 58vw" preload={position === 0} quality={85} /></div>)}</div>
    <div className={styles.promoInner}>
      <div className={styles.promoCopy} aria-live="off">
        <h1>{slide.title}</h1>
        <p className={styles.promoDescription}>{slide.text}</p>
        <div className={styles.promoActions}><Link href={slide.href}>{slide.cta}<ArrowRight size={19} /></Link><Link href={slide.href === '/planes' ? '/registrarse' : '/planes'}>{slide.href === '/planes' ? 'Crear cuenta' : 'Ver planes'}<ArrowUpRight size={16} /></Link></div>
      </div>
        <div className={styles.promoControls}>
          <div className={styles.promoDots} aria-label="Seleccionar diapositiva">{slides.map((item, position) => <button key={item.image} type="button" aria-label={`Ver diapositiva ${position + 1}`} aria-current={index === position ? 'true' : undefined} onClick={() => change(position)}><span /></button>)}</div>
          {!reduced && <button type="button" aria-label={playing ? 'Pausar carrusel' : 'Reproducir carrusel'} onClick={() => setPlaying(current => !current)}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>}
        </div>
    </div>
    <span className="sr-only">{slide.alt} Fotografía promocional ilustrativa.</span>
  </section>;
}
