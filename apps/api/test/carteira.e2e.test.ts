import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState, type Cookie } from './helpers.js';

// NPAC-54, Fase 3B: alcance "Só a carteira" no cargo Acompanhamento. A Carla (Acompanhamento) fica com
// "só a carteira": vê e cuida só das inscrições em que é a responsável; o resto do módulo dá 404.
// Quem grava o alcance: a Diretoria e o Admin do Acompanhamento, pelas rotas de sempre.
let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let diretor: Cookie;
let carla: Cookie;
let carlaId: string;
let outraId: string; // outra pessoa do Acompanhamento (todos os mentorados)
let minha: { id: string; version: number };
let outra: { id: string; version: number };

const INDIVIDUAL = {
  tipo: 'INDIVIDUAL',
  mentoria: 'RDV',
  pessoas: [{ nome: 'Mentorado Fictício Carteira' }],
};

const limpar = async () => {
  await owner`delete from account where user_id in (select id from "user" where email like '%@carteira.test')`;
  await owner`delete from "user" where email like '%@carteira.test'`;
};

const criar = async (cookie: Cookie, corpo: object) => {
  const r = await h.post('/api/mentoria/inscricoes', corpo, cookie);
  expect(r.status, r.text).toBe(201);
  return r.body as { id: string; version: number; responsavelId: string | null };
};

const alcanceDe = async (id: string) =>
  (
    await owner<{ alcance: string }[]>`
    select alcance from area_membros where user_id = ${id} and area = 'ACOMPANHAMENTO'`
  )[0]?.alcance;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [c] = await owner<
    { id: string }[]
  >`select id from "user" where email = 'carla@npac.com.br'`;
  carlaId = c!.id;
});
afterAll(async () => {
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  await limpar();
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await limpar();
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carlaId}, 'ACOMPANHAMENTO', false)`;
  diretor = await h.signIn('diretor@npac.com.br');
  const conv = await h.post(
    '/api/admin/users',
    {
      name: 'Outra Pessoa',
      email: 'outra@carteira.test',
      username: 'outra.carteira',
      role: 'ACOMPANHAMENTO',
      perfil: 'ACOMPANHAMENTO',
    },
    diretor,
  );
  expect(conv.status, conv.text).toBe(201);
  outraId = (conv.body as { id: string }).id;
  minha = await criar(diretor, { ...INDIVIDUAL, responsavelId: carlaId });
  outra = await criar(diretor, { ...INDIVIDUAL, responsavelId: outraId });
  // A Diretoria põe "só a carteira" pela aba Perfis.
  const p = await h.put(
    '/api/mentoria/perfis',
    { userId: carlaId, perfil: 'ACOMPANHAMENTO', admin: false, alcance: 'CARTEIRA' },
    diretor,
  );
  expect(p.status, p.text).toBe(200);
  carla = await h.signIn('carla@npac.com.br');
});

describe('o que "só a carteira" vê', () => {
  it('GET eu diz soCarteira', async () => {
    expect((await h.get('/api/mentoria/eu', carla)).body).toEqual({
      perfil: 'ACOMPANHAMENTO',
      admin: false,
      soCarteira: true,
    });
  });

  it('lista e ficha: só a carteira; a outra é 404', async () => {
    const l = await h.post('/api/mentoria/inscricoes/lista', {}, carla);
    expect(l.status, l.text).toBe(200);
    const ids = (l.body as { itens: { id: string }[] }).itens.map((i) => i.id);
    expect(ids).toEqual([minha.id]);
    expect((await h.get(`/api/mentoria/inscricoes/${minha.id}`, carla)).status).toBe(200);
    expect((await h.get(`/api/mentoria/inscricoes/${outra.id}`, carla)).status).toBe(404);
    expect((await h.get(`/api/mentoria/inscricoes/${outra.id}/historico`, carla)).status).toBe(404);
  });

  it('Fila: sempre a "Minha fila", mesmo pedindo a Equipe', async () => {
    const r = await h.post('/api/mentoria/fila', { escopo: 'EQUIPE' }, carla);
    expect(r.status, r.text).toBe(200);
    const body = r.body as { escopo: string; itens: { inscricaoId: string | null }[] };
    expect(body.escopo).toBe('MINHA');
    for (const i of body.itens) if (i.inscricaoId) expect(i.inscricaoId).toBe(minha.id);
  });

  it('CSV de Mentorados: só a carteira (a)', async () => {
    const r = await h.post('/api/mentoria/exportar', { aba: 'MENTORADOS' }, carla);
    expect(r.status, r.text).toBe(200);
    const linhas = r.text.trim().split(/\r?\n/);
    expect(linhas).toHaveLength(2); // cabeçalho + a da carteira
  });

  it('o que é só do Admin continua 404', async () => {
    expect((await h.get('/api/mentoria/perfis', carla)).status).toBe(404);
    expect((await h.del(`/api/mentoria/inscricoes/${minha.id}`, {}, carla)).status).toBe(404);
    expect(
      (await h.post('/api/mentoria/carteira/transferir', { de: carlaId, para: outraId }, carla))
        .status,
    ).toBe(404);
  });

  it('inscrição que sai da carteira some na hora (d)', async () => {
    const r = await h.patch(
      `/api/mentoria/inscricoes/${minha.id}`,
      { version: minha.version, responsavelId: outraId },
      diretor,
    );
    expect(r.status, r.text).toBe(200);
    expect((await h.get(`/api/mentoria/inscricoes/${minha.id}`, carla)).status).toBe(404);
  });
});

describe('o que "só a carteira" faz', () => {
  it('cadastra mentorado já na carteira dela (2A), mesmo pedindo outro responsável', async () => {
    const sem = await criar(carla, INDIVIDUAL);
    expect(sem.responsavelId).toBe(carlaId);
    const outro = await criar(carla, { ...INDIVIDUAL, responsavelId: outraId });
    expect(outro.responsavelId).toBe(carlaId);
  });

  it('edita a carteira, mas não passa o mentorado para outra pessoa (e)', async () => {
    const ok = await h.patch(
      `/api/mentoria/inscricoes/${minha.id}`,
      { version: minha.version, linkGrupo: 'https://chat.whatsapp.com/teste' },
      carla,
    );
    expect(ok.status, ok.text).toBe(200);
    const troca = await h.patch(
      `/api/mentoria/inscricoes/${minha.id}`,
      { version: (ok.body as { version: number }).version, responsavelId: outraId },
      carla,
    );
    expect(troca.status).toBe(403);
    const fora = await h.patch(
      `/api/mentoria/inscricoes/${outra.id}`,
      { version: outra.version, linkGrupo: 'https://chat.whatsapp.com/teste' },
      carla,
    );
    expect(fora.status).toBe(404);
  });
});

describe('gravar o alcance', () => {
  it('a Diretoria convida com "só a carteira" e a lista mostra; troca para todos pelo PATCH', async () => {
    const c = await h.post(
      '/api/admin/users',
      {
        name: 'Maria Carteira',
        email: 'maria@carteira.test',
        username: 'maria.carteira',
        role: 'ACOMPANHAMENTO',
        perfil: 'ACOMPANHAMENTO',
        alcance: 'CARTEIRA',
      },
      diretor,
    );
    expect(c.status, c.text).toBe(201);
    const id = (c.body as { id: string }).id;
    expect(await alcanceDe(id)).toBe('CARTEIRA');
    const lista = (await h.get('/api/admin/users', diretor)).body as {
      id: string;
      alcance: string | null;
    }[];
    expect(lista.find((u) => u.id === id)?.alcance).toBe('CARTEIRA');
    expect(lista.find((u) => u.id === outraId)?.alcance).toBe('TODOS');
    const p = await h.patch(`/api/admin/users/${id}`, { alcance: 'TODOS' }, diretor);
    expect(p.status, p.text).toBe(200);
    expect(await alcanceDe(id)).toBe('TODOS');
    // Trocar de cargo volta a "todos" (o alcance só vale no cargo Acompanhamento).
    await h.patch(`/api/admin/users/${id}`, { alcance: 'CARTEIRA' }, diretor);
    await h.patch(`/api/admin/users/${id}`, { perfil: 'OPERACAO' }, diretor);
    expect(await alcanceDe(id)).toBe('TODOS');
  });

  it('"Só a carteira" em outro cargo: 400', async () => {
    const sdr = await h.post(
      '/api/admin/users',
      {
        name: 'Sdr Carteira',
        email: 'sdr@carteira.test',
        username: 'sdr.carteira',
        role: 'SDR',
        alcance: 'CARTEIRA',
      },
      diretor,
    );
    expect(sdr.status).toBe(400);
    const op = await h.put(
      '/api/mentoria/perfis',
      { userId: outraId, perfil: 'OPERACAO', admin: false, alcance: 'CARTEIRA' },
      diretor,
    );
    expect(op.status).toBe(400);
  });

  it('o Admin do Acompanhamento troca o alcance de outra pessoa, não o próprio', async () => {
    await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
    await owner`insert into mentoria_perfis (user_id, perfil, admin) values (${carlaId}, 'ACOMPANHAMENTO', true)`;
    const adm = await h.signIn('carla@npac.com.br');
    const r = await h.put(
      '/api/mentoria/perfis',
      { userId: outraId, perfil: 'ACOMPANHAMENTO', admin: false, alcance: 'CARTEIRA' },
      adm,
    );
    expect(r.status, r.text).toBe(200);
    expect(await alcanceDe(outraId)).toBe('CARTEIRA');
    const proprio = await h.put(
      '/api/mentoria/perfis',
      { userId: carlaId, perfil: 'ACOMPANHAMENTO', admin: true, alcance: 'TODOS' },
      adm,
    );
    expect(proprio.status).toBe(400);
  });

  it('o registro de acessos da Diretoria mostra "só a carteira"', async () => {
    const r = await h.get('/api/admin/acessos?page=1', diretor);
    expect(r.status, r.text).toBe(200);
    const itens = (
      r.body as { items: { tipo: string; alcance?: string; alvo: { id: string } | null }[] }
    ).items;
    expect(
      itens.some(
        (i) => i.tipo === 'CARGO_TROCADO' && i.alcance === 'CARTEIRA' && i.alvo?.id === carlaId,
      ),
    ).toBe(true);
  });
});
