import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PersonalAttendanceLayout } from '@/components/personal-attendance-shell';
import { Loading } from '@/components/feedback';
import './personal-attendance.css';

export const metadata: Metadata = { title: 'Zenvik Asistencia', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading label="Cargando asistencia…" />}><PersonalAttendanceLayout>{children}</PersonalAttendanceLayout></Suspense>;
}
