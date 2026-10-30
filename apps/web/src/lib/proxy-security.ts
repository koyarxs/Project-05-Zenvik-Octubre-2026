export const BODY_LIMIT = 65536;
export class ProxyInputError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function upstreamTarget(segments: string[], search: string, base: string): URL {
  if (!segments.length || !['auth', 'businesses'].includes(segments[0]) || segments.some(segment => !/^[A-Za-z0-9_-]+$/.test(segment))) {
    throw new ProxyInputError(400, 'Ruta de API no permitida.');
  }
  const upstream = new URL(base);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') {
    throw new Error('Invalid upstream configuration');
  }
  return new URL(`/api/v1/${segments.join('/')}/${search}`, upstream);
}

export async function limitedBody(request: Request, timeoutMs = 15000): Promise<Buffer | undefined> {
  if (['GET', 'HEAD'].includes(request.method)) return undefined;
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new ProxyInputError(400, 'Longitud de solicitud inválida.');
  if (length !== null && Number(length) > BODY_LIMIT) throw new ProxyInputError(413, 'Solicitud demasiado grande.');
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ProxyInputError(408, 'Tiempo de solicitud agotado.')), timeoutMs); });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) throw new ProxyInputError(413, 'Solicitud demasiado grande.');
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
