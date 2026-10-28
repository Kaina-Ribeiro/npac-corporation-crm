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
  incomeBand: 'R10_20K',
  tier: 'P1',
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
  await owner`truncate meetings, leads`;
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
    expect(got.body).toMatchObject({ stageKey: 'SONDAGEM', incomeBand: 'R10_20K', version: 1 });
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
