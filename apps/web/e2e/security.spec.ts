import { test, expect } from '@playwright/test';
const business = process.env.E2E_BUSINESS_A!;

test('cabeceras, CSRF, límites del proxy y sesión cerrada', async ({ page }) => {
  const html = await page.goto('/iniciar-sesion');
  expect(html?.headers()['x-frame-options']).toBe('DENY');
  expect(html?.headers()['x-content-type-options']).toBe('nosniff');
  expect(html?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(html?.headers()['referrer-policy']).toBe('same-origin');
  expect(html?.headers()['x-powered-by']).toBeUndefined();
  const oversized = await page.request.post('/api/v1/auth/login/', { data: { padding: 'x'.repeat(65536) } });
  expect(oversized.status()).toBe(413);
  expect(oversized.headers()['cache-control']).toContain('no-store');
  const csrf = await (await page.request.get('/api/v1/auth/csrf/')).json();
  const badOrigin = await page.request.post('/api/v1/auth/login/', { headers: { 'X-CSRFToken': csrf.csrfToken, Origin: 'https://untrusted.example' }, data: {} });
  expect(badOrigin.status()).toBe(403);
  expect(badOrigin.headers()['access-control-allow-origin']).toBeUndefined();

  await page.getByLabel('Nombre de usuario', { exact: true }).fill('owner_hardening');
  await page.getByLabel('Contraseña', { exact: true }).fill('Browser-test!pass-9274');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  const token = await (await page.request.get('/api/v1/auth/csrf/')).json();
  const text = '<img src=x onerror="window.__zenvikXss=1">';
  const created = await page.request.post(`/api/v1/businesses/${business}/employees/`, { headers: { 'X-CSRFToken': token.csrfToken }, data: { first_name: text, last_name: 'Security test' } });
  expect(created.status()).toBe(201);
  const employee = await created.json();
  await page.goto(`/app/${business}/trabajadores/${employee.id}`);
  await expect(page.getByRole('main')).toContainText(text);
  expect(await page.evaluate(() => '__zenvikXss' in window)).toBe(false);
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);

  // Keep the old token only in test memory; never print cookies or auth state.
  const session = (await page.context().cookies()).find(cookie => cookie.name === 'sessionid');
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect((await page.request.post('/api/v1/auth/logout/', { headers: { 'X-CSRFToken': token.csrfToken }, data: {} })).status()).toBe(204);
  const replay = await page.request.get('/api/v1/auth/me/', { headers: { Cookie: `sessionid=${session!.value}` } });
  expect(replay.status()).toBe(403);
});
