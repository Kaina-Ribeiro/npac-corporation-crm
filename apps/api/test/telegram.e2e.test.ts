import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PUSH_SENDER, PushService } from '../src/push/push.service.js';
import { TELEGRAM_SENDER } from '../src/telegram/telegram.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type MemoryPushSender,
  type MemoryTelegramSender,
} from './helpers.js';

/**
 * Avisos pelo Telegram (NPAC-74, Igor 24/11/2026). A pessoa pede o link no Meu perfil, toca em
 * "Começar" no bot e o Telegram chama o webhook com `/start <código>`. Aqui o teste faz o papel do
 * Telegram; o envio vai para um Telegram em memória.
 */
const VARS = {
  TELEGRAM_BOT_TOKEN: '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  TELEGRAM_BOT_USERNAME: 'npac_teste_bot',
  TELEGRAM_WEBHOOK_SECRET: 'segredo-do-webhook-do-telegram-de-teste',
};
const ROUTE = '/api/webhooks/telegram';
const CHAT_ALE = 111111;
const CHAT_OUTRO = 222222;

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let tg: MemoryTelegramSender;
let push: MemoryPushSender;
let ale: string;
let aleId: string;

const webhook = (body: object, secret: string | null = VARS.TELEGRAM_WEBHOOK_SECRET) => {
  const r = request(app.getHttpServer()).post(ROUTE).send(body);
  return secret === null ? r : r.set('x-telegram-bot-api-secret-token', secret);
};
const start = (chat: number, text: string, type = 'private') =>
  webhook({ update_id: 1, message: { message_id: 1, chat: { id: chat, type }, text } });

/** Pede o link no perfil e devolve o código do `?start=`. */
async function pedirLink(cookie: string): Promise<string> {
  const res = await h.post('/api/me/telegram/code', {}, cookie);
  expect(res.status).toBe(200);
  const url = new URL(res.body.url as string);
  expect(url.origin + url.pathname).toBe('https://t.me/npac_teste_bot');
  return url.searchParams.get('start')!;
}
async function conectar(cookie: string, chat: number) {
  const code = await pedirLink(cookie);
  expect((await start(chat, `/start ${code}`)).status).toBe(200);
}
const vinculos = async () =>
  (await owner<{ user_id: string }[]>`select user_id from telegram_vinculos`).map((r) => r.user_id);

beforeAll(async () => {
  Object.assign(process.env, VARS);
  app = await createTestApp();
  h = api(app);
  tg = app.get(TELEGRAM_SENDER);
  push = app.get(PUSH_SENDER);
  const [u] = await owner<{ id: string }[]>`select id from "user" where username = 'ale'`;
  aleId = u!.id;
});
afterAll(async () => {
  for (const k of Object.keys(VARS)) delete process.env[k];
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate telegram_vinculos, telegram_codigos, push_subscriptions`;
  ale = await h.signIn('ale@npac.com.br');
  tg.sent = [];
  tg.blocked.clear();
  tg.fail = false;
  push.sent = [];
});

describe('conectar pelo Meu perfil', () => {
  it('o perfil mostra desconectado; o link é do bot, com código de uso único', async () => {
    expect((await h.get('/api/me/profile', ale)).body.telegram).toEqual({
      connected: false,
      since: null,
    });
    const code = await pedirLink(ale);
    expect(code).toMatch(/^[\w-]{43}$/);
    // Só o hash fica no banco.
    const [row] = await owner<{ hash: Buffer }[]>`select hash from telegram_codigos`;
    expect(row!.hash.toString('utf8')).not.toContain(code);

    expect((await start(CHAT_ALE, `/start ${code}`)).body).toEqual({ ok: true });
    expect(await vinculos()).toEqual([aleId]);
    expect(tg.sent).toEqual([
      { chat: String(CHAT_ALE), html: 'Pronto, Ale! Os avisos do NPAC CRM vão chegar aqui.' },
    ]);
    const status = (await h.get('/api/me/telegram', ale)).body;
    expect(status.connected).toBe(true);
    expect(typeof status.since).toBe('string');
    // O id do chat vai cifrado.
    const [v] = await owner<{ chat_enc: Buffer }[]>`select chat_enc from telegram_vinculos`;
    expect(v!.chat_enc.toString('latin1')).not.toContain(String(CHAT_ALE));

    // De novo o mesmo código: não vale mais.
    tg.sent = [];
    await start(CHAT_OUTRO, `/start ${code}`);
    expect(tg.sent[0]!.html).toContain('Esse link não vale mais');
    expect(await vinculos()).toEqual([aleId]);
  });

  it('código vencido ou inventado não conecta e ensina o caminho', async () => {
    const code = await pedirLink(ale);
    await owner`update telegram_codigos set vence_em = now() - interval '1 second'`;
    await start(CHAT_ALE, `/start ${code}`);
    await start(CHAT_ALE, '/start nao-e-um-codigo');
    expect(tg.sent.map((m) => m.html)).toEqual([
      'Esse link não vale mais. No CRM, abra “Meu perfil” e toque em “Conectar Telegram” de novo.',
      'Esse link não vale mais. No CRM, abra “Meu perfil” e toque em “Conectar Telegram” de novo.',
    ]);
    expect(await vinculos()).toEqual([]);
  });

  it('/start sem código ensina o caminho; outra mensagem e grupo são ignorados', async () => {
    await start(CHAT_ALE, '/start');
    expect(tg.sent.map((m) => m.html)).toEqual([
      'Para receber os avisos do NPAC CRM aqui, abra o CRM, vá em “Meu perfil” e toque em “Conectar Telegram”.',
    ]);
    tg.sent = [];
    const code = await pedirLink(ale);
    expect((await start(CHAT_ALE, 'oi')).status).toBe(200);
    expect((await start(-100, `/start ${code}`, 'group')).status).toBe(200);
    expect((await webhook({ update_id: 2, edited_message: {} })).status).toBe(200);
    expect(tg.sent).toEqual([]);
    expect(await vinculos()).toEqual([]);
  });

  it('desconectar apaga o vínculo; o teste sem vínculo pede para conectar', async () => {
    await conectar(ale, CHAT_ALE);
    expect((await h.del('/api/me/telegram', {}, ale)).status).toBe(204);
    expect(await vinculos()).toEqual([]);
    const res = await h.post('/api/me/telegram/test', {}, ale);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Conecte o Telegram antes do teste.');
  });

  it('aviso de teste vai só ao Telegram da pessoa', async () => {
    await conectar(ale, CHAT_ALE);
    tg.sent = [];
    expect((await h.post('/api/me/telegram/test', {}, ale)).status).toBe(204);
    expect(tg.sent).toEqual([
      {
        chat: String(CHAT_ALE),
        html: '<b>Aviso de teste do NPAC CRM</b>\nSe chegou, está tudo certo.',
      },
    ]);
    tg.fail = true;
    const falhou = await h.post('/api/me/telegram/test', {}, ale);
    expect(falhou.status).toBe(502);
    expect(falhou.body.message).toBe('Não deu para falar com o Telegram. Tente de novo.');
  });

  it('um Telegram por pessoa: o mesmo chat em outra conta sai da primeira', async () => {
    await conectar(ale, CHAT_ALE);
    const murilo = await h.signIn('murilo@npac.com.br');
    await conectar(murilo, CHAT_ALE);
    const [m] = await owner<{ id: string }[]>`select id from "user" where username = 'murilo'`;
    expect(await vinculos()).toEqual([m!.id]);
    expect((await h.get('/api/me/telegram', ale)).body.connected).toBe(false);
  });

  it('vale para o cargo Acompanhamento', async () => {
    const carla = await h.signIn('carla@npac.com.br');
    expect((await h.get('/api/me/profile', carla)).body.telegram).toEqual({
      connected: false,
      since: null,
    });
    await conectar(carla, CHAT_OUTRO);
    expect((await h.get('/api/me/telegram', carla)).body.connected).toBe(true);
  });

  it('desativar a pessoa apaga o vínculo', async () => {
    await conectar(ale, CHAT_ALE);
    const dir = await h.signIn('diretor@npac.com.br');
    const res = await h.patch(`/api/admin/users/${aleId}`, { active: false }, dir);
    expect(res.status).toBe(200);
    expect(await vinculos()).toEqual([]);
    await owner`update "user" set active = true where id = ${aleId}`;
  });
});

describe('webhook', () => {
  it('segredo errado ou ausente: 404, sem ler o corpo', async () => {
    const code = await pedirLink(ale);
    const body = { message: { chat: { id: CHAT_ALE, type: 'private' }, text: `/start ${code}` } };
    expect((await webhook(body, 'segredo-errado-segredo-errado-segredo')).status).toBe(404);
    expect((await webhook(body, null)).status).toBe(404);
    expect(tg.sent).toEqual([]);
    expect(await vinculos()).toEqual([]);
  });
});

describe('avisos', () => {
  it('o aviso do push também vai ao Telegram de quem conectou, com o botão do CRM', async () => {
    await h.post(
      '/api/push/subscriptions',
      { endpoint: 'https://push.test/ale', keys: { p256dh: 'p', auth: 'a' } },
      ale,
    );
    await conectar(ale, CHAT_ALE);
    tg.sent = [];
    const murilo = await owner<{ id: string }[]>`select id from "user" where username = 'murilo'`;
    await app
      .get(PushService)
      .notify([aleId, murilo[0]!.id], { title: 'Ana <agendou> João', url: '/hoje', tag: 't' });
    expect(push.sent.map((s) => s.endpoint)).toEqual(['https://push.test/ale']);
    // WEB_ORIGIN dos testes é http: o Telegram recusa botão assim, então vai sem ele.
    expect(tg.sent).toEqual([{ chat: String(CHAT_ALE), html: '<b>Ana &lt;agendou&gt; João</b>' }]);
  });

  it('quem bloqueou o bot (403) perde o vínculo; erro do Telegram não atrapalha o push', async () => {
    await conectar(ale, CHAT_ALE);
    tg.blocked.add(String(CHAT_ALE));
    await app.get(PushService).notify([aleId], { title: 'x', url: '/hoje', tag: 't' });
    expect(await vinculos()).toEqual([]);
  });
});

describe('sem as variáveis', () => {
  let off: NestFastifyApplication;
  beforeAll(async () => {
    for (const k of Object.keys(VARS)) delete process.env[k];
    off = await createTestApp();
    Object.assign(process.env, VARS);
  });
  afterAll(async () => off.close());

  it('tudo 404 e o perfil sem a seção', async () => {
    const o = api(off);
    const c = await o.signIn('ale@npac.com.br');
    expect((await o.get('/api/me/profile', c)).body.telegram).toBeNull();
    expect((await o.get('/api/me/telegram', c)).status).toBe(404);
    expect((await o.post('/api/me/telegram/code', {}, c)).status).toBe(404);
    expect((await o.post('/api/me/telegram/test', {}, c)).status).toBe(404);
    expect((await o.del('/api/me/telegram', {}, c)).status).toBe(404);
    const r = await request(off.getHttpServer())
      .post(ROUTE)
      .set('x-telegram-bot-api-secret-token', VARS.TELEGRAM_WEBHOOK_SECRET)
      .send({ message: { chat: { id: 1, type: 'private' }, text: '/start' } });
    expect(r.status).toBe(404);
  });
});
