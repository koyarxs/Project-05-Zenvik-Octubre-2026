'use client';
import { useEffect, useRef, useState } from 'react';
import { loadTurnstile, type TurnstileConfig } from '@/lib/turnstile';
import { ErrorNotice } from './feedback';
import { Button } from './ui/button';

function Widget({ action, siteKey, onToken }: { action: 'login' | 'register'; siteKey: string; onToken: (token: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true; let widgetId: string | undefined;
    let compact = (container.current?.clientWidth ?? 300) < 300;
    const resize = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width < 300;
      if (alive && next !== compact) { compact = next; onToken(null); setAttempt(value => value + 1); }
    });
    if (container.current) resize.observe(container.current);
    const fail = () => { if (alive) { onToken(null); setLoading(false); setError('No pudimos completar la verificación. Reinténtalo o revisa si tu navegador la está bloqueando.'); } };
    void loadTurnstile().then(api => {
      if (!alive || !container.current) return;
      widgetId = api.render(container.current, {
        sitekey: siteKey, action, theme: 'light', size: compact ? 'compact' : 'flexible', language: 'es', 'response-field': false,
        callback: token => { if (alive) { onToken(token); setLoading(false); setError(null); } },
        'expired-callback': () => { if (alive) { onToken(null); setError('La verificación expiró. Complétala nuevamente.'); } },
        'error-callback': fail, 'timeout-callback': fail,
      });
      setLoading(false);
    }).catch(fail);
    return () => { alive = false; resize.disconnect(); if (widgetId !== undefined) window.turnstile?.remove(widgetId); };
  }, [action, siteKey, onToken, attempt]);
  return <div className="auth-challenge"><div ref={container} aria-label="Verificación de seguridad de Cloudflare" />{loading && <p role="status" className="text-xs text-muted-foreground">Preparando verificación de seguridad…</p>}{error && <div><ErrorNotice message={error} /><Button type="button" variant="outline" size="sm" onClick={() => { onToken(null); setError(null); setLoading(true); setAttempt(value => value + 1); }}>Reintentar verificación</Button></div>}</div>;
}

export function TurnstileChallenge({ action, config, error, retry, onToken }: { action: 'login' | 'register'; config?: TurnstileConfig; error?: Error; retry: () => void; onToken: (token: string | null) => void }) {
  if (error) return <ErrorNotice message={error.message} retry={retry} />;
  if (!config) return <p role="status" className="text-xs text-muted-foreground">Preparando el acceso…</p>;
  if (!config.enabled) return null;
  return <Widget action={action} siteKey={config.siteKey!} onToken={onToken} />;
}
