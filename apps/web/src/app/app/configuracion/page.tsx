'use client';
import { ShieldCheck, UserRound, Building2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/components/session-provider';
import { useWorkspace } from '@/components/workspace-provider';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/operations-panels';
import { Toast } from '@/components/ui/toast';
import { ErrorNotice } from '@/components/feedback';
import { api } from '@/lib/http';
import type { User } from '@/lib/types';
export default function Page() {
  const session = useSession(); const { businesses } = useWorkspace();
  const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function refresh() { setBusy(true); setError(null); setNotice(null); try { const user = await api<User>('/api/v1/auth/me/'); session.accept(user); setNotice('Los datos de tu cuenta se consultaron nuevamente.'); } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos actualizar la información.'); } finally { setBusy(false); } }
  return <><Toast message={notice} onClose={() => setNotice(null)} />{error && <ErrorNotice message={error} />}<PageHeading eyebrow="PREFERENCIAS Y CUENTA" title="Tu espacio de trabajo" description="Información de tu cuenta y de los espacios a los que tienes acceso." /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><section className="surface"><SectionHeader title="Datos de tu cuenta" /><div className="p-6"><span className="avatar mb-5"><UserRound className="size-5" /></span><dl className="grid gap-6 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Nombre de usuario</dt><dd className="mt-2 text-sm font-semibold">{session.user?.username}</dd></div><div><dt className="text-xs text-muted-foreground">Correo electrónico</dt><dd className="mt-2 break-all text-sm font-semibold">{session.user?.email}</dd></div></dl><p className="mt-6 border-t border-border pt-5 text-xs leading-6 text-muted-foreground">Estos datos son de consulta. Para cambios de cuenta o recuperación de acceso, contacta a la administración.</p><Button variant="outline" className="mt-4" disabled={busy} onClick={() => void refresh()}>{busy ? 'Consultando…' : 'Actualizar información'}</Button></div></section><section className="surface p-6"><ShieldCheck className="size-6 text-primary" /><h2 className="mt-4 text-sm font-bold">Tu acceso, bajo control</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">Cada negocio mantiene su propio espacio. Las acciones disponibles dependen de tu rol en él.</p><div className="mt-6 flex items-center gap-3 border-t border-border pt-5"><Building2 className="size-4 text-primary" /><span className="text-xs">{businesses.length} {businesses.length === 1 ? 'negocio disponible' : 'negocios disponibles'}</span></div></section></div></>;
}
