import { defineConfig, devices } from '@playwright/test';
import { API_PORT, appDbUrl, WEB_ORIGIN, WEB_PORT } from './e2e/env.js';

const apiEnv = {
  ...process.env,
  NODE_ENV: 'production',
  APP_DATABASE_URL: appDbUrl(),
  API_PORT: String(API_PORT),
  WEB_ORIGIN,
  LOG_LEVEL: 'warn',
} as Record<string, string>;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: WEB_ORIGIN, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', testIgnore: /mobile-layout/, use: { ...devices['Desktop Chrome'] } },
    // Motor do Safari em tamanho de iPhone para regressões de layout no celular.
    { name: 'iphone', testMatch: /mobile-layout/, use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @npac/api build && node ../api/dist/main.js',
      url: `http://localhost:${API_PORT}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm build && pnpm exec next start --port ${WEB_PORT}`,
      url: `${WEB_ORIGIN}/login`,
      env: { ...process.env, API_INTERNAL_URL: `http://localhost:${API_PORT}` } as Record<
        string,
        string
      >,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
