import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  api,
  closeTestApp,
  cookiesOf,
  createTestApp,
  owner,
  resetAuthState,
  type Cookie,
} from './helpers.js';

// NPAC-56, Parte 2: o cargo Envios (a Maria) entra no módulo só pela aba Envios físicos. Vê nome, endereço
// e a foto do presente; marca enviado (rastreio) e entregue; tudo fora de `mentoria/envios`, `mentoria/eu`
// e da foto do presente é 404. A Caixa entregue pela aba conclui a etapa Caixa do onboarding.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let diretor: Cookie;
let carla: Cookie; // Admin do Acompanhamento (Head da área)
let maria: Cookie;
let mariaId: string;

type Envio = {
  id: string | null;
  inscricaoId: string;
  tipo: string;
  status: string;
  nomes: string[];
  endereco: string | null;
  cep: string | null;
  fotoMidiaId: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  rastreio: string | null;
  version: number;
};
type Envios = { hoje: string; aEnviar: Envio[]; emTransito: Envio[]; entregues: Envio[] };

const envios = async (cookie: Cookie): Promise<Envios> => {
  const r = await h.get('/api/mentoria/envios', cookie);
  expect(r.status, r.text).toBe(200);
  return r.body as Envios;
};
const marcar = (cookie: Cookie, e: Envio, status: 'ENVIADO' | 'ENTREGUE', extra: object = {}) =>
  h.post(
    '/api/mentoria/envios/marcar',
    {
      inscricaoId: e.inscricaoId,
      tipo: e.tipo,
      envioId: e.id,
      version: e.version,
      status,
      data: '2026-11-20',
      ...extra,
    },
    cookie,
  );

type Etapa = { id: string; etapa: string; status: string; version: number };
type Ficha = { id: string; onboarding: Etapa[]; endereco: { version: number } | null };

/** Inscrição pela Diretoria, com endereço e o formulário do endereço marcado (G8). */
async function inscricaoComCaixa(nome = 'Mentorado Fictício Envio'): Promise<string> {
  const r = await h.post(
    '/api/mentoria/inscricoes',
    { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome }] },
    diretor,
  );
  expect(r.status, r.text).toBe(201);
  const id = (r.body as Ficha).id;
  const end = await h.put(
    `/api/mentoria/inscricoes/${id}/endereco`,
    { version: 0, endereco: 'Rua das Acácias, 120 · São Paulo/SP', cep: '01415-000' },
    diretor,
  );
  expect(end.status, end.text).toBe(200);
  const bv = (r.body as Ficha).onboarding.find((e) => e.etapa === 'BOAS_VINDAS')!;
  const f = await h.patch(
    `/api/mentoria/onboarding/${bv.id}`,
    { version: bv.version, formularioPreenchido: true },
    diretor,
  );
  expect(f.status, f.text).toBe(200);
  return id;
}

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@envios.test')`;
  await owner`delete from "user" where email like '%@envios.test'`;
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@envios.test')`;
  await owner`delete from "user" where email like '%@envios.test'`;
  await owner`delete from mentoria_perfis where user_id = (select id from "user" where email = 'carla@npac.com.br')`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin)
    select id, 'ACOMPANHAMENTO', true from "user" where email = 'carla@npac.com.br'`;
  diretor = await h.signIn('diretor@npac.com.br');
  carla = await h.signIn('carla@npac.com.br');
  // A Admin do Acompanhamento convida a Maria com o cargo Envios (D6: Head da área convida).
  const r = await h.post(
    '/api/admin/users',
    {
      name: 'Maria Envios',
      email: 'maria@envios.test',
      username: 'maria.envios',
      role: 'ACOMPANHAMENTO',
      perfil: 'ENVIOS',
    },
    carla,
  );
  expect(r.status, r.text).toBe(201);
  mariaId = r.body.id;
  await owner`update "user" set must_change_password = false where id = ${mariaId}`;
  const login = await h.signInRaw('maria.envios@x', r.body.temporaryPassword);
  expect(login.status, login.text).toBe(200);
  maria = cookiesOf(login);
});

describe('cargo Envios', () => {
  it('a Admin do Acompanhamento convida com o cargo Envios; o Head do Comercial não', async () => {
    const [m] = await owner<{ cargo: string; head: boolean }[]>`
      select cargo, head from area_membros where user_id = ${mariaId} and area = 'ACOMPANHAMENTO'`;
    expect(m).toEqual({ cargo: 'ENVIOS', head: false });
    expect((await h.get('/api/mentoria/eu', maria)).body).toEqual({
      perfil: 'ENVIOS',
      admin: false,
      soCarteira: false,
    });
    const ronaldo = await h.signIn('ronaldo@npac.com.br');
    const r = await h.post(
      '/api/admin/users',
      {
        name: 'Outra Envios',
        email: 'outra@envios.test',
        username: 'outra.envios',
        role: 'ACOMPANHAMENTO',
        perfil: 'ENVIOS',
      },
      ronaldo,
    );
    expect(r.status).toBe(403);
  });

  it('fora da aba, tudo do módulo e do comercial é 404 para ela', async () => {
    const id = await inscricaoComCaixa();
    for (const [metodo, path] of [
      ['get', `/api/mentoria/inscricoes/${id}`],
      ['post', '/api/mentoria/inscricoes/lista'],
      ['post', '/api/mentoria/fila'],
      ['post', '/api/mentoria/onboarding/painel'],
      ['post', '/api/mentoria/reunioes/agenda'],
      ['post', '/api/mentoria/busca'],
      ['get', '/api/mentoria/perfis'],
      ['get', '/api/mentoria/responsaveis'],
      ['get', '/api/leads?page=1'],
    ] as const) {
      const r = metodo === 'get' ? await h.get(path, maria) : await h.post(path, {}, maria);
      expect({ path, status: r.status }).toEqual({ path, status: 404 });
    }
  });

  it('a Especialista não abre a aba (404)', async () => {
    await owner`update area_membros set cargo = 'ESPECIALISTA'
      where user_id = ${mariaId} and area = 'ACOMPANHAMENTO'`;
    expect((await h.get('/api/mentoria/envios', maria)).status).toBe(404);
  });
});

describe('aba Envios físicos', () => {
  it('a Maria vê a Caixa com nome, endereço e CEP, sem contato nem valor, e a envia e entrega', async () => {
    const id = await inscricaoComCaixa();
    const lista = await envios(maria);
    expect(lista.emTransito).toEqual([]);
    expect(lista.aEnviar).toHaveLength(1);
    const [caixa] = lista.aEnviar;
    expect(Object.keys(caixa!)).toEqual([
      'id',
      'inscricaoId',
      'tipo',
      'status',
      'nomes',
      'endereco',
      'cep',
      'fotoMidiaId',
      'enviadoEm',
      'entregueEm',
      'rastreio',
      'version',
    ]);
    expect(caixa).toMatchObject({
      id: null,
      inscricaoId: id,
      tipo: 'CAIXA',
      status: 'PREPARANDO',
      nomes: ['Mentorado Fictício Envio'],
      endereco: 'Rua das Acácias, 120 · São Paulo/SP',
      cep: '01415000',
      version: 0,
    });

    const env = await marcar(maria, caixa!, 'ENVIADO', { rastreio: 'BR123456789BR' });
    expect(env.status, env.text).toBe(200);
    const [emTransito] = (await envios(maria)).emTransito;
    expect(emTransito).toMatchObject({ tipo: 'CAIXA', rastreio: 'BR123456789BR' });

    // A mesma leitura de antes (outra aba): conflito.
    expect((await marcar(maria, caixa!, 'ENVIADO')).status).toBe(409);

    const ent = await marcar(maria, emTransito!, 'ENTREGUE', { data: '2026-11-22' });
    expect(ent.status, ent.text).toBe(200);
    expect((await envios(maria)).entregues.map((e) => e.inscricaoId)).toEqual([id]);

    const ficha = (await h.get(`/api/mentoria/inscricoes/${id}`, diretor)).body as Ficha;
    expect(ficha.onboarding.find((e) => e.etapa === 'CAIXA')!.status).toBe('CONCLUIDA');
  });

  it('kit criado pela Admin aparece para a Maria; ela não cria envio (404)', async () => {
    const id = await inscricaoComCaixa();
    const r = await h.post('/api/mentoria/envios', { inscricaoId: id, tipo: 'KIT' }, carla);
    expect(r.status, r.text).toBe(201);
    expect((await envios(maria)).aEnviar.map((e) => e.tipo).sort()).toEqual(['CAIXA', 'KIT']);
    expect(
      (await h.post('/api/mentoria/envios', { inscricaoId: id, tipo: 'KIT' }, maria)).status,
    ).toBe(404);
    expect(
      (await h.post('/api/mentoria/envios', { inscricaoId: id, tipo: 'CAIXA' }, carla)).status,
    ).toBe(400);
  });

  it('a regra da data volta em português', async () => {
    await inscricaoComCaixa();
    const [caixa] = (await envios(maria)).aEnviar;
    const r = await marcar(maria, caixa!, 'ENVIADO', { data: null });
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Informe a data de envio');
  });
});
