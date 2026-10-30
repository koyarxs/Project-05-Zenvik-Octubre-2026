import { NextRequest } from 'next/server';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { limitedBody, ProxyInputError, upstreamTarget } from '@/lib/proxy-security';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000');
  if (request.headers.get('host') !== origin.host) return Response.json({ detail: 'Origen no permitido.' }, { status: 403 });
  const headers: Record<string, string> = {};
  for (const key of ['cookie', 'content-type', 'accept', 'x-csrftoken', 'origin', 'referer']) {
    const value = request.headers.get(key); if (value) headers[key] = value;
  }
  // Preserve the public host for Django's CSRF same-origin comparison.
  headers.host = origin.host;
  headers['x-forwarded-proto'] = origin.protocol === 'https:' ? 'https' : 'http';
  try {
    const target = upstreamTarget(path, request.nextUrl.search, process.env.DJANGO_API_URL ?? 'http://127.0.0.1:8000');
    const body = await limitedBody(request);
    // Native Node transport preserves Host. Next's fetch rewrites it to the upstream.
    const upstream = await new Promise<{ status: number; headers: IncomingHttpHeaders; body: Uint8Array<ArrayBuffer> }>((resolve, reject) => {
      const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
      const connection = transport(target, { method: request.method, headers }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1048576) connection.destroy(new Error('Upstream response too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 502, headers: response.headers, body: new Uint8Array(Buffer.concat(chunks)) }));
        response.on('error', reject);
      });
      connection.setTimeout(15000, () => connection.destroy(new Error('Upstream timeout')));
      const deadline = setTimeout(() => connection.destroy(new Error('Upstream deadline')), 15000);
      connection.on('close', () => clearTimeout(deadline));
      connection.on('error', reject);
      connection.end(body);
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['content-type', 'retry-after', 'vary']) { const value = upstream.headers[key]; if (typeof value === 'string') responseHeaders.set(key, value); }
    for (const cookie of upstream.headers['set-cookie'] ?? []) responseHeaders.append('set-cookie', cookie);
    return new Response(request.method === 'HEAD' || upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    return Response.json({ detail: error instanceof ProxyInputError ? error.message : 'No pudimos conectar con el servidor. Inténtalo de nuevo.' }, { status: error instanceof ProxyInputError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE, proxy as OPTIONS, proxy as HEAD };
