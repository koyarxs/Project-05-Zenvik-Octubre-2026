import { describe, expect, it } from 'vitest';
import { BODY_LIMIT, limitedBody, upstreamTarget } from './proxy-security';

describe('proxy input boundary', () => {
  it('preserves API prefix and query strings', () => {
    expect(upstreamTarget(['businesses', 'abc-123', 'employees'], '?page=2', 'http://127.0.0.1:8000').pathname).toBe('/api/v1/businesses/abc-123/employees/');
  });
  it('rejects dot segments, encoded separators and non-API prefixes', () => {
    for (const segments of [['auth', '..', '..', 'admin'], ['businesses', 'a/b'], ['auth', '%2e%2e'], ['admin'], ['auth', '\\admin'], ['auth', '']]) {
      expect(() => upstreamTarget(segments, '', 'http://localhost:8000')).toThrow('Ruta de API no permitida');
    }
  });
  it('rejects unsafe configured upstreams', () => {
    for (const base of ['file:///tmp', 'http://user:pass@localhost/', 'http://localhost/base/']) expect(() => upstreamTarget(['auth'], '', base)).toThrow();
  });
  it('rejects declared oversize before reading', async () => {
    const request = new Request('http://localhost/', { method: 'POST', headers: { 'content-length': String(BODY_LIMIT + 1) }, body: 'small' });
    await expect(limitedBody(request)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it('rejects oversized streaming input without trusting declared length', async () => {
    const request = new Request('http://localhost/', { method: 'POST', headers: { 'content-length': '1' }, body: 'x'.repeat(BODY_LIMIT + 1) });
    await expect(limitedBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it('accepts exactly the configured limit and skips GET', async () => {
    expect((await limitedBody(new Request('http://localhost/', { method: 'POST', body: 'x'.repeat(BODY_LIMIT) })))?.length).toBe(BODY_LIMIT);
    expect(await limitedBody(new Request('http://localhost/'))).toBeUndefined();
  });
  it('rejects invalid lengths', async () => {
    await expect(limitedBody(new Request('http://localhost/', { method: 'POST', headers: { 'content-length': '-1' }, body: '{}' }))).rejects.toMatchObject({ status: 400 });
  });
  it('bounds stalled input time', async () => {
    const request = { method: 'POST', headers: new Headers(), body: new ReadableStream({ start() {} }) } as Request;
    await expect(limitedBody(request, 10)).rejects.toMatchObject({ status: 408 });
  });
});
