import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// Acesso por área, Fase 2 (NPAC-54): a regra única de quem gerencia quem nas rotas de contas, por
// ator (Diretoria, Head do Comercial, Head do Acompanhamento = Admin do módulo), e o registro de
// acessos da Diretoria (GET admin/acessos).
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let ids: Record<string, string>;
let diretor: Cookie, ronaldo: Cookie, carla: Cookie;

const SELO = 'Só a Diretoria dá o selo de Admin do Acompanhamento';
const DUAS = 'Conta em mais de uma área: só a Diretoria redefine a senha ou desativa';

const limpar = async () => {
  await owner`delete from account where user_id in (select id from "user" where email like '%@area.test')`;
  await owner`delete from "user" where email like '%@area.test'`;
  await owner`truncate access_requests`;
};

/** Grava como a Diretoria pelas funções do banco (a rota de segunda área é da Fase 4). */
const comoDiretoria = (q: (t: typeof owner) => Promise<unknown>) =>
  owner.begin(async (t) => {
    await t`select set_config('app.user_id', ${ids.diretor!}, true)`;
    await q(t as unknown as typeof owner);
  });

const convidar = (cookie: Cookie, nome: string, corpo: object) =>
  h.post(
    '/api/admin/users',
    { name: `Pessoa ${nome}`, email: `${nome}@area.test`, username: nome, ...corpo },
    cookie,
  );

const pedir = async (username: string, area: 'COMERCIAL' | 'ACOMPANHAMENTO') => {
  await h.post('/api/auth/request-access', {
    name: 'Pedido Teste',
    username,
    email: `${username}@area.test`,
    password: '123',
    area,
  });
  const [r] = await owner<
    { id: string }[]
  >`select id from access_requests where username = ${username}`;
  return r!.id;
};

const lista = async (cookie: Cookie) =>
  (await h.get('/api/admin/users', cookie)).body as {
    id: string;
    role: string;
    areas: { area: string; cargo: string | null; head: boolean }[];
    outraArea: boolean;
    perfil: string | null;
    moduloAdmin: boolean | null;
  }[];

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await limpar();
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false where email = 'igor@npac.com.br'`;
  await owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true where email = 'sonia@npac.com.br'`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await limpar();
  await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
  await owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true where email = 'sonia@npac.com.br'`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false where email = 'igor@npac.com.br'`;
  // Carla = Admin do Acompanhamento (Head da área, M2).
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin)
    select id, 'ACOMPANHAMENTO', true from "user" where email = 'carla@npac.com.br'`;
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
  diretor = await h.signIn('diretor@npac.com.br');
  ronaldo = await h.signIn('ronaldo@npac.com.br');
  carla = await h.signIn('carla@npac.com.br');
  // Contas do Acompanhamento criadas pela Diretoria: uma Operação e outra Admin.
  for (const [nome, corpo] of [
    ['op.area', { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' }],
    ['admin2.area', { role: 'ACOMPANHAMENTO', perfil: 'ACOMPANHAMENTO', moduloAdmin: true }],
  ] as const) {
    const r = await convidar(diretor, nome, corpo);
    expect(r.status, r.text).toBe(201);
    ids[nome] = r.body.id;
  }
});

describe('Head do Acompanhamento (Admin do módulo)', () => {
  it('vê só as contas do Acompanhamento, com o perfil', async () => {
    const contas = await lista(carla);
    expect(contas.map((c) => c.id).sort()).toEqual(
      [ids.carla!, ids['op.area']!, ids['admin2.area']!].sort(),
    );
    expect(contas.find((c) => c.id === ids['op.area'])).toMatchObject({
      perfil: 'OPERACAO',
      moduloAdmin: false,
      areas: [{ area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false }],
      outraArea: false,
    });
  });

  it('convida Operação, que entra direto no módulo; nunca com o selo nem cargo do Comercial', async () => {
    const r = await convidar(carla, 'nova.op', { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' });
    expect(r.status).toBe(201);
    await owner`update "user" set must_change_password = false where id = ${r.body.id}`;
    const login = await h.signInRaw('nova.op@x', r.body.temporaryPassword);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    expect((await h.get('/api/mentoria/eu', cookie)).body).toEqual({
      perfil: 'OPERACAO',
      admin: false,
    });
    const selo = await convidar(carla, 'nova.adm', {
      role: 'ACOMPANHAMENTO',
      perfil: 'OPERACAO',
      moduloAdmin: true,
    });
    expect(selo.status).toBe(403);
    expect(selo.body.message).toBe(SELO);
    const sdr = await convidar(carla, 'nova.sdr', { role: 'SDR' });
    expect(sdr.status).toBe(403);
    expect(sdr.body.message).toBe('Só a Diretoria pode dar cargo do Comercial');
    expect((await convidar(carla, 'nova.dir', { role: 'DIRETOR' })).status).toBe(403);
  });

  it('troca o perfil, redefine senha, zera MFA, desativa e reativa contas da área', async () => {
    const op = ids['op.area']!;
    expect(
      (await h.patch(`/api/admin/users/${op}`, { perfil: 'ESPECIALISTA' }, carla)).status,
    ).toBe(200);
    expect((await h.post(`/api/admin/users/${op}/reset-password`, {}, carla)).status).toBe(200);
    expect((await h.post(`/api/admin/users/${op}/reset-mfa`, {}, carla)).status).toBe(200);
    expect((await h.patch(`/api/admin/users/${op}`, { active: false }, carla)).status).toBe(200);
    expect((await h.patch(`/api/admin/users/${op}`, { active: true }, carla)).status).toBe(200);
    const [v] = await owner<{ cargo: string; active: boolean }[]>`
      select m.cargo, u.active from area_membros m join "user" u on u.id = m.user_id
      where m.user_id = ${op}`;
    expect(v).toEqual({ cargo: 'ESPECIALISTA', active: true });
  });

  it('não dá nem tira o selo de outro, por nenhum caminho (403)', async () => {
    const op = ids['op.area']!;
    const admin2 = ids['admin2.area']!;
    const patch = await h.patch(`/api/admin/users/${op}`, { moduloAdmin: true }, carla);
    expect(patch.status).toBe(403);
    expect(patch.body.message).toBe(SELO);
    const dar = await h.put(
      '/api/mentoria/perfis',
      { userId: op, perfil: 'OPERACAO', admin: true },
      carla,
    );
    expect(dar.status).toBe(403);
    expect(dar.body.message).toBe(SELO);
    const tirar = await h.put(
      '/api/mentoria/perfis',
      { userId: admin2, perfil: 'ACOMPANHAMENTO', admin: false },
      carla,
    );
    expect(tirar.status).toBe(403);
    expect(
      (await h.patch(`/api/admin/users/${admin2}`, { moduloAdmin: false }, carla)).status,
    ).toBe(403);
    // Troca de perfil sem mexer no selo continua.
    expect(
      (await h.put('/api/mentoria/perfis', { userId: op, perfil: 'MENTOR', admin: false }, carla))
        .status,
    ).toBe(200);
    const selos = await owner<{ user_id: string; admin: boolean }[]>`
      select user_id, admin from mentoria_perfis where user_id in (${op}, ${admin2})`;
    expect(Object.fromEntries(selos.map((s) => [s.user_id, s.admin]))).toEqual({
      [op]: false,
      [admin2]: true,
    });
  });

  it('não mexe em outro Admin (403) nem no próprio cargo (400)', async () => {
    const admin2 = ids['admin2.area']!;
    expect((await h.post(`/api/admin/users/${admin2}/reset-password`, {}, carla)).status).toBe(403);
    const desativar = await h.patch(`/api/admin/users/${admin2}`, { active: false }, carla);
    expect(desativar.status).toBe(403);
    expect(desativar.body.message).toBe(
      'Só a Diretoria administra contas de Admin do Acompanhamento',
    );
    expect(
      (await h.patch(`/api/admin/users/${ids.carla}`, { perfil: 'OPERACAO' }, carla)).status,
    ).toBe(400);
  });

  it('não enxerga o Comercial nem a Diretoria (404)', async () => {
    for (const alvo of [ids.ale!, ids.ronaldo!, ids.diretor!]) {
      expect((await h.patch(`/api/admin/users/${alvo}`, { role: 'CLOSER' }, carla)).status).toBe(
        404,
      );
      expect((await h.post(`/api/admin/users/${alvo}/reset-password`, {}, carla)).status).toBe(404);
    }
    expect(
      (await h.post(`/api/admin/users/${ids.ale}/transfer-leads`, { to: ids.murilo }, carla))
        .status,
    ).toBe(404);
  });

  it('pedidos de acesso: só os do Acompanhamento, aprovados com cargo da área', async () => {
    const doAc = await pedir('pedido.ac', 'ACOMPANHAMENTO');
    const doCom = await pedir('pedido.com', 'COMERCIAL');
    const vistos = (await h.get('/api/admin/access-requests', carla)).body as { id: string }[];
    expect(vistos.map((p) => p.id)).toEqual([doAc]);
    const url = (id: string) => `/api/admin/access-requests/${id}/approve`;
    expect((await h.post(url(doCom), { role: 'SDR' }, carla)).status).toBe(404);
    expect((await h.del(`/api/admin/access-requests/${doCom}`, {}, carla)).status).toBe(404);
    const selo = await h.post(
      url(doAc),
      { role: 'ACOMPANHAMENTO', perfil: 'ESPECIALISTA', moduloAdmin: true },
      carla,
    );
    expect(selo.status).toBe(403);
    expect((await h.post(url(doAc), { role: 'CLOSER' }, carla)).status).toBe(403);
    const ok = await h.post(url(doAc), { role: 'ACOMPANHAMENTO', perfil: 'ESPECIALISTA' }, carla);
    expect(ok.status).toBe(201);
    expect(await owner`select 1 from access_requests`).toHaveLength(1);
  });
});

describe('Head do Comercial', () => {
  it('vê só o Comercial: nem o Acompanhamento nem a Diretoria', async () => {
    const vistos = (await lista(ronaldo)).map((c) => c.id);
    expect(vistos).toEqual(expect.arrayContaining([ids.ale, ids.sonia, ids.ana, ids.ronaldo]));
    for (const fora of [ids.carla, ids['op.area'], ids.diretor]) expect(vistos).not.toContain(fora);
  });

  it('convida, aprova, troca cargo, redefine senha e desativa no Comercial', async () => {
    const r = await convidar(ronaldo, 'novo.sdr', { role: 'SDR' });
    expect(r.status).toBe(201);
    const novo = r.body.id as string;
    expect((await h.patch(`/api/admin/users/${novo}`, { role: 'CLOSER' }, ronaldo)).status).toBe(
      200,
    );
    expect((await h.post(`/api/admin/users/${novo}/reset-password`, {}, ronaldo)).status).toBe(200);
    expect((await h.patch(`/api/admin/users/${novo}`, { active: false }, ronaldo)).status).toBe(
      200,
    );
    const doCom = await pedir('pedido.com', 'COMERCIAL');
    const doAc = await pedir('pedido.ac', 'ACOMPANHAMENTO');
    expect(
      (await h.post(`/api/admin/access-requests/${doAc}/approve`, { role: 'SDR' }, ronaldo)).status,
    ).toBe(404);
    expect(
      (await h.post(`/api/admin/access-requests/${doCom}/approve`, { role: 'SDR' }, ronaldo))
        .status,
    ).toBe(201);
  });

  it('não alcança o Acompanhamento (404) nem outro Head (403)', async () => {
    const op = ids['op.area']!;
    expect((await h.patch(`/api/admin/users/${op}`, { perfil: 'MENTOR' }, ronaldo)).status).toBe(
      404,
    );
    expect((await h.post(`/api/admin/users/${op}/reset-password`, {}, ronaldo)).status).toBe(404);
    expect((await h.post(`/api/admin/users/${ids.diretor}/reset-mfa`, {}, ronaldo)).status).toBe(
      404,
    );
    expect((await h.patch(`/api/admin/users/${ids.ana}`, { role: 'SDR' }, ronaldo)).status).toBe(
      403,
    );
    expect((await h.post(`/api/admin/users/${ids.ana}/reset-password`, {}, ronaldo)).status).toBe(
      403,
    );
  });
});

describe('Diretoria', () => {
  it('vê todas as contas, com as áreas, e só ela dá e tira o selo e o Head', async () => {
    const contas = await lista(diretor);
    expect(contas.find((c) => c.id === ids.diretor)).toMatchObject({ areas: [], outraArea: false });
    expect(contas.find((c) => c.id === ids['op.area'])).toMatchObject({ perfil: 'OPERACAO' });
    const op = ids['op.area']!;
    expect((await h.patch(`/api/admin/users/${op}`, { moduloAdmin: true }, diretor)).status).toBe(
      200,
    );
    expect(
      (
        await h.put(
          '/api/mentoria/perfis',
          { userId: op, perfil: 'OPERACAO', admin: false },
          diretor,
        )
      ).status,
    ).toBe(200);
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'HEAD' }, diretor)).status).toBe(
      200,
    );
    expect((await h.patch(`/api/admin/users/${ids.ale}`, { role: 'SDR' }, diretor)).status).toBe(
      200,
    );
  });

  it('aprova pedido do Comercial em outra área', async () => {
    const doCom = await pedir('pedido.com', 'COMERCIAL');
    const r = await h.post(
      `/api/admin/access-requests/${doCom}/approve`,
      { role: 'ACOMPANHAMENTO', perfil: 'MENTOR' },
      diretor,
    );
    expect(r.status).toBe(201);
  });
});

describe('conta em duas áreas (M5)', () => {
  beforeEach(async () => {
    await comoDiretoria(
      (t) => t`select area_definir_membro(${ids.sonia!}, 'ACOMPANHAMENTO', 'ESPECIALISTA', false)`,
    );
  });

  it('cada Head vê só o cargo da área dele, sabe que há outra e não mexe na conta', async () => {
    const doHead = (await lista(ronaldo)).find((c) => c.id === ids.sonia)!;
    expect(doHead).toMatchObject({
      role: 'CLOSER',
      areas: [{ area: 'COMERCIAL', cargo: 'CLOSER', head: false }],
      outraArea: true,
      perfil: null,
    });
    const doAdmin = (await lista(carla)).find((c) => c.id === ids.sonia)!;
    expect(doAdmin).toMatchObject({
      role: 'ACOMPANHAMENTO',
      areas: [{ area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA', head: false }],
      outraArea: true,
      perfil: 'ESPECIALISTA',
    });
    for (const cookie of [ronaldo, carla]) {
      const senha = await h.post(`/api/admin/users/${ids.sonia}/reset-password`, {}, cookie);
      expect(senha.status).toBe(403);
      expect(senha.body.message).toBe(DUAS);
      expect(
        (await h.patch(`/api/admin/users/${ids.sonia}`, { active: false }, cookie)).status,
      ).toBe(403);
    }
    expect((await h.post(`/api/admin/users/${ids.sonia}/reset-mfa`, {}, diretor)).status).toBe(200);
  });

  it('o Head de cada área troca o cargo da área dele, sem tirar a outra', async () => {
    expect(
      (await h.patch(`/api/admin/users/${ids.sonia}`, { perfil: 'MENTOR' }, carla)).status,
    ).toBe(400); // o resumo da conta é Closer: troca por área é a rota da Fase 4
    expect(
      (
        await h.put(
          '/api/mentoria/perfis',
          { userId: ids.sonia, perfil: 'MENTOR', admin: false },
          carla,
        )
      ).status,
    ).toBe(200);
    expect((await h.patch(`/api/admin/users/${ids.sonia}`, { role: 'SDR' }, ronaldo)).status).toBe(
      200,
    );
    const v = await owner<{ area: string; cargo: string }[]>`
      select area, cargo from area_membros where user_id = ${ids.sonia!} order by area`;
    expect(v).toEqual([
      { area: 'ACOMPANHAMENTO', cargo: 'MENTOR' },
      { area: 'COMERCIAL', cargo: 'SDR' },
    ]);
  });
});

describe('/api/me', () => {
  it('traz mestre e as áreas; o módulo vem do vínculo', async () => {
    expect((await h.get('/api/me', diretor)).body).toMatchObject({
      role: 'DIRETOR',
      mestre: true,
      areas: [],
      modules: { mentoria: true },
    });
    expect((await h.get('/api/me', carla)).body).toMatchObject({
      mestre: false,
      areas: [{ area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true }],
      modules: { mentoria: true },
    });
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get('/api/me', ale)).body).toMatchObject({
      areas: [{ area: 'COMERCIAL', cargo: 'SDR', head: false }],
      modules: { mentoria: false },
    });
  });
});

describe('registro de acessos da Diretoria (GET admin/acessos)', () => {
  type Linha = {
    tipo: string;
    ator: { id: string; nome: string } | null;
    alvo: { id: string; nome: string } | null;
    area: string | null;
    cargo: string | null;
    head: boolean | null;
  };
  const registro = async () => {
    const r = await h.get('/api/admin/acessos', diretor);
    expect(r.status).toBe(200);
    return r.body as { items: Linha[]; total: number; hasMore: boolean; page: number };
  };

  it('só a Diretoria vê; os demais recebem 404', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    for (const cookie of [ronaldo, carla, ale])
      expect((await h.get('/api/admin/acessos', cookie)).status).toBe(404);
  });

  it('cada ação da tabela vira uma linha, com área e cargo; login e lead não aparecem', async () => {
    const op = ids['op.area']!;
    // As duas contas do beforeEach: conta criada.
    const antes = await registro();
    expect(antes.items.map((l) => l.tipo)).toEqual(['CONTA_CRIADA', 'CONTA_CRIADA']);
    expect(antes.items[1]).toMatchObject({
      ator: { id: ids.diretor, nome: 'Diretor' },
      alvo: { id: op, nome: 'Pessoa op.area' },
      area: 'ACOMPANHAMENTO',
      cargo: 'OPERACAO',
      head: false,
    });

    const doAc = await pedir('pedido.ac', 'ACOMPANHAMENTO');
    const aprovado = await h.post(
      `/api/admin/access-requests/${doAc}/approve`,
      { role: 'ACOMPANHAMENTO', perfil: 'ESPECIALISTA' },
      carla,
    );
    const doCom = await pedir('pedido.com', 'COMERCIAL');
    await h.del(`/api/admin/access-requests/${doCom}`, {}, ronaldo);
    await h.patch(`/api/admin/users/${op}`, { perfil: 'MENTOR' }, carla); // cargo trocado
    await h.patch(`/api/admin/users/${op}`, { moduloAdmin: true }, diretor); // selo dado
    await h.patch(`/api/admin/users/${op}`, { moduloAdmin: false }, diretor); // selo tirado
    await h.patch(
      `/api/admin/users/${ids.igor}`,
      { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' },
      diretor,
    ); // troca de área
    await h.patch(`/api/admin/users/${ids.igor}`, { role: 'DIRETOR' }, diretor); // Diretoria dada
    await h.patch(`/api/admin/users/${ids.igor}`, { role: 'SDR' }, diretor); // Diretoria tirada
    await h.post(`/api/admin/users/${op}/reset-password`, {}, carla);
    await h.post(`/api/admin/users/${op}/reset-mfa`, {}, carla);
    await h.patch(`/api/admin/users/${op}`, { active: false }, carla);
    await h.patch(`/api/admin/users/${op}`, { active: true }, carla);
    await h.patch(`/api/admin/users/${op}`, { name: 'Nome Novo' }, carla); // não é acesso
    // Login e lead não entram.
    const ale = await h.signIn('ale@npac.com.br');
    await h.post(
      '/api/leads',
      { name: 'Lead do registro', instagram: '@lead.registro', incomeBand: 'R5_8K', source: 'BIO' },
      ale,
    );

    const { items, total } = await registro();
    expect(items.map((l) => l.tipo).reverse()).toEqual([
      'CONTA_CRIADA',
      'CONTA_CRIADA',
      'PEDIDO_APROVADO',
      'PEDIDO_RECUSADO',
      'CARGO_TROCADO',
      'HEAD_DADO',
      'HEAD_TIRADO',
      'AREA_ADICIONADA',
      'AREA_REMOVIDA',
      'DIRETORIA_DADA',
      'DIRETORIA_TIRADA',
      'SENHA_REDEFINIDA',
      'MFA_ZERADO',
      'CONTA_DESATIVADA',
      'CONTA_REATIVADA',
    ]);
    expect(total).toBe(15);
    const por = (tipo: string) => items.find((l) => l.tipo === tipo)!;
    expect(por('PEDIDO_APROVADO')).toMatchObject({
      ator: { id: ids.carla },
      alvo: { id: aprovado.body.id, nome: 'Pedido Teste' },
      area: 'ACOMPANHAMENTO',
      cargo: 'ESPECIALISTA',
    });
    expect(por('PEDIDO_RECUSADO')).toMatchObject({ alvo: null, area: 'COMERCIAL' });
    expect(por('CARGO_TROCADO')).toMatchObject({ area: 'ACOMPANHAMENTO', cargo: 'MENTOR' });
    expect(por('HEAD_DADO')).toMatchObject({ area: 'ACOMPANHAMENTO', head: true });
    expect(por('AREA_ADICIONADA')).toMatchObject({
      alvo: { id: ids.igor },
      area: 'ACOMPANHAMENTO',
    });
    expect(por('AREA_REMOVIDA')).toMatchObject({ area: 'COMERCIAL' });
    expect(por('DIRETORIA_TIRADA')).toMatchObject({ area: 'COMERCIAL', cargo: 'SDR' });
    // O nome vem da conta na hora de ler (trocado depois da ação).
    expect(por('CONTA_DESATIVADA').alvo).toEqual({ id: op, nome: 'Nome Novo' });

    // A auditoria não guarda nome nem e-mail.
    const dump = JSON.stringify(await owner`select data from audit_log`);
    for (const pessoal of ['Pessoa op.area', 'Nome Novo', 'Pedido Teste', '@area.test'])
      expect(dump).not.toContain(pessoal);
  });

  it('pagina de 20 em 20', async () => {
    for (let i = 0; i < 20; i++)
      await h.post(`/api/admin/users/${ids['op.area']}/reset-mfa`, {}, diretor);
    const p1 = await registro();
    expect(p1.items).toHaveLength(20);
    expect(p1.hasMore).toBe(true);
    const p2 = (await h.get('/api/admin/acessos?page=2', diretor)).body;
    expect(p2.items).toHaveLength(2);
    expect(p2.hasMore).toBe(false);
  });
});
