'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, resetCsrf } from '@/lib/http';
import type { User } from '@/lib/types';
type Session = { user: User | null; loading: boolean; error: string | null; refresh: () => Promise<void>; accept: (user: User | null) => void };
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ user: null as User | null, loading: true, error: null as string | null });
  const version = useRef(0);
  const accept = useCallback((user: User | null) => { version.current++; setState({ user, loading: false, error: null }); }, []);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try { const user = await api<User>('/api/v1/auth/me/'); if (version.current === current) setState({ user, loading: false, error: null }); }
    catch (error) { if (version.current === current) setState({ user: null, loading: false, error: error instanceof ApiError && error.status === 403 ? null : 'No pudimos verificar tu sesión. Revisa la conexión e inténtalo de nuevo.' }); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); const expired = () => { resetCsrf(); accept(null); }; window.addEventListener('zenvik:session-expired', expired); window.addEventListener('focus', refresh); return () => { window.removeEventListener('zenvik:session-expired', expired); window.removeEventListener('focus', refresh); }; }, [refresh, accept]);
  return <Context.Provider value={{ ...state, refresh, accept }}>{children}</Context.Provider>;
}
export function useSession() { const context = useContext(Context); if (!context) throw new Error('SessionProvider requerido'); return context; }
