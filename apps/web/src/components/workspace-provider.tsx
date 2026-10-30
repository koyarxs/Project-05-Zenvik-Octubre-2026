'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { listBusinesses } from '@/lib/data';
import type { Business } from '@/lib/types';
import { ErrorNotice, Loading } from './feedback';
type Workspace = { businesses: Business[]; refresh: () => Promise<void> };
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { setBusinesses(await listBusinesses()); setError(null); } catch { setError('No pudimos cargar tus negocios.'); } }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorNotice message={error} retry={refresh} /></div>;
  if (!businesses) return <Loading />;
  return <Context.Provider value={{ businesses, refresh }}>{children}</Context.Provider>;
}
export function useWorkspace() { const context = useContext(Context); if (!context) throw new Error('WorkspaceProvider requerido'); return context; }
