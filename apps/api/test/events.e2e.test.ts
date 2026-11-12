import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { RevisionService } from '../src/events/revision.service.js';
import {
  api,
  closeTestApp,
  createTestApp,
  deactivate,
  owner,
  resetAuthState,
  type Cookie,
} from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => closeTestApp(app));

/** Revisão do canal ao vivo que o render recebe (`/api/me`). */
async function renderedRevision(cookie: Cookie): Promise<string> {
  const me = await h.get('/api/me', cookie);
  expect(me.body.revision).toMatch(/^\d+$/);
  return me.body.revision as string;
}

/** Abre `/api/events` e lê os sinais um a um (cada `data:` só pode ter `type`). */
async function openStream(cookie: Cookie, abort: AbortController, rev?: string) {
  const query = rev === undefined ? '' : `?rev=${rev}`;
  const res = await fetch(`${await app.getUrl()}/api/events${query}`, {
    headers: { cookie },
    signal: abort.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toContain('no-store');
  const reader = res.body!.getReader();
  let buffer = '';
  return {
    reader,
    async next(): Promise<string> {
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
    },
  };
}

it('stream não expõe PII, detecta mudanças e encerra usuário desativado', async () => {
  await resetAuthState();
  const cookie = await h.signIn('ale@npac.com.br');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25_000);
  try {
    const s = await openStream(cookie, abort, await renderedRevision(cookie));
    expect(await s.next()).toBe('ready');
    await h.post(
      '/api/leads',
      {
        name: 'Sinal privado',
        instagram: '@evento.privado',
        incomeBand: 'R5_8K',
        source: 'BIO',
        tier: 'P1',
      },
      cookie,
    );
    expect(await s.next()).toBe('invalidate');
    const murilo = await h.signIn('murilo@npac.com.br');
    const channels = await h.get('/api/chat/channels', murilo);
    const general = channels.body.find((c: { kind: string }) => c.kind === 'GENERAL');
    await h.post(`/api/chat/channels/${general.id}/messages`, { body: 'mensagem nova' }, murilo);
    expect(await s.next()).toBe('invalidate');
    // A sessão é conferida a cada 10 s: o usuário desativado sai em até 10 s.
    await deactivate('ale@npac.com.br');
    const t0 = Date.now();
    let type = await s.next();
    while (type === 'invalidate') type = await s.next();
    expect(type).toBe('session-ended');
    expect(Date.now() - t0).toBeLessThanOrEqual(10_500);
    await s.reader.cancel();
    expect((await h.get('/api/events', cookie)).status).toBe(401);
  } finally {
    abort.abort();
    clearTimeout(timeout);
  }
});

it('uma escrita avisa cada conexão uma vez; o contador é lido uma vez a cada 2 s no processo', async () => {
  await resetAuthState();
  const ale = await h.signIn('ale@npac.com.br');
  const igor = await h.signIn('igor@npac.com.br');
  const lead = await h.post(
    '/api/leads',
    { name: 'Sinal contador', instagram: '@evento.contador', incomeBand: 'R5_8K', source: 'BIO' },
    ale,
  );
  expect(lead.status).toBe(201);
  // O Chat aberto grava "lido até" a cada recarga, com o mesmo valor: isso não pode virar aviso.
  const channels = await h.get('/api/chat/channels', ale);
  const general = channels.body.find((c: { kind: string }) => c.kind === 'GENERAL');
  const sent = await h.post(`/api/chat/channels/${general.id}/messages`, { body: 'oi' }, igor);
  expect(sent.status).toBe(201);
  const readUpTo = () =>
    h.post(`/api/chat/channels/${general.id}/read`, { lastReadId: sent.body.id }, ale);
  expect((await readUpTo()).status).toBeLessThan(300);
  const revision = app.get(RevisionService);
  const reads = vi.spyOn(revision, 'read');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 25_000);
  try {
    // Três abas (duas pessoas): o contador é um só, não uma consulta por aba.
    const rev = await renderedRevision(ale);
    const a = await openStream(ale, abort, rev);
    const b = await openStream(igor, abort, rev);
    const c = await openStream(ale, abort, rev);
    expect(await a.next()).toBe('ready');
    expect(await b.next()).toBe('ready');
    expect(await c.next()).toBe('ready');
    await vi.waitFor(() => expect(reads).toHaveBeenCalled());
    reads.mockClear();
    const t0 = Date.now();
    // Uma transação (de outra pessoa, num lead que o Igor não vê): todas as abas são avisadas.
    await owner`update leads set name = 'Sinal contador 2' where id = ${lead.body.id}`;
    expect(await a.next()).toBe('invalidate');
    expect(await b.next()).toBe('invalidate');
    expect(await c.next()).toBe('invalidate');
    expect((await readUpTo()).status).toBeLessThan(300);
    // Sem outra escrita, o próximo sinal é o heartbeat da checagem de sessão (aos 10 s): o aviso
    // saiu uma vez só.
    expect(await a.next()).toBe('heartbeat');
    const elapsed = Date.now() - t0;
    expect(reads.mock.calls.length).toBeLessThanOrEqual(Math.ceil(elapsed / 2000) + 1);
    expect(reads.mock.calls.length).toBeGreaterThanOrEqual(3);
  } finally {
    abort.abort();
    clearTimeout(timeout);
    reads.mockRestore();
  }
});

it('ao abrir, só avisa se algo mudou desde o render (revisão velha ou ausente = invalidate)', async () => {
  await resetAuthState();
  const ale = await h.signIn('ale@npac.com.br');
  const rev = await renderedRevision(ale);
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15_000);
  try {
    // Em dia: `ready`, que a aba não trata como recarga (a tela não carrega duas vezes).
    expect(await (await openStream(ale, abort, rev)).next()).toBe('ready');
    // Uma escrita entre o render e a conexão: a aba recarrega ao conectar.
    const novo = await h.post(
      '/api/leads',
      { name: 'Sinal render', instagram: '@evento.render', incomeBand: 'R5_8K', source: 'BIO' },
      ale,
    );
    expect(novo.status).toBe(201);
    expect(await (await openStream(ale, abort, rev)).next()).toBe('invalidate');
    // Cliente antigo (sem revisão) ou valor inválido: recarrega, como antes.
    expect(await (await openStream(ale, abort)).next()).toBe('invalidate');
    expect(await (await openStream(ale, abort, 'abc')).next()).toBe('invalidate');
    expect(await (await openStream(ale, abort, await renderedRevision(ale))).next()).toBe('ready');
  } finally {
    abort.abort();
    clearTimeout(timeout);
  }
});
