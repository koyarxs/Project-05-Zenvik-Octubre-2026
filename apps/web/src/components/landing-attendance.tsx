import Image from 'next/image';
import attendanceArtwork from '../../public/images/landing/attendance-illustration.webp';
import styles from './landing-attendance.module.css';

export function LandingAttendance() {
  return <section id="control-asistencia" className={styles.section} aria-labelledby="attendance-title">
    <div className={styles.inner}>
      <div className={styles.copy}>
        <p className={styles.label}>Control de asistencia</p>
        <h2 id="attendance-title">Una jornada.<br />Tres formas<br /> de <em>verla.</em></h2>
        <p className={styles.description}>Tu equipo registra su entrada, colación y salida desde el navegador. Tú revisas las marcaciones y el estado de cada jornada en el panel de asistencia.</p>
        <p className={styles.detail}>Desde el notebook, la tablet o el celular: consulta el historial y revisa las incidencias con el acceso que corresponde a cada cuenta.</p>
      </div>
      <figure className={styles.artwork}>
        <Image src={attendanceArtwork} alt="Ilustración de la demo de asistencia de Zenvik: notebook con jornadas del equipo, tablet con trabajadores y celular con una marcación de entrada." sizes="(max-width: 700px) 100vw, 65vw" />
        <figcaption>Demo visual · Datos de ejemplo</figcaption>
      </figure>
    </div>
  </section>;
}
