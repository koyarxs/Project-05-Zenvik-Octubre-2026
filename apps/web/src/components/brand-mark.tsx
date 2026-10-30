import { useId } from 'react';

export function BrandMark({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const id = useId().replace(/:/g, '');
  const colors = tone === 'dark' ? ['#94f0df', '#24c9bf', '#1babc7', '#69dfd2'] : ['#94e0df', '#159eb4', '#08759f', '#56c4c7'];
  return <svg aria-hidden="true" viewBox="0 0 64 64" className={className} fill="none"><defs><linearGradient id={id} x1="8" y1="5" x2="56" y2="59" gradientUnits="userSpaceOnUse"><stop stopColor={colors[0]} /><stop offset=".38" stopColor={colors[1]} /><stop offset=".65" stopColor={colors[2]} /><stop offset="1" stopColor={colors[3]} /></linearGradient></defs><path d="M20 5H48C59 5 63 15 55 22L25 47H55L48 58H16C5 58 1 48 9 41L39 16H9L14 9C15 6 17 5 20 5Z" fill={`url(#${id})`} /><path d="M9 41L27 26L39 33L25 47C18 53 7 50 9 41Z" fill={tone === 'dark' ? '#0d788b' : '#07557d'} fillOpacity=".3" /></svg>;
}
