import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

/**
 * NPAC-67 (Igor, 23/11/2026): concluir a tarefa pede o que aconteceu (vira nota) e o próximo passo
 * (Agendou reunião, Novo follow-up ou Ligar para a pessoa), tudo numa transação.
 */
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ale: string, murilo: string, sonia: string;
let lead: string;
let users: Record<string, string>;
const ids = (name: string) => users[name]!;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const rows = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  users = Object.fromEntries(rows.map((u) => [u.email.split('@')[0], u.id]));
});
afterAll(async () => closeTestApp(app));
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, sdr_sale_marks, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  lead = (
    await h.post(
      '/api/leads',
      { name: 'Tarefa Ale', instagram: '@tarefa.ale', incomeBand: 'R5_8K', source: 'BIO' },
      ale,
    )
  ).body.id;
});

/** Tarefa vencida do lead, como no Atrasados do Hoje. */
async function overdueTask(leadId = lead, cookie = ale) {
  const res = await h.post(
    `/api/leads/${leadId}/tasks`,
    { title: 'Acompanhar', dueAt: new Date(Date.now() - 3_600_000).toISOString() },
    cookie,
  );
  expect(res.status).toBe(201);
  return res.body as { id: string; version: number };
}
const complete = (taskId: string, body: object, cookie = ale, leadId = lead) =>
  h.post(`/api/leads/${leadId}/tasks/${taskId}/complete`, body, cookie);
const kinds = async (leadId = lead) =>
  (
    await owner<{ kind: string; fields: string[] }[]>`
      select kind, fields from lead_timeline where lead_id = ${leadId}`
  )
    .map((t) => `${t.kind}:${t.fields.join(',')}`)
    .sort();
const stageOf = async (leadId = lead) =>
  (
    await owner<{ key: string }[]>`
      select s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.id = ${leadId}`
  )[0]!.key;
const setStage = (key: string, leadId = lead) =>
  owner`update leads set stage_id = (select id from pipeline_stages where key = ${key}) where id = ${leadId}`;

describe('concluir tarefa com o próximo passo', () => {
  it.each(['FOLLOW_UP', 'CALL'] as const)(
    '%s: conclui, grava a nota e vira o próximo contato do lead',
    async (next) => {
      const task = await overdueTask();
      const at = inDays(2);
      const res = await complete(task.id, {
        version: task.version,
        note: 'Pediu para falar depois do almoço',
        next,
        at,
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: task.id, version: task.version + 1 });
      const [t] = await owner<{ completed_at: Date | null }[]>`
        select completed_at from lead_tasks where id = ${task.id}`;
      expect(t!.completed_at).not.toBeNull();
      const [l] = await owner<{ next_contact_at: Date }[]>`
        select next_contact_at from leads where id = ${lead}`;
      expect(l!.next_contact_at.toISOString()).toBe(at);
      const notes = await owner<
        { body: string }[]
      >`select body from lead_notes where lead_id = ${lead}`;
      expect(notes.map((n) => n.body)).toEqual(['Pediu para falar depois do almoço']);
      // Timeline só com tipos e nomes de campos (nunca o texto da nota).
      expect(await kinds()).toEqual(
        [
          'lead.created:',
          'task.created:',
          'task.updated:completedAt',
          'note.created:',
          'lead.contact_rescheduled:nextContactAt',
        ].sort(),
      );
      const timeline = await owner`select * from lead_timeline where lead_id = ${lead}`;
      expect(JSON.stringify(timeline)).not.toContain('almoço');
      // Some do Atrasados do Hoje.
      const today = await h.post('/api/today/search', {}, ale);
      expect(today.body.overdueTasks).toEqual([]);
      expect(await stageOf()).toBe('SONDAGEM');
    },
  );

  it('Agendou reunião: cria a reunião e leva o lead de Criando Relacionamento para Agendado', async () => {
    const task = await overdueTask();
    const at = inDays(3);
    const res = await complete(task.id, {
      version: task.version,
      note: 'Topou conversar com o closer',
      next: 'MEETING',
      at,
      closerId: ids('sonia'),
    });
    expect(res.status).toBe(200);
    const meetings = await owner<{ closer_id: string; scheduled_at: Date; origin: string }[]>`
      select closer_id, scheduled_at, origin from meetings where lead_id = ${lead}`;
    expect(meetings).toHaveLength(1);
    expect(meetings[0]!.closer_id).toBe(ids('sonia'));
    expect(meetings[0]!.scheduled_at.toISOString()).toBe(at);
    expect(meetings[0]!.origin).toBe('DIRETO');
    expect(await stageOf()).toBe('AGENDADO_DIRETO');
    expect(await kinds()).toEqual(
      [
        'lead.created:',
        'task.created:',
        'task.updated:completedAt',
        'note.created:',
        'lead.moved:stageKey',
        'meeting.scheduled:',
      ].sort(),
    );
  });

  it('Agendou reunião de lead em follow-up vai para Agendado follow-up', async () => {
    await setStage('EM_FOLLOW');
    const task = await overdueTask();
    const res = await complete(task.id, {
      version: task.version,
      note: 'Voltou a responder',
      next: 'MEETING',
      at: inDays(1),
      closerId: ids('sonia'),
    });
    expect(res.status).toBe(200);
    expect(await stageOf()).toBe('AGENDADO_FOLLOW');
    const [m] = await owner<
      { origin: string }[]
    >`select origin from meetings where lead_id = ${lead}`;
    expect(m!.origin).toBe('FOLLOW');
  });

  it('versão antiga da tarefa dá 409 e não grava nada', async () => {
    const task = await overdueTask();
    await h.patch(
      `/api/leads/${lead}/tasks/${task.id}`,
      { version: task.version, title: 'Ligar' },
      ale,
    );
    const before = await kinds();
    const res = await complete(task.id, {
      version: task.version,
      note: 'Não deve gravar',
      next: 'FOLLOW_UP',
      at: inDays(1),
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VERSION_CONFLICT');
    expect(await kinds()).toEqual(before);
    expect(await owner`select 1 from lead_notes where lead_id = ${lead}`).toHaveLength(0);
    const [t] = await owner<{ completed_at: Date | null }[]>`
      select completed_at from lead_tasks where id = ${task.id}`;
    expect(t!.completed_at).toBeNull();
  });

  it('tarefa já concluída dá 409', async () => {
    const task = await overdueTask();
    const body = { note: 'Ok', next: 'CALL', at: inDays(1) };
    expect((await complete(task.id, { version: task.version, ...body })).status).toBe(200);
    const again = await complete(task.id, { version: task.version + 1, ...body });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('TASK_DONE');
  });

  it('pede o que aconteceu, data futura e o closer da reunião', async () => {
    const task = await overdueTask();
    const base = { version: task.version, note: 'Algo', next: 'FOLLOW_UP', at: inDays(1) };
    expect((await complete(task.id, { ...base, note: '   ' })).status).toBe(400);
    expect((await complete(task.id, { ...base, at: inDays(-1) })).status).toBe(400);
    expect((await complete(task.id, { ...base, next: 'SEM_RESPOSTA' })).status).toBe(400);
    expect((await complete(task.id, { ...base, next: 'MEETING' })).status).toBe(400);
    const sem = await owner<{ completed_at: Date | null }[]>`
      select completed_at from lead_tasks where id = ${task.id}`;
    expect(sem[0]!.completed_at).toBeNull();
  });

  it('closer não usa (403) e lead de outro SDR não existe (404)', async () => {
    const task = await overdueTask();
    const body = { version: task.version, note: 'Ok', next: 'FOLLOW_UP', at: inDays(1) };
    expect((await complete(task.id, body, sonia)).status).toBe(403);
    expect((await complete(task.id, body, murilo)).status).toBe(404);
  });

  it('SDR não muda a data do pagamento combinado (403), mas agenda reunião', async () => {
    await setStage('AGENDOU_PAGAMENTO');
    const task = await overdueTask();
    const body = { version: task.version, note: 'Ok', next: 'FOLLOW_UP', at: inDays(1) };
    expect((await complete(task.id, body)).status).toBe(403);
    const meeting = await complete(task.id, {
      ...body,
      next: 'MEETING',
      closerId: ids('sonia'),
    });
    expect(meeting.status).toBe(200);
    // Fora das etapas antes da reunião, o lead fica onde está.
    expect(await stageOf()).toBe('AGENDOU_PAGAMENTO');
  });
});
