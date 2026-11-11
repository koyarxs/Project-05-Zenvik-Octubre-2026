import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET() {
  let ready = false;
  try {
    const base = new URL(process.env.DJANGO_API_URL ?? 'http://127.0.0.1:8000');
    const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000');
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Invalid upstream');
    ready = await new Promise<boolean>(resolve => {
      const target = new URL('/health/ready/', base);
      const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = transport(target, { headers: { host: origin.host, 'x-forwarded-proto': origin.protocol === 'https:' ? 'https' : 'http' } }, response => { response.resume(); resolve(response.statusCode === 200); });
      req.setTimeout(2000, () => req.destroy());
      req.on('error', () => resolve(false));
      req.end();
    });
  } catch { ready = false; }
  return Response.json({ status: ready ? 'ok' : 'unavailable' }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
