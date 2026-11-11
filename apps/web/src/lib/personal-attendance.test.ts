import { afterEach, describe, expect, it, vi } from 'vitest';
import { attendanceDestination, attendanceRequest, pendingKey, readPending, savePending, type PendingMark } from './personal-attendance';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./http', () => ({ api: mocks.api }));
const id = 'a225fbde-80ed-4dbb-8883-78a7cff1aa51';
const pending: PendingMark = { event_type: 'CLOCK_IN', request_id: id, session_id: null, expected_version: 0 };
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('portal personal de asistencia', () => {
  it('acepta solo destinos locales de asistencia conocidos', () => {
    expect(attendanceDestination(`/asistencia/${id}/historial`)).toBe(`/asistencia/${id}/historial`);
    expect(attendanceDestination(`/asistencia/${id}`)).toBe(`/asistencia/${id}`);
    for (const path of ['https://evil.invalid', '//evil.invalid', '/app', `/asistencia/${id}/supervision`, '/asistencia/no-es-uuid', `/asistencia/${id}?next=//evil.invalid`]) expect(attendanceDestination(path)).toBe('/asistencia');
  });
  it('conserva solo metadatos de recuperación y separa usuario y negocio', () => {
    let stored = '';
    const storage = { setItem: vi.fn((_key: string, value: string) => { stored = value; }), getItem: () => stored, removeItem: vi.fn() };
    savePending(storage, pendingKey('worker', 'company'), { ...pending, location: { latitude: -33, longitude: -70 }, exception_reason: 'No almacenar' } as PendingMark);
    expect(JSON.parse(stored)).toEqual(pending);
    expect(stored).not.toMatch(/latitude|longitude|exception_reason|password|token/);
    expect(readPending(storage, 'key')).toEqual(pending);
    expect(pendingKey('a', 'b')).not.toBe(pendingKey('b', 'a'));
    expect(pendingKey('a', 'b')).not.toBe(pendingKey('a', 'c'));
    savePending(storage, 'key', null); expect(storage.removeItem).toHaveBeenCalledWith('key');
  });
  it('tolera almacenamiento bloqueado y descarta referencias inválidas', () => {
    expect(savePending({ setItem: () => { throw Error('Blocked'); }, removeItem: () => {} }, 'key', pending)).toBe(false);
    for (const value of ['broken', '{}', JSON.stringify({ ...pending, expected_version: -1 }), JSON.stringify({ ...pending, event_type: '__proto__' }), JSON.stringify({ ...pending, request_id: 'invalid' })]) expect(readPending({ getItem: () => value }, 'key')).toBeNull();
    expect(readPending({ getItem: () => { throw Error('Blocked'); } }, 'key')).toBeNull();
  });
  it('aplica un límite de espera y aborta sin repetir escrituras', async () => {
    vi.useFakeTimers(); mocks.api.mockImplementation(() => new Promise(() => {}));
    const request = attendanceRequest('/api/v1/test/', { method: 'POST', body: {} }, 50);
    const assertion = expect(request).rejects.toThrow('Se agotó el tiempo');
    await vi.advanceTimersByTimeAsync(51); await assertion;
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('devuelve la confirmación y limpia el temporizador', async () => {
    vi.useFakeTimers(); mocks.api.mockResolvedValue({ receipt: { id } });
    await expect(attendanceRequest('/api/v1/test/')).resolves.toEqual({ receipt: { id } });
    expect(vi.getTimerCount()).toBe(0);
  });
});
