import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUSH_SENDER, PushService } from '../src/push/push.service.js';
import {
  api,
  closeTestApp,
  createTestApp,
  type MemoryPushSender,
  owner,
  resetAuthState,
} from './helpers.js';

/**
 * Envio do push (NPAC-71, Igor 24/11/2026: avisos com atraso). Uma pessoa com vários aparelhos
 * recebia um por vez, com a transação do banco aberta enquanto a API falava com a Apple/Google.
 */
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let push: MemoryPushSender;
let service: PushService;
let enviar: MemoryPushSender['send'];
let aleId: string;
let ale: string;

const PAYLOAD = { title: 'Teste', url: '/hoje', tag: 'teste' };
const device = (nome: string) => `https://push.test/${nome}`;

async function subscribe(nome: string) {
  const res = await h.post(
    '/api/push/subscriptions',
    { endpoint: device(nome), keys: { p256dh: `p-${nome}`, auth: `a-${nome}` } },
    ale,
  );
  expect(res.status).toBe(200);
}
const inscritos = async () =>
  (
    await owner<{ endpoint: string }[]>`select endpoint from push_subscriptions order by endpoint`
  ).map((r) => r.endpoint);

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  push = app.get(PUSH_SENDER);
  service = app.get(PushService);
  enviar = push.send.bind(push);
  const [u] = await owner<{ id: string }[]>`select id from "user" where username = 'ale'`;
  aleId = u!.id;
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate push_subscriptions`;
  ale = await h.signIn('ale@npac.com.br');
  push.sent = [];
  push.gone.clear();
});
afterEach(() => {
  push.send = enviar;
});

describe('aparelho inscrito × o que o servidor conhece', () => {
  const conferir = (cookie: string, nome: string) =>
    h.post('/api/push/subscriptions/check', { endpoint: device(nome) }, cookie);

  it('responde se a inscrição deste aparelho é da pessoa; a de outra pessoa não conta', async () => {
    await subscribe('a');
    const meu = await conferir(ale, 'a');
    expect(meu.status).toBe(200);
    expect(meu.body).toEqual({ known: true });
    expect((await conferir(ale, 'nunca-ativado')).body).toEqual({ known: false });
    const murilo = await h.signIn('murilo@npac.com.br');
    expect((await conferir(murilo, 'a')).body).toEqual({ known: false });
  });

  it('depois de apagada no servidor, o aparelho deixa de constar e pode ativar de novo', async () => {
    await subscribe('a');
    await owner`delete from push_subscriptions`;
    expect((await conferir(ale, 'a')).body).toEqual({ known: false });
    await subscribe('a');
    expect((await conferir(ale, 'a')).body).toEqual({ known: true });
  });
});

describe('envio do push', () => {
  it('os aparelhos da pessoa recebem ao mesmo tempo, sem transação aberta no banco', async () => {
    for (const nome of ['a', 'b', 'c']) await subscribe(nome);
    let iniciados = 0;
    let soltar!: () => void;
    const preso = new Promise<void>((r) => (soltar = r));
    // Nenhum envio termina antes de `soltar`: em fila, só o primeiro chegaria a começar.
    push.send = async (alvo, payload) => {
      iniciados += 1;
      await preso;
      return enviar(alvo, payload);
    };
    const envio = service.notify([aleId], PAYLOAD);
    try {
      await vi.waitFor(() => expect(iniciados).toBe(3), { timeout: 3000 });
      const [parada] = await owner<{ n: number }[]>`
        select count(*)::int as n from pg_stat_activity
        where datname = current_database() and usename = 'npac_app' and state = 'idle in transaction'`;
      expect(parada!.n).toBe(0);
    } finally {
      soltar();
      await envio;
    }
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual(['a', 'b', 'c'].map(device));
  });

  it('inscrição expirada sai; as outras ficam e recebem', async () => {
    for (const nome of ['a', 'b']) await subscribe(nome);
    push.gone.add(device('a'));
    await service.notify([aleId], PAYLOAD);
    expect(push.sent.map((s) => s.endpoint)).toEqual([device('b')]);
    expect(await inscritos()).toEqual([device('b')]);
  });

  it('falha num aparelho não tira o aviso dos outros', async () => {
    for (const nome of ['a', 'b']) await subscribe(nome);
    push.send = (alvo, payload) =>
      alvo.endpoint === device('a') ? Promise.reject(new Error('rede')) : enviar(alvo, payload);
    await service.notify([aleId], PAYLOAD);
    expect(push.sent.map((s) => s.endpoint)).toEqual([device('b')]);
    expect(await inscritos()).toEqual([device('a'), device('b')]);
  });
});
