import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { spDayRange } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ale: string, murilo: string;
let a: string, m: string;
let users: Record<string, string>;
const ids = (name: string) => users[name]!;
beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const rows = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  users = Object.fromEntries(rows.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  a = (
    await h.post(
      '/api/leads',
      { name: 'Hoje Ale', instagram: '@hoje.ale', incomeBand: 'R5_8K', tier: 'P1' },
      ale,
    )
  ).body.id;
  m = (
    await h.post(
      '/api/leads',
      { name: 'Hoje Murilo', instagram: '@hoje.murilo', incomeBand: 'R5_8K', tier: 'P1' },
      murilo,
    )
  ).body.id;
});
it('Hoje usa o dia BRT e só retorna dados do escopo', async () => {
  const { start, end } = spDayRange(new Date());
  await owner`update leads set next_contact_at = ${new Date(start.getTime() - 1000)} where id = ${a}`;
  await owner`update leads set next_contact_at = ${new Date(end.getTime() - 1000)} where id = ${m}`;
  let res = await h.post('/api/today/search', {}, ale);
  expect(res.status).toBe(200);
  expect(res.body.overdue.map((l: { id: string }) => l.id)).toEqual([a]);
  expect(JSON.stringify(res.body)).not.toContain('Hoje Murilo');
  res = await h.post('/api/today/search', {}, murilo);
  expect(res.body.contacts.map((l: { id: string }) => l.id)).toEqual([m]);
  await owner`update leads set next_contact_at = ${end} where id = ${m}`;
  expect((await h.post('/api/today/search', {}, murilo)).body.contacts).toEqual([]);
  expect((await h.post('/api/today/search', { sdrId: 'alguem' }, ale)).status).toBe(403);
});
it('contato de hoje que já passou da hora está em atrasados', async () => {
  const now = Date.now();
  const { end } = spDayRange(new Date());
  await owner`update leads set next_contact_at = ${new Date(now - 5 * 60_000)} where id = ${a}`;
  const res = await h.post('/api/today/search', {}, ale);
  expect(res.body.overdue.map((l: { id: string }) => l.id)).toEqual([a]);
  expect(res.body.contacts).toEqual([]);
  if (now + 5 * 60_000 < end.getTime()) {
    await owner`update leads set next_contact_at = ${new Date(now + 5 * 60_000)} where id = ${a}`;
    const later = await h.post('/api/today/search', {}, ale);
    expect(later.body.contacts.map((l: { id: string }) => l.id)).toEqual([a]);
    expect(later.body.overdue).toEqual([]);
  }
});
it('tarefas concluídas saem da aba Hoje', async () => {
  const task = await h.post(
    `/api/leads/${a}/tasks`,
    { title: 'Retorno hoje', dueAt: new Date().toISOString() },
    ale,
  );
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(1);
  await h.patch(`/api/leads/${a}/tasks/${task.body.id}`, { version: 1, completed: true }, ale);
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(0);
});

it('tarefas avulsas são pessoais e podem ser concluídas sem lead', async () => {
  const res = await h.post('/api/tasks', { title: 'Preparar roteiro' }, ale);
  expect(res.status).toBe(201);
  const mine = await h.post('/api/today/search', {}, ale);
  expect(mine.body.tasks).toHaveLength(1);
  expect(mine.body.tasks[0].leadId).toBeNull();
  expect((await h.post('/api/today/search', {}, murilo)).body.tasks).toHaveLength(0);
  expect(
    (await h.patch(`/api/tasks/${res.body.id}`, { version: 1, completed: true }, murilo)).status,
  ).toBe(404);
  expect(
    (await h.patch(`/api/tasks/${res.body.id}`, { version: 1, completed: true }, ale)).status,
  ).toBe(200);
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(0);
});
it('tarefa que a liderança cria na ficha vai para o SDR do lead e aparece no Hoje dele', async () => {
  const head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const task = await h.post(`/api/leads/${a}/tasks`, { title: 'Cobrar retorno' }, head);
  expect(task.status).toBe(201);
  expect(task.body.assigneeId).toBe(ids('ale'));
  expect(
    (await h.post('/api/today/search', {}, ale)).body.tasks.map((t: { id: string }) => t.id),
  ).toEqual([task.body.id]);
  expect((await h.post('/api/today/search', {}, murilo)).body.tasks).toHaveLength(0);
  // A liderança pode ficar com a tarefa; fora do SDR do lead ou de si mesma, não.
  const mine = await h.post(
    `/api/leads/${a}/tasks`,
    { title: 'Revisar proposta', assigneeId: ids('ronaldo') },
    head,
  );
  expect(mine.status).toBe(201);
  expect((await h.post('/api/today/search', {}, ale)).body.tasks).toHaveLength(1);
  const other = await h.post(
    `/api/leads/${a}/tasks`,
    { title: 'Errado', assigneeId: ids('murilo') },
    head,
  );
  expect(other.status).toBe(400);
  // O SDR continua criando para si mesmo e não escolhe outra pessoa.
  expect(
    (await h.post(`/api/leads/${a}/tasks`, { title: 'Minha', assigneeId: ids('murilo') }, ale))
      .status,
  ).toBe(400);
});
it('Hoje da liderança mostra as próprias tarefas pessoais, não as de todo mundo', async () => {
  const head = await h.signIn('ronaldo@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
  const personal = await h.post('/api/tasks', { title: 'Treinar pitch' }, ale);
  const own = await h.post('/api/tasks', { title: 'Revisar metas' }, head);
  const onLead = await h.post(`/api/leads/${a}/tasks`, { title: 'Ligar' }, ale);
  const titles = (res: { body: { tasks: { id: string }[] } }) => res.body.tasks.map((t) => t.id);
  // Sem filtro: tarefas dos leads (de todos) + só as pessoais da própria liderança.
  expect(titles(await h.post('/api/today/search', {}, head)).sort()).toEqual(
    [own.body.id, onLead.body.id].sort(),
  );
  // Olhando o dia de um SDR, as tarefas pessoais dele aparecem.
  expect(titles(await h.post('/api/today/search', { sdrId: ids('ale') }, head)).sort()).toEqual(
    [personal.body.id, onLead.body.id].sort(),
  );
});

describe('ação rápida no Hoje', () => {
  const quick = (id: string, body: object, cookie = ale) =>
    h.post(`/api/leads/${id}/quick-action`, body, cookie);
  const version = async (id: string) =>
    (await owner<{ version: number }[]>`select version from leads where id = ${id}`)[0]!.version;
  beforeEach(async () => {
    await owner`update leads set next_contact_at = now() - interval '1 hour' where id = ${a}`;
  });

  it('chamado tira o lead da lista e registra na timeline', async () => {
    const res = await quick(a, { version: await version(a), action: 'CALLED' });
    expect(res.status).toBe(201);
    const [row] = await owner<{ next_contact_at: Date | null }[]>`
      select next_contact_at from leads where id = ${a}`;
    expect(row!.next_contact_at).toBeNull();
    const t =
      await owner`select kind from lead_timeline where lead_id = ${a} and kind = 'lead.called'`;
    expect(t).toHaveLength(1);
    const today = await h.post('/api/today/search', {}, ale);
    expect(today.body.overdue).toEqual([]);
  });

  it('remarcado muda o próximo contato', async () => {
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const res = await quick(a, { version: await version(a), action: 'RESCHEDULED', at });
    expect(res.status).toBe(201);
    const [row] = await owner<{ next_contact_at: Date }[]>`
      select next_contact_at from leads where id = ${a}`;
    expect(row!.next_contact_at.toISOString()).toBe(at);
    const [t] = await owner<{ fields: string[] }[]>`
      select fields from lead_timeline where lead_id = ${a} and kind = 'lead.contact_rescheduled'`;
    expect(t!.fields).toEqual(['nextContactAt']);
  });

  it('próxima ação vira tarefa e tira o lead da lista de contatos', async () => {
    // Ainda hoje em Brasília: depois das 23h, "daqui a 1 hora" já cairia amanhã e sairia do Hoje.
    const now = Date.now();
    const fim = spDayRange(new Date(now)).end.getTime();
    const at = new Date(now + Math.min(3600_000, (fim - now) / 2)).toISOString();
    const res = await quick(a, {
      version: await version(a),
      action: 'NEXT_ACTION',
      at,
      title: 'Mandar proposta',
    });
    expect(res.status).toBe(201);
    const today = await h.post('/api/today/search', {}, ale);
    expect(today.body.overdue).toEqual([]);
    expect(today.body.tasks.map((t: { title: string }) => t.title)).toContain('Mandar proposta');
    const kinds = await owner<
      { kind: string }[]
    >`select kind from lead_timeline where lead_id = ${a}`;
    expect(kinds.map((k) => k.kind)).toContain('task.created');
  });

  it('valida data, título, versão e escopo', async () => {
    const v = await version(a);
    const noDate = await quick(a, { version: v, action: 'RESCHEDULED' });
    expect(noDate.status).toBe(400);
    expect(noDate.body.message).toBe('Informe a data');
    const noTitle = await quick(a, {
      version: v,
      action: 'NEXT_ACTION',
      at: new Date().toISOString(),
    });
    expect(noTitle.status).toBe(400);
    expect(noTitle.body.message).toBe('Informe a próxima ação');
    const stale = await quick(a, { version: v - 1 || 99, action: 'CALLED' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(await version(a)).toBe(v);
    expect((await quick(m, { version: 1, action: 'CALLED' })).status).toBe(404);
  });
});
