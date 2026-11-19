import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UltimoUso } from '../src/auth/ultimo-uso.js';
import {
  api,
  closeTestApp,
  cookiesOf,
  createTestApp,
  owner,
  resetAuthState,
  type Cookie,
} from './helpers.js';

// "Entrou há X" (NPAC-54, Fase 3, D12/M12/M13): a última vez que a pessoa usou o sistema, guardada
// na conta (no máximo uma gravação a cada 15 min), devolvida em GET admin/users como `ultimoUso`.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;

type Linha = { id: string; email: string; ultimoUso: string | null };
const lista = async (cookie: Cookie) => (await h.get('/api/admin/users', cookie)).body as Linha[];
const doBanco = async (id: string) => {
  const [r] = await owner<
    { u: Date | null }[]
  >`select ultimo_uso as u from "user" where id = ${id}`;
  return r!.u;
};
const limpar = async () => {
  await owner`delete from account where user_id in (select id from "user" where email like '%@uso.test')`;
  await owner`delete from "user" where email like '%@uso.test'`;
};

/** Convida pela Diretoria e entra com a senha temporária. */
const contaNova = async (diretor: Cookie, nome: string, corpo: object = { role: 'SDR' }) => {
  const r = await h.post(
    '/api/admin/users',
    { name: `Pessoa ${nome}`, email: `${nome}@uso.test`, username: nome, ...corpo },
    diretor,
  );
  expect(r.status).toBe(201);
  const { id, temporaryPassword } = r.body as { id: string; temporaryPassword: string };
  return {
    id,
    entrar: async () => cookiesOf(await h.signInRaw(`${nome}@uso.test`, temporaryPassword)),
  };
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await limpar();
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await limpar();
});

describe('ultimoUso em GET admin/users', () => {
  it('conta nova vem nula ("nunca entrou")', async () => {
    const diretor = await h.signIn('diretor@npac.com.br');
    const { id } = await contaNova(diretor, 'nunca');
    const linha = (await lista(diretor)).find((u) => u.id === id);
    expect(linha).toBeDefined();
    expect(linha!.ultimoUso).toBeNull();
  });

  it('um pedido autenticado grava; o seguinte não grava de novo; o Sair não apaga', async () => {
    const diretor = await h.signIn('diretor@npac.com.br');
    const { id, entrar } = await contaNova(diretor, 'usou');
    const cookie = await entrar();
    // Login só cria a sessão; o uso conta no primeiro pedido com ela (M12).
    expect((await h.get('/api/me', cookie)).status).toBe(200);
    const primeiro = await doBanco(id);
    expect(primeiro).not.toBeNull();
    expect(Date.now() - primeiro!.getTime()).toBeLessThan(60_000);

    const linha = (await lista(diretor)).find((u) => u.id === id)!;
    expect(new Date(linha.ultimoUso!).getTime()).toBe(primeiro!.getTime());

    // Dois pedidos seguidos gravam uma vez só.
    await h.get('/api/me', cookie);
    await h.get('/api/me', cookie);
    expect((await doBanco(id))!.getTime()).toBe(primeiro!.getTime());

    // Sair apaga a sessão, não o último uso.
    expect((await h.post('/api/auth/sign-out', {}, cookie)).status).toBe(200);
    expect((await doBanco(id))!.getTime()).toBe(primeiro!.getTime());
  });

  it('passados 15 minutos grava de novo (e o banco recusa gravar antes, entre instâncias)', async () => {
    const diretor = await h.signIn('diretor@npac.com.br');
    const { id, entrar } = await contaNova(diretor, 'volta');
    await h.get('/api/me', await entrar());
    const uso = app.get(UltimoUso);

    // Outra instância (sem memória) tenta gravar 1 min depois: o UPDATE confere a data no banco.
    await owner`update "user" set ultimo_uso = now() - interval '1 minute' where id = ${id}`;
    const umMinuto = (await doBanco(id))!.getTime();
    await uso.marcar(id, Date.now() + 16 * 60_000);
    expect((await doBanco(id))!.getTime()).toBe(umMinuto);

    // 20 min depois, grava.
    await owner`update "user" set ultimo_uso = now() - interval '20 minutes' where id = ${id}`;
    await uso.marcar(id, Date.now() + 32 * 60_000);
    expect(Date.now() - (await doBanco(id))!.getTime()).toBeLessThan(60_000);
  });

  it('o Head recebe o último uso só das contas da área dele', async () => {
    const diretor = await h.signIn('diretor@npac.com.br');
    const { id } = await contaNova(diretor, 'operacao', {
      role: 'ACOMPANHAMENTO',
      perfil: 'OPERACAO',
    });
    await owner`update "user" set ultimo_uso = now() where id = ${id}`;
    const ana = await h.signIn('ana@npac.com.br');
    const comercial = await lista(ana);
    expect(comercial.find((u) => u.id === id)).toBeUndefined();
    expect(comercial.every((u) => 'ultimoUso' in u)).toBe(true);

    // Carla como Admin do Acompanhamento (Head da área, M2): vê a conta nova com o último uso.
    await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      select id, 'ACOMPANHAMENTO', true from "user" where email = 'carla@npac.com.br'`;
    const carla = await h.signIn('carla@npac.com.br');
    const acomp = await lista(carla);
    expect(acomp.find((u) => u.id === id)?.ultimoUso).not.toBeNull();
    expect(acomp.some((u) => u.email === 'ana@npac.com.br')).toBe(false);
  });
});
