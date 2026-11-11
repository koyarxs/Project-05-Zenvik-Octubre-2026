import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.skip(process.env.E2E_PERSONAL !== '1', 'Fixture aislada del portal personal');
const business = process.env.E2E_BUSINESS_A!;
const other = process.env.E2E_BUSINESS_B!;
const root = `/asistencia/${business}`;
const base = `/api/v1/businesses/${business}/attendance`;
const measurements: { action: string; milliseconds: number }[] = [];

async function login(page: Page, name: string, destination = root) {
  await page.goto(destination);
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(`personal_${name}`);
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(destination);
  if (destination === root) await expect(page.getByRole('heading', { name: 'Mi jornada', exact: true })).toBeVisible();
}
async function closeReceipt(page: Page) {
  await expect(page.getByRole('dialog', { name: 'Comprobante de marcación', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión de asistencia' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
}
async function mark(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const start = performance.now();
  await page.getByRole('button', { name: 'Confirmar y obtener ubicación', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Comprobante de marcación', exact: true })).toBeVisible();
  measurements.push({ action: label, milliseconds: Math.round(performance.now() - start) });
}
async function snapshot(page: Page, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/personal-${name}.png`, fullPage: true, animations: 'disabled' });
}

test('entrada directa, timeout tras persistir, recuperación al recargar y cuatro marcas sin duplicados', async ({ page, context, browser }) => {
  test.setTimeout(90000);
  page.on('dialog', dialog => dialog.accept());
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: -33.45, longitude: -70.66, accuracy: 10 });
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    Reflect.set(window, 'personalGpsCalls', 0);
    navigator.geolocation.getCurrentPosition = (...args) => { Reflect.set(window, 'personalGpsCalls', Reflect.get(window, 'personalGpsCalls') + 1); original(...args); };
  });
  await login(page, 'main');
  expect(await page.evaluate(() => Reflect.get(window, 'personalGpsCalls'))).toBe(0);
  expect((await page.request.get(root)).headers()['permissions-policy']).toContain('geolocation=(self)');
  await expect(page.locator('#primary-nav')).toHaveCount(0);
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0);
  await expect(page.getByText('Valentina Prueba', { exact: true })).toBeVisible();
  await snapshot(page, 'desktop-before');
  const requestIds: string[] = []; let first = true;
  await page.route(`**${base}/events/`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    requestIds.push(route.request().postDataJSON().request_id);
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch(); expect(response.status()).toBe(201);
    // The server committed, but its response arrives after the real 20s client deadline.
    await new Promise(resolve => setTimeout(resolve, 22000));
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByRole('button', { name: 'Inicio de turno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y obtener ubicación', exact: true }).dblclick();
  await expect(page.getByRole('dialog')).toContainText('Respuesta no confirmada', { timeout: 26000 });
  await page.getByRole('button', { name: 'Cerrar panel' }).click();
  await expect(page.getByRole('heading', { name: 'Resultado pendiente de confirmar', exact: true })).toBeVisible();
  await snapshot(page, 'pending-timeout');
  expect(requestIds).toHaveLength(1);
  const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('zenvik:attendance:pending:')).map(([, value]) => value));
  expect(stored).toHaveLength(1); expect(stored[0]).not.toMatch(/latitude|longitude|exception_reason|password|token/);
  await page.reload(); await closeReceipt(page); // GET recovery only, no second POST.
  expect(requestIds).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Inicio de colación', exact: true })).toBeEnabled();
  for (const label of ['Inicio de colación', 'Término de colación', 'Término de turno']) { await mark(page, label); await closeReceipt(page); }
  const history = await (await page.request.get(`${base}/history/`)).json();
  expect(history.results[0].events).toHaveLength(4); expect(new Set(requestIds).size).toBe(4);
  await page.getByRole('link', { name: 'Mi historial', exact: true }).click();
  await page.getByRole('button', { name: 'Ver comprobante de Inicio de turno', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('America/Santiago'); await closeReceipt(page);
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await snapshot(page, `history-${width}`); }
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage();
  try {
    await login(admin, 'owner'); await admin.goto(`/app/${business}/asistencia/supervision`);
    await expect(admin.getByRole('heading', { name: 'Asistencia', exact: true })).toBeVisible();
    await expect(admin.locator('article').filter({ hasText: 'Valentina Prueba' })).toContainText('Jornada finalizada');
    const storedReceipt = await (await page.request.get(`${base}/receipts/${history.results[0].events[0].id}/`)).json();
    expect(storedReceipt.integrity_hash).toBe(history.results[0].events[0].integrity_hash);
  } finally { await adminContext.close(); }
  await mkdir('../../.artifacts/personal-attendance', { recursive: true });
  await writeFile('../../.artifacts/personal-attendance/measurements.json', JSON.stringify({ environment: 'Local Windows, Chromium, Next production build, Django LiveServer, synthetic PostgreSQL database; no TLS', normal_flow_clicks: 2, native_permission_prompt_excluded: true, samples: measurements, timeout_test_ms: 20000, marks_persisted: 4 }, null, 2));
});

test('envío no recibido, consulta ausente y reintento con el mismo ID después de recargar', async ({ page, context }) => {
  page.on('dialog', dialog => dialog.accept());
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: -33.45, longitude: -70.66, accuracy: 10 });
  await page.setViewportSize({ width: 320, height: 844 }); await login(page, 'retry');
  let reference = ''; let drop = true;
  await page.route(`**${base}/events/`, async route => {
    const id = route.request().postDataJSON().request_id;
    if (!reference) reference = id; else expect(id).toBe(reference);
    if (drop) { drop = false; return route.abort('failed'); }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Inicio de turno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y obtener ubicación', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Respuesta no confirmada');
  await page.getByRole('button', { name: 'Cerrar panel' }).click(); await page.reload();
  await expect(page.getByRole('heading', { name: 'Resultado pendiente de confirmar' })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar resultado', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'no demuestra un rechazo' })).toBeVisible();
  await context.setOffline(true); await expect(page.getByText('Estás sin conexión', { exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar marcación pendiente' }).click();
  await page.getByRole('button', { name: 'Confirmar reintento' }).click();
  await closeReceipt(page);
  const history = await (await page.request.get(`${base}/history/`)).json(); expect(history.results[0].events).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  const primary = await page.locator('.attendance-primary-action').boundingBox();
  const navigation = await page.getByRole('navigation', { name: 'Navegación personal de asistencia' }).boundingBox();
  expect(primary && navigation && primary.y + primary.height <= navigation.y).toBe(true);
  await snapshot(page, 'mobile-retry-complete');
});

test('rechazo explícito no muestra éxito y no crea un registro', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: -33.45, longitude: -70.66, accuracy: 10 });
  await login(page, 'reject');
  await page.route(`**${base}/events/`, route => route.fulfill({ status: 409, json: { detail: 'El estado cambió; consulta tu jornada.' } }));
  await page.getByRole('button', { name: 'Inicio de turno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y obtener ubicación', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Marcación rechazada' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Comprobante de marcación' })).toHaveCount(0);
  expect((await (await page.request.get(`${base}/history/`)).json()).count).toBe(0);
});

test('GPS denegado permite excepción declarada y precisión insuficiente queda identificada', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: -33.45, longitude: -70.66, accuracy: 5000 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation); let deny = true;
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success: PositionCallback, error: PositionErrorCallback, options: PositionOptions) { if (deny) { deny = false; error({ code: 1 } as GeolocationPositionError); } else original(success, error, options); } } });
  });
  await page.setViewportSize({ width: 390, height: 844 }); await login(page, 'exception');
  await page.getByRole('button', { name: 'Inicio de turno', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar y obtener ubicación', exact: true }).click();
  await expect(page.getByText('No autorizaste la ubicación.', { exact: false })).toBeVisible();
  await page.getByLabel('Explica la incidencia', { exact: true }).fill('El navegador no permitió consultar el GPS al iniciar.');
  await page.getByRole('button', { name: 'Registrar incidencia sin ubicación', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sin ubicación: incidencia registrada'); await closeReceipt(page);
  await mark(page, 'Inicio de colación');
  await expect(page.getByRole('dialog')).toContainText('Precisión insuficiente: incidencia registrada'); await closeReceipt(page);
  await snapshot(page, 'exception');
});

test('sin ficha, sin membresía y sesión vencida tienen estados claros sin menú administrativo', async ({ page }) => {
  await login(page, 'no_profile');
  await expect(page.getByRole('heading', { name: 'Tu ficha necesita estar habilitada' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inicio de turno', exact: true })).toHaveCount(0);
  await page.goto(`/asistencia/${process.env.E2E_PERSONAL_FOREIGN}`);
  await expect(page.getByRole('heading', { name: 'Negocio no disponible' })).toBeVisible();
  await logout(page);
  await login(page, 'no_business', '/asistencia');
  await expect(page.getByRole('heading', { name: 'No tienes negocios habilitados' })).toBeVisible();
  await logout(page);
  await login(page, 'no_profile');
  await page.route('**/api/v1/auth/me/', route => route.fulfill({ status: 403, json: { detail: 'Sesión vencida.' } }));
  await page.route(`**${base}/personal/current/`, route => route.fulfill({ status: 403, json: { detail: 'Sesión vencida.' } }));
  await page.getByRole('button', { name: 'Actualizar mi jornada' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  await expect(page.locator('.attendance-journey-banner')).toHaveCount(0);
});

test('selección explícita entre negocios y descarte de respuestas tardías a 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'multi', '/asistencia');
  await expect(page.getByRole('link', { name: 'Elegir Café de prueba personal', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Elegir Segundo negocio personal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mi jornada', exact: true })).toHaveCount(0);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let fetched = false;
  await page.route(`**${base}/personal/current/`, async route => { const response = await route.fetch(); fetched = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  await page.getByRole('link', { name: 'Elegir Café de prueba personal', exact: true }).click();
  await expect.poll(() => fetched).toBe(true);
  await page.getByRole('link', { name: 'Cambiar negocio', exact: true }).click();
  await page.getByRole('link', { name: 'Elegir Segundo negocio personal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ficha segunda Prueba', exact: true })).toBeVisible();
  release(); await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('heading', { name: 'Ficha primera Prueba', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sin turno asociado', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Saltar al contenido', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#attendance-main')).toBeFocused(); await snapshot(page, 'business-switch-320');
  expect((await page.request.get(`${base}/receipts/${process.env.E2E_PERSONAL_PEER_RECEIPT}/`)).status()).toBe(404);
  await page.goto(`/app/${other}/asistencia`); await expect(page.getByRole('heading', { name: 'Mi asistencia', exact: true })).toBeVisible();
});

test('incidencia asociada, decisión administrativa, aviso y ajuste separado del original', async ({ page, browser }) => {
  await page.setViewportSize({ width: 320, height: 844 }); await login(page, 'followup');
  await page.getByRole('link', { name: 'Mi historial', exact: true }).click();
  await page.getByRole('link', { name: 'Informar un problema de esta jornada', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva solicitud de regularización' })).toBeVisible();
  await page.getByLabel('Fecha y hora declarada (America/Santiago)', { exact: true }).fill(process.env.E2E_PERSONAL_DECLARED!);
  await page.getByLabel('Motivo', { exact: true }).fill('Olvidé registrar mi salida y solicito revisar los antecedentes.');
  const submitted = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/personal/incidents') && (response.status() < 300 || response.status() >= 400));
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  const response = await submitted; expect(response.status()).toBe(201); const incident = await response.json();
  await expect(page.getByRole('dialog', { name: 'Detalle de incidencia' })).toContainText('Pendiente');
  await page.getByRole('button', { name: 'Cerrar panel' }).click();
  const adminContext = await browser.newContext(); const admin = await adminContext.newPage();
  try {
    await login(admin, 'owner');
    const csrf = await (await admin.request.get('/api/v1/auth/csrf/')).json();
    const decided = await admin.request.post(`${base}/incidents/${incident.id}/transition/`, { headers: { 'X-CSRFToken': csrf.csrfToken, Origin: 'http://127.0.0.1:3100' }, data: { request_id: crypto.randomUUID(), expected_version: 1, state: 'APPROVED', reason: 'Antecedentes revisados en la jornada de prueba.' } });
    expect(decided.status()).toBe(201);
  } finally { await adminContext.close(); }
  await page.getByRole('link', { name: 'Notificaciones', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Solicitud aprobada', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar como leída', exact: true }).first().click();
  await page.getByRole('link', { name: 'Ver recurso', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Detalle de incidencia' })).toContainText('Aprobada');
  await expect(page.getByRole('dialog')).toContainText('Ajuste operativo'); await snapshot(page, 'correction-separate');
  const original = await (await page.request.get(`${base}/receipts/${process.env.E2E_PERSONAL_FOLLOWUP}/`)).json();
  expect(original.integrity_hash).toBe(process.env.E2E_PERSONAL_FOLLOWUP_HASH);
  expect(original.event_type).toBe('CLOCK_IN');
});

test('permisos personales y administrador en ámbito personal conservan aislamiento', async ({ page }) => {
  await login(page, 'leaves'); await page.getByRole('link', { name: 'Mis solicitudes', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar permiso', exact: true }).click();
  await page.getByLabel('Motivo (opcional)', { exact: true }).fill('Solicitud personal de prueba sin información sensible.');
  await page.getByRole('button', { name: 'Enviar solicitud', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud enviada' })).toBeVisible();
  await page.getByRole('button', { name: /^Ver solicitud de/ }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Pendiente');
  await page.getByRole('button', { name: 'Cancelar solicitud', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelar', exact: true }).click();
  await logout(page);
  await login(page, 'owner'); await page.getByRole('link', { name: 'Mis incidencias', exact: true }).click();
  expect((await (await page.request.get(`${base}/personal/incidents/`)).json()).count).toBe(1);
  await expect(page.getByRole('button', { name: 'Política de incidencias' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Auditoría', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Notificaciones', exact: true }).first().click();
  const notifications = await (await page.request.get(`${base}/personal/notifications/`)).json();
  expect(notifications.results.every((item: { manager_only: boolean }) => !item.manager_only)).toBe(true);
  await expect(page.getByRole('button', { name: 'Revisar jornadas incompletas' })).toHaveCount(0);
  await expect(page.locator('a[href^="/app"]')).toHaveCount(0);
});
