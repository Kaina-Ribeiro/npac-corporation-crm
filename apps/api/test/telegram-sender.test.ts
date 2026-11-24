import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotApiTelegramSender, telegramHtml } from '../src/telegram/telegram.js';

/**
 * Emissor do Telegram (NPAC-74) contra um servidor local: o token vai no caminho e nunca no log, nem o
 * chat nem o texto. 403 (bot bloqueado) apaga o vínculo; outro erro só fica no log.
 */
const TOKEN = '123456:SEGREDOdoTOKENsegredoDOtokenSEGREDO';
let server: Server;
let base: string;
let status = 200;
const pedidos: { url: string; body: Record<string, unknown> }[] = [];

async function corpo(req: IncomingMessage) {
  const parts: Buffer[] = [];
  for await (const c of req) parts.push(c as Buffer);
  return JSON.parse(Buffer.concat(parts).toString()) as Record<string, unknown>;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void corpo(req).then((body) => {
      pedidos.push({ url: req.url ?? '', body });
      res.statusCode = status;
      res.end(JSON.stringify({ ok: status === 200, description: 'Forbidden: bot was blocked' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  pedidos.length = 0;
  status = 200;
});

describe('BotApiTelegramSender', () => {
  it('manda em HTML, com o botão, e o log leva só status e host', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const s = new BotApiTelegramSender(TOKEN, base);
    const r = await s.send('987654', telegramHtml({ title: 'Ana agendou João', body: 'Hoje' }), {
      text: 'Abrir no CRM',
      url: 'https://crm.exemplo.com/hoje',
    });
    expect(r).toBe('ok');
    expect(pedidos[0]!.url).toBe(`/bot${TOKEN}/sendMessage`);
    expect(pedidos[0]!.body).toMatchObject({
      chat_id: '987654',
      text: '<b>Ana agendou João</b>\nHoje',
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'Abrir no CRM', url: 'https://crm.exemplo.com/hoje' }]],
      },
    });
    const linhas = log.mock.calls.map((c) => String(c[0]));
    expect(linhas).toEqual([`telegram enviado: 200 ${new URL(base).host}`]);
    for (const l of linhas) {
      expect(l).not.toContain('SEGREDO');
      expect(l).not.toContain('987654');
      expect(l).not.toContain('João');
    }
    log.mockRestore();
  });

  it('403 = bloqueou o bot; outro erro e falta de resposta = erro', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const s = new BotApiTelegramSender(TOKEN, base);
    status = 403;
    expect(await s.send('1', 'x')).toBe('gone');
    status = 400;
    expect(await s.send('1', 'x')).toBe('error');
    expect(await new BotApiTelegramSender(TOKEN, 'http://127.0.0.1:1').send('1', 'x')).toBe(
      'error',
    );
    for (const l of [...warn.mock.calls, ...log.mock.calls].map((c) => String(c[0])))
      expect(l).not.toContain('SEGREDO');
    warn.mockRestore();
    log.mockRestore();
  });

  it('registra o webhook com o segredo e só mensagens', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const s = new BotApiTelegramSender(TOKEN, base);
    expect(await s.setWebhook('https://crm.exemplo.com/api/webhooks/telegram', 'seg')).toBe(true);
    expect(pedidos[0]!.url).toBe(`/bot${TOKEN}/setWebhook`);
    expect(pedidos[0]!.body).toMatchObject({
      url: 'https://crm.exemplo.com/api/webhooks/telegram',
      secret_token: 'seg',
      allowed_updates: ['message'],
    });
    vi.restoreAllMocks();
  });
});
