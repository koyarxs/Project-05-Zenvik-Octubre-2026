'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/http';
export function useResource<T>(path: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T; error?: Error }>({ key: '' });
  const key = `${path}:${attempt}`;
  useEffect(() => { const controller = new AbortController(); api<T>(path, { signal: controller.signal }).then(data => setState({ key, data })).catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error : new Error('Error de conexión.') }); }); return () => controller.abort(); }, [path, key]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, retry: () => setAttempt(value => value + 1) };
}
