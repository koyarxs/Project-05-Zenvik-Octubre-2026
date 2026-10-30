import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, resetCsrf } from './http';
afterEach(() => { vi.unstubAllGlobals(); resetCsrf(); });
describe('Cliente HTTP', () => {
  it('envía cookies y CSRF, y conserva el token rotado por login', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: 'first' })).mockResolvedValueOnce(Response.json({ csrfToken: 'rotated', user: {} })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/api/v1/auth/login/', { method: 'POST', body: { username: 'test', password: 'test' } });
    await api('/api/v1/auth/logout/', { method: 'POST', body: {} });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include', headers: { 'X-CSRFToken': 'first' }, method: 'POST' });
    expect(fetchMock.mock.calls[2][1].headers['X-CSRFToken']).toBe('rotated');
  });
  it('propaga el límite de intentos con tiempo de espera', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })));
    await expect(api('/api/v1/auth/me/')).rejects.toThrow('60 segundos');
  });
  it('no reintenta silenciosamente una escritura fallida', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ csrfToken: 'first' })).mockResolvedValueOnce(Response.json({ detail: 'CSRF' }, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/api/v1/auth/login/', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rechaza URLs fuera del contrato', async () => { await expect(api('https://external.example')).rejects.toThrow('Ruta'); });
});
