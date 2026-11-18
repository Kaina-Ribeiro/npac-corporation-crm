import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  appDbUrl,
  CAIXA_HTTP_PORT,
  CAIXA_SMTP_PORT,
  CAIXA_URL,
  E2E_FORMS_TOKEN,
  WEB_ORIGIN,
  WEB_PORT,
} from './e2e/env.js';

const apiEnv = {
  ...process.env,
  NODE_ENV: 'production',
  APP_DATABASE_URL: appDbUrl(),
  API_PORT: String(API_PORT),
  WEB_ORIGIN,
  LOG_LEVEL: 'warn',
  // API em modo produção exige MEDIA_DIR: pasta temporária do e2e, nunca o volume real.
  MEDIA_DIR: join(tmpdir(), 'npac-e2e-media'),
  FORMS_WEBHOOK_TOKEN: E2E_FORMS_TOKEN,
  FORMS_OWNER_USERNAME: 'ale',
  // "Esqueci minha senha" envia de verdade, pelo SMTP, para a caixa falsa (nada sai da máquina).
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(CAIXA_SMTP_PORT),
  MAIL_FROM: 'NPAC <crm@npac.test>',
  // O e2e prova o MFA real de HEAD, independente do .env local.
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
      command: 'node ../../scripts/caixa-falsa.mts',
      url: CAIXA_URL,
      env: {
        ...process.env,
        CAIXA_SMTP_PORT: String(CAIXA_SMTP_PORT),
        CAIXA_HTTP_PORT: String(CAIXA_HTTP_PORT),
      } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 30_000,
    },
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
      env: {
        ...process.env,
        API_INTERNAL_URL: `http://localhost:${API_PORT}`,
      } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
