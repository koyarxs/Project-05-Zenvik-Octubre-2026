import { roleLabels } from './types';
export function accessSummary(value: unknown) {
  if (!value || typeof value !== 'object') return 'Sin cuenta vinculada';
  const row = value as Record<string, unknown>;
  if (!row.user_id) return 'Sin cuenta vinculada';
  const role = typeof row.role === 'string' && row.role in roleLabels ? roleLabels[row.role as keyof typeof roleLabels] : 'Sin rol';
  return `${typeof row.account_name === 'string' ? row.account_name : 'Cuenta vinculada'} · ${role} · ${row.access_enabled === true ? 'Habilitado' : 'Suspendido'}`;
}
