import { test, expect, type Page } from '@playwright/test';
test.skip(process.env.E2E_TURNSTILE !== '1', 'Run by the isolated Django runner with its controlled provider stub.');
const password = 'Browser-test!pass-9274';
async function provider(page: Page) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.__challengeFixtures = {};
    window.turnstile = {
      render(container, options) {
        const id = crypto.randomUUID();
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = 'Completar verificación de prueba';
        button.onclick = () => options.callback(options.action + '-fixture-' + crypto.randomUUID());
        container.appendChild(button);
        window.__challengeFixtures[id] = {container, options}; return id;
      },
      remove(id) { const widget = window.__challengeFixtures[id]; if(widget) { widget.container.replaceChildren(); delete window.__challengeFixtures[id]; } }
    };
  ` }));
}
test('Turnstile obligatorio en login y validado por el backend', async ({ page }) => {
  await provider(page);
  await page.goto('/iniciar-sesion');
  const button = page.getByRole('button', { name: 'Iniciar sesión', exact: true });
  await page.getByRole('button', { name: 'Completar verificación de prueba' }).waitFor();
  await expect(button).toBeDisabled();
  const config = await (await page.request.get('/api/v1/auth/csrf/')).json();
  expect(config.turnstile.enabled).toBe(true);
  expect(JSON.stringify(config)).not.toContain('private-e2e-fixture');
  const missing = await page.request.post('/api/v1/auth/login/', { headers: { 'X-CSRFToken': config.csrfToken }, data: { username: 'owner_turnstile', password } });
  expect(missing.status()).toBe(400);
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('owner_turnstile');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Completar verificación de prueba' }).click();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(/\/app$/);
});
test('registro exige renovar una verificación expirada o fallida', async ({ page }) => {
  await provider(page);
  await page.goto('/registrarse');
  const button = page.getByRole('button', { name: 'Crear mi cuenta', exact: true });
  await page.getByRole('button', { name: 'Completar verificación de prueba' }).click();
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    const widgets = (window as unknown as { __challengeFixtures: Record<string, { options: Record<string, () => void> }> }).__challengeFixtures;
    Object.values(widgets)[0].options['expired-callback']();
  });
  await expect(button).toBeDisabled();
  await page.getByRole('button', { name: 'Reintentar verificación' }).click();
  await page.getByRole('button', { name: 'Completar verificación de prueba' }).waitFor();
  await page.evaluate(() => {
    const widgets = (window as unknown as { __challengeFixtures: Record<string, { options: Record<string, () => void> }> }).__challengeFixtures;
    Object.values(widgets)[0].options['error-callback']();
  });
  await expect(button).toBeDisabled();
  await page.getByRole('button', { name: 'Reintentar verificación' }).click();
  await page.getByRole('button', { name: 'Completar verificación de prueba' }).click();
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('browser_turnstile_registration');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('browser-turnstile@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await button.click();
  await expect(page.getByText('Tu cuenta está lista', { exact: true })).toBeVisible();
});
