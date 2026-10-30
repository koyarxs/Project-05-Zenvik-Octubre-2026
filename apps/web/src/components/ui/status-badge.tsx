import { cn } from '@/lib/utils';
export function StatusBadge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'success' | 'pending' | 'muted' | 'danger' | 'info' }) {
  return <span className={cn('status', `status-${tone}`)}>{children}</span>;
}
