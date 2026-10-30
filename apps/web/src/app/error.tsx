'use client';
import { ErrorNotice } from '@/components/feedback';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="mx-auto max-w-lg p-10"><h1 className="text-2xl font-semibold">Algo no salió como esperábamos</h1><ErrorNotice message="Intenta cargar esta página nuevamente." retry={reset} /></main>; }
