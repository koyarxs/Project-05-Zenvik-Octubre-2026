let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
export class ApiError extends Error {
  constructor(public status: number, public data: unknown, message: string) { super(message); }
}
export function errorMessage(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(errorMessage).join(' ');
  const labels: Record<string, string> = { username: 'Usuario', password: 'Contraseña', email: 'Correo', name: 'Nombre comercial', rut: 'RUT', first_name: 'Nombre', last_name: 'Apellido', hire_date: 'Fecha de incorporación', user: 'Cuenta vinculada', business: 'Negocio', employee: 'Trabajador', starts_at: 'Inicio', ends_at: 'Término', status: 'Estado', turnstile_token: 'Verificación de seguridad' };
  if (data && typeof data === 'object') return Object.entries(data).map(([key, value]) => `${key === 'detail' || key === 'non_field_errors' || key === '__all__' ? '' : (labels[key] ?? 'Datos') + ': '}${errorMessage(value)}`).join(' ');
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.';
}
export function resetCsrf() { csrfToken = null; csrfRequest = null; }
async function csrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfRequest ??= fetch('/api/v1/auth/csrf/', { credentials: 'include', cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new ApiError(response.status, null, 'No pudimos preparar la conexión segura.');
    const data: { csrfToken: string } = await response.json(); csrfToken = data.csrfToken; return data.csrfToken;
  }).finally(() => { csrfRequest = null; });
  return csrfRequest;
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  if (!path.startsWith('/api/v1/')) throw new Error('Ruta de API no permitida.');
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-CSRFToken'] = await csrf();
  const response = await fetch(path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'include', cache: 'no-store', signal: options.signal });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 403 && (!path.startsWith('/api/v1/auth/') || path.endsWith('/logout/'))) {
      const session = await fetch('/api/v1/auth/me/', { credentials: 'include', cache: 'no-store' });
      if (session.status === 403) { resetCsrf(); window.dispatchEvent(new Event('zenvik:session-expired')); }
    }
    const message = response.status === 429 ? `Demasiados intentos. Vuelve a intentarlo en ${response.headers.get('Retry-After') ?? 'unos'} segundos.` : errorMessage(data);
    throw new ApiError(response.status, data, message);
  }
  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data as T;
}
