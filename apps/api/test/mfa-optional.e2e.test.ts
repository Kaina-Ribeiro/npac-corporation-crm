import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  protectedRoute,
  resetAuthState,
} from './helpers.js';

// Só desenvolvimento: HEAD entra sem configurar o autenticador.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
beforeAll(async () => {
  process.env.MFA_REQUIRED = 'false';
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  delete process.env.MFA_REQUIRED;
  await closeTestApp(app);
});

it('com MFA_REQUIRED=false o HEAD sem autenticador usa o app', async () => {
  await resetAuthState();
  await owner`update "user" set two_factor_enabled = false where email = 'ana@npac.com.br'`;
  const ana = await h.signIn('ana@npac.com.br');
  expect((await h.get(protectedRoute, ana)).status).toBe(200);
  const me = await h.get('/api/me', ana);
  expect(me.body.mfaPending).toBe(false);
});
