import { Logger } from '@nestjs/common';
import webpush from 'web-push';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/config/env.js';
import { WebPushSender } from '../src/push/push.service.js';

/** Log de cada envio de push (NPAC-48, B7): código HTTP, host e motivo; nada da pessoa. */
const ENDPOINT = 'https://web.push.apple.com/QGuSegredoDoAparelho123';
const target = { endpoint: ENDPOINT, p256dh: 'p', auth: 'a' };
const payload = { title: 'Sônia agendou Lead aviso', url: '/leads/1', tag: 'aviso-1' };
const env = {
  VAPID_PUBLIC_KEY: 'pub',
  VAPID_PRIVATE_KEY: 'priv',
  WEB_ORIGIN: 'https://crm.test',
} as Env;

let lines: string[];
beforeEach(() => {
  lines = [];
  for (const level of ['log', 'warn'] as const)
    vi.spyOn(Logger.prototype, level).mockImplementation((msg: unknown) => {
      lines.push(`${level} ${String(msg)}`);
    });
});
afterEach(() => vi.restoreAllMocks());

function rejectWith(err: Record<string, unknown>) {
  vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
    Object.assign(new Error('Received unexpected response code'), err),
  );
}

describe('log do envio de push', () => {
  it('sucesso: código e host do serviço', async () => {
    vi.spyOn(webpush, 'sendNotification').mockResolvedValue({
      statusCode: 201,
      body: '',
      headers: {},
    });
    expect(await new WebPushSender(env).send(target, payload)).toBe('ok');
    expect(lines).toEqual(['log push enviado: 201 web.push.apple.com']);
  });

  it('recusa da Apple: código, host e motivo, sem o endereço do aparelho nem o aviso', async () => {
    rejectWith({ statusCode: 403, body: '{"reason":"BadJwtToken"}', endpoint: ENDPOINT });
    expect(await new WebPushSender(env).send(target, payload)).toBe('error');
    expect(lines).toEqual(['warn push recusado: 403 web.push.apple.com BadJwtToken']);
    expect(lines.join()).not.toMatch(/Segredo|Lead aviso|aviso-1/);
  });

  it('inscrição expirada (410): volta "gone" e registra', async () => {
    rejectWith({ statusCode: 410, body: '{"reason":"Unregistered"}' });
    expect(await new WebPushSender(env).send(target, payload)).toBe('gone');
    expect(lines).toEqual([
      'log push expirado, inscrição apagada: 410 web.push.apple.com Unregistered',
    ]);
  });

  it('corpo em texto: cortado e sem endereços', async () => {
    rejectWith({
      statusCode: 400,
      body: `UnauthorizedRegistration\n see ${ENDPOINT} ${'x'.repeat(300)}`,
    });
    await new WebPushSender(env).send(
      { ...target, endpoint: 'https://fcm.googleapis.com/fcm/send/abc' },
      payload,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^warn push recusado: 400 fcm\.googleapis\.com UnauthorizedRegistration see x+$/,
    );
    expect(lines[0]).not.toMatch(/Segredo|https/);
    expect(lines[0]!.length).toBeLessThan(200);
  });

  it('sem resposta (rede): o código do erro', async () => {
    vi.spyOn(webpush, 'sendNotification').mockRejectedValue(
      Object.assign(new Error('connect ETIMEDOUT 17.188.0.1:443'), { code: 'ETIMEDOUT' }),
    );
    expect(await new WebPushSender(env).send(target, payload)).toBe('error');
    expect(lines).toEqual(['warn push sem resposta: ETIMEDOUT web.push.apple.com']);
  });
});
