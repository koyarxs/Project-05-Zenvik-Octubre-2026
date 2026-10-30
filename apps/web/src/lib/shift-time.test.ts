import { describe, expect, it } from 'vitest';
import { addDays, dayBoundary, localDateTime, localToInstant, overlapsDay, possibleInstants, todayInSantiago, weekStart } from './shift-time';

describe('Planificación en America/Santiago', () => {
  it('obtiene lunes desde cualquier día, incluyendo domingo', () => {
    expect(weekStart('2026-10-29')).toBe('2026-10-26');
    expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });
  it('convierte independientemente de la zona del navegador', () => {
    expect(localToInstant('2026-10-26T09:00')).toBe('2026-10-26T12:00:00.000Z');
    expect(localDateTime('2026-10-26T12:00:00Z')).toBe('2026-10-26T09:00');
    expect(todayInSantiago(new Date('2026-10-26T01:00:00Z'))).toBe('2026-10-25');
  });
  it('rechaza horas inexistentes por cambio de horario', () => {
    expect(possibleInstants('2026-09-06T00:30')).toEqual([]);
    expect(() => localToInstant('2026-09-06T00:30')).toThrow('no existe');
    expect(dayBoundary('2026-09-07') - dayBoundary('2026-09-06')).toBe(23 * 3600000);
  });
  it('requiere elegir la ocurrencia de una hora repetida', () => {
    expect(possibleInstants('2026-04-04T23:30')).toHaveLength(2);
    expect(() => localToInstant('2026-04-04T23:30')).toThrow('se repite');
    expect(Date.parse(localToInstant('2026-04-04T23:30', 'later')) - Date.parse(localToInstant('2026-04-04T23:30', 'earlier'))).toBe(3600000);
  });
  it('incluye turnos nocturnos en ambos días sin duplicar medianoche exacta', () => {
    expect(overlapsDay('2026-10-26T22:00:00-03:00', '2026-10-27T06:00:00-03:00', '2026-10-27')).toBe(true);
    expect(overlapsDay('2026-10-26T22:00:00-03:00', '2026-10-27T00:00:00-03:00', '2026-10-27')).toBe(false);
  });
  it('rechaza fechas inválidas', () => { expect(possibleInstants('2026-02-31T10:00')).toEqual([]); });
});
