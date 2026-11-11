import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';

// Cargos em um passo (spec 2026-11-11-cargos-design): um campo só grava cargo, caixas e perfil.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let diretor: string, head: string;
let ids: Record<string, string>;

const limpar = async () => {
  await owner`delete from mentoria_perfis where user_id in (select id from "user" where email like '%@cargo.test')`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@cargo.test')`;
  await owner`delete from "user" where email like '%@cargo.test'`;
  await owner`delete from access_requests`;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await limpar();
  await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false where email = 'ale@npac.com.br'`;
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await limpar();
  await owner`truncate lead_timeline, notifications, form_responses, leads cascade`;
  await owner`update "user" set role = 'SDR', can_prospect = true, can_close = false where email = 'ale@npac.com.br'`;
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
  const users = await owner<{ id: string; email: string }[]>`select id, email from "user"`;
  ids = Object.fromEntries(users.map((u) => [u.email.split('@')[0], u.id]));
  diretor = await h.signIn('ana@npac.com.br');
  head = await h.signIn('ronaldo@npac.com.br');
});

const convidar = (cookie: string, corpo: object, nome = 'pessoa') =>
  h.post(
    '/api/admin/users',
    { name: 'Pessoa Nova', email: `${nome}@cargo.test`, username: nome, ...corpo },
    cookie,
  );

const gravado = async (id: string) =>
  (
    await owner<
      {
        role: string;
        can_prospect: boolean;
        can_close: boolean;
        perfil: string | null;
        admin: boolean | null;
      }[]
    >`select u.role, u.can_prospect, u.can_close, p.perfil, p.admin
      from "user" u left join mentoria_perfis p on p.user_id = u.id where u.id = ${id}`
  )[0]!;

describe('convite', () => {
  it('cada cargo grava as caixas certas; Acompanhamento já nasce com perfil', async () => {
    const casos: [object, object][] = [
      [{ role: 'SDR' }, { role: 'SDR', can_prospect: true, can_close: false, perfil: null }],
      [{ role: 'CLOSER' }, { role: 'CLOSER', can_prospect: false, can_close: true }],
      [
        { role: 'HEAD', canClose: true },
        { role: 'HEAD', can_prospect: false, can_close: true },
      ],
      [{ role: 'DIRETOR' }, { role: 'DIRETOR', can_prospect: false, can_close: false }],
      [
        { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' },
        { role: 'ACOMPANHAMENTO', can_prospect: false, perfil: 'OPERACAO', admin: false },
      ],
      [
        { role: 'ACOMPANHAMENTO', perfil: 'ACOMPANHAMENTO', moduloAdmin: true },
        { role: 'ACOMPANHAMENTO', perfil: 'ACOMPANHAMENTO', admin: true },
      ],
    ];
    for (const [i, [corpo, esperado]] of casos.entries()) {
      const r = await convidar(diretor, corpo, `pessoa${i}`);
      expect(r.status, JSON.stringify(corpo)).toBe(201);
      expect(await gravado(r.body.id)).toMatchObject(esperado);
    }
  });

  it('Acompanhamento sem perfil, caixa contrária ou perfil em outro cargo: 400', async () => {
    const semPerfil = await convidar(diretor, { role: 'ACOMPANHAMENTO' });
    expect(semPerfil.status).toBe(400);
    expect(semPerfil.body.message).toBe('Escolha o perfil do Acompanhamento');
    const contraria = await convidar(diretor, { role: 'SDR', canClose: true });
    expect(contraria.status).toBe(400);
    expect(contraria.body.message).toBe('Esse cargo não aceita essa opção');
    expect((await convidar(diretor, { role: 'CLOSER', canProspect: true })).status).toBe(400);
    expect((await convidar(diretor, { role: 'SDR', perfil: 'OPERACAO' })).status).toBe(400);
    expect((await owner`select 1 from "user" where email like '%@cargo.test'`).length).toBe(0);
  });

  it('Head só dá SDR e Closer', async () => {
    expect((await convidar(head, { role: 'SDR' })).status).toBe(201);
    expect((await convidar(head, { role: 'HEAD' }, 'head2')).status).toBe(403);
    const acomp = await convidar(head, { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' }, 'acomp2');
    expect(acomp.status).toBe(403);
    expect(acomp.body.message).toBe('Só a Diretoria pode dar cargo de Acompanhamento');
  });

  it('audita só os nomes dos campos', async () => {
    await convidar(diretor, { role: 'ACOMPANHAMENTO', perfil: 'MENTOR' });
    const [log] = await owner<{ data: { fields: string[] } }[]>`
      select data from audit_log where action = 'admin.user.invite'`;
    expect(log!.data.fields).toEqual(['role', 'canProspect', 'canClose', 'perfil', 'moduloAdmin']);
    const perfil = await owner`select 1 from audit_log where action = 'mentoria.perfil.definido'`;
    expect(perfil).toHaveLength(1);
  });

  it('a conta do Acompanhamento entra direto no módulo', async () => {
    const r = await convidar(diretor, { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' });
    await owner`update "user" set must_change_password = false where id = ${r.body.id}`;
    const login = await h.signInRaw('pessoa@x', r.body.temporaryPassword);
    expect(login.status).toBe(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    expect((await h.get('/api/mentoria/eu', cookie)).body).toEqual({
      perfil: 'OPERACAO',
      admin: false,
    });
  });
});

describe('troca de cargo', () => {
  const patch = (id: string, corpo: object, cookie = diretor) =>
    h.patch(`/api/admin/users/${id}`, corpo, cookie);

  it('SDR promovido a Head continua atuando como SDR', async () => {
    expect((await patch(ids.ale!, { role: 'HEAD' })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({ role: 'HEAD', can_prospect: true });
    expect((await patch(ids.ale!, { canClose: true })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({ can_prospect: true, can_close: true });
    // Volta a SDR: o cargo redefine as caixas.
    expect((await patch(ids.ale!, { role: 'SDR' })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({ can_prospect: true, can_close: false });
  });

  it('caixa contrária ao cargo atual é recusada', async () => {
    const r = await patch(ids.ale!, { canClose: true }, head);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Esse cargo não aceita essa opção');
  });

  it('virar Acompanhamento exige perfil e grava junto; sair apaga o perfil', async () => {
    expect((await patch(ids.ale!, { role: 'ACOMPANHAMENTO' })).status).toBe(400);
    expect(await gravado(ids.ale!)).toMatchObject({ role: 'SDR' });
    expect((await patch(ids.ale!, { role: 'ACOMPANHAMENTO', perfil: 'ESPECIALISTA' })).status).toBe(
      200,
    );
    expect(await gravado(ids.ale!)).toMatchObject({
      role: 'ACOMPANHAMENTO',
      can_prospect: false,
      can_close: false,
      perfil: 'ESPECIALISTA',
      admin: false,
    });
    // Só o selo ou só o perfil, em quem já é Acompanhamento.
    expect((await patch(ids.ale!, { moduloAdmin: true })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({ perfil: 'ESPECIALISTA', admin: true });
    expect((await patch(ids.ale!, { perfil: 'MENTOR' })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({ perfil: 'MENTOR', admin: true });
    // Sai do Acompanhamento.
    expect((await patch(ids.ale!, { role: 'SDR' })).status).toBe(200);
    expect(await gravado(ids.ale!)).toMatchObject({
      role: 'SDR',
      can_prospect: true,
      perfil: null,
    });
  });

  it('perfil ou selo em quem não é Acompanhamento: 400', async () => {
    expect((await patch(ids.sonia!, { perfil: 'OPERACAO' })).status).toBe(400);
    expect((await patch(ids.sonia!, { moduloAdmin: true })).status).toBe(400);
  });

  it('conta antiga sem perfil precisa escolher um', async () => {
    expect((await patch(ids.carla!, { moduloAdmin: true })).status).toBe(400);
    expect((await patch(ids.carla!, { perfil: 'OPERACAO' })).status).toBe(200);
    expect(await gravado(ids.carla!)).toMatchObject({ perfil: 'OPERACAO' });
  });

  it('Head não mexe em liderança nem em Acompanhamento', async () => {
    expect((await patch(ids.ale!, { role: 'HEAD' }, head)).status).toBe(403);
    expect(
      (await patch(ids.ale!, { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' }, head)).status,
    ).toBe(403);
    expect((await patch(ids.carla!, { perfil: 'OPERACAO' }, head)).status).toBe(403);
  });

  it('audita os campos gravados', async () => {
    await patch(ids.ale!, { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' });
    const [log] = await owner<{ data: { fields: string[] } }[]>`
      select data from audit_log where action = 'admin.user.update'`;
    expect(log!.data.fields).toEqual(['role', 'perfil', 'canProspect', 'canClose', 'moduloAdmin']);
  });
});

describe('lista do Admin', () => {
  it('Diretoria vê o perfil do Acompanhamento; Head não', async () => {
    await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${ids.carla!}, 'OPERACAO', true)`;
    const doDiretor = await h.get('/api/admin/users', diretor);
    expect(doDiretor.body.find((u: { id: string }) => u.id === ids.carla)).toMatchObject({
      perfil: 'OPERACAO',
      moduloAdmin: true,
    });
    expect(doDiretor.body.find((u: { id: string }) => u.id === ids.ale)).toMatchObject({
      perfil: null,
      moduloAdmin: null,
    });
    const doHead = await h.get('/api/admin/users', head);
    expect(doHead.body.find((u: { id: string }) => u.id === ids.carla)).toMatchObject({
      perfil: null,
      moduloAdmin: null,
    });
  });
});

describe('pedido de acesso', () => {
  const pedir = () =>
    h.post('/api/auth/request-access', {
      name: 'Pedido Novo',
      username: 'pedido.novo',
      email: 'pedido@cargo.test',
      password: '123',
    });
  const pedidoId = async () =>
    (await owner<{ id: string }[]>`select id from access_requests`)[0]!.id;

  it('aprovar como Operação cria a conta já com perfil', async () => {
    await pedir();
    const r = await h.post(
      `/api/admin/access-requests/${await pedidoId()}/approve`,
      { role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' },
      diretor,
    );
    expect(r.status).toBe(201);
    expect(await gravado(r.body.id)).toMatchObject({
      role: 'ACOMPANHAMENTO',
      can_prospect: false,
      perfil: 'OPERACAO',
    });
  });

  it('aprovar sem perfil ou com caixa contrária é recusado e o pedido fica', async () => {
    await pedir();
    const id = await pedidoId();
    const url = `/api/admin/access-requests/${id}/approve`;
    expect((await h.post(url, { role: 'ACOMPANHAMENTO' }, diretor)).status).toBe(400);
    expect((await h.post(url, { role: 'CLOSER', canProspect: true }, head)).status).toBe(400);
    expect((await h.post(url, { role: 'ACOMPANHAMENTO', perfil: 'MENTOR' }, head)).status).toBe(
      403,
    );
    expect(await owner`select 1 from access_requests`).toHaveLength(1);
    const ok = await h.post(url, { role: 'CLOSER' }, head);
    expect(ok.status).toBe(201);
    expect(await gravado(ok.body.id)).toMatchObject({ can_prospect: false, can_close: true });
  });
});

describe('aba Perfis do módulo', () => {
  it('não aceita mais tirar o perfil (null)', async () => {
    const r = await request(app.getHttpServer())
      .put('/api/mentoria/perfis')
      .set('Origin', ORIGIN)
      .set('Cookie', diretor)
      .send({ userId: ids.carla, perfil: null, admin: false });
    expect(r.status).toBe(400);
  });
});
