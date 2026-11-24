import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';

// Função simples no lugar do `vi.fn`: o resultado rejeitado de um `vi.fn` derruba o teste mesmo
// quando o código trata o erro.
const chamadas: unknown[][] = [];
let responder: () => Promise<{ statusCode: number }>;
vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => {
      chamadas.push(args);
      return responder();
    },
  },
}));

const { PUSH_TIMEOUT_MS, WebPushSender } = await import('../src/push/push.service.js');

const env = {
  VAPID_PUBLIC_KEY: 'publica',
  VAPID_PRIVATE_KEY: 'privada',
  WEB_ORIGIN: 'https://crm.exemplo.com',
} as Env;
const alvo = { endpoint: 'https://web.push.apple.com/x', p256dh: 'p', auth: 'a' };
const payload = { title: 'Teste', url: '/hoje', tag: 'teste' };

/** Envio ao serviço de push (NPAC-71): com prazo, para um aparelho que não responde não prender os demais. */
describe('WebPushSender', () => {
  beforeEach(() => {
    chamadas.length = 0;
  });

  it('envia com prazo para desistir', async () => {
    responder = () => Promise.resolve({ statusCode: 201 });
    expect(await new WebPushSender(env).send(alvo, payload)).toBe('ok');
    expect(PUSH_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
    expect(chamadas[0]![2]).toMatchObject({ timeout: PUSH_TIMEOUT_MS, urgency: 'high' });
  });

  it('sem resposta no prazo vira erro, sem apagar a inscrição', async () => {
    // O web-push rejeita sem `statusCode` quando o prazo estoura.
    responder = () => Promise.reject(new Error('Socket timeout'));
    expect(await new WebPushSender(env).send(alvo, payload)).toBe('error');
  });
});
