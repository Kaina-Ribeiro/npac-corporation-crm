import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PUSH_SENDER } from '../src/push/push.service.js';
import {
  api,
  closeTestApp,
  createTestApp,
  owner,
  resetAuthState,
  type MemoryPushSender,
} from './helpers.js';

const TOKEN = 'token-de-teste-do-forms-com-mais-de-32-caracteres';
const ROUTE = '/api/webhooks/forms';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let users: Record<string, string>;
let seq = 0;
const id = (name: string) => users[name]!;

const answer = (extra: object = {}) => ({
  responseId: `resp-${++seq}`,
  submittedAt: new Date().toISOString(),
  name: 'Maria Forms',
  phone: '(11) 98888-7766',
  instagram: '@maria.forms',
  email: 'Maria@Forms.com',
  incomeBand: 'R8_15K',
  answers: [{ q: 'Qual seu objetivo?', a: 'Sair das dívidas secretas' }],
  ...extra,
});
const send = (body: object, token: string | null = TOKEN) => {
  const r = request(app.getHttpServer()).post(ROUTE).send(body);
  return token ? r.set('x-forms-token', token) : r;
};
const countLeads = async () =>
  (await owner<{ n: number }[]>`select count(*)::int as n from leads`)[0]!.n;
const notified = async (leadId: string) =>
  (
    await owner<{ user_id: string }[]>`select n.user_id from notifications n
      join lead_timeline t on t.id = n.timeline_id
      where t.lead_id = ${leadId} and t.kind = 'form.received'`
  )
    .map((r) => r.user_id)
    .sort();
const leaders = () => [id('diretor'), id('ana'), id('ronaldo')];

beforeAll(async () => {
  process.env.FORMS_WEBHOOK_TOKEN = TOKEN;
  process.env.FORMS_OWNER_USERNAME = 'ale';
  app = await createTestApp();
  h = api(app);
  const rows = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  users = Object.fromEntries(rows.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => {
  delete process.env.FORMS_WEBHOOK_TOKEN;
  delete process.env.FORMS_OWNER_USERNAME;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate push_subscriptions, lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, leads`;
});

describe('acesso à rota', () => {
  it('sem token ou com token errado responde 404', async () => {
    expect((await send(answer(), null)).status).toBe(404);
    expect((await send(answer(), 'token-errado')).status).toBe(404);
    expect(await countLeads()).toBe(0);
  });

  it('sem FORMS_WEBHOOK_TOKEN a integração fica desligada', async () => {
    delete process.env.FORMS_WEBHOOK_TOKEN;
    const off = await createTestApp();
    process.env.FORMS_WEBHOOK_TOKEN = TOKEN;
    const res = await request(off.getHttpServer())
      .post(ROUTE)
      .set('x-forms-token', TOKEN)
      .send(answer());
    await off.close();
    expect(res.status).toBe(404);
  });

  it('corpo inválido responde 400 sem repetir os dados', async () => {
    const res = await send({ ...answer(), campoExtra: 'segredo-do-corpo' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('segredo-do-corpo');
  });

  it('dono mal configurado responde 503 e audita', async () => {
    await owner`update "user" set active = false where id = ${id('ale')}`;
    try {
      expect((await send(answer())).status).toBe(503);
      const [a] = await owner`select 1 from audit_log where action = 'form.owner_invalid'`;
      expect(a).toBeDefined();
    } finally {
      await owner`update "user" set active = true where id = ${id('ale')}`;
    }
  });
});

describe('sem lead correspondente', () => {
  it('acima de 5 mil cria o lead para o dono configurado e avisa dono e liderança', async () => {
    const res = await send(answer());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'created' });
    const [lead] = await owner<
      {
        id: string;
        sdr_id: string;
        source: string;
        tier: string;
        key: string;
        phone_enc: Buffer;
        email_enc: Buffer;
        instagram: string;
        next_contact_at: Date | null;
      }[]
    >`select l.*, s.key from leads l join pipeline_stages s on s.id = l.stage_id`;
    expect(lead).toMatchObject({
      sdr_id: id('ale'),
      source: 'FORMULARIO',
      tier: 'P1',
      key: 'SONDAGEM',
      instagram: 'maria.forms',
      next_contact_at: null,
    });
    expect(lead!.phone_enc.toString('latin1')).not.toContain('98888');
    expect(lead!.email_enc.toString('latin1')).not.toContain('maria');
    expect(await notified(lead!.id)).toEqual([id('ale'), ...leaders()].sort());
  });

  it.each([
    ['BELOW_5K', {}, 'LOW_INCOME'],
    ['UNKNOWN', {}, 'UNKNOWN_INCOME'],
    ['R8_15K', { phone: undefined, instagram: undefined }, 'NO_CONTACT'],
  ])('descarta %s sem guardar a resposta', async (incomeBand, extra, reason) => {
    const res = await send(answer({ incomeBand, ...extra }));
    expect(res.body).toEqual({ status: 'discarded' });
    expect(await countLeads()).toBe(0);
    expect(await owner`select 1 from form_responses`).toHaveLength(0);
    const rows = await owner<
      { data: { reason: string } }[]
    >`select data from audit_log where action = 'form.discarded'`;
    expect(rows.map((r) => r.data)).toEqual([{ reason }]);
  });
});

describe('com lead correspondente', () => {
  let murilo: string;
  let leadId: string;
  beforeEach(async () => {
    murilo = await h.signIn('murilo@npac.com.br');
    leadId = (
      await h.post(
        '/api/leads',
        {
          name: 'Lead Existente',
          phone: '(11) 97777-6655',
          instagram: '@lead.existente',
          email: 'lead@existente.com',
          incomeBand: 'R5_8K',
          source: 'BIO',
        },
        murilo,
      )
    ).body.id;
  });

  it.each([
    ['telefone', { phone: '11977776655', instagram: '@outro', email: 'outro@x.com' }],
    ['Instagram', { phone: undefined, instagram: 'lead.existente', email: 'outro@x.com' }],
    ['e-mail', { phone: undefined, instagram: undefined, email: 'LEAD@existente.com' }],
  ])('vincula por %s, mantém o dono e não altera o lead', async (_, extra) => {
    const before = await owner`select * from leads where id = ${leadId}`;
    const res = await send(answer({ incomeBand: 'BELOW_5K', ...extra }));
    expect(res.body).toEqual({ status: 'linked' });
    expect(await countLeads()).toBe(1);
    expect(await owner`select * from leads where id = ${leadId}`).toEqual(before);
    expect(await notified(leadId)).toEqual([id('murilo'), ...leaders()].sort());
  });

  it('e-mail malformado não serve de contato', async () => {
    const res = await send(
      answer({ phone: undefined, instagram: undefined, email: 'lead@existente' }),
    );
    expect(res.body).toEqual({ status: 'discarded' });
  });

  it('reenvio da mesma resposta não duplica', async () => {
    const body = answer({ phone: '11977776655' });
    expect((await send(body)).body).toEqual({ status: 'linked' });
    expect((await send(body)).body).toEqual({ status: 'duplicate' });
    expect(await owner`select 1 from form_responses`).toHaveLength(1);
    expect(await notified(leadId)).toHaveLength(4);
  });

  it('respostas ficam cifradas e só aparecem para quem enxerga o lead', async () => {
    await send(answer({ phone: '11977776655' }));
    const [row] = await owner<{ answers_enc: Buffer }[]>`select answers_enc from form_responses`;
    expect(row!.answers_enc.toString('latin1')).not.toContain('dívidas');

    const mine = await h.get(`/api/leads/${leadId}/form-responses`, murilo);
    expect(mine.status).toBe(200);
    expect(mine.body[0].answers).toEqual([
      { q: 'Qual seu objetivo?', a: 'Sair das dívidas secretas' },
    ]);
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get(`/api/leads/${leadId}/form-responses`, ale)).status).toBe(404);
  });

  it('Hoje lista só nome e horário e sai ao marcar como lido', async () => {
    await send(answer({ phone: '11977776655' }));
    const today = await h.post('/api/today/search', {}, murilo);
    expect(today.body.formsNew).toHaveLength(1);
    const item = today.body.formsNew[0];
    expect(Object.keys(item).sort()).toEqual(['at', 'id', 'leadId', 'name']);
    expect(item).toMatchObject({ leadId, name: 'Lead Existente' });
    await h.post('/api/notifications/read', { ids: [item.id] }, murilo);
    expect((await h.post('/api/today/search', {}, murilo)).body.formsNew).toEqual([]);
  });

  it('auditoria e timeline não guardam dados pessoais', async () => {
    await send(answer({ phone: '11977776655' }));
    const text = JSON.stringify([
      ...(await owner`select * from audit_log where action like 'form.%'`),
      ...(await owner`select * from lead_timeline where kind = 'form.received'`),
    ]);
    expect(text).not.toContain('Maria');
    expect(text).not.toContain('dívidas');
    expect(text).not.toContain('977776655');
  });

  it('LGPD apaga as respostas e o export as inclui antes disso', async () => {
    await send(answer({ phone: '11977776655' }));
    await owner`select lgpd_anonymize(${leadId}::uuid, ${id('diretor')}, 'teste')`;
    const [row] = await owner<
      { answers_enc: Buffer | null }[]
    >`select answers_enc from form_responses`;
    expect(row!.answers_enc).toBeNull();
  });

  it('push avisa sem nome nem contato', async () => {
    const sender = app.get<MemoryPushSender>(PUSH_SENDER);
    sender.sent = [];
    await h.post(
      '/api/push/subscriptions',
      { endpoint: 'https://push.test/murilo', keys: { p256dh: 'p', auth: 'a' } },
      murilo,
    );
    await send(answer({ phone: '11977776655' }));
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.payload.title).toBe('Novo formulário preenchido');
    expect(JSON.stringify(sender.sent[0]!.payload)).not.toContain('Lead Existente');
  });
});
