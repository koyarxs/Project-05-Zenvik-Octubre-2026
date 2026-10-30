import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SessionProvider } from '@/components/session-provider';
export const metadata: Metadata = { title: { default: 'Zenvik · Tu equipo, en sintonía', template: '%s · Zenvik' }, description: 'Personas, turnos y solicitudes conectados en el espacio de tu negocio.' };
const inter = localFont({ src: './fonts/Inter.ttf', variable: '--font-inter', weight: '100 900', display: 'swap' });
const manrope = localFont({ src: './fonts/Manrope.ttf', variable: '--font-manrope', weight: '200 800', display: 'swap' });
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="es-CL" className={`${inter.variable} ${manrope.variable}`}><body><SessionProvider>{children}</SessionProvider></body></html>; }
