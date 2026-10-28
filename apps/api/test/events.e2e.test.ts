import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, deactivate, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => closeTestApp(app));

it('stream não expõe PII, detecta mudanças e encerra usuário desativado', async () => {
  await resetAuthState();
  const cookie = await h.signIn('ale@npac.com.br');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  try {
    const res = await fetch(`${await app.getUrl()}/api/events`, {
      headers: { cookie },
      signal: abort.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const reader = res.body!.getReader();
    let buffer = '';
    async function nextType() {
      while (true) {
        const split = buffer.indexOf('\n\n');
        if (split >= 0) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (line) {
            const data = JSON.parse(line.slice(5)) as { type: string };
            expect(Object.keys(data)).toEqual(['type']);
            return data.type;
          }
        } else {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('Stream encerrado');
          buffer += new TextDecoder().decode(chunk.value);
        }
      }
    }
    expect(await nextType()).toBe('ready');
    await h.post(
      '/api/leads',
      { name: 'Sinal privado', instagram: '@evento.privado', incomeBand: 'R5_10K', tier: 'P1' },
      cookie,
    );
    expect(await nextType()).toBe('invalidate');
    await deactivate('ale@npac.com.br');
    expect(await nextType()).toBe('session-ended');
    await reader.cancel();
    expect((await h.get('/api/events', cookie)).status).toBe(401);
  } finally {
    abort.abort();
    clearTimeout(timeout);
  }
});
