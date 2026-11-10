import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// "Descobrindo renda" (Igor, 10/11/2026): o lead fica só em Criando Relacionamento e só vai para a
// reunião quando a renda é descoberta. Trocar a faixa libera a etapa (409 INCOME_REQUIRED antes).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ale' | 'ronaldo' | 'sonia';
let ids: Record<Who, string>;
let ale: Cookie, ronaldo: Cookie;
let productId: string;

let seq = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Renda',
  instagram: `@maria.renda.${++seq}`,
  incomeBand: 'DESCOBRINDO',
  source: 'BIO',
  ...over,
});
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const meeting = () => ({ scheduledAt: inDays(3), closerId: ids.sonia });

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id])) as Record<Who, string>;
  const [p] = await owner<{ id: string }[]>`select id from products where code = 'RDV'`;
  productId = p!.id;
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
});

async function create(body: object, cookie: Cookie = ale): Promise<string> {
  const res = await h.post('/api/leads', body, cookie);
  if (res.status !== 201) throw new Error(`criação falhou (${res.status}): ${res.text}`);
  return res.body.id;
}
const get = async (id: string) => (await h.get(`/api/leads/${id}`, ale)).body;
const incomeRequired = (res: { status: number; body: { code?: string; message?: string } }) => {
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('INCOME_REQUIRED');
  expect(res.body.message).toMatch(/faixa de renda/);
};

describe('Descobrindo renda fica só em Criando Relacionamento', () => {
  it('cadastro em outra etapa → 409; em Criando Relacionamento passa', async () => {
    incomeRequired(await h.post('/api/leads', lead({ stageKey: 'EM_FOLLOW' }), ale));
    incomeRequired(
      await h.post('/api/leads', lead({ stageKey: 'AGENDADO_DIRETO', meeting: meeting() }), ale),
    );
    expect(await owner`select id from leads`).toHaveLength(0);
    const id = await create(lead({ stageKey: 'SONDAGEM' }));
    expect(await get(id)).toMatchObject({ stageKey: 'SONDAGEM', tier: 'DESCOBRINDO' });
  });

  it('mover a etapa → 409 até trocar a faixa; trocar as duas juntas passa', async () => {
    const id = await create(lead({ stageKey: 'SONDAGEM' }));
    incomeRequired(await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'EM_FOLLOW' }, ale));
    incomeRequired(
      await h.patch(
        `/api/leads/${id}`,
        { version: 1, stageKey: 'PERDIDO', lostReason: 'SEM_RENDA' },
        ale,
      ),
    );
    const ok = await h.patch(
      `/api/leads/${id}`,
      { version: 1, incomeBand: 'R8_15K', stageKey: 'EM_FOLLOW' },
      ale,
    );
    expect(ok.status).toBe(200);
    expect(await get(id)).toMatchObject({ stageKey: 'EM_FOLLOW', tier: 'P1' });
  });

  it('voltar a faixa para Descobrindo renda fora de Criando Relacionamento → 409', async () => {
    const id = await create(lead({ incomeBand: 'R5_8K', stageKey: 'EM_FOLLOW' }));
    incomeRequired(
      await h.patch(`/api/leads/${id}`, { version: 1, incomeBand: 'DESCOBRINDO' }, ale),
    );
    const ok = await h.patch(
      `/api/leads/${id}`,
      { version: 1, incomeBand: 'DESCOBRINDO', stageKey: 'SONDAGEM' },
      ale,
    );
    expect(ok.status).toBe(200);
  });

  it('agendar reunião → 409; registrar venda → 409', async () => {
    const id = await create(lead({ stageKey: 'SONDAGEM' }));
    incomeRequired(
      await h.post('/api/meetings', { leadId: id, origin: 'DIRETO', ...meeting() }, ale),
    );
    expect(await owner`select id from meetings`).toHaveLength(0);
    const [p] = await owner<{ closer_id: string }[]>`
      select closer_id from products where id = ${productId}`;
    incomeRequired(
      await h.post(
        '/api/finance/deals',
        {
          leadId: id,
          productId,
          closerId: p!.closer_id,
          version: 1,
          totalCents: 300000,
          method: 'PIX',
          entryCents: 0,
          installments: [],
          requestKey: randomUUID(),
        },
        ronaldo,
      ),
    );
    expect(await get(id)).toMatchObject({ stageKey: 'SONDAGEM' });
  });
});
