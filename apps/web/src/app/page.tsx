import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Fingerprint, Users, UserRound, CircleHelp } from 'lucide-react';
import { LandingPlans, LandingNavigation, ProductTour } from '@/components/landing-content';
import { LandingHero } from '@/components/landing-hero';
import { LandingMobile } from '@/components/landing-mobile';
import { LandingAttendance } from '@/components/landing-attendance';
import { LandingFooter } from '@/components/landing-footer';
import styles from './landing.module.css';

const description = 'Organiza trabajadores, turnos, asistencia y solicitudes en el espacio de tu negocio. Conoce Zenvik, una plataforma de gestión para pymes chilenas.';
const origin = process.env.APP_ORIGIN?.startsWith('https://') ? process.env.APP_ORIGIN : undefined;
export const metadata: Metadata = {
  title: { absolute: 'Zenvik · Tu equipo, tu negocio, todo conectado' },
  description,
  ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: '/' } } : {}),
  openGraph: { title: 'Zenvik · Tu equipo, tu negocio, todo conectado', description, locale: 'es_CL', type: 'website',
    ...(origin ? { url: origin, images: [{ url: '/images/landing/dashboard-desktop.webp', width: 1198, height: 680, alt: 'Dashboard de Zenvik con datos de ejemplo de Café del Sur' }] } : {}),
  },
  twitter: { card: 'summary_large_image', title: 'Zenvik · Tu equipo, tu negocio, todo conectado', description },
};

const steps = [
  { icon: Users, title: 'Dale un espacio a tu negocio.', body: 'Crea tu cuenta y registra los datos de tu empresa. Puedes configurar tu negocio durante el registro o hacerlo después.' },
  { icon: CalendarDays, title: 'Reúne a tu equipo.', body: 'Agrega las fichas de tus trabajadores y organiza sus turnos. Define quién administra y quién consulta su propia información.' },
  { icon: Fingerprint, title: 'Acompaña cada jornada.', body: 'Consulta las marcaciones, revisa los permisos y da seguimiento a las incidencias desde sus respectivos módulos.' },
];
const questions = [
  ['¿Cómo registro mi primer negocio?', 'Elige Crear cuenta y completa tus datos. En el registro puedes agregar tu negocio, o dejarlo para después y hacerlo desde Mis negocios al iniciar sesión.'],
  ['¿Qué información puede ver un trabajador?', 'El acceso depende del rol asignado. Un trabajador puede consultar su ficha y sus propios turnos, marcaciones y solicitudes. El directorio completo y la supervisión del equipo corresponden a los roles de administración.'],
  ['¿Puedo acceder desde el celular?', 'Puedes acceder a Zenvik desde el navegador de tu celular. La navegación del trabajador permite consultar su jornada, marcar asistencia y revisar sus solicitudes según su cuenta y los permisos habilitados.'],
  ['¿Dónde veo los planes y cómo se contratan?', 'La página de planes muestra el catálogo y sus condiciones publicadas. La contratación se gestiona por negocio desde Mi suscripción. La disponibilidad de contratación y pagos se indica junto al catálogo.'],
];

export default function Home() {
  return <div className={styles.landing}>
    <a href="#contenido" className={styles.skip}>Saltar al contenido</a>
    <header className={styles.header}>
      <div className={styles.utilityBar}>
        <div className={styles.utilityInner}>
          <p><strong>ZENVIK</strong><span className={styles.utilityDivider} aria-hidden="true" /><span>Plataforma para pymes <span aria-hidden="true">·</span> Chile</span></p>
          <nav aria-label="Accesos rápidos"><Link href="/iniciar-sesion"><UserRound size={13} aria-hidden="true" />Acceso clientes</Link><Link href="/#preguntas-frecuentes"><CircleHelp size={13} aria-hidden="true" />Ayuda y preguntas</Link></nav>
        </div>
      </div>
      <div className={styles.navbar}>
        <LandingNavigation />
      </div>
    </header>
    <main id="contenido">
      <LandingHero />
      <div className={styles.moduleStrip} aria-label="Módulos de Zenvik"><span>Trabajadores</span><span>Turnos</span><span>Asistencia</span><span>Permisos</span><span>Incidencias</span></div>
      <section id="producto" className={styles.product}>
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>DE LA PLANIFICACIÓN AL DÍA A DÍA</p><h2>¿Qué está pasando hoy<br />en tu negocio?</h2><p>Abre tu panel y encuentra las personas, las jornadas y las decisiones que necesitan tu atención.</p></div>
        <ProductTour />
      </section>
      <LandingMobile />
      <section id="nosotros" className={styles.getStarted} aria-labelledby="primeros-pasos">
        <div className={styles.startHeading}><p className={styles.eyebrow}>TU PRIMERA JORNADA EN ZENVIK</p><h2 id="primeros-pasos">Empieza con tu negocio.<br /><span>Crece con tu equipo.</span></h2><Link href="/registrarse" className={styles.textLink}>Crear mi cuenta<ArrowRight size={17} /></Link></div>
        <div className={styles.steps}>{steps.map(({ icon: Icon, title, body }) => <article key={title}><Icon size={24} aria-hidden="true" /><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>
      <section className={styles.plans} id="planes">
        <div className={styles.sectionHeading}><p className={styles.eyebrow}>PLANES DE LANZAMIENTO</p><h2>Elige por el tamaño de tu equipo.</h2><p>Precios finales en pesos chilenos, IVA incluido. Una suscripción por negocio.</p></div>
        <LandingPlans />
        <div className={styles.centerLink}><Link href="/planes" className={styles.textLink}>Ver todos los detalles de los planes<ArrowUpRight size={17} /></Link></div>
      </section>
      <LandingAttendance />
      <section id="preguntas-frecuentes" className={styles.faq}>
        <div><p className={styles.eyebrow}>ANTES DE EMPEZAR</p><h2>Resolvamos<br />tus dudas.</h2></div>
        <div className={styles.questions}>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
      </section>
      <section className={styles.closing}>
        <p>Tu próxima jornada empieza aquí.</p><h2>Dale a tu equipo<br />un espacio en Zenvik.</h2>
        <div className={styles.actions}><Link href="/registrarse" className={styles.lightCta}>Crear cuenta<ArrowRight size={18} /></Link><Link href="/iniciar-sesion" className={styles.closingLogin}>Ya tengo cuenta<ArrowUpRight size={17} /></Link></div>
        <div className={styles.closingChecks}><span><Check size={15} />Tu negocio</span><span><Check size={15} />Tu equipo</span><span><Check size={15} />Tu jornada</span></div>
      </section>
    </main>
    <LandingFooter />
  </div>;
}
