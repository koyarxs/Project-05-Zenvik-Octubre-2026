import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function login(page: Page, user: string) {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Nombre de usuario', { exact: true }).fill(user);
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Un lugar para cada equipo.' })).toBeVisible();
  await expect.poll(() => page.locator('.business-hero img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await mkdir('../../.artifacts/workspaces', { recursive: true });
}

test('mis negocios: portada, vistas y apertura del espacio real', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'owner_gallery');
  await expect(page.locator('.business-card')).toHaveCount(1);
  await expect(page.locator('.business-card')).toContainText('Propietario');
  await expect(page.locator('.business-card')).toContainText('RUT no informado');
  await expect.poll(() => page.locator('.business-card img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('link', { name: 'Registrar negocio', exact: true })).toHaveCount(2);
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
  await expect(page.getByRole('link', { name: 'Turnos', exact: true })).toHaveAttribute('href', `/app/${process.env.E2E_BUSINESS_A}/turnos`);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menú', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Registrar negocio', exact: true }).first().click();
  await expect(page).toHaveURL('/app/nuevo-negocio');
});
