import { afterEach, describe, expect, it, vi } from 'vitest';
import { listBusinesses } from './data';

afterEach(() => vi.unstubAllGlobals());
describe('consulta cancelable de negocios', () => {
  it('reúne páginas reales con la misma señal de cancelación', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ results: [{ id: 'a' }], next: '?page=2' })).mockResolvedValueOnce(Response.json({ results: [{ id: 'b' }], next: null }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    expect(await listBusinesses(controller.signal)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/v1/businesses/?page=1', '/api/v1/businesses/?page=2']);
    for (const call of fetchMock.mock.calls) expect(call[1]).toMatchObject({ signal: controller.signal, cache: 'no-store', credentials: 'include' });
  });
  it('no entrega un listado parcial si se cancela durante la paginación', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ results: [{ id: 'old' }], next: '?page=2' })).mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listBusinesses(new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
