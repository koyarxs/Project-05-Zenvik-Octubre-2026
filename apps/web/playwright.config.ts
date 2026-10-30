import { defineConfig, devices } from '@playwright/test';
if (process.env.ZENVIK_E2E !== '1' || !process.env.E2E_BUSINESS_A) throw new Error('Ejecutar mediante el runner Django aislado; ver README.md.');
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, maxFailures: 1,
  timeout: 45000, expect: { timeout: 10000 },
  // Traces can contain cookies and request bodies. Keep screenshots of synthetic fixtures only.
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3100', trace: 'off', screenshot: 'only-on-failure' },
  reporter: [['list']],
  webServer: { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100/iniciar-sesion', reuseExistingServer: false, timeout: 60000 },
});
