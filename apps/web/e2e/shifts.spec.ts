import { test, expect, type Page } from '@playwright/test';
const business = process.env.E2E_BUSINESS_A!;
const colleague = process.env.E2E_COLLEAGUE!;
const base = `/api/v1/businesses/${business}/shifts/`;

async function openCalendar(page: Page, username: string) {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(`/app/${business}/turnos`);
  await page.getByLabel('Semana que incluye').fill('2026-10-26');
  await expect(page.getByRole('button', { name: /09:00.*12:00/ }).first()).toBeVisible();
}

async function fillShift(page: Page, start: string, end: string) {
  await page.getByRole('button', { name: 'Crear turno', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Trabajador', { exact: true }).selectOption(colleague);
  await page.getByLabel('Inicio del turno', { exact: true }).fill(start);
  await page.getByLabel('Término del turno', { exact: true }).fill(end);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear turno', exact: true }).click();
}

test('OWNER crea, detecta conflictos, edita y cancela desde el calendario', async ({ page }) => {
  await openCalendar(page, 'owner_shifts');
  await fillShift(page, '2026-10-26T14:00', '2026-10-26T18:00');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Otra ficha.*14:00.*18:00.*Programado/ })).toBeVisible();
  await fillShift(page, '2026-10-26T15:00', '2026-10-26T17:00');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('superpone');
  await page.getByRole('button', { name: 'Cerrar panel' }).click();
  await page.getByRole('button', { name: /Otra ficha.*14:00.*18:00.*Programado/ }).click();
  await page.getByRole('button', { name: 'Editar turno', exact: true }).click();
  await page.getByLabel('Inicio del turno', { exact: true }).fill('2026-10-26T15:00');
  await page.getByLabel('Término del turno', { exact: true }).fill('2026-10-26T19:00');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('button', { name: /Otra ficha.*15:00.*19:00.*Programado/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/shifts-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Otra ficha.*15:00.*19:00.*Programado/ }).click();
  await page.getByRole('button', { name: 'Cancelar turno', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar cancelación' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar cancelación' }).click();
  await expect(page.getByRole('button', { name: /Otra ficha.*15:00.*19:00.*Cancelado/ })).toBeVisible();
});

test('ADMIN planifica de noche y navega entre semanas', async ({ page }) => {
  await openCalendar(page, 'admin_shifts');
  await fillShift(page, '2026-10-27T22:00', '2026-10-28T06:00');
  await expect(page.getByRole('button', { name: /Otra ficha.*22:00.*06:00.*Programado/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click();
  await expect(page.getByLabel('Semana que incluye')).toHaveValue('2026-11-02');
  await expect(page.getByRole('button', { name: /Otra ficha.*22:00/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click();
  await expect(page.getByRole('button', { name: /Otra ficha.*22:00.*06:00/ })).toHaveCount(2);
  await page.getByLabel('Trabajador', { exact: true }).selectOption(colleague);
  await expect(page.getByRole('button', { name: /Turnos propios/ })).toHaveCount(0);
});

test('EMPLOYEE consulta exclusivamente sus turnos sin controles de escritura', async ({ page }) => {
  await openCalendar(page, 'employee_shifts');
  await expect(page.getByRole('heading', { name: 'Mis turnos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Turnos propios.*09:00/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Otra ficha/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear turno', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Turnos propios.*09:00/ }).click();
  await expect(page.getByRole('button', { name: 'Editar turno', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar turno', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const csrf = await (await page.request.get('/api/v1/auth/csrf/')).json();
  const response = await page.request.post(base, { headers: { 'X-CSRFToken': csrf.csrfToken }, data: { employee: colleague, starts_at: '2026-10-26T20:00:00Z', ends_at: '2026-10-26T21:00:00Z' } });
  expect(response.status()).toBe(403);
});

test('turnos respetan CSRF y los UUID de otros negocios', async ({ page }) => {
  await openCalendar(page, 'owner_shift_security');
  expect((await page.request.post(base, { data: {} })).status()).toBe(403);
  const csrf = await (await page.request.get('/api/v1/auth/csrf/')).json();
  const response = await page.request.post(base, { headers: { 'X-CSRFToken': csrf.csrfToken }, data: { employee: process.env.E2E_FOREIGN, starts_at: '2026-10-26T20:00:00Z', ends_at: '2026-10-26T21:00:00Z' } });
  expect(response.status()).toBe(400);
  expect((await page.request.patch(`${base}${process.env.E2E_FOREIGN_SHIFT}/`, { headers: { 'X-CSRFToken': csrf.csrfToken }, data: { status: 'CANCELLED' } })).status()).toBe(404);
});

test('calendario y formulario móvil, con navegación de teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCalendar(page, 'owner_shift_mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/shifts-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Crear turno', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Inicio del turno', { exact: true }).fill('2026-10-26T18:00');
  await page.getByLabel('Término del turno', { exact: true }).fill('2026-10-26T17:00');
  await page.getByRole('dialog').getByLabel('Trabajador', { exact: true }).selectOption(colleague);
  await page.getByRole('dialog').getByRole('button', { name: 'Crear turno', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('posterior');
  await page.screenshot({ path: 'test-results/shifts-mobile-form.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
