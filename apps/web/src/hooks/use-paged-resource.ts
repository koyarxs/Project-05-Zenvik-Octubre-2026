'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/http';
import type { Page } from '@/lib/types';

export function usePagedResource<T extends { id: string }>(path: string) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ key: string; data?: T[]; error?: Error }>({ key: '' });
  const key = `${path}:${version}`;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const all = new Map<string, T>(); let page = 1;
      while (true) {
        const response = await api<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}`, { signal: controller.signal });
        response.results.forEach(row => all.set(row.id, row));
        if (!response.next) break;
        page++;
      }
      if (!controller.signal.aborted) setState({ key, data: [...all.values()] });
    }
    void load().catch(error => { if (!controller.signal.aborted) setState({ key, error: error instanceof Error ? error : new Error('Error de conexión.') }); });
    return () => controller.abort();
  }, [path, key]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, reload: () => setVersion(value => value + 1) };
}
