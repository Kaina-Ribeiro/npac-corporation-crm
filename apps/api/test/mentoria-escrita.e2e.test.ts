import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CAMPOS_SENSIVEIS } from '@npac/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;
let idM: string;
let ficha: string;

const M = '/api/mentoria/mentorados';
const F = '/api/mentoria/fichas';
const KB = 1024;

beforeAll(async () => {
  app = await createTestApp();
  h = api(app);
});
afterAll(async () => {
  await closeTestApp(app);
});
beforeEach(async () => {
  await resetAuthState();
  carla = await h.signIn('carla@npac.com.br');
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  const [m] = await owner<
    { id: string }[]
  >`insert into mentoria_mentorados (nome, nome_norm, status)
    values ('Mentorado Fictício 01', 'mentorado ficticio 01', 'ENGAJADO') returning id`;
  idM = m!.id;
  ficha = randomUUID();
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (${ficha}, 'Mentorado Fictício 02', 'mentorado ficticio 02')`;
});

describe('mentorados', () => {
  it('PATCH sem version → 400 "Dados inválidos"', async () => {
    const r = await h.patch(`${M}/${idM}`, { status: 'EM_RISCO' }, carla);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Dados inválidos');
  });

  it('PATCH com version antiga → 409 com code VERSION_CONFLICT e message em português', async () => {
    const r = await h.patch(`${M}/${idM}`, { version: 5, status: 'EM_RISCO' }, carla);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      code: 'VERSION_CONFLICT',
      message: 'Este registro foi alterado por outra pessoa. Recarregue e tente de novo.',
    });
  });

  it('PATCH incrementa version e devolve a nova', async () => {
    const r = await h.patch(
      `${M}/${idM}`,
      { version: 1, status: 'EM_ATENCAO', tipoCadastro: 'Casal', dataEntrada: '03/2026' },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: idM, version: 2 });
    const [row] =
      await owner`select status, tipo_cadastro, data_entrada_texto, data_entrada::text as data_entrada, version, updated_by from mentoria_mentorados where id = ${idM}`;
    expect(row).toMatchObject({
      status: 'EM_ATENCAO',
      tipo_cadastro: 'Casal',
      data_entrada_texto: '03/2026',
      data_entrada: '2026-03-01',
      version: 2,
    });
  });

  it('PATCH de nome atualiza o nome normalizado e recusa nome de outro registro', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Outro Fictício', 'outro ficticio', 'ENGAJADO')`;
    expect(
      (await h.patch(`${M}/${idM}`, { version: 1, nome: 'Ágata Fictícia' }, carla)).status,
    ).toBe(200);
    const [row] = await owner`select nome, nome_norm from mentoria_mentorados where id = ${idM}`;
    expect(row).toEqual({ nome: 'Ágata Fictícia', nome_norm: 'agata ficticia' });
    const dup = await h.patch(`${M}/${idM}`, { version: 2, nome: 'OUTRO  fictício' }, carla);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Já existe um mentorado com este nome');
  });

  it('criar mentorado com nome já existente sem acento → 409 (decisão D40; não é regra do PDF)', async () => {
    const ok = await h.post(M, { nome: 'Novo Fictício', status: 'ENGAJADO' }, carla);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ version: 1 });
    const dup = await h.post(M, { nome: 'MENTORADO ficticio 01', status: 'ENGAJADO' }, carla);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Já existe um mentorado com este nome');
  });

  it('texto colado "Renda atual: R$ 8 mil" é gravado sem alteração', async () => {
    const r = await h.post(
      M,
      {
        nome: '  Renda atual: R$ 8 mil ',
        tipoMentoria: ' Mentoria  Fictícia ',
        status: 'ENGAJADO',
      },
      carla,
    );
    expect(r.status).toBe(201);
    const [row] =
      await owner`select nome, tipo_mentoria from mentoria_mentorados where id = ${r.body.id}`;
    expect(row).toEqual({ nome: 'Renda atual: R$ 8 mil', tipo_mentoria: 'Mentoria  Fictícia' });
  });

  it('nome vazio é recusado', async () => {
    expect((await h.post(M, { nome: '   ', status: 'ENGAJADO' }, carla)).status).toBe(400);
    expect((await h.patch(`${M}/${idM}`, { version: 1, nome: '' }, carla)).status).toBe(400);
  });

  it('status fora da lista é recusado', async () => {
    expect((await h.patch(`${M}/${idM}`, { version: 1, status: 'ESFRIANDO' }, carla)).status).toBe(
      400,
    );
  });

  it('SDR recebe 404 no PATCH', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.patch(`${M}/${idM}`, { version: 1, status: 'EM_RISCO' }, ale)).status).toBe(
      404,
    );
    expect((await h.post(M, { nome: 'X', status: 'ENGAJADO' }, ale)).status).toBe(404);
  });

  it('excluir pela rota genérica pede version e apaga', async () => {
    const url = `/api/mentoria/registros/mentorado/${idM}/excluir`;
    expect((await h.post(url, {}, carla)).status).toBe(400);
    expect((await h.post(url, { version: 9 }, carla)).status).toBe(409);
    expect((await h.post(url, { version: 1 }, carla)).status).toBe(204);
    expect((await h.get(`${M}/${idM}`, carla)).status).toBe(404);
    expect((await h.post(url, { version: 1 }, carla)).status).toBe(404);
    expect(
      (await h.post(`/api/mentoria/registros/lead/${idM}/excluir`, { version: 1 }, carla)).status,
    ).toBe(404);
  });

  it('não existe rota de restauração (404)', async () => {
    expect(
      (await h.post(`/api/mentoria/registros/mentorado/${idM}/restaurar`, { version: 1 }, carla))
        .status,
    ).toBe(404);
  });
});

describe('fichas', () => {
  it('PATCH com pasta_url ou data de quadro → 400 (campo fora do schema)', async () => {
    for (const extra of [
      { pastaUrl: 'https://drive.google.com/x' },
      { dataTexto: '01/2026' },
      { pasta_url: 'x' },
    ]) {
      const r = await h.patch(`${F}/${ficha}`, { version: 1, ...extra }, carla);
      expect(r.status).toBe(400);
    }
    expect(
      (await h.patch(`${M}/${idM}`, { version: 1, pastaUrl: 'https://drive.google.com/x' }, carla))
        .status,
    ).toBe(400);
  });

  it('PATCH de campo de ficha com version antiga → 409 VERSION_CONFLICT', async () => {
    const r = await h.patch(`${F}/${ficha}`, { version: 3, campos: { FE: { antes: 'x' } } }, carla);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VERSION_CONFLICT');
  });

  it('PATCH da ficha grava notas e pilares cifrados; nome fica em claro (varredura por CAMPOS_SENSIVEIS)', async () => {
    const r = await h.patch(
      `${F}/${ficha}`,
      {
        version: 1,
        nome: 'Mentorado Fictício 02',
        notasMomentoInicial: 'Profissão: engenheira fictícia',
        campos: {
          FE: { antes: 'Fé antes fictícia', depois: 'Fé depois fictícia' },
          AREA_ATUACAO: { antes: 'Área fictícia' },
        },
      },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: ficha, version: 2 });
    const [f] = await owner<{ nome: string; notas_momento_inicial: string }[]>`
      select nome, notas_momento_inicial from mentoria_fichas where id = ${ficha}`;
    expect(f?.nome).toBe('Mentorado Fictício 02');
    expect(f?.notas_momento_inicial).toBeTruthy();
    for (const [tabela, colunas] of Object.entries(CAMPOS_SENSIVEIS)) {
      for (const col of colunas) {
        const rows =
          await owner`select ${owner(col)}::text as v from ${owner(tabela)} where ${owner(col)} is not null`;
        for (const row of rows) {
          expect(String(row.v)).not.toContain('fictícia');
          expect(String(row.v)).not.toContain('Profissão');
        }
      }
    }
    const campos =
      await owner`select chave, secao from mentoria_ficha_campos where ficha_id = ${ficha} order by chave`;
    expect(campos).toEqual([
      { chave: 'AREA_ATUACAO', secao: 'EVOLUCAO' },
      { chave: 'FE', secao: 'PILAR' },
    ]);
  });

  it('segunda edição com a version nova grava; campo de outra seção não apaga o anterior', async () => {
    await h.patch(`${F}/${ficha}`, { version: 1, campos: { FE: { antes: 'a1' } } }, carla);
    const r = await h.patch(
      `${F}/${ficha}`,
      { version: 2, campos: { FE: { depois: 'd1' } } },
      carla,
    );
    expect(r.body.version).toBe(3);
    const [c] = await owner<{ antes: string | null; depois: string | null }[]>`
      select antes, depois from mentoria_ficha_campos where ficha_id = ${ficha} and chave = 'FE'`;
    expect(c?.antes).toBeTruthy();
    expect(c?.depois).toBeTruthy();
  });

  it('chave de campo desconhecida → 400', async () => {
    expect(
      (await h.patch(`${F}/${ficha}`, { version: 1, campos: { CPF: { antes: 'x' } } }, carla))
        .status,
    ).toBe(400);
  });

  it('registro com textos somando 256 KB + 1 (ex.: nove campos de 100 KB) → 400 "Registro acima do limite de 256 KB"', async () => {
    const cem = 'a'.repeat(100 * KB);
    const chaves = [
      'FE',
      'SAUDE',
      'DINHEIRO',
      'RELACIONAMENTOS',
      'RESERVA_FINANCEIRA',
      'EVOLUCAO_RENDA',
      'EVOLUCAO_SAUDE',
      'INVESTIMENTOS_MENTORIA',
      'AREA_ATUACAO',
    ];
    const r = await h.patch(
      `${F}/${ficha}`,
      { version: 1, campos: Object.fromEntries(chaves.map((k) => [k, { antes: cem }])) },
      carla,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Registro acima do limite de 256 KB');
    // Em duas edições também: o limite soma o que já está gravado (nome incluído).
    const resto = 56 * KB - Buffer.byteLength('Mentorado Fictício 02');
    expect(
      (
        await h.patch(
          `${F}/${ficha}`,
          { version: 1, campos: { FE: { antes: cem }, SAUDE: { antes: cem } } },
          carla,
        )
      ).status,
    ).toBe(200);
    const segunda = await h.patch(
      `${F}/${ficha}`,
      { version: 2, notasMomentoAtual: 'a'.repeat(resto + 1) },
      carla,
    );
    expect(segunda.status).toBe(400);
    expect(segunda.body.message).toBe('Registro acima do limite de 256 KB');
    // Controle: exatamente 256 KB cabe.
    expect(
      (await h.patch(`${F}/${ficha}`, { version: 2, notasMomentoAtual: 'a'.repeat(resto) }, carla))
        .status,
    ).toBe(200);
  });

  it('SDR recebe 404 no PATCH da ficha', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.patch(`${F}/${ficha}`, { version: 1, nome: 'X' }, ale)).status).toBe(404);
  });
});
