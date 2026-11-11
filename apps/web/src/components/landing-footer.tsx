import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, ChevronUp, Globe2 } from 'lucide-react';
import { BrandMark } from './brand-mark';
import styles from './landing-footer.module.css';

const productLinks = [
  ['El producto', '/#producto'], ['Control de asistencia', '/#control-asistencia'],
  ['Zenvik en tu celular', '/#en-tu-celular'], ['Planes y capacidades', '/planes'],
];
const accessLinks = [
  ['Crear una cuenta', '/registrarse'], ['Iniciar sesión', '/iniciar-sesion'],
  ['Preguntas frecuentes', '/#preguntas-frecuentes'], ['Primeros pasos', '/#nosotros'],
];

export function LandingFooter() {
  return <footer id="contacto" className={styles.footer}>
    <div className={styles.inner}>
      <div className={styles.top}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand} aria-label="Zenvik, inicio"><BrandMark tone="orange" /><span>envik</span></Link>
          <p>Trabajadores, turnos y asistencia.<br />El día a día de tu negocio, en Zenvik.</p>
          <span className={styles.location}><Globe2 size={13} aria-hidden="true" />Para pymes en Chile</span>
        </div>
        <nav aria-label="Producto, enlaces del pie" className={styles.linkColumn}><h2>Producto</h2>{productLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
        <nav aria-label="Acceso y ayuda, enlaces del pie" className={styles.linkColumn}><h2>Comienza aquí</h2>{accessLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</nav>
        <div className={styles.apps}>
          <h2>También en tu celular</h2><p>Hoy, desde el navegador.<br />Próximamente, en las tiendas.</p>
          <div className={styles.storeGrid} aria-label="Futuras aplicaciones móviles, todavía no disponibles para descargar">
            <div className={styles.store}><svg viewBox="0 0 24 26" aria-hidden="true"><path fill="#00b879" d="M1 1 14 13 1 25Z"/><path fill="#00a7f1" d="m1 1 16 9-3 3Z"/><path fill="#ffca28" d="m17 10 6 3-6 3-3-3Z"/><path fill="#f44754" d="m1 25 16-9-3-3Z"/></svg><span><small>Próximamente en</small><strong>Google Play</strong></span></div>
            <div className={styles.store}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.4c0-2 1.7-3 1.8-3.1-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8C6.9 7.6 4.5 9.4 4.5 13c0 2.2.8 4.6 1.9 6.1.9 1.3 1.8 2.5 3.2 2.4 1.3-.1 1.8-.8 3.3-.8s1.9.8 3.3.8c1.4 0 2.2-1.2 3.1-2.4.6-.9 1-1.8 1.2-2.3-2.6-1-3.4-3-3.4-4.4ZM14.9 5.9c.7-.9 1.2-2.1 1.1-3.4-1.1.1-2.4.8-3.1 1.7-.7.8-1.3 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5Z"/></svg><span><small>Próximamente en</small><strong>App Store</strong></span></div>
          </div>
          <Link href="/#en-tu-celular" className={styles.mobileLink}>Conoce la experiencia móvil<ArrowUpRight size={13} aria-hidden="true" /></Link>
        </div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.copyright}><span>© {new Date().getFullYear()} Zenvik.</span><span>Todos los derechos reservados.</span></div>
        <div className={styles.credit}><span>Desarrollado por</span><div className={styles.veltrix} role="img" aria-label="YB Veltrix Solutions"><Image src="/images/yb-veltrix-mark.svg" alt="" width={38} height={38} /><span><strong>YB Veltrix</strong><small>SOLUTIONS</small></span></div></div>
        <a href="#contenido" className={styles.backTop}>Volver arriba<ChevronUp size={15} aria-hidden="true" /></a>
      </div>
    </div>
  </footer>;
}
