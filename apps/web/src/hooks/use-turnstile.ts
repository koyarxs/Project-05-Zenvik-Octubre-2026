'use client';
import { useCallback, useState } from 'react';
import { useResource } from './use-resource';
import type { TurnstileConfig } from '@/lib/turnstile';

export function useTurnstile() {
  const resource = useResource<{ turnstile: TurnstileConfig }>('/api/v1/auth/csrf/');
  const [token, setToken] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const receiveToken = useCallback((value: string | null) => setToken(value), []);
  const reset = useCallback(() => { setToken(null); setVersion(value => value + 1); }, []);
  const value = resource.data?.turnstile;
  const config = value && typeof value.enabled === 'boolean' && (!value.enabled || (typeof value.siteKey === 'string' && value.siteKey.length > 0)) ? value : undefined;
  const error = resource.error ?? (resource.data && !config ? new Error('No pudimos preparar la verificación de seguridad. Actualiza el backend e inténtalo nuevamente.') : undefined);
  const ready = !!config && (!config.enabled || !!token);
  function payload() {
    if (!ready) throw new Error('Completa la verificación de seguridad antes de continuar.');
    return config?.enabled ? { turnstile_token: token! } : {};
  }
  return { config, error, ready, version, receiveToken, reset, payload, retry: resource.retry };
}
