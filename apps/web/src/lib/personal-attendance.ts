import { api } from './http';
import { eventLabels, type AttendanceCurrent, type MarkInput } from './attendance';

export type PersonalCurrent = Omit<AttendanceCurrent, 'policy'> & {
  policy: Pick<AttendanceCurrent['policy'], 'version' | 'location_required' | 'max_accuracy_meters'>;
};
export type PendingMark = Pick<MarkInput, 'event_type' | 'request_id' | 'session_id' | 'expected_version'>;
export const attendanceSections = [
  { segment: '', label: 'Mi jornada', short: 'Jornada' },
  { segment: '/historial', label: 'Mi historial', short: 'Historial' },
  { segment: '/incidencias', label: 'Mis incidencias', short: 'Incidencias' },
  { segment: '/solicitudes', label: 'Mis solicitudes', short: 'Permisos' },
  { segment: '/notificaciones', label: 'Notificaciones', short: 'Avisos' },
] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A fixed local route allowlist, never a user-supplied redirect URL. */
export function attendanceDestination(path: string) {
  const match = /^\/asistencia\/([^/]+)(\/[^/]+)?$/.exec(path);
  return match && uuid.test(match[1]) && attendanceSections.some(item => item.segment === (match[2] ?? '')) ? path : '/asistencia';
}
export function pendingKey(user: string, business: string) { return `zenvik:attendance:pending:v1:${user}:${business}`; }
export function pendingMetadata(input: PendingMark): PendingMark {
  return { event_type: input.event_type, request_id: input.request_id, session_id: input.session_id, expected_version: input.expected_version };
}
export function readPending(storage: Pick<Storage, 'getItem'>, key: string): PendingMark | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null');
    if (!value || !uuid.test(value.request_id) || !Object.hasOwn(eventLabels, value.event_type) ||
      !(value.session_id === null || uuid.test(value.session_id)) || !Number.isSafeInteger(value.expected_version) || value.expected_version < 0) return null;
    return pendingMetadata(value); // Deliberately discard all other fields, including any coordinates.
  } catch { return null; }
}
export function savePending(storage: Pick<Storage, 'setItem' | 'removeItem'>, key: string, pending: PendingMark | null) {
  try {
    if (pending) storage.setItem(key, JSON.stringify(pendingMetadata(pending)));
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}

/** Bound both CSRF preparation and response parsing; never retry a write automatically. */
export async function attendanceRequest<T>(path: string, options: { method?: string; body?: unknown } = {}, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      api<T>(path, { ...options, signal: controller.signal }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Se agotó el tiempo de espera. El resultado debe consultarse antes de volver a marcar.')); }, timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
