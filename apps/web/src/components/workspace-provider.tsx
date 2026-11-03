'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/http';
import { listBusinesses } from '@/lib/data';
import type { Business } from '@/lib/types';
import { ErrorNotice, Loading } from './feedback';
type Workspace = { businesses: Business[]; refresh: () => Promise<void> };
const Context = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const next = await listBusinesses(controller.signal);
      if (!controller.signal.aborted) { setBusinesses(next); setError(null); }
    } catch (error) {
      if (!controller.signal.aborted) { setBusinesses(null); setError(error instanceof ApiError ? error.message : 'No pudimos cargar tus negocios. Revisa la conexión y vuelve a intentarlo.'); }
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void refresh(); });
    const update = () => { void refresh(); };
    window.addEventListener('focus', update);
    return () => { mounted = false; request.current?.abort(); window.removeEventListener('focus', update); };
  }, [refresh]);
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorNotice message={error} retry={refresh} /></div>;
  if (!businesses) return <Loading />;
  return <Context.Provider value={{ businesses, refresh }}>{children}</Context.Provider>;
}
export function useWorkspace() { const context = useContext(Context); if (!context) throw new Error('WorkspaceProvider requerido'); return context; }
