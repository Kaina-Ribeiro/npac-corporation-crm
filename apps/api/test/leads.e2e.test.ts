import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
type Who = 'ana' | 'ronaldo' | 'ale' | 'murilo' | 'igor' | 'sonia';
let ids: Record<Who, string>;
let ale: Cookie;
let murilo: Cookie;
let sonia: Cookie;
let ronaldo: Cookie;

let seq = 0;
const lead = (over: Record<string, unknown> = {}) => ({
  name: 'Maria Silva',
  instagram: `@maria.${++seq}`,
  incomeBand: 'R8_15K',
  source: 'BIO',
  ...over,
});

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const rows = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(rows.map((r) => [r.email.split('@')[0], r.id])) as Record<Who, string>;
});
afterAll(async () => closeTestApp(app));

beforeEach(async () => {
  await resetAuthState();
  await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, notifications, lead_timeline, meeting_reminders_sent, meeting_confirmations, meetings, form_responses, leads`;
  ale = await h.signIn('ale@npac.com.br');
  murilo = await h.signIn('murilo@npac.com.br');
  sonia = await h.signIn('sonia@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
  // HEAD só passa do guard com MFA ativo.
  await owner`update "user" set two_factor_enabled = true where email = 'ronaldo@npac.com.br'`;
});

async function create(body: object, cookie: Cookie): Promise<string> {
  const res = await h.post('/api/leads', body, cookie);
  if (res.status !== 201) throw new Error(`criação falhou (${res.status}): ${res.text}`);
  return res.body.id;
}

describe('leads', () => {
  it('pipeline agrupa pelas etapas do banco sem incluir lead de outro SDR', async () => {
    const id = await create(lead({ name: 'Meu pipeline' }), ale);
    await create(lead({ name: 'Pipeline alheio' }), murilo);
    const res = await h.get('/api/leads/pipeline', ale);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.flatMap((c: { items: { id: string }[] }) => c.items.map((l) => l.id))).toEqual([
      id,
    ]);
    expect(JSON.stringify(res.body)).not.toContain('Pipeline alheio');
  });
  it('filtros por origem/data e ordenação são aplicados no servidor', async () => {
    await create(
      lead({ name: 'Zélia', source: 'TIKTOK', nextContactAt: '2030-01-01T23:30:00-03:00' }),
      ale,
    );
    await create(lead({ name: 'Alice', source: 'SALA_SECRETA' }), ale);
    const sorted = await h.post('/api/leads/search', { sort: 'name', direction: 'asc' }, ale);
    expect(sorted.body.items.map((l: { name: string }) => l.name)).toEqual(['Alice', 'Zélia']);
    const range = await h.post(
      '/api/leads/search',
      { source: 'TIKTOK', period: 'RANGE', from: '2030-01-01', to: '2030-01-01' },
      ale,
    );
    expect(range.body.items.map((l: { name: string }) => l.name)).toEqual(['Zélia']);
    const noDate = await h.post('/api/leads/search', { period: 'NO_DATE' }, ale);
    expect(noDate.body.items.map((l: { name: string }) => l.name)).toEqual(['Alice']);
    expect(
      (
        await h.post(
          '/api/leads/search',
          { period: 'RANGE', from: '2030-01-02', to: '2030-01-01' },
          ale,
        )
      ).status,
    ).toBe(400);
  });
  it('ficha guarda notas e tarefas com timeline sem copiar conteúdo', async () => {
    const id = await create(lead(), ale);
    expect(
      (await h.post(`/api/leads/${id}/notes`, { body: 'Retornar depois do almoço' }, murilo))
        .status,
    ).toBe(404);
    const note = await h.post(`/api/leads/${id}/notes`, { body: 'Retornar depois do almoço' }, ale);
    expect(note.status).toBe(201);
    const task = await h.post(
      `/api/leads/${id}/tasks`,
      { title: 'Ligar', dueAt: '2030-01-01T12:00:00-03:00' },
      ale,
    );
    expect(task.status).toBe(201);
    expect(
      (
        await h.patch(
          `/api/leads/${id}/tasks/${task.body.id}`,
          { version: 1, completed: true },
          ale,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await h.patch(
          `/api/leads/${id}/tasks/${task.body.id}`,
          { version: 1, completed: false },
          ale,
        )
      ).status,
    ).toBe(409);
    const activity = await h.get(`/api/leads/${id}/activity`, ale);
    expect(activity.status).toBe(200);
    expect(activity.body.notes[0].body).toBe('Retornar depois do almoço');
    expect(activity.body.tasks[0].completedAt).not.toBeNull();
    expect(JSON.stringify(activity.body.timeline)).not.toContain('Retornar');
    expect((await h.get(`/api/leads/${id}/activity`, murilo)).status).toBe(404);
  });
  it('origem: lista nova no cadastro, "Outro" com texto e antigas só nos leads existentes', async () => {
    expect((await h.post('/api/leads', lead({ source: undefined }), ale)).status).toBe(400);
    expect((await h.post('/api/leads', lead({ source: 'INSTAGRAM' }), ale)).status).toBe(400);
    expect((await h.post('/api/leads', lead({ source: 'OUTRO' }), ale)).status).toBe(400);
    expect(
      (await h.post('/api/leads', lead({ source: 'OUTRO', sourceOther: 'x'.repeat(81) }), ale))
        .status,
    ).toBe(400);
    const outro = await create(lead({ source: 'OUTRO', sourceOther: ' Feira do bairro ' }), ale);
    expect((await h.get(`/api/leads/${outro}`, ale)).body).toMatchObject({
      source: 'OUTRO',
      sourceOther: 'Feira do bairro',
    });
    // Texto mandado com outra origem é descartado.
    const bio = await create(lead({ source: 'BIO', sourceOther: 'ignorado' }), ale);
    expect((await h.get(`/api/leads/${bio}`, ale)).body.sourceOther).toBeNull();
    // Sair de "Outro" apaga o texto; voltar exige texto novo.
    expect(
      (await h.patch(`/api/leads/${outro}`, { version: 1, source: 'PDF_10' }, ale)).status,
    ).toBe(200);
    expect((await h.get(`/api/leads/${outro}`, ale)).body.sourceOther).toBeNull();
    const back = await h.patch(`/api/leads/${outro}`, { version: 2, source: 'OUTRO' }, ale);
    expect(back.status).toBe(400);
    expect(back.body.message).toBe('Escreva qual é a origem');
    // Lead antigo (Instagram) continua editável sem trocar a origem, mas não volta para antiga.
    await owner`update leads set source = 'INSTAGRAM' where id = ${bio}`;
    expect(
      (await h.patch(`/api/leads/${bio}`, { version: 1, source: 'INSTAGRAM', name: 'Maria' }, ale))
        .status,
    ).toBe(200);
    expect(
      (await h.patch(`/api/leads/${outro}`, { version: 2, source: 'WHATSAPP' }, ale)).status,
    ).toBe(400);
    const timeline = await owner<{ fields: string[] }[]>`
      select fields from lead_timeline where lead_id = ${outro} and kind = 'lead.updated'`;
    expect(timeline.map((t) => t.fields)).toEqual([['source']]);
  });

  it('perfil vem da faixa de renda e não é trocado à mão (Igor, 05/11/2026)', async () => {
    const id = await create(lead({ incomeBand: 'R5_8K' }), ale);
    expect((await h.get(`/api/leads/${id}`, ale)).body.tier).toBe('P2');
    // Perfil enviado no cadastro é ignorado: vale a faixa.
    const p0 = await create(lead({ incomeBand: 'R8_15K', tier: 'P0' }), ale);
    expect((await h.get(`/api/leads/${p0}`, ale)).body.tier).toBe('P1');
    // Trocar o perfil à mão é recusado.
    expect((await h.patch(`/api/leads/${id}`, { version: 1, tier: 'P0' }, ale)).status).toBe(400);
    // Trocar a faixa troca o perfil, e a timeline registra os dois campos.
    const res = await h.patch(`/api/leads/${id}`, { version: 1, incomeBand: 'R50K_PLUS' }, ale);
    expect(res.status).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ale)).body.tier).toBe('P0');
    const timeline = await owner<{ fields: string[] }[]>`
      select fields from lead_timeline where lead_id = ${id} and kind = 'lead.updated'`;
    expect(timeline.map((t) => t.fields)).toEqual([['incomeBand', 'tier']]);
  });

  it('"Descobrindo renda" é faixa e perfil; descobrir a renda troca o perfil (Igor, 10/11/2026)', async () => {
    const id = await create(lead({ incomeBand: 'DESCOBRINDO' }), ale);
    expect((await h.get(`/api/leads/${id}`, ale)).body).toMatchObject({
      incomeBand: 'DESCOBRINDO',
      tier: 'DESCOBRINDO',
    });
    expect((await h.get('/api/leads?tier=DESCOBRINDO', ale)).body.items).toHaveLength(1);
    const res = await h.patch(`/api/leads/${id}`, { version: 1, incomeBand: 'R8_15K' }, ale);
    expect(res.status).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ale)).body.tier).toBe('P1');
  });

  it('edição usa versão otimista e nunca altera um lead invisível', async () => {
    const id = await create(lead(), ale);
    const [a, b] = await Promise.all([
      h.patch(`/api/leads/${id}`, { version: 1, name: 'Maria atualizada' }, ale),
      h.patch(`/api/leads/${id}`, { version: 1, name: 'Outra edição' }, ale),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await h.get(`/api/leads/${id}`, ale)).body.version).toBe(2);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 2, name: 'Invasão' }, murilo)).status,
    ).toBe(404);
  });

  it('campos desconhecidos e dados pessoais de closer são rejeitados', async () => {
    const id = await create(lead(), ale);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, createdBy: ids.murilo }, ale)).status,
    ).toBe(400);
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${id}, ${ids.sonia}, now(), 'DIRETO', ${ids.ale})`;
    expect((await h.patch(`/api/leads/${id}`, { version: 1, name: 'Mudou' }, sonia)).status).toBe(
      403,
    );
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, stageKey: 'EM_FOLLOW' }, sonia)).status,
    ).toBe(200);
  });

  it('troca de contato não confunde o próprio lead com duplicado e protege outro SDR', async () => {
    const id = await create(lead({ phone: '11988887777' }), ale);
    await create(lead({ phone: '11977776666' }), murilo);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, phone: '11988887777' }, ale)).status,
    ).toBe(200);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 2, phone: '11977776666' }, ale)).status,
    ).toBe(409);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 2, phone: null, instagram: null }, ale)).status,
    ).toBe(400);
  });

  it('só HEAD transfere e exclui, com timeline sem valores pessoais', async () => {
    const id = await create(lead(), ale);
    expect((await h.patch(`/api/leads/${id}`, { version: 1, sdrId: ids.murilo }, ale)).status).toBe(
      403,
    );
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, sdrId: ids.murilo }, ronaldo)).status,
    ).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ale)).status).toBe(404);
    expect((await h.del(`/api/leads/${id}`, { version: 2 }, murilo)).status).toBe(403);
    expect((await h.del(`/api/leads/${id}`, { version: 2 }, ronaldo)).status).toBe(200);
    expect((await h.get(`/api/leads/${id}`, murilo)).status).toBe(404);
    const timeline = await owner`select kind, fields from lead_timeline where lead_id = ${id}`;
    expect(timeline.map((r) => r.kind)).toContain('lead.deleted');
    expect(JSON.stringify(timeline)).not.toContain('Maria');
  });
  it('lead só nasce em Venda com a reunião realizada (NPAC-39)', async () => {
    const res = await h.post('/api/leads', lead({ stageKey: 'VENDA' }), ale);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MEETING_REQUIRED');
  });

  it('lead excluído não abre nem para a liderança', async () => {
    const id = await create(lead({ phone: '11988887777' }), ale);
    expect((await h.del(`/api/leads/${id}`, { version: 1 }, ronaldo)).status).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ronaldo)).status).toBe(404);
    expect(await owner`select 1 from audit_log where action = 'lead.view'`).toHaveLength(0);
  });

  it('cadastros simultâneos do mesmo contato criam apenas um lead', async () => {
    const body = lead({ phone: '(11) 98888-7777' });
    const responses = await Promise.all([
      h.post('/api/leads', body, ale),
      h.post('/api/leads', body, murilo),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('busca por POST não leva o contato para a URL e audita a leitura', async () => {
    await create(lead({ phone: '(11) 98888-7777' }), ale);
    const res = await h.post('/api/leads/search', { search: '11988887777' }, ale);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const rows = await owner`select data from audit_log where action = 'lead.list'`;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('98888');
  });
  it('SDR cria lead e ele fica dele', async () => {
    const res = await h.post('/api/leads', lead(), ale);
    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(['id']);
    const got = await h.get(`/api/leads/${res.body.id}`, ale);
    expect(got.status).toBe(200);
    expect(got.body.sdr).toEqual({ id: ids.ale, name: 'Ale' });
    expect(got.body).toMatchObject({ stageKey: 'SONDAGEM', incomeBand: 'R8_15K', version: 1 });
  });

  it('SDR não cria lead para outro SDR', async () =>
    expect((await h.post('/api/leads', lead({ sdrId: ids.murilo }), ale)).status).toBe(403));

  it('closer não cria lead', async () =>
    expect((await h.post('/api/leads', lead(), sonia)).status).toBe(403));

  it('HEAD cria lead escolhendo um SDR que prospecta', async () => {
    expect((await h.post('/api/leads', lead(), ronaldo)).status).toBe(400);
    expect((await h.post('/api/leads', lead({ sdrId: ids.sonia }), ronaldo)).status).toBe(400);
    const id = await create(lead({ sdrId: ids.murilo }), ronaldo);
    expect((await h.get(`/api/leads/${id}`, murilo)).body.sdr.id).toBe(ids.murilo);
  });

  it('SDR não vê lead de outro (404, não 403)', async () => {
    const doMurilo = await create(lead(), murilo);
    expect((await h.get(`/api/leads/${doMurilo}`, ale)).status).toBe(404);
    expect((await h.get('/api/leads/00000000-0000-0000-0000-000000000000', ale)).status).toBe(404);
    expect((await h.get('/api/leads/nao-e-uuid', ale)).status).toBe(404);
  });

  it('lista do SDR só tem os dele; HEAD vê todos', async () => {
    const a = await create(lead({ name: 'Lead do Ale' }), ale);
    const m = await create(lead({ name: 'Lead do Murilo' }), murilo);
    const mine = await h.get('/api/leads', ale);
    expect(mine.body.items.map((l: { id: string }) => l.id)).toEqual([a]);
    expect(mine.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    const all = await h.get('/api/leads', ronaldo);
    expect(all.body.items.map((l: { id: string }) => l.id).sort()).toEqual([a, m].sort());
  });

  it('Sônia vê só leads da agenda', async () => {
    const a = await create(lead(), ale);
    await create(lead(), murilo);
    await owner`
      insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
      values (${a}, ${ids.sonia}, now() + interval '1 day', 'DIRETO', ${ids.ale})`;
    const res = await h.get('/api/leads', sonia);
    expect(res.body.items.map((l: { id: string }) => l.id)).toEqual([a]);
  });

  it('duplicado de outro SDR é barrado sem vazar dono', async () => {
    await create(lead({ instagram: undefined, phone: '(11) 98888-7777' }), murilo);
    const r = await h.post(
      '/api/leads',
      lead({ instagram: undefined, phone: '+55 11 98888-7777' }),
      ale,
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DUPLICATE_LEAD');
    expect(JSON.stringify(r.body)).not.toMatch(/murilo|Murilo/);
  });

  it('instagram duplicado também é barrado', async () => {
    await create(lead({ instagram: '@Mesma.Pessoa' }), murilo);
    expect(
      (await h.post('/api/leads', lead({ instagram: 'instagram.com/mesma.pessoa' }), ale)).status,
    ).toBe(409);
  });

  it('telefone fica cifrado no banco e volta decifrado na API', async () => {
    const id = await create(lead({ phone: '(11) 98888-7777' }), ale);
    const [row] = await owner<{ phone_enc: string; phone_bidx: string }[]>`
      select phone_enc::text, phone_bidx from leads where id = ${id}`;
    expect(row?.phone_enc).not.toContain('98888');
    expect(row?.phone_bidx).toMatch(/^[0-9a-f]{64}$/);
    expect((await h.get(`/api/leads/${id}`, ale)).body.phone).toBe('+5511988887777');
  });

  it('busca por nome, telefone e instagram', async () => {
    const a = await create(lead({ name: 'Joana Prado', phone: '11 97777-6666' }), ale);
    await create(lead({ name: 'Carlos Lima' }), ale);
    const by = async (q: string) =>
      (await h.post('/api/leads/search', { search: q }, ale)).body.items.map(
        (l: { id: string }) => l.id,
      );
    expect(await by('joana')).toEqual([a]);
    expect(await by('(11) 97777-6666')).toEqual([a]);
    const insta = (await h.get(`/api/leads/${a}`, ale)).body.instagram;
    expect(await by(`@${insta}`)).toEqual([a]);
    expect((await h.get('/api/leads?search=joana', ale)).status).toBe(400);
  });

  it('paginação limita pageSize a 100', async () => {
    const res = await h.get('/api/leads?page=1&pageSize=500', ale);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  it('lead sem faixa de renda → 400', async () =>
    expect((await h.post('/api/leads', lead({ incomeBand: undefined }), ale)).status).toBe(400));

  it('faixa abaixo de 5k → 400', async () =>
    expect((await h.post('/api/leads', lead({ incomeBand: 'R0_5K' }), ale)).status).toBe(400));

  it('detalhe é auditado como leitura', async () => {
    const id = await create(lead(), ale);
    await h.get(`/api/leads/${id}`, ale);
    const rows = await owner<{ actor_id: string; entity_id: string }[]>`
      select actor_id, entity_id from audit_log where action = 'lead.view'`;
    expect(rows).toEqual([{ actor_id: ids.ale, entity_id: id }]);
    const created =
      await owner`select 1 from audit_log where action = 'lead.create' and entity_id = ${id}`;
    expect(created).toHaveLength(1);
  });

  it('resposta tem Cache-Control no-store', async () =>
    expect((await h.get('/api/leads', ale)).headers['cache-control']).toContain('no-store'));
});

describe('e-mail do lead', () => {
  const search = async (q: string, cookie: Cookie = ale) =>
    (await h.post('/api/leads/search', { search: q }, cookie)).body.items.map(
      (l: { id: string }) => l.id,
    );

  it('fica cifrado no banco com blind index e volta decifrado', async () => {
    const id = await create(lead({ email: ' Maria.Cifra@Exemplo.COM ' }), ale);
    const [row] = await owner<{ email_enc: Buffer; email_bidx: string }[]>`
      select email_enc, email_bidx from leads where id = ${id}`;
    expect(row!.email_enc.toString('latin1')).not.toMatch(/maria|cifra|exemplo/i);
    expect(row!.email_bidx).toMatch(/^[0-9a-f]{64}$/);
    expect((await h.get(`/api/leads/${id}`, ale)).body.email).toBe('maria.cifra@exemplo.com');
  });

  it('é opcional: lead sem e-mail vem com null', async () => {
    const id = await create(lead(), ale);
    expect((await h.get(`/api/leads/${id}`, ale)).body.email).toBeNull();
  });

  it('sozinho não basta: continua exigindo telefone ou Instagram', async () =>
    expect(
      (await h.post('/api/leads', lead({ instagram: undefined, email: 'so@exemplo.com' }), ale))
        .status,
    ).toBe(400));

  it('duplicado entre SDRs é barrado sem revelar o dono', async () => {
    await create(lead({ email: 'mesma@exemplo.com' }), murilo);
    const r = await h.post('/api/leads', lead({ email: 'MESMA@Exemplo.com' }), ale);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DUPLICATE_LEAD');
    expect(JSON.stringify(r.body)).not.toMatch(/murilo|mesma@/i);
  });

  it('na edição barra e-mail de outro lead e aceita o próprio', async () => {
    await create(lead({ email: 'outra@exemplo.com' }), murilo);
    const id = await create(lead({ email: 'minha@exemplo.com' }), ale);
    const taken = await h.patch(
      `/api/leads/${id}`,
      { version: 1, email: 'outra@exemplo.com' },
      ale,
    );
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('DUPLICATE_LEAD');
    const same = await h.patch(`/api/leads/${id}`, { version: 1, email: 'minha@exemplo.com' }, ale);
    expect(same.status).toBe(200);
  });

  it('edição troca e apaga; timeline e auditoria guardam só o nome do campo', async () => {
    const id = await create(lead({ email: 'antes@exemplo.com' }), ale);
    expect(
      (await h.patch(`/api/leads/${id}`, { version: 1, email: 'depois@exemplo.com' }, ale)).status,
    ).toBe(200);
    expect((await h.get(`/api/leads/${id}`, ale)).body.email).toBe('depois@exemplo.com');
    expect(await search('antes@exemplo.com')).toEqual([]);
    expect(await search('depois@exemplo.com')).toEqual([id]);
    const [t] = await owner<{ fields: string[] }[]>`
      select fields from lead_timeline where lead_id = ${id} and kind = 'lead.updated'`;
    expect(t!.fields).toEqual(['email']);
    const dump = await owner<{ d: string }[]>`
      select coalesce(data::text, '') as d from audit_log where entity_id = ${id}`;
    for (const r of dump) expect(r.d).not.toContain('@');
    expect((await h.patch(`/api/leads/${id}`, { version: 2, email: null }, ale)).status).toBe(200);
    const [row] = await owner<{ email_enc: Buffer | null; email_bidx: string | null }[]>`
      select email_enc, email_bidx from leads where id = ${id}`;
    expect(row).toEqual({ email_enc: null, email_bidx: null });
  });

  it('busca pelo blind index, sem diferença de maiúsculas e só nos leads visíveis', async () => {
    const a = await create(lead({ name: 'Joana', email: 'joana@exemplo.com' }), ale);
    await create(lead({ name: 'Carlos', email: 'carlos@exemplo.com' }), murilo);
    expect(await search(' JOANA@Exemplo.com ')).toEqual([a]);
    expect(await search('carlos@exemplo.com')).toEqual([]);
    // Parte do e-mail não acha: o blind index só compara o endereço inteiro.
    expect(await search('joana@exem')).toEqual([]);
  });

  it('busca aceita e-mail de 254 caracteres', async () => {
    const email = `${'a'.repeat(242)}@exemplo.com`;
    const id = await create(lead({ email }), ale);
    expect(await search(email)).toEqual([id]);
  });

  it('@usuario e link do Instagram continuam buscando o Instagram', async () => {
    const id = await create(lead({ instagram: '@joana.prado' }), ale);
    expect(await search('@joana.prado')).toEqual([id]);
    expect(await search('https://instagram.com/@joana.prado')).toEqual([id]);
  });
});

describe('exportar leads (período, filtro ou total)', () => {
  const csv = (body: object, cookie: Cookie) => h.post('/api/leads/csv', body, cookie);

  it('leva o e-mail decifrado e neutraliza fórmula', async () => {
    await create(lead({ name: 'Com e-mail', email: 'csv@exemplo.com' }), ale);
    await create(lead({ name: 'Fórmula', email: '+formula@exemplo.com' }), ale);
    await create(lead({ name: 'Sem e-mail' }), ale);
    const res = await csv({}, ronaldo);
    expect(res.status).toBe(200);
    expect(res.text).toContain('"csv@exemplo.com"');
    expect(res.text).toContain('"\'+formula@exemplo.com"');
  });

  it('só liderança exporta', async () => {
    await create(lead(), ale);
    expect((await csv({}, ale)).status).toBe(403);
  });

  it('total traz todos os leads visíveis com contato decifrado e auditoria', async () => {
    await create(lead({ name: 'Exporta Ale', phone: '11987654321', incomeBand: 'R15_50K' }), ale);
    await create(lead({ name: '=1+1', incomeBand: 'R5_8K' }), murilo);
    const res = await csv({}, ronaldo);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const [header, ...lines] = res.text.replace('﻿', '').split('\r\n');
    expect(header).toBe(
      '"Nome";"Telefone";"Instagram";"E-mail";"Perfil";"Etapa";"SDR";"Criado em"',
    );
    expect(lines).toHaveLength(2);
    expect(res.text).toContain('+5511987654321');
    expect(res.text).toContain('"\'=1+1"');
    const [audit] = await owner<{ data: { count: number } }[]>`
      select data from audit_log where action = 'lead.export.csv' order by id desc limit 1`;
    expect(audit!.data.count).toBe(2);
  });

  it('com filtro respeita os filtros da lista', async () => {
    await create(lead({ name: 'Só P0', incomeBand: 'R50K_PLUS' }), ale);
    await create(lead({ name: 'Um P2', incomeBand: 'R5_8K' }), ale);
    // A tela manda a ordenação junto com os filtros.
    const res = await csv({ tier: 'P0', sort: 'name', direction: 'asc' }, ronaldo);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Só P0');
    expect(res.text).not.toContain('Um P2');
  });

  it('por período usa a data de criação em dias de Brasília', async () => {
    const old = await create(lead({ name: 'Antigo' }), ale);
    await create(lead({ name: 'Recente' }), ale);
    await owner`update leads set created_at = '2025-03-10T12:00:00-03:00' where id = ${old}`;
    const res = await csv({ createdFrom: '2025-03-10', createdTo: '2025-03-10' }, ronaldo);
    expect(res.text).toContain('Antigo');
    expect(res.text).not.toContain('Recente');
  });

  it('sem resultado sai só o cabeçalho; acima de 10 mil recusa', async () => {
    const empty = await csv({ tier: 'P0' }, ronaldo);
    expect(empty.text.replace('﻿', '').split('\r\n')).toHaveLength(1);
    const id = await create(lead(), ale);
    await owner`insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by)
      select 'Massa', income_band, source, tier, stage_id, sdr_id, created_by
      from leads, generate_series(1, 10000) where id = ${id}`;
    const big = await csv({}, ronaldo);
    expect(big.status).toBe(400);
    expect(big.body.message).toBe('Reduza o filtro para exportar até 10 mil leads');
    const invalid = await csv({ tier: 'P9' }, ronaldo);
    expect(invalid.status).toBe(400);
  });
});
