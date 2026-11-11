import Image from 'next/image';
import { CalendarDays, ChartNoAxesColumnIncreasing, Store, UsersRound } from 'lucide-react';
import { BrandMark } from './brand-mark';

const features = [
  { label: 'Turnos', icon: CalendarDays },
  { label: 'Asistencia', icon: UsersRound },
  { label: 'Reportes', icon: ChartNoAxesColumnIncreasing },
];

export function AuthHero() {
  return <div className="access-hero">
    <Image src="/images/auth-cafe-v1.png" alt="" fill preload sizes="(min-width: 900px) 50vw, 100vw" className="access-photo" />
    <div className="access-brand" role="img" aria-label="Zenvik">
      <BrandMark tone="orange" className="access-brand-mark" />
      <span aria-hidden="true">envik</span>
    </div>
    <div className="access-caption">
      <div className="access-badge"><Store aria-hidden="true" /> SaaS para PYMES</div>
      <p className="access-tagline">Más tiempo<br />para tu <em>negocio</em></p>
      <p className="access-description">Tu equipo, tus turnos y tu asistencia en un solo lugar.</p>
      <ul className="access-features">
        {features.map(({ label, icon: Icon }) => (
          <li key={label}><span><Icon aria-hidden="true" /></span>{label}</li>
        ))}
      </ul>
    </div>
    <svg className="access-ribbon" viewBox="0 0 800 250" preserveAspectRatio="none" aria-hidden="true">
      <path fill="#ff8500" fillOpacity=".85" d="M415 0H590C675 53 710 109 720 202C653 100 545 51 415 0Z" />
      <path fill="#ffad43" fillOpacity=".55" d="M415 0H495C598 50 665 113 720 202C641 116 541 56 415 0Z" />
    </svg>
    <svg className="access-waves" viewBox="0 0 800 170" preserveAspectRatio="none" aria-hidden="true">
      <path fill="#ff8500" fillOpacity=".9" d="M0 0C133 43 213 143 460 170H0Z" />
      <path fill="#fff4eb" fillOpacity=".67" d="M0 112C221 4 359 170 565 149C654 140 725 99 800 80V170H0Z" />
      <path fill="#fff" fillOpacity=".82" d="M0 153C240 81 367 197 590 159C694 141 722 131 800 128V170H0Z" />
    </svg>
  </div>;
}
