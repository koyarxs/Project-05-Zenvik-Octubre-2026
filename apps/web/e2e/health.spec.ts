import { test, expect } from '@playwright/test';
test('healthchecks del frontend y dependencia API sin datos sensibles', async ({ request }) => {
  for (const path of ['/health/live', '/health/ready']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect((await response.json()).status).toBe('ok');
  }
});
