import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function login(page: Page, user: string) {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(user);
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Tus negocios' })).toBeVisible();
  await expect(page.locator('.workspace-intro img')).toHaveCount(0);
  await mkdir('../../.artifacts/workspaces', { recursive: true });
}

test('mis negocios: portada, vistas y apertura del espacio real', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'owner_gallery');
  await expect(page.locator('.business-card')).toHaveCount(1);
  await expect(page.locator('.business-card')).toContainText('Propietario');
  await expect(page.locator('.business-card')).toContainText('RUT no informado');
  await expect(page.locator('.business-card__avatar')).toHaveText('NA');
  await expect(page.getByRole('link', { name: 'Registrar negocio', exact: true })).toHaveCount(1);
  for (const link of await page.getByRole('link', { name: 'Registrar negocio', exact: true }).all()) await expect(link).toHaveAttribute('href', '/app/nuevo-negocio');
  await page.screenshot({ path: '../../.artifacts/workspaces/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Vista de lista', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vista de lista', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.business-card')).toHaveClass(/business-card--list/);
  await page.getByRole('button', { name: 'Vista de tarjetas', exact: true }).click();
  await expect(page.locator('.business-card')).not.toHaveClass(/business-card--list/);
  await page.getByRole('link', { name: 'Abrir espacio de Negocio A de prueba', exact: true }).click();
  await expect(page).toHaveURL(`/app/${process.env.E2E_BUSINESS_A}`);
  await expect(page.getByRole('heading', { name: 'Negocio A de prueba', exact: true })).toBeVisible();
});

test('mis negocios en móvil: sin desborde, menú y registro accesibles', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'owner_gallery_mobile');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../.artifacts/workspaces/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Vista de lista', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Turnos', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Negocio activo')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Registrar negocio', exact: true }).first().click();
  await expect(page).toHaveURL('/app/nuevo-negocio');
});


test('resumen aislado al cambiar negocio y recuperación de errores', async ({ page }) => {
  await login(page, 'owner_selection');
  const a = process.env.E2E_BUSINESS_A!; const b = process.env.E2E_BUSINESS_B!;
  await page.getByLabel('Negocio activo').selectOption(a);
  await expect(page.getByRole('heading', { name: 'Negocio A de prueba' })).toBeVisible();
  await expect(page.getByText('Valentina Rojas', { exact: true }).first()).toBeVisible();
  await page.route(`**/api/v1/businesses/${b}/dashboard/**`, async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.getByLabel('Negocio activo').selectOption(b);
  await expect(page.getByRole('heading', { name: 'Negocio B de prueba' })).toBeVisible();
  await expect(page.getByText('Valentina Rojas', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Consultando resumen' })).toHaveCount(0);
  const response = await page.request.get(`/api/v1/businesses/${b}/dashboard/`);
  const data = await response.json();
  expect(data.active_employees).toBe(1);
  expect(data.pending_count).toBe(0);
  await page.unrouteAll();
  await page.route(`**/api/v1/businesses/${b}/dashboard/**`, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Resumen temporalmente no disponible.' }) }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Resumen temporalmente no disponible.' })).toBeVisible();
  await expect(page.getByText('Trabajadores activos', { exact: true })).toHaveCount(0);
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Contraer menú lateral' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir menú lateral' })).toBeVisible();
});

test('negocio ajeno no expone resumen y selector recupera error', async ({ page }) => {
  await login(page, 'owner_gallery');
  const b = process.env.E2E_BUSINESS_B!;
  expect((await page.request.get(`/api/v1/businesses/${b}/dashboard/`)).status()).toBe(404);
  await page.goto(`/app/${b}`);
  await expect(page.getByRole('heading', { name: 'Negocio no disponible' })).toBeVisible();
  await page.route('**/api/v1/businesses/?page=*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Listado temporalmente no disponible.' }) }));
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'Listado temporalmente no disponible.' })).toBeVisible();
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await page.getByRole('link', { name: 'Volver a mis negocios' }).click();
  await expect(page.getByRole('heading', { name: 'Tus negocios' })).toBeVisible();
});


test('breadcrumb contextual, actualización real y retorno al directorio', async ({ page }) => {
  await login(page, 'owner_gallery');
  const a = process.env.E2E_BUSINESS_A!;
  await page.getByLabel('Negocio activo').selectOption(a);
  const breadcrumb = page.getByRole('navigation', { name: 'Ruta actual' });
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Inicio');
  await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname.replace(/\/$/, '') === `/api/v1/businesses/${a}/dashboard` && response.status() === 200, { timeout: 10000 }),
    page.getByRole('button', { name: 'Actualizar resumen' }).click(),
  ]);
  await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
  await page.goto(`/app/${a}/trabajadores/${process.env.E2E_COLLEAGUE}/editar`);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('Editar trabajador');
  await expect(breadcrumb.getByRole('link', { name: 'Ficha del trabajador' })).toHaveAttribute('href', `/app/${a}/trabajadores/${process.env.E2E_COLLEAGUE}`);
  await breadcrumb.getByRole('link', { name: 'Trabajadores', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tu equipo, en un solo lugar', exact: true })).toBeVisible();
  await breadcrumb.getByRole('link', { name: 'Mis negocios', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tus negocios' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Asistencia/ })).toHaveCount(0);
});

test('controles accesibles a 320px y foco contenido en navegación móvil', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page, 'owner_gallery_mobile');
  await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const brand = page.getByRole('link', { name: 'Zenvik, mis negocios' });
  await expect(brand).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cerrar sesión desde navegación' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(brand).toBeFocused();
  await page.getByLabel('Negocio activo').selectOption(process.env.E2E_BUSINESS_A!);
  await expect(page.getByRole('heading', { name: 'Negocio A de prueba' })).toBeVisible();
  await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/stage8-dashboard-320.png', fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#main').locator('..')).not.toHaveAttribute('inert');
});

test('una respuesta tardía del negocio anterior no reemplaza el resumen actual', async ({ page }) => {
  await login(page, 'owner_selection');
  const a = process.env.E2E_BUSINESS_A!; const b = process.env.E2E_BUSINESS_B!;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let fetched = false;
  await page.route(`**/api/v1/businesses/${a}/dashboard/**`, async route => {
    const response = await route.fetch();
    fetched = true;
    await gate;
    await route.fulfill({ response }).catch(() => {}); // The browser may have already aborted this request.
  });
  try {
    await page.getByLabel('Negocio activo').selectOption(a);
    await expect.poll(() => fetched).toBe(true);
    await page.getByLabel('Negocio activo').selectOption(b);
    await expect(page.getByRole('heading', { name: 'Negocio B de prueba' })).toBeVisible();
    await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(page.getByText('Valentina Rojas', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Trabajadores activos', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Consultando resumen' })).toHaveCount(0);
  } finally { release(); }
});
