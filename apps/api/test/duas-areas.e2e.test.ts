import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// Acesso por área, Fase 4 (NPAC-54): pessoa em duas áreas. A Diretoria põe e tira alguém de uma
// área (`PUT`/`DELETE admin/users/:id/areas/:area`); a conta usa o comercial pelo cargo comercial e
// o módulo pelo vínculo do Acompanhamento, com um login só. Nenhum Head alcança a outra área.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
const ids: Record<string, string> = {};

const OUTRA_AREA = 'Só a Diretoria põe ou tira alguém de uma área';

const areas = async (id: string) =>
  owner<{ area: string; cargo: string | null; head: boolean }[]>`
    select area, cargo, head from area_membros where user_id = ${id} order by area`;

/** Volta a Sonia a só Closer (a escrita em `role` vira um vínculo só) e a Carla a Admin do módulo. */
const restaurar = async () => {
  await owner`update "user" set name = 'Sônia' where username = 'sonia'`;
  await owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true where username = 'sonia'`;
  await owner`delete from area_membros where user_id = ${ids.sonia!} and area = 'ACOMPANHAMENTO'`;
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${ids.carla!}, 'ACOMPANHAMENTO', true)`;
  await owner`delete from area_membros where user_id = ${ids.carla!} and area = 'COMERCIAL'`;
};

const porArea = (cookie: Cookie, id: string, area: string, corpo: object) =>
  h.put(`/api/admin/users/${id}/areas/${area}`, corpo, cookie);
const tirarArea = (cookie: Cookie, id: string, area: string) =>
  h.del(`/api/admin/users/${id}/areas/${area}`, {}, cookie);

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  for (const u of ['diretor', 'sonia', 'carla', 'ronaldo', 'ale', 'ana']) {
    const [r] = await owner<{ id: string }[]>`select id from "user" where username = ${u}`;
    ids[u] = r!.id;
  }
});
afterAll(async () => {
  await restaurar();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`update "user" set role = 'HEAD' where username in ('ana', 'ronaldo')`;
  await restaurar();
});

describe('rotas por área (4.1)', () => {
  it('a Diretoria põe a Sonia como Especialista e tira, com auditoria', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    const r = await porArea(d, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' });
    expect(r.status, r.text).toBe(200);
    expect(await areas(ids.sonia!)).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false },
      { area: 'COMERCIAL', cargo: 'CLOSER', head: false },
    ]);
    // O resumo continua comercial (as caixas do Closer ficam).
    const [u] = await owner<{ role: string; can_close: boolean }[]>`
      select role, can_close from "user" where id = ${ids.sonia!}`;
    expect(u).toEqual({ role: 'CLOSER', can_close: true });

    const lista = (await h.get('/api/admin/users', d)).body as {
      id: string;
      areas: unknown[];
      outraArea: boolean;
    }[];
    expect(lista.find((c) => c.id === ids.sonia)).toMatchObject({
      areas: [
        { area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false },
        { area: 'COMERCIAL', cargo: 'CLOSER', head: false },
      ],
      outraArea: false,
    });

    // Troca o cargo de uma das áreas pela mesma rota.
    expect((await porArea(d, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'MENTOR' })).status).toBe(200);
    expect((await areas(ids.sonia!))[0]).toMatchObject({ cargo: 'MENTOR' });

    const t = await tirarArea(d, ids.sonia!, 'ACOMPANHAMENTO');
    expect(t.status, t.text).toBe(200);
    expect(await areas(ids.sonia!)).toEqual([{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }]);

    const acoes = await owner<{ action: string; data: { area: string; cargo?: string } }[]>`
      select action, data from audit_log where entity_id = ${ids.sonia!}
        and action like 'area.membro.%' order by id`;
    expect(acoes.map((a) => [a.action, a.data.area, a.data.cargo ?? null])).toEqual([
      ['area.membro.definido', 'ACOMPANHAMENTO', 'ESPECIALISTA'],
      ['area.membro.definido', 'ACOMPANHAMENTO', 'MENTOR'],
      ['area.membro.removido', 'ACOMPANHAMENTO', null],
    ]);
    const registro = (await h.get('/api/admin/acessos', d)).body as { items: { tipo: string }[] };
    expect(registro.items.map((l) => l.tipo).slice(0, 3)).toEqual([
      'AREA_REMOVIDA',
      'CARGO_TROCADO',
      'AREA_ADICIONADA',
    ]);
  });

  it('a Diretoria põe Comercial em quem é só do Acompanhamento; o resumo vira o cargo comercial', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    await owner`delete from mentoria_perfis where user_id = ${ids.carla!}`;
    await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${ids.carla!}, 'OPERACAO', false)`;
    expect((await porArea(d, ids.carla!, 'COMERCIAL', { cargo: 'SDR' })).status).toBe(200);
    const [u] = await owner<{ role: string; can_prospect: boolean }[]>`
      select role, can_prospect from "user" where id = ${ids.carla!}`;
    expect(u).toEqual({ role: 'SDR', can_prospect: true });
    expect((await tirarArea(d, ids.carla!, 'COMERCIAL')).status).toBe(200);
    const [v] = await owner<{ role: string; can_prospect: boolean }[]>`
      select role, can_prospect from "user" where id = ${ids.carla!}`;
    expect(v).toEqual({ role: 'ACOMPANHAMENTO', can_prospect: false });
  });

  it('recusa cargo de outra área, Diretoria, a última área e a própria conta', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    const s = ids.sonia!;
    expect((await porArea(d, s, 'ACOMPANHAMENTO', { cargo: 'CLOSER' })).status).toBe(400);
    expect((await porArea(d, s, 'COMERCIAL', { cargo: 'DIRETOR' })).status).toBe(400);
    expect((await porArea(d, s, 'COMERCIAL', { cargo: 'SDR', extra: 1 })).status).toBe(400);
    expect((await porArea(d, s, 'VENDAS', { cargo: 'SDR' })).status).toBe(404);
    expect((await porArea(d, ids.diretor!, 'COMERCIAL', { cargo: 'SDR' })).status).toBe(400);
    const ultima = await tirarArea(d, s, 'COMERCIAL');
    expect(ultima.status).toBe(400);
    expect(ultima.body.message).toBe('A conta precisa de ao menos uma área');
    expect((await tirarArea(d, s, 'ACOMPANHAMENTO')).status).toBe(404);
    expect((await porArea(d, 'nao-existe', 'COMERCIAL', { cargo: 'SDR' })).status).toBe(404);
    expect(await areas(s)).toEqual([{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }]);
  });

  it('Head: 404 em conta que não enxerga, 403 com o motivo na que enxerga; demais 403/404', async () => {
    const ronaldo = await h.signIn('ronaldo@npac.com.br');
    const carla = await h.signIn('carla@npac.com.br');
    const ale = await h.signIn('ale@npac.com.br');
    // A Sonia (só Comercial) é invisível para o Admin do Acompanhamento.
    expect(
      (await porArea(carla, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' })).status,
    ).toBe(404);
    const r = await porArea(ronaldo, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' });
    expect(r.status).toBe(403);
    expect(r.body.message).toBe(OUTRA_AREA);
    // Nem dentro da própria área: a rota é só da Diretoria.
    expect((await porArea(ronaldo, ids.sonia!, 'COMERCIAL', { cargo: 'SDR' })).status).toBe(403);
    expect((await tirarArea(ronaldo, ids.sonia!, 'COMERCIAL')).status).toBe(403);
    expect(
      (await porArea(ale, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' })).status,
    ).toBe(403);

    const d = await h.signIn('diretor@npac.com.br');
    await porArea(d, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' });
    for (const cookie of [ronaldo, carla]) {
      const t = await tirarArea(cookie, ids.sonia!, 'ACOMPANHAMENTO');
      expect(t.status).toBe(403);
      expect(t.body.message).toBe(OUTRA_AREA);
    }
    expect(await areas(ids.sonia!)).toHaveLength(2);
  });

  it('PATCH de cargo em conta com duas áreas: a Diretoria recebe 400; o Head troca a área dele', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    await porArea(d, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' });
    const p = await h.patch(`/api/admin/users/${ids.sonia}`, { role: 'SDR' }, d);
    expect(p.status).toBe(400);
    expect(p.body.message).toBe('Conta em mais de uma área: troque o cargo em cada área');
    // Nome e e-mail continuam pelo PATCH.
    expect(
      (await h.patch(`/api/admin/users/${ids.sonia}`, { name: 'Sonia Closer' }, d)).status,
    ).toBe(200);
    await owner`update "user" set name = 'Sônia' where id = ${ids.sonia!}`;
    // O Head do Comercial troca o cargo da área dele (M5), sem tirar a outra.
    const ronaldo = await h.signIn('ronaldo@npac.com.br');
    expect((await h.patch(`/api/admin/users/${ids.sonia}`, { role: 'SDR' }, ronaldo)).status).toBe(
      200,
    );
    expect(await areas(ids.sonia!)).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false },
      { area: 'COMERCIAL', cargo: 'SDR', head: false },
    ]);
  });
});

/** `datetime-local` de Brasília, `horas` a partir de agora. */
const quando = async (horas: number) => {
  const [r] = await owner<{ d: string }[]>`
    select to_char((now() at time zone 'America/Sao_Paulo') + make_interval(hours => ${horas}::int),
      'YYYY-MM-DD"T"HH24:MI') as d`;
  return r!.d;
};
let n = 0;
const inscricao = async () => {
  n += 1;
  const [i] = await owner<{ id: string }[]>`
    insert into mentoria_inscricoes (tipo, mentoria, status) values ('INDIVIDUAL', 'RDV', 'ATIVO')
    returning id`;
  await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
    values (${i!.id}, 1, ${`Mentorado Fictício ${n}`}, ${`mentorado ficticio ${n}`})`;
  return i!.id;
};

describe('guardas pelo vínculo (4.2)', () => {
  it('a Sonia usa o comercial como Closer e o módulo como Especialista, só nas reuniões que conduz', async () => {
    let s = await h.signIn('sonia@npac.com.br');
    expect((await h.get('/api/mentoria/eu', s)).status).toBe(404);
    expect((await h.get('/api/me', s)).body.modules).toEqual({ mentoria: false });

    const d = await h.signIn('diretor@npac.com.br');
    expect((await porArea(d, ids.sonia!, 'ACOMPANHAMENTO', { cargo: 'ESPECIALISTA' })).status).toBe(
      200,
    );
    const dela = await inscricao();
    const outra = await inscricao();
    const criar = async (i: string, conduzidaPor: string) => {
      const r = await h.post(
        '/api/mentoria/reunioes',
        { inscricaoId: i, tipo: 'POSICIONAMENTO', inicio: await quando(24), conduzidaPor },
        d,
      );
      expect(r.status, r.text).toBe(201);
      return r.body as { id: string };
    };
    const reuniao = await criar(dela, ids.sonia!);
    const deOutro = await criar(outra, ids.diretor!);

    // Mesma sessão de antes: o vínculo vale no próximo pedido, sem novo login.
    const eu = await h.get('/api/mentoria/eu', s);
    expect(eu.status, eu.text).toBe(200);
    expect(eu.body).toMatchObject({ perfil: 'ESPECIALISTA', admin: false });
    s = await h.signIn('sonia@npac.com.br');
    expect((await h.get('/api/me', s)).body).toMatchObject({
      role: 'CLOSER',
      modules: { mentoria: true },
    });

    // Comercial como Closer.
    expect((await h.get('/api/leads?page=1', s)).status).toBe(200);
    expect((await h.post('/api/today/search', {}, s)).status).toBe(200);
    // Módulo como Especialista: só o que conduz.
    expect((await h.get(`/api/mentoria/reunioes/${reuniao.id}`, s)).status).toBe(200);
    expect((await h.get(`/api/mentoria/inscricoes/${dela}`, s)).status).toBe(200);
    expect((await h.get(`/api/mentoria/reunioes/${deOutro.id}`, s)).status).toBe(404);
    expect((await h.get(`/api/mentoria/inscricoes/${outra}`, s)).status).toBe(404);
    const lista = await h.post('/api/mentoria/inscricoes/lista', {}, s);
    expect(lista.status, lista.text).toBe(200);
    expect((lista.body as { itens: { id: string }[] }).itens.map((x) => x.id)).toEqual([dela]);
    // O que a Especialista não usa continua 404 (Fila da equipe, perfis, CSV).
    expect((await h.get('/api/mentoria/perfis', s)).status).toBe(404);
    expect((await h.post('/api/mentoria/reunioes/controle-mensal', {}, s)).status).toBe(404);

    // Tirada do Acompanhamento: o módulo volta a ser 404 no próximo pedido.
    expect((await tirarArea(d, ids.sonia!, 'ACOMPANHAMENTO')).status).toBe(200);
    expect((await h.get('/api/mentoria/eu', s)).status).toBe(404);
    expect((await h.get(`/api/mentoria/reunioes/${reuniao.id}`, s)).status).toBe(404);
    expect((await h.get('/api/leads?page=1', s)).status).toBe(200);
  });

  it('a Carla com o Comercial ganha as rotas do comercial sem perder o módulo', async () => {
    const d = await h.signIn('diretor@npac.com.br');
    let c = await h.signIn('carla@npac.com.br');
    expect((await h.get('/api/leads?page=1', c)).status).toBe(404);
    expect((await porArea(d, ids.carla!, 'COMERCIAL', { cargo: 'SDR' })).status).toBe(200);
    c = await h.signIn('carla@npac.com.br');
    expect((await h.get('/api/leads?page=1', c)).status).toBe(200);
    expect((await h.get('/api/mentoria/eu', c)).body).toMatchObject({
      perfil: 'ACOMPANHAMENTO',
      admin: true,
    });
    expect((await h.get('/api/mentoria/perfis', c)).status).toBe(200);
    expect((await tirarArea(d, ids.carla!, 'COMERCIAL')).status).toBe(200);
  });
});
