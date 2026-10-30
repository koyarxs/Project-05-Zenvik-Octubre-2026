import { test, expect, type Page } from '@playwright/test';
const a = process.env.E2E_BUSINESS_A!; const b = process.env.E2E_BUSINESS_B!;
const password = 'Browser-test!pass-9274';
async function login(page: Page, username: string) {
  await page.goto('/iniciar-sesion'); await page.getByLabel('Nombre de usuario', { exact: true }).fill(username); await page.getByLabel('Contraseña', { exact: true }).fill(password); await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click(); await expect(page).toHaveURL(/\/app$/);
}
test('registro, negocio, trabajador, edición, persistencia y cierre de sesión', async ({ page }) => {
  await page.goto('/registrarse');
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('browser_registration'); await page.getByLabel('Correo electrónico', { exact: true }).fill('browser-registration@example.com'); await page.getByLabel('Contraseña', { exact: true }).fill(password); await page.getByRole('button', { name: 'Crear mi cuenta' }).click();
  await expect(page.getByText('Tu cuenta está lista')).toBeVisible(); await login(page, 'browser_registration');
  await expect(page.getByText('Tu primer negocio empieza aquí')).toBeVisible();
  await page.getByRole('link', { name: 'Registrar mi primer negocio' }).click(); await page.getByLabel('Nombre comercial').fill('Negocio creado en navegador'); await page.getByRole('button', { name: 'Registrar negocio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Negocio creado en navegador' })).toBeVisible(); await expect(page.getByText('Negocio registrado correctamente. Ya puedes comenzar.')).toBeVisible();
  await page.getByRole('link', { name: 'Registrar trabajador', exact: true }).click(); await page.getByLabel('Nombre', { exact: true }).fill('Ana'); await page.getByLabel('Apellido', { exact: true }).fill('Prueba'); await page.getByLabel('Correo electrónico (opcional)').fill('ana-test@example.com'); await page.getByRole('button', { name: 'Registrar trabajador', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ana Prueba' })).toBeVisible(); await page.getByRole('link', { name: 'Editar trabajador' }).click(); await page.getByLabel('Nombre', { exact: true }).fill('Anita'); await page.getByRole('button', { name: 'Guardar cambios' }).click(); await expect(page.getByRole('heading', { name: 'Anita Prueba' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Anita Prueba' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.length)).toBe(0);
  const cookies = await page.context().cookies(); expect(cookies.find(c => c.name === 'sessionid')?.httpOnly).toBe(true); expect(cookies.find(c => c.name === 'csrftoken')?.httpOnly).toBe(true);
  await page.locator('summary').click(); await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expect(page).toHaveURL(/iniciar-sesion/);
  await page.goto('/app'); await expect(page).toHaveURL(/iniciar-sesion/);
});
test('selección de negocios y datos reales', async ({ page }) => {
  await login(page, 'owner_selection'); await page.getByLabel('Negocio activo').selectOption(a); await expect(page.getByRole('heading', { name: 'Negocio A de prueba' })).toBeVisible();
  await expect(page.getByText('Fichas de este negocio', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByLabel('Negocio activo').selectOption(b); await expect(page.getByRole('heading', { name: 'Negocio B de prueba' })).toBeVisible(); await page.getByRole('link', { name: 'Ver trabajadores' }).click(); await expect(page.getByText('Ficha ajena De prueba', { exact: true })).toBeVisible(); await expect(page.getByText('Otra ficha De prueba', { exact: true })).toHaveCount(0);
});
test('ADMIN puede registrar trabajadores', async ({ page }) => {
  await login(page, 'admin_ui'); await page.goto(`/app/${a}/trabajadores/nuevo`); await page.getByLabel('Nombre', { exact: true }).fill('Registro'); await page.getByLabel('Apellido', { exact: true }).fill('Administrador'); await page.getByRole('button', { name: 'Registrar trabajador', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Registro Administrador' })).toBeVisible();
});
test('EMPLOYEE ve solo su ficha y no puede escribir', async ({ page }) => {
  await login(page, 'employee_ui'); await page.goto(`/app/${a}/trabajadores`); await expect(page.getByText('Mi ficha De prueba', { exact: true })).toBeVisible(); await expect(page.getByText('Otra ficha De prueba', { exact: true })).toHaveCount(0); await expect(page.getByRole('link', { name: 'Registrar trabajador' })).toHaveCount(0);
  await page.goto(`/app/${a}/trabajadores/nuevo`); await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
  const csrf = await (await page.request.get('/api/v1/auth/csrf/')).json(); const response = await page.request.post(`/api/v1/businesses/${a}/employees/`, { headers: { 'X-CSRFToken': csrf.csrfToken }, data: { first_name: 'No', last_name: 'Permitido' } }); expect(response.status()).toBe(403);
  await page.goto(`/app/${a}/trabajadores/${process.env.E2E_COLLEAGUE}`); await expect(page.getByRole('heading', { name: 'Ficha no disponible' })).toBeVisible();
});
test('CSRF activo, PATCH protegido y 404 entre negocios', async ({ page }) => {
  await login(page, 'owner_security');
  const missingCsrf = await page.request.post('/api/v1/businesses/', { data: { name: 'Sin CSRF' } }); expect(missingCsrf.status()).toBe(403);
  const csrf = await (await page.request.get('/api/v1/auth/csrf/')).json();
  const badOrigin = await page.request.post('/api/v1/businesses/', { headers: { 'X-CSRFToken': csrf.csrfToken, Origin: 'https://untrusted.example' }, data: { name: 'Origen rechazado' } }); expect(badOrigin.status()).toBe(403);
  const forbidden = await page.request.patch(`/api/v1/businesses/${a}/employees/${process.env.E2E_COLLEAGUE}/`, { headers: { 'X-CSRFToken': csrf.csrfToken }, data: { business: b } }); expect(forbidden.status()).toBe(400);
  expect((await page.request.get(`/api/v1/businesses/${b}/employees/`)).status()).toBe(404);
  await page.goto(`/app/${a}/trabajadores/${process.env.E2E_FOREIGN}`); await expect(page.getByRole('heading', { name: 'Ficha no disponible' })).toBeVisible();
});
test('sesión vencida redirige sin mostrar datos', async ({ page }) => {
  await login(page, 'owner_expiry'); await page.goto(`/app/${a}`); await expect(page.getByRole('heading', { name: 'Negocio A de prueba' })).toBeVisible(); await page.context().clearCookies(); await page.reload(); await expect(page).toHaveURL(/iniciar-sesion/); await expect(page.getByRole('heading', { name: 'Negocio A de prueba' })).toHaveCount(0);
});
test('errores recuperables de conexión', async ({ page }) => {
  await login(page, 'owner_error'); await page.route(`**/api/v1/businesses/${a}/employees/**`, route => route.fulfill({ status: 502, contentType: 'application/json', body: '{"detail":"Conexión temporalmente no disponible."}' })); await page.goto(`/app/${a}/trabajadores`); await expect(page.getByRole('alert').filter({ hasText: 'Conexión temporalmente' })).toBeVisible(); await page.unrouteAll(); await page.getByRole('button', { name: 'Volver a intentar' }).click(); await expect(page.getByText('Otra ficha De prueba', { exact: true })).toBeVisible();
});
test('móvil sin desbordamiento y navegación por teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page, 'owner_mobile'); await page.goto(`/app/${a}/trabajadores`); await expect(page.getByText('Otra ficha De prueba', { exact: true })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); await page.getByRole('button', { name: 'Abrir menú' }).click(); await expect(page.getByRole('complementary', { name: 'Navegación principal' })).toBeVisible(); await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click(); await page.keyboard.press('Tab');
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
