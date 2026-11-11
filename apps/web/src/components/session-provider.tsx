'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, ApiError, resetCsrf } from '@/lib/http';
import type { SessionTimes, User } from '@/lib/types';
type Session = { user: User | null; loading: boolean; error: string | null; refresh: () => Promise<void>; accept: (user: User | null) => void };
const Context = createContext<Session | null>(null);
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ user: null as User | null, loading: true, error: null as string | null });
  const version = useRef(0);
  const accept = useCallback((user: User | null) => { version.current++; setState({ user, loading: false, error: null }); }, []);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    try { const user = await api<User>('/api/v1/auth/me/'); if (version.current === current) setState({ user, loading: false, error: null }); }
    catch (error) {
      if (version.current !== current) return;
      const expired = error instanceof ApiError && error.status === 403;
      if (expired) resetCsrf();
      setState({ user: null, loading: false, error: expired ? null : 'No pudimos verificar tu sesión. Revisa la conexión e inténtalo de nuevo.' });
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); const expired = () => { resetCsrf(); accept(null); }; window.addEventListener('zenvik:session-expired', expired); window.addEventListener('focus', refresh); return () => { window.removeEventListener('zenvik:session-expired', expired); window.removeEventListener('focus', refresh); }; }, [refresh, accept]);
  const userId = state.user?.id;
  const startedAt = state.user?.session_started_at;
  const expiresAt = state.user?.session_expires_at;
  const serverTime = state.user?.session_server_time;

  useEffect(() => {
    if (userId === undefined || startedAt === undefined) return;
    const controller = new AbortController();
    let lastInteraction = -Infinity;
    let inFlight = false;
    let pendingInteraction = false;
    function report(interacted: boolean) {
      if (controller.signal.aborted || document.visibilityState !== 'visible') return;
      if (inFlight) {
        pendingInteraction ||= interacted;
        return;
      }
      inFlight = true;
      void api<SessionTimes>('/api/v1/auth/session-activity/', { method: 'POST', body: { interacted }, signal: controller.signal }).then(times => {
        if (controller.signal.aborted) return;
        setState(current => {
          const user = current.user;
          if (!user || user.id !== userId || user.session_started_at !== startedAt || times.session_server_time < (user.session_server_time ?? 0)) return current;
          return { ...current, user: { ...user, ...times } };
        });
      }).catch(error => {
        if (!controller.signal.aborted && error instanceof ApiError && error.status === 403) void refresh();
      }).finally(() => {
        inFlight = false;
        if (pendingInteraction) {
          pendingInteraction = false;
          report(true);
        }
      });
    }
    const trackInteraction = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible' || performance.now() - lastInteraction < 45_000) return;
      lastInteraction = performance.now();
      report(true);
    };
    const trackPresence = () => report(false);
    const interactions = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    for (const event of interactions) window.addEventListener(event, trackInteraction, { passive: true });
    trackPresence();
    const heartbeat = window.setInterval(trackPresence, 45_000);
    document.addEventListener('visibilitychange', trackPresence);
    return () => {
      controller.abort();
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', trackPresence);
      for (const event of interactions) window.removeEventListener(event, trackInteraction);
    };
  }, [userId, startedAt, refresh]);

  useEffect(() => {
    if (expiresAt === undefined || serverTime === undefined) return;
    const timer = window.setTimeout(() => void refresh(), Math.max(1, expiresAt - serverTime + 1) * 1000);
    return () => window.clearTimeout(timer);
  }, [expiresAt, serverTime, refresh]);

  return <Context.Provider value={{ ...state, refresh, accept }}>{children}</Context.Provider>;
}
export function useSession() { const context = useContext(Context); if (!context) throw new Error('SessionProvider requerido'); return context; }
