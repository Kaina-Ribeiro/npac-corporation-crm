import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { ModulesContainer } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REQUIRES_MFA } from '../src/auth/requires-mfa.decorator.js';
import { api, closeTestApp, createTestApp, ORIGIN, owner, resetAuthState } from './helpers.js';
import { jpegComExif } from './media-fixtures.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carlaId: string;

const put = (path: string, body: object, cookie: string) =>
  request(app.getHttpServer()).put(path).set('Origin', ORIGIN).set('Cookie', cookie).send(body);

const enviar = (path: string, arquivo: Buffer, nome: string, cookie: string) =>
  request(app.getHttpServer())
    .post(path)
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .attach('arquivo', arquivo, { filename: nome, contentType: 'image/jpeg' });

/** Carla, o único cargo Acompanhamento do seed, com o perfil pedido (ou sem nenhum). */
const comoPerfil = async (perfil: string | null, admin = false) => {
  await owner`delete from mentoria_perfis where user_id = ${carlaId}`;
  if (perfil)
    await owner`insert into mentoria_perfis (user_id, perfil, admin)
      values (${carlaId}, ${perfil}, ${admin})`;
  return h.signIn('carla@npac.com.br');
};
const duda = () => comoPerfil('ACOMPANHAMENTO', true);

const INDIVIDUAL = {
  tipo: 'INDIVIDUAL',
  mentoria: 'RDV',
  pessoas: [
    { nome: 'Mentorado Fictício 01', whatsapp: '(11) 99999-0001', email: 'Um@Exemplo.COM' },
  ],
};
const CASAL = {
  tipo: 'CASAL',
  mentoria: '2M',
  pessoas: [
    { nome: 'Mentorada Fictícia 02', whatsapp: '11999990002' },
    { nome: 'Mentorado Fictício 03', email: 'tres@exemplo.com' },
  ],
};

type Ficha = {
  id: string;
  version: number;
  tipo: string;
  pessoas: { id: string; ordem: number; version: number; whatsapp: string | null }[];
  momento: { version: number; dor: string | null; travadoEm: string | null } | null;
  endereco: { version: number; endereco: string | null } | null;
};

const criar = async (cookie: string, corpo: object = INDIVIDUAL): Promise<Ficha> => {
  const r = await h.post('/api/mentoria/inscricoes', corpo, cookie);
  expect(r.status, r.text).toBe(201);
  return r.body as Ficha;
};
const abrir = async (cookie: string, id: string): Promise<Ficha> => {
  const r = await h.get(`/api/mentoria/inscricoes/${id}`, cookie);
  expect(r.status, r.text).toBe(200);
  return r.body as Ficha;
};

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
  const [c] = await owner<
    { id: string }[]
  >`select id from "user" where email = 'carla@npac.com.br'`;
  carlaId = c!.id;
});
afterAll(async () => {
  await owner`delete from mentoria_perfis`;
  await owner`truncate mentoria_inscricoes cascade`;
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  await owner`truncate mentoria_inscricoes cascade`;
  await owner`delete from mentoria_perfis`;
});

describe('acesso por perfil', () => {
  it('GET eu devolve perfil e admin', async () => {
    const s = await duda();
    const r = await h.get('/api/mentoria/eu', s);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ perfil: 'ACOMPANHAMENTO', admin: true });
    const d = await h.signIn('diretor@npac.com.br');
    expect((await h.get('/api/mentoria/eu', d)).body).toEqual({ perfil: null, admin: true });
  });

  it('cargo sem perfil recebe 404 em tudo menos eu', async () => {
    const s = await comoPerfil(null);
    expect((await h.get('/api/mentoria/eu', s)).body).toEqual({ perfil: null, admin: false });
    expect((await h.post('/api/mentoria/inscricoes/lista', {}, s)).status).toBe(404);
    expect((await h.post('/api/mentoria/busca', { termo: 'x' }, s)).status).toBe(404);
    expect((await h.get('/api/mentoria/condutores', s)).status).toBe(404);
    expect((await h.get('/api/mentoria/perfis', s)).status).toBe(404);
  });

  it('Leo (MENTOR) recebe 404 em inscrições', async () => {
    const dd = await duda();
    const f = await criar(dd);
    const s = await comoPerfil('MENTOR');
    expect((await h.get('/api/mentoria/eu', s)).body).toEqual({ perfil: 'MENTOR', admin: false });
    expect((await h.post('/api/mentoria/inscricoes/lista', {}, s)).status).toBe(404);
    expect((await h.get(`/api/mentoria/inscricoes/${f.id}`, s)).status).toBe(404);
  });

  it('comercial recebe 404 no módulo inteiro', async () => {
    const s = await h.signIn('ale@npac.com.br');
    expect((await h.get('/api/mentoria/eu', s)).status).toBe(404);
  });

  it('só admin lê e define perfis', async () => {
    const op = await comoPerfil('OPERACAO');
    expect((await h.get('/api/mentoria/perfis', op)).status).toBe(404);
    const dd = await duda();
    const lista = await h.get('/api/mentoria/perfis', dd);
    expect(lista.status).toBe(200);
    expect(lista.body).toContainEqual(
      expect.objectContaining({ id: carlaId, perfil: 'ACOMPANHAMENTO', admin: true }),
    );
    const r = await put(
      '/api/mentoria/perfis',
      { userId: carlaId, perfil: 'OPERACAO', admin: true },
      dd,
    );
    expect(r.status).toBe(200);
    expect((await h.get('/api/mentoria/eu', dd)).body).toEqual({ perfil: 'OPERACAO', admin: true });
  });

  it('condutores lista usuários ativos, inclusive do comercial', async () => {
    const s = await comoPerfil('OPERACAO');
    const r = await h.get('/api/mentoria/condutores', s);
    expect(r.status).toBe(200);
    const nomes = (r.body as { nome: string }[]).map((c) => c.nome);
    expect(nomes).toEqual(expect.arrayContaining(['Carla', 'Sônia', 'Ana']));
  });

  it('todo controller do módulo exige MFA', () => {
    const doModulo = [...app.get(ModulesContainer).values()]
      .flatMap((m) => [...m.controllers.values()])
      .map((c) => c.metatype as object)
      .filter((c) => String(Reflect.getMetadata('path', c) ?? '').startsWith('mentoria'));
    expect(doModulo.length).toBeGreaterThan(1);
    for (const c of doModulo) expect(Reflect.getMetadata(REQUIRES_MFA, c)).toBe(true);
  });
});

describe('inscrições', () => {
  it('cria casal com 2 pessoas e individual com 1', async () => {
    const s = await duda();
    expect((await criar(s)).pessoas).toHaveLength(1);
    const c = await criar(s, CASAL);
    expect(c.pessoas.map((p) => p.ordem)).toEqual([1, 2]);
    const lista = await h.post('/api/mentoria/inscricoes/lista', {}, s);
    expect(lista.body.total).toBe(2);
    const casal = (lista.body.itens as { tipo: string; nome: string }[]).find(
      (i) => i.tipo === 'CASAL',
    );
    expect(casal!.nome).toBe('Mentorada Fictícia 02 e Mentorado Fictício 03');
  });

  it('individual recusa pessoa 2; casal → individual remove a pessoa 2 e registra histórico', async () => {
    const s = await duda();
    const r = await h.post(
      '/api/mentoria/inscricoes',
      { ...INDIVIDUAL, pessoas: CASAL.pessoas },
      s,
    );
    expect(r.status).toBe(400);
    const c = await criar(s, CASAL);
    const del = await h.del(`/api/mentoria/inscricoes/${c.id}/pessoa-2`, {}, s);
    expect(del.status).toBe(200);
    const f = await abrir(s, c.id);
    expect(f.tipo).toBe('INDIVIDUAL');
    expect(f.pessoas).toHaveLength(1);
    const hist = await h.get(`/api/mentoria/inscricoes/${c.id}/historico`, s);
    expect((hist.body.itens as { tipo: string }[]).map((i) => i.tipo)).toContain(
      'inscricao.virou_individual',
    );
  });

  it('individual → casal adiciona a pessoa 2; repetir é recusado', async () => {
    const s = await duda();
    const f = await criar(s);
    const r = await h.post(
      `/api/mentoria/inscricoes/${f.id}/pessoa-2`,
      { nome: 'Pessoa Dois Fictícia' },
      s,
    );
    expect(r.status, r.text).toBe(201);
    expect((await abrir(s, f.id)).tipo).toBe('CASAL');
    const de2 = await h.post(`/api/mentoria/inscricoes/${f.id}/pessoa-2`, { nome: 'Outra' }, s);
    expect(de2.status).toBe(409);
  });

  it('término previsto padrão é início mais 12 meses', async () => {
    const s = await duda();
    const f = await criar(s, { ...INDIVIDUAL, inicioJornada: '2026-01-31' });
    expect((await abrir(s, f.id)) as unknown).toMatchObject({
      inicioJornada: '2026-01-31',
      terminoPrevisto: '2027-01-31',
    });
  });

  it('busca acha por nome, telefone completo e e-mail em maiúsculas', async () => {
    const s = await duda();
    const f = await criar(s);
    for (const termo of ['fictício 01', '11 99999-0001', 'UM@EXEMPLO.COM']) {
      const r = await h.post('/api/mentoria/busca', { termo }, s);
      expect(r.status).toBe(200);
      expect(
        (r.body.itens as { id: string }[]).map((i) => i.id),
        termo,
      ).toEqual([f.id]);
    }
  });

  it('busca por telefone parcial não acha', async () => {
    const s = await duda();
    await criar(s);
    const r = await h.post('/api/mentoria/busca', { termo: '99999' }, s);
    expect(r.body.itens).toEqual([]);
  });

  it('WhatsApp e e-mail não aparecem em claro no banco', async () => {
    const s = await duda();
    const f = await criar(s);
    const [p] = await owner<
      { whatsapp: string; email: string; whatsapp_idx: string; email_idx: string }[]
    >`select whatsapp, email, whatsapp_idx, email_idx from mentoria_pessoas where inscricao_id = ${f.id}`;
    const tudo = JSON.stringify(p);
    expect(tudo).not.toContain('99999');
    expect(tudo.toLowerCase()).not.toContain('exemplo');
    expect(p!.whatsapp_idx).toBeTruthy();
    expect(f.pessoas[0]!.whatsapp).toBe('+5511999990001');
  });

  it('PATCH sem version → 400; version velha → 409 VERSION_CONFLICT', async () => {
    const s = await duda();
    const f = await criar(s);
    const url = `/api/mentoria/inscricoes/${f.id}`;
    expect((await h.patch(url, { formaPagamento: 'Pix' }, s)).status).toBe(400);
    const ok = await h.patch(url, { version: f.version, formaPagamento: 'Pix' }, s);
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(f.version + 1);
    const velha = await h.patch(url, { version: f.version, formaPagamento: 'Cartão' }, s);
    expect(velha.status).toBe(409);
    expect(velha.body.code).toBe('VERSION_CONFLICT');
  });

  it('status PAUSADO não entra por PATCH', async () => {
    const s = await duda();
    const f = await criar(s);
    const r = await h.patch(
      `/api/mentoria/inscricoes/${f.id}`,
      { version: f.version, status: 'PAUSADO' },
      s,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Use a ação de pausar');
  });

  it('Operação não muda o status por PATCH', async () => {
    const s = await comoPerfil('OPERACAO');
    const f = await criar(s);
    const r = await h.patch(
      `/api/mentoria/inscricoes/${f.id}`,
      { version: f.version, status: 'CANCELADO' },
      s,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Só o Acompanhamento muda o status');
  });

  it('link do grupo só aceita convite do WhatsApp', async () => {
    const s = await duda();
    const f = await criar(s);
    const r = await h.patch(
      `/api/mentoria/inscricoes/${f.id}`,
      { version: f.version, linkGrupo: 'https://exemplo.com/x' },
      s,
    );
    expect(r.status).toBe(400);
  });

  it('histórico grava nomes de campos, nunca valores', async () => {
    const s = await duda();
    const f = await criar(s);
    await h.patch(
      `/api/mentoria/inscricoes/${f.id}`,
      { version: f.version, formaPagamento: 'Valor Secreto' },
      s,
    );
    const p = f.pessoas[0]!;
    await h.patch(
      `/api/mentoria/pessoas/${p.id}`,
      { version: p.version, apelido: 'Apelido Secreto' },
      s,
    );
    const rows =
      await owner`select tipo, campos from mentoria_historico where inscricao_id = ${f.id}`;
    const tudo = JSON.stringify(rows);
    expect(tudo).toContain('formaPagamento');
    expect(tudo).toContain('apelido');
    expect(tudo).not.toContain('Secreto');
  });

  it('filtros por status, responsável e mês da jornada', async () => {
    const s = await duda();
    const f = await criar(s, { ...INDIVIDUAL, inicioJornada: '2020-01-01' });
    await criar(s, CASAL);
    await h.patch(
      `/api/mentoria/inscricoes/${f.id}`,
      { version: f.version, status: 'ATIVO', responsavelId: carlaId },
      s,
    );
    const lista = (b: object) => h.post('/api/mentoria/inscricoes/lista', b, s);
    expect((await lista({ status: 'ATIVO' })).body.total).toBe(1);
    expect((await lista({ responsavelId: carlaId })).body.total).toBe(1);
    const [m] = await owner<{ m: number }[]>`
      select mentoria_mes_jornada(${f.id}, (now() at time zone 'America/Sao_Paulo')::date) as m`;
    const r = await lista({ mes: m!.m });
    expect(r.body.total).toBe(1);
    expect(r.body.itens[0].mesJornada).toBe(m!.m);
  });

  it('lista "completar a ficha" traz importado de RDV sem IDR', async () => {
    const s = await duda();
    const f = await criar(s);
    await owner`update mentoria_inscricoes set importada = true where id = ${f.id}`;
    await criar(s, CASAL);
    const r = await h.post('/api/mentoria/inscricoes/lista', { completar: true }, s);
    expect((r.body.itens as { id: string }[]).map((i) => i.id)).toEqual([f.id]);
  });

  it('pagina a lista com cursor', async () => {
    const s = await duda();
    for (let i = 0; i < 52; i++)
      await criar(s, {
        tipo: 'INDIVIDUAL',
        mentoria: 'RDV',
        pessoas: [{ nome: `Mentorado Fictício ${String(i).padStart(2, '0')}` }],
      });
    const a = await h.post('/api/mentoria/inscricoes/lista', {}, s);
    expect(a.body.itens).toHaveLength(50);
    const b = await h.post('/api/mentoria/inscricoes/lista', { cursor: a.body.cursor }, s);
    expect(b.body.itens).toHaveLength(2);
    expect(b.body.cursor).toBeNull();
  });
});

describe('momento inicial, endereço e avaliações', () => {
  const momento = (id: string) => `/api/mentoria/inscricoes/${id}/momento`;

  it('momento concluído recusa PUT; admin destrava', async () => {
    const s = await duda();
    const f = await criar(s);
    const r = await put(momento(f.id), { version: 0, dor: 'Dor fictícia', recebeCentavos: 100 }, s);
    expect(r.status, r.text).toBe(200);
    expect((await h.post(`${momento(f.id)}/concluir`, {}, s)).status).toBe(200);
    const ficha = await abrir(s, f.id);
    expect(ficha.momento!.dor).toBe('Dor fictícia');
    expect(ficha.momento!.travadoEm).toBeTruthy();
    expect(
      (await put(momento(f.id), { version: ficha.momento!.version, dor: 'x' }, s)).status,
    ).toBe(400);
    expect((await h.post(`${momento(f.id)}/destravar`, {}, s)).status).toBe(200);
    const depois = await abrir(s, f.id);
    expect(
      (await put(momento(f.id), { version: depois.momento!.version, dor: 'Outra' }, s)).status,
    ).toBe(200);
  });

  it('Acompanhamento sem selo não destrava', async () => {
    const dd = await duda();
    const f = await criar(dd);
    await put(momento(f.id), { version: 0, dor: 'Dor' }, dd);
    await h.post(`${momento(f.id)}/concluir`, {}, dd);
    const s = await comoPerfil('ACOMPANHAMENTO');
    expect((await h.post(`${momento(f.id)}/destravar`, {}, s)).status).toBe(404);
  });

  it('dor e sonho ficam cifrados', async () => {
    const s = await duda();
    const f = await criar(s);
    await put(momento(f.id), { version: 0, dor: 'Dor fictícia', sonho: 'Sonho fictício' }, s);
    const rows =
      await owner`select dor, sonho from mentoria_momento_inicial where inscricao_id = ${f.id}`;
    expect(JSON.stringify(rows)).not.toContain('fict');
  });

  it('avaliação é por pessoa no casal', async () => {
    const s = await duda();
    const c = await criar(s, CASAL);
    const [p1, p2] = c.pessoas;
    const url = (id: string) => `/api/mentoria/pessoas/${id}/avaliacoes`;
    expect((await put(url(p1!.id), { tipo: 'PILARES', notaFe: 7 }, s)).status).toBe(200);
    expect((await put(url(p2!.id), { tipo: 'PILARES', notaFe: 3 }, s)).status).toBe(200);
    const f = (await abrir(s, c.id)) as unknown as {
      pessoas: { avaliacoes: { tipo: string; notaFe: number | null }[] }[];
    };
    expect(f.pessoas[0]!.avaliacoes[0]!.notaFe).toBe(7);
    expect(f.pessoas[1]!.avaliacoes[0]!.notaFe).toBe(3);
  });

  it('endereço é cifrado e o CEP guarda só os dígitos', async () => {
    const s = await comoPerfil('OPERACAO');
    const f = await criar(s);
    const r = await put(
      `/api/mentoria/inscricoes/${f.id}/endereco`,
      { version: 0, endereco: 'Rua Fictícia, 1', cep: '01234-000' },
      s,
    );
    expect(r.status, r.text).toBe(200);
    const [row] = await owner<{ endereco: string; cep: string }[]>`
      select endereco, cep from mentoria_enderecos where inscricao_id = ${f.id}`;
    expect(row!.endereco).not.toContain('Rua');
    expect(row!.cep).toBe('01234000');
    expect((await abrir(s, f.id)).endereco!.endereco).toBe('Rua Fictícia, 1');
  });

  it('Operação recebe 404 ao editar momento inicial', async () => {
    const s = await comoPerfil('OPERACAO');
    const f = await criar(s);
    expect((await put(momento(f.id), { version: 0, dor: 'x' }, s)).status).toBe(404);
    expect((await h.post(`${momento(f.id)}/concluir`, {}, s)).status).toBe(404);
  });

  it('anotações são cifradas e aparecem no histórico', async () => {
    const s = await comoPerfil('OPERACAO');
    const f = await criar(s);
    const r = await h.post(
      `/api/mentoria/inscricoes/${f.id}/anotacoes`,
      { texto: 'Prefere à noite' },
      s,
    );
    expect(r.status, r.text).toBe(201);
    const rows = await owner`select texto from mentoria_anotacoes where inscricao_id = ${f.id}`;
    expect(JSON.stringify(rows)).not.toContain('noite');
    const hist = await h.get(`/api/mentoria/inscricoes/${f.id}/historico`, s);
    expect(hist.body.itens).toContainEqual(
      expect.objectContaining({ tipo: 'anotacao', texto: 'Prefere à noite', ator: 'Carla' }),
    );
  });

  it('inscrição inexistente responde 404', async () => {
    const s = await duda();
    const id = randomUUID();
    expect((await h.get(`/api/mentoria/inscricoes/${id}`, s)).status).toBe(404);
    expect(
      (await h.patch(`/api/mentoria/inscricoes/${id}`, { version: 1, origem: 'INSTAGRAM' }, s))
        .status,
    ).toBe(404);
  });
});

describe('mídia da ficha', () => {
  const dir = () => process.env.MEDIA_DIR!;

  it('foto da pessoa e foto da família sobem e ficam fora do registro', async () => {
    const s = await duda();
    const f = await criar(s);
    const p = f.pessoas[0]!;
    const foto = await enviar(`/api/mentoria/pessoa-foto/${p.id}/midia`, jpegComExif(), 'a.jpg', s);
    expect(foto.status, foto.text).toBe(201);
    const familia = await enviar(
      `/api/mentoria/foto-familia/${f.id}/midia`,
      jpegComExif(),
      'b.jpg',
      s,
    );
    expect(familia.status, familia.text).toBe(201);
    const ficha = (await abrir(s, f.id)) as unknown as {
      fotoFamiliaMidiaId: string;
      pessoas: { fotoMidiaId: string }[];
    };
    expect(ficha.fotoFamiliaMidiaId).toBe(familia.body.id);
    expect(ficha.pessoas[0]!.fotoMidiaId).toBe(foto.body.id);
    expect(existsSync(dir()) && readdirSync(dir()).length).toBeTruthy();
    const [m] = await owner<{ chave_objeto: string }[]>`
      select chave_objeto from mentoria_midia where id = ${foto.body.id}`;
    expect(m!.chave_objeto).toBeTruthy();
    expect((await h.get(`/api/mentoria/midia/${foto.body.id}`, s)).status).toBe(200);
  });

  it('trocar a foto enfileira a anterior', async () => {
    const s = await duda();
    const p = (await criar(s)).pessoas[0]!;
    const a = await enviar(`/api/mentoria/pessoa-foto/${p.id}/midia`, jpegComExif(), 'a.jpg', s);
    const [m] = await owner<{ chave_objeto: string }[]>`
      select chave_objeto from mentoria_midia where id = ${a.body.id}`;
    await enviar(`/api/mentoria/pessoa-foto/${p.id}/midia`, jpegComExif(), 'b.jpg', s);
    const fila =
      await owner`select 1 from mentoria_midia_exclusao where chave_objeto = ${m!.chave_objeto}`;
    expect(fila.length).toBe(1);
  });

  it('dono desconhecido responde 404', async () => {
    const s = await duda();
    const r = await enviar(
      `/api/mentoria/ficha-antes/${randomUUID()}/midia`,
      jpegComExif(),
      'a.jpg',
      s,
    );
    expect(r.status).toBe(404);
  });

  it('Mentor não baixa a mídia', async () => {
    const dd = await duda();
    const p = (await criar(dd)).pessoas[0]!;
    const a = await enviar(`/api/mentoria/pessoa-foto/${p.id}/midia`, jpegComExif(), 'a.jpg', dd);
    const s = await comoPerfil('MENTOR');
    expect((await h.get(`/api/mentoria/midia/${a.body.id}`, s)).status).toBe(404);
  });
});
