import { useId } from 'react';
import { BrandMark } from './brand-mark';

/** Decorative vector artwork; no controls or sample business data. */
export function WorkspaceIllustration() {
  const id = useId().replace(/:/g, '');
  return <svg className="workspace-illustration" viewBox="0 0 400 260" fill="none" aria-hidden="true">
    <defs><linearGradient id={`${id}-wash`} x1="40" y1="20" x2="390" y2="240" gradientUnits="userSpaceOnUse"><stop stopColor="#e1f5f1" /><stop offset="1" stopColor="#d9f1ef" /></linearGradient><linearGradient id={`${id}-mint`} x1="150" y1="80" x2="300" y2="210" gradientUnits="userSpaceOnUse"><stop stopColor="#a3e4d5" /><stop offset="1" stopColor="#42bcae" /></linearGradient><linearGradient id={`${id}-leaf`} x1="30" y1="100" x2="85" y2="200" gradientUnits="userSpaceOnUse"><stop stopColor="#10b9a2" /><stop offset="1" stopColor="#047f7b" /></linearGradient></defs>
    <path d="M27 197C-10 150 13 76 72 46C131 15 173 43 219 64C263 85 327 72 368 112C415 156 396 212 347 226C282 246 65 246 27 197Z" fill={`url(#${id}-wash)`} />
    <ellipse cx="204" cy="232" rx="173" ry="10" fill="#d6e7e9" fillOpacity=".55" />
    <path d="M111 62Q111 54 120 54L337 50Q347 50 346 61L339 222H102Z" fill="#52768a" /><path d="M119 64L338 61L332 213H111Z" fill="#f9fdfd" /><path d="M119 64L338 61L337 78L118 82Z" fill="#82cec3" /><g fill="#fff"><circle cx="126" cy="73" r="2.5" /><circle cx="134" cy="73" r="2.5" /><circle cx="142" cy="73" r="2.5" /></g><rect x="312" y="66" width="8" height="6" rx="2" fill="#35b9a9" /><circle cx="327" cy="69" r="3" fill="#17ac9c" />
    <rect x="132" y="95" width="58" height="53" rx="9" fill="#e3f5f1" /><svg x="145" y="104" width="33" height="33" viewBox="0 0 64 64"><BrandMark /></svg>
    <g fill="#d8e8ec"><rect x="129" y="161" width="60" height="7" rx="2" /><rect x="128" y="175" width="60" height="7" rx="2" /><rect x="127" y="189" width="60" height="7" rx="2" /></g>
    <rect x="205" y="94" width="117" height="7" rx="2" fill="#e8f1f3" /><rect x="205" y="107" width="117" height="7" rx="2" fill="#e8f1f3" /><rect x="204" y="122" width="116" height="75" rx="4" stroke="#e8f1f3" strokeWidth="5" /><path d="M222 188V168H236V188ZM244 188V154H258V188ZM266 188V141H280V188ZM288 188V128H302V188Z" fill={`url(#${id}-mint)`} />
    <path d="M87 218H354L349 225Q348 228 339 228H100Q91 228 87 218Z" fill="#afc8d0" /><path d="M199 218H252L247 222H204Z" fill="#91b1be" />
    <path d="M49 180C43 155 46 123 51 101M51 167L32 147M49 154L72 136" stroke="#148e7f" strokeWidth="2" /><path d="M51 130C24 115 37 79 49 91C64 104 58 122 51 130ZM45 166C22 163 20 132 30 137C45 144 46 156 45 166ZM53 156C53 132 79 117 79 130C79 147 62 157 53 156Z" fill={`url(#${id}-leaf)`} /><path d="M30 178H70L63 224H38Z" fill="#89aebb" /><path d="M30 178H70L68 185H32Z" fill="#9bbec9" />
  </svg>;
}
