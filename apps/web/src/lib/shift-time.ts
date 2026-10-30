export const PLANNING_ZONE = 'America/Santiago';
const wallFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLANNING_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function localDateTime(instant: string | Date): string {
  const parts = Object.fromEntries(wallFormatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function todayInSantiago(now = new Date()) { return localDateTime(now).slice(0, 10); }
export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(weekday + 6) % 7);
}
export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Intl.DateTimeFormat('es-CL', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

// Enumerate possible UTC offsets rather than assuming the browser's time zone.
// Modern Santiago offsets are minute-aligned. Missing and repeated DST hours
// yield zero and two candidates respectively, never silent date normalization.
export function possibleInstants(local: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return [];
  const nominal = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== local) return [];
  const matches: string[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const instant = new Date(nominal - offset * 60000);
    if (localDateTime(instant) === local) matches.push(instant.toISOString());
  }
  return matches.sort();
}
export function localToInstant(local: string, occurrence = ''): string {
  const candidates = possibleInstants(local);
  if (!candidates.length) throw new Error('La fecha u hora no existe en America/Santiago. Revisa el cambio de horario.');
  if (candidates.length === 1) return candidates[0];
  if (occurrence === 'earlier') return candidates[0];
  if (occurrence === 'later') return candidates[candidates.length - 1];
  throw new Error('Esta hora se repite por el cambio de horario. Selecciona cuál de las dos corresponde.');
}
export function occurrenceFor(instant: string) {
  const options = possibleInstants(localDateTime(instant));
  return options.length > 1 ? (Date.parse(instant) === Date.parse(options[0]) ? 'earlier' : 'later') : '';
}
export function offsetLabel(instant: string) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: PLANNING_ZONE, timeZoneName: 'shortOffset' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value ?? '';
}
export function dayBoundary(date: string) {
  for (let hour = 0; hour <= 3; hour++) {
    const candidates = possibleInstants(`${date}T${String(hour).padStart(2, '0')}:00`);
    if (candidates.length) return Date.parse(candidates[0]);
  }
  throw new Error('No se pudo determinar el comienzo del día.');
}
export function overlapsDay(start: string, end: string, day: string): boolean {
  return Date.parse(start) < dayBoundary(addDays(day, 1)) && Date.parse(end) > dayBoundary(day);
}
export function shiftTimeLabel(start: string, end: string): string {
  const localStart = localDateTime(start); const localEnd = localDateTime(end);
  return `${localStart.slice(11)} – ${localEnd.slice(11)}${localStart.slice(0, 10) !== localEnd.slice(0, 10) ? ` (${dateLabel(localEnd.slice(0, 10))})` : ''}`;
}
