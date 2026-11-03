import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttendanceActions } from '@/components/attendance-workspace';
import { attendanceTime, locateOnce, type EventType } from './attendance';

describe('asistencia y ubicación puntual', () => {
  it.each([['CLOCK_IN'], ['BREAK_START', 'CLOCK_OUT'], ['BREAK_END'], []] as EventType[][])('habilita solo acciones autorizadas por servidor: %j', (...allowed) => {
    const html = renderToStaticMarkup(<AttendanceActions allowed={allowed as EventType[]} busy={false} onAction={() => {}} />);
    expect((html.match(/<button/g) ?? []).length).toBe(4);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(4 - allowed.length);
  });
  it('bloquea las cuatro acciones mientras registra', () => {
    const html = renderToStaticMarkup(<AttendanceActions allowed={['CLOCK_IN']} busy onAction={() => {}} />);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(4);
  });
  it('captura una sola lectura sin vigilancia y con posición no cacheada', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success: PositionCallback) => success({ coords: { latitude: -33, longitude: -70, accuracy: 12 } } as GeolocationPosition));
    const result = await locateOnce(true, { getCurrentPosition } as unknown as Geolocation);
    expect(result.location).toEqual({ latitude: -33, longitude: -70, accuracy_meters: 12 });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getCurrentPosition.mock.calls[0]).toHaveLength(3);
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
  it.each([[1, 'DENIED'], [2, 'UNAVAILABLE'], [3, 'TIMEOUT']] as const)('explica error GPS %i sin inventar coordenadas', async (code, status) => {
    const gps = { getCurrentPosition: (_: PositionCallback, failure: PositionErrorCallback) => failure({ code } as GeolocationPositionError) } as unknown as Geolocation;
    const result = await locateOnce(true, gps);
    expect(result.location_status).toBe(status); expect(result.location).toBeNull(); expect(result.message).toBeTruthy();
  });
  it('no solicita ubicación en contexto inseguro', async () => {
    const getCurrentPosition = vi.fn();
    expect((await locateOnce(false, { getCurrentPosition } as unknown as Geolocation)).location_status).toBe('INSECURE');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
  it('rechaza números no finitos del dispositivo', async () => {
    const gps = { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: NaN, longitude: 0, accuracy: 1 } } as GeolocationPosition) } as unknown as Geolocation;
    expect((await locateOnce(true, gps)).location).toBeNull();
  });
  it('traduce un fallo síncrono del navegador a incidencia', async () => {
    const gps = { getCurrentPosition: () => { throw new Error('Unavailable'); } } as unknown as Geolocation;
    expect((await locateOnce(true, gps)).location_status).toBe('UNAVAILABLE');
  });
  it('explica navegador incompatible', async () => {
    vi.stubGlobal('navigator', {});
    try { expect((await locateOnce(true)).location_status).toBe('UNSUPPORTED'); } finally { vi.unstubAllGlobals(); }
  });
  it('presenta hora oficial en Santiago al cruzar medianoche UTC', () => {
    expect(attendanceTime('2026-11-02T02:00:00Z')).toContain('23:00:00');
  });
});
