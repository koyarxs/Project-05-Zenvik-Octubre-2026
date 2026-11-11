'use client';

import { Clock3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSession } from './session-provider';

const timeFormat = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });

export function SessionTime({ className }: { className?: string }) {
  const { user } = useSession();
  const startedAt = user?.session_started_at;
  return startedAt === undefined ? null : <SessionClock key={startedAt} startedAt={startedAt} className={className} />;
}

function SessionClock({ startedAt, className }: { startedAt: number; className?: string }) {
  const start = startedAt * 1000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 5000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  return <div className={cn('overview-session-time', className)}>
    <Clock3 size={15} aria-hidden="true" />
    <span>Sesión desde <time dateTime={new Date(start).toISOString()}>{timeFormat.format(start)}</time><small>{minutes} {minutes === 1 ? 'minuto conectado' : 'minutos conectado'}</small></span>
  </div>;
}
