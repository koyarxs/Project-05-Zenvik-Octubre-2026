import { test, expect, type Page } from '@playwright/test';
const business = process.env.E2E_BUSINESS_A!;
const base = `/api/v1/businesses/${business}/leave-requests/`;
async function open(page: Page, username: string) {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/${business}/permisos`);
  await expect(page.getByRole('heading', { name: 'Historial de solicitudes' })).toBeVisible();
}

test('OWNER aprueba con advertencia de turnos y conserva la planificación', async ({ page }) => {
  await open(page, 'owner_leaves');
  await page.getByLabel('Estado', { exact: true }).selectOption('PENDING');
  await page.getByLabel('Desde', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-12-01');
  await expect(page.getByRole('button', { name: /Ver solicitud de/ })).toHaveCount(1);
  await page.getByRole('button', { name: /Ver solicitud de.*2026-12-01/ }).click();
  await expect(page.getByRole('dialog')).toContainText('1 turnos afectados');
  await page.getByRole('button', { name: 'Aprobar', exact: true }).click();
  await page.getByLabel('Observación administrativa (opcional)').fill('Coordinaremos el turno por separado.');
  await page.screenshot({ path: 'test-results/leaves-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Confirmar aprobar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud aprobada.' })).toContainText('siguen programados');
  await page.getByLabel('Estado', { exact: true }).selectOption('APPROVED');
  await page.getByRole('button', { name: /Ver solicitud de.*2026-12-01/ }).click();
  await expect(page.getByRole('dialog')).toContainText('owner_leaves');
  await expect(page.getByRole('dialog')).toContainText('Coordinaremos el turno por separado.');
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toHaveCount(0);
  const shifts = await (await page.request.get(`/api/v1/businesses/${business}/shifts/?date_from=2026-12-01&date_to=2026-12-02`)).json();
  expect(shifts.results[0].status).toBe('SCHEDULED');
});

test('ADMIN rechaza y consulta el historial de decisiones', async ({ page }) => {
  await open(page, 'admin_leaves');
  await page.getByRole('button', { name: /Ver solicitud de.*2026-12-03/ }).click();
  await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
  await page.getByLabel('Observación administrativa (opcional)').fill('Propongamos otra fecha.');
  await page.getByRole('button', { name: 'Confirmar rechazar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud rechazada.' })).toBeVisible();
  await page.getByLabel('Estado', { exact: true }).selectOption('REJECTED');
  await expect(page.getByRole('button', { name: /Ver solicitud de/ })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/leaves-desktop.png', fullPage: true });
});

test('trabajador solicita, recibe errores y cancela desde móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'employee_leaves');
  await page.getByRole('button', { name: 'Solicitar permiso', exact: true }).click();
  await page.getByLabel('Fecha inicial', { exact: true }).fill('2026-12-10');
  await page.getByLabel('Fecha final', { exact: true }).fill('2026-12-09');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('alert')).toContainText('igual o posterior');
  await page.getByLabel('Fecha final', { exact: true }).fill('2026-12-10');
  await page.getByLabel('Motivo (opcional)').fill('Trámite personal.');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Solicitar permiso', exact: true }).click();
  await page.getByLabel('Fecha inicial', { exact: true }).fill('2026-12-10');
  await page.getByLabel('Fecha final', { exact: true }).fill('2026-12-10');
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page.getByRole('alert')).toContainText('superpone');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Ver solicitud de.*2026-12-10/ }).click();
  await expect(page.getByRole('button', { name: 'Aprobar', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancelar solicitud', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar cancelar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Solicitud cancelada.' })).toBeVisible();
  await page.getByLabel('Estado', { exact: true }).selectOption('CANCELLED');
  await expect(page.getByRole('button', { name: /Ver solicitud de/ })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/leaves-mobile.png', fullPage: true });
});

test('solicitudes ajenas, CSRF, campos sensibles y errores recuperables', async ({ page }) => {
  await open(page, 'employee_leave_security');
  await expect(page.getByRole('heading', { name: 'No hay solicitudes para mostrar' })).toBeVisible();
  expect((await page.request.get(`${base}${process.env.E2E_LEAVE}/`)).status()).toBe(404);
  expect((await page.request.get(`/api/v1/businesses/${process.env.E2E_BUSINESS_B}/leave-requests/`)).status()).toBe(404);
  expect((await page.request.post(base, { data: {} })).status()).toBe(403);
  const { csrfToken } = await (await page.request.get('/api/v1/auth/csrf/')).json();
  expect((await page.request.post(base, { headers: { 'X-CSRFToken': csrfToken }, data: { request_type: 'OTHER', start_date: '2026-12-20', end_date: '2026-12-20', employee: process.env.E2E_COLLEAGUE } })).status()).toBe(400);
  await page.route('**/leave-requests/?*', route => route.abort());
  await page.getByLabel('Estado', { exact: true }).selectOption('PENDING');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.unroute('**/leave-requests/?*');
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByRole('heading', { name: 'No hay solicitudes para mostrar' })).toBeVisible();
});
