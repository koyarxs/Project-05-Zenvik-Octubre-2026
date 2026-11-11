'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/http';
import { locateOnce, type EventType, type LocationResult, type MarkInput, type Receipt } from '@/lib/attendance';
import { attendanceRequest, pendingKey, pendingMetadata, readPending, savePending, type PendingMark, type PersonalCurrent } from '@/lib/personal-attendance';
import { usePersonalAttendance } from '@/components/personal-attendance-shell';

export function usePersonalMark(businessId: string, userId: string, refresh: () => void) {
  const base = `/api/v1/businesses/${businessId}/attendance`;
  const key = pendingKey(userId, businessId);
  const { setNavigationLocked } = usePersonalAttendance();
  const [stage, setStage] = useState<'idle' | 'locating' | 'sending' | 'checking'>('idle');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<PendingMark | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [online, setOnline] = useState(true);
  const alive = useRef(true); const locked = useRef(false);
  const reference = useRef<PendingMark | null>(null);
  const payload = useRef<MarkInput | null>(null);

  const remember = useCallback((value: PendingMark | null) => {
    reference.current = value;
    if (alive.current) setPending(value);
    try {
      if (!savePending(window.sessionStorage, key, value) && alive.current) setStorageWarning(true);
    } catch { if (alive.current) setStorageWarning(true); }
  }, [key]);
  const accepted = useCallback((value: Receipt) => {
    remember(null); payload.current = null;
    if (alive.current) { setReceipt(value); setError(''); setLocation(null); refresh(); }
    return value;
  }, [remember, refresh]);
  const lookup = useCallback(async (value: PendingMark) => {
    try {
      const result = await attendanceRequest<{ receipt: Receipt }>(`${base}/submissions/${value.request_id}/`, {}, 8000);
      return accepted(result.receipt);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 404) return null;
      throw failure;
    }
  }, [base, accepted]);

  useEffect(() => {
    alive.current = true;
    let stopped = false;
    const connectivity = () => setOnline(navigator.onLine);
    connectivity(); window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    const unloading = (event: BeforeUnloadEvent) => { if (locked.current || reference.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', unloading);
    void Promise.resolve().then(async () => {
      if (stopped) return;
      let value: PendingMark | null = null;
      try { value = readPending(window.sessionStorage, key); } catch { setStorageWarning(true); }
      if (value) {
        reference.current = value; setPending(value); locked.current = true; setStage('checking'); setNavigationLocked(true);
        try { await lookup(value); }
        catch { if (!stopped) setError('No pudimos consultar el intento anterior. Su resultado sigue pendiente de confirmar.'); }
        finally { locked.current = false; if (!stopped) { setStage('idle'); setNavigationLocked(false); } }
      }
      if (!stopped) setReady(true);
    });
    return () => {
      stopped = true; alive.current = false; setNavigationLocked(false);
      window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('beforeunload', unloading);
    };
  }, [key, lookup, setNavigationLocked]);

  async function recover() {
    if (locked.current || !reference.current) return;
    locked.current = true; setStage('checking'); setNavigationLocked(true); setError('');
    try {
      if (!await lookup(reference.current) && alive.current) setError('El registro todavía no aparece. Esto no demuestra un rechazo: puedes volver a consultar o reintentar el mismo intento.');
    } catch { if (alive.current) setError('No hay confirmación del servidor. Conservamos la referencia del intento.'); }
    finally { locked.current = false; if (alive.current) { setStage('idle'); setNavigationLocked(false); } }
  }

  async function confirm(action: EventType, fresh: boolean, current: PersonalCurrent, reason: string, exception = false) {
    if (locked.current || !ready || !navigator.onLine) return null;
    locked.current = true; setStage('checking'); setNavigationLocked(true); setError('');
    try {
      const prior = reference.current;
      if (prior) {
        try { const found = await lookup(prior); if (found) return found; }
        catch { if (alive.current) setError('No pudimos verificar el intento pendiente. No enviamos otra marcación.'); return null; }
      }
      if (!alive.current) return null;
      let input = payload.current;
      if (!input) {
        setStage('locating');
        const result = exception ? location : await locateOnce();
        if (!alive.current || !result) return null;
        setLocation(result);
        if (!result.location && !exception) return null;
        if (!result.location && reason.trim().length < 10) { setError('Explica la incidencia con al menos 10 caracteres.'); return null; }
        const session = fresh ? null : current.session;
        const metadata: PendingMark = prior ?? { event_type: action, request_id: crypto.randomUUID(), session_id: session?.id ?? null, expected_version: session?.version ?? 0 };
        input = { ...metadata, location: result.location, location_status: result.location_status, exception_reason: result.location ? '' : reason.trim() };
        payload.current = input; remember(pendingMetadata(input));
      }
      if (!alive.current) return null;
      setStage('sending');
      try {
        const result = await attendanceRequest<{ receipt: Receipt }>(`${base}/events/`, { method: 'POST', body: input });
        return accepted(result.receipt);
      } catch (failure) {
        if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500 && ![408, 429].includes(failure.status)) {
          // A re-captured position may differ after reload. Recover the existing ID
          // before treating a payload/version conflict as a rejected operation.
          if (failure.status === 409) {
            try { const found = await lookup(pendingMetadata(input)); if (found) return found; }
            catch { if (alive.current) setError('El servidor informó un conflicto, pero no pudimos verificar su resultado. Consulta el mismo intento.'); return null; }
          }
          remember(null); payload.current = null;
          if (alive.current) { setError(`Marcación rechazada: ${failure.message}`); refresh(); }
        } else if (alive.current) {
          setError('Respuesta no confirmada. La marcación puede haber llegado al servidor; consulta el resultado antes de reintentar.');
        }
        return null;
      }
    } finally {
      locked.current = false;
      if (alive.current) { setStage('idle'); setNavigationLocked(false); }
    }
  }
  function prepare() { if (!reference.current) { setLocation(null); setError(''); } }
  return { stage, ready, busy: stage !== 'idle', pending, receipt, closeReceipt: () => setReceipt(null), error, location, storageWarning, online, confirm, recover, prepare };
}
