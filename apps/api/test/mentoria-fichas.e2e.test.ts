import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, auditCount, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;

const F = '/api/mentoria/fichas';

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
});

const criar = async (nome = 'Mentorado Fictício 10', dataInicio = '01/02/2026') => {
  const r = await h.post(F, { nome, dataInicio }, carla);
  expect(r.status).toBe(201);
  return r.body as { id: string; version: number };
};

describe('fichas', () => {
  it('a lista conta as conquistas de cada ficha', async () => {
    const f = await criar();
    await h.post(`${F}/${f.id}/conquistas`, { version: 1 }, carla);
    const l = await h.post(`${F}/search`, {}, carla);
    expect(l.body.itens[0].conquistas).toBe(1);
  });

  it('criar ficha manual pede nome e data de início; nome repetido → 409', async () => {
    expect((await h.post(F, { dataInicio: '01/02/2026' }, carla)).status).toBe(400);
    const f = await criar();
    expect(f.version).toBe(1);
    const dup = await h.post(F, { nome: 'MENTORADO ficticio 10', dataInicio: '' }, carla);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Já existe uma ficha com este nome');
  });

  it('pilares e evolução sempre vêm com 4 e 5 linhas fixas', async () => {
    const f = await criar();
    await h.patch(
      `${F}/${f.id}`,
      { version: 1, campos: { SAUDE: { antes: 'Sedentária' } } },
      carla,
    );
    const r = await h.get(`${F}/${f.id}`, carla);
    expect(r.status).toBe(200);
    expect(r.body.pilares.map((p: { chave: string }) => p.chave)).toEqual([
      'FE',
      'SAUDE',
      'DINHEIRO',
      'RELACIONAMENTOS',
    ]);
    expect(r.body.evolucao.map((p: { chave: string }) => p.chave)).toEqual([
      'RESERVA_FINANCEIRA',
      'EVOLUCAO_RENDA',
      'EVOLUCAO_SAUDE',
      'INVESTIMENTOS_MENTORIA',
      'AREA_ATUACAO',
    ]);
    expect(r.body.pilares[1]).toEqual({
      chave: 'SAUDE',
      rotulo: 'Saúde',
      antes: 'Sedentária',
      depois: null,
    });
    expect(r.body.evolucao[3].rotulo).toBe('Investimentos feitos na mentoria');
    expect(r.body).toMatchObject({
      nome: 'Mentorado Fictício 10',
      dataInicioTexto: '01/02/2026',
      version: 2,
    });
  });

  it('conquistas ordenam por data e depois id; MM/AAAA vai para o dia 1 só na ordem; data ausente vai para o fim', async () => {
    const f = await criar();
    let v = f.version;
    const ids: string[] = [];
    for (const data of ['10/03/2026', '', '03/2026', '01/01/2026']) {
      const c = await h.post(`${F}/${f.id}/conquistas`, { version: v }, carla);
      expect(c.status).toBe(201);
      v = c.body.version;
      const p = await h.patch(
        `${F}/${f.id}`,
        {
          version: v,
          conquistas: { [c.body.id]: { data, descricao: `Conquista ${data || 'sem data'}` } },
        },
        carla,
      );
      expect(p.status).toBe(200);
      v = p.body.version;
      ids.push(c.body.id);
    }
    const r = await h.get(`${F}/${f.id}`, carla);
    expect(r.body.conquistas.map((c: { data: string | null }) => c.data)).toEqual([
      '01/01/2026',
      '03/2026',
      '10/03/2026',
      null,
    ]);
    expect(r.body.conquistas[0].descricao).toBe('Conquista 01/01/2026');
  });

  it('dado antigo com data mais recente aparece depois (regra 3)', async () => {
    const f = await criar();
    const a = await h.post(`${F}/${f.id}/conquistas`, { version: 1 }, carla);
    const b = await h.post(`${F}/${f.id}/conquistas`, { version: a.body.version }, carla);
    // A criada primeiro recebe a data mais recente: a ordem segue a data, não a criação.
    const p = await h.patch(
      `${F}/${f.id}`,
      {
        version: b.body.version,
        conquistas: { [a.body.id]: { data: '20/05/2026' }, [b.body.id]: { data: '01/05/2026' } },
      },
      carla,
    );
    expect(p.status).toBe(200);
    const r = await h.get(`${F}/${f.id}`, carla);
    expect(r.body.conquistas.map((c: { id: string }) => c.id)).toEqual([b.body.id, a.body.id]);
  });

  it('conquista de outra ficha não é editável pelo PATCH desta', async () => {
    const f = await criar();
    const g = await criar('Mentorado Fictício 11');
    const c = await h.post(`${F}/${g.id}/conquistas`, { version: 1 }, carla);
    const r = await h.patch(
      `${F}/${f.id}`,
      { version: 1, conquistas: { [c.body.id]: { descricao: 'x' } } },
      carla,
    );
    expect(r.status).toBe(404);
  });

  it('abrir ficha grava mentoria.open; a busca por nome usa POST e não audita', async () => {
    const f = await criar();
    await criar('Ágata Fictícia');
    const busca = await h.post(`${F}/search`, { q: 'agata' }, carla);
    expect(busca.status).toBe(200);
    expect(busca.body.itens.map((i: { nome: string }) => i.nome)).toEqual(['Ágata Fictícia']);
    expect((await h.post(`${F}/search`, {}, carla)).body.itens).toHaveLength(2);
    expect(await auditCount('mentoria.open')).toBe(0);
    await h.get(`${F}/${f.id}`, carla);
    expect(await auditCount('mentoria.open')).toBe(1);
    expect((await h.get(`${F}/search`, carla)).status).toBe(404);
  });

  it('remover conquista pede version; não existe rota de restauração (404)', async () => {
    const f = await criar();
    const c = await h.post(`${F}/${f.id}/conquistas`, { version: 1 }, carla);
    expect(
      (
        await h.post(
          `/api/mentoria/registros/conquista/${c.body.id}/excluir`,
          { version: 1 },
          carla,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await h.post(
          `/api/mentoria/registros/conquista/${c.body.id}/excluir`,
          { version: c.body.version },
          carla,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await h.post(
          `/api/mentoria/registros/conquista/${c.body.id}/restaurar`,
          { version: 1 },
          carla,
        )
      ).status,
    ).toBe(404);
    const r = await h.get(`${F}/${f.id}`, carla);
    expect(r.body.conquistas).toEqual([]);
  });

  it('ficha devolve as mídias da ficha e das conquistas (só endereços)', async () => {
    const f = await criar();
    await h.post(
      `/api/mentoria/ficha-antes/${f.id}/midia/link`,
      { urlVideo: 'https://youtu.be/ficticio' },
      carla,
    );
    const r = await h.get(`${F}/${f.id}`, carla);
    expect(r.body.midias).toEqual([
      expect.objectContaining({
        donoTipo: 'FICHA_ANTES',
        donoId: f.id,
        tipo: 'LINK_VIDEO',
        urlVideo: 'https://youtu.be/ficticio',
      }),
    ]);
    expect(JSON.stringify(r.body.midias)).not.toContain('chave');
  });

  it('SDR recebe 404 em todas as rotas de ficha', async () => {
    const f = await criar();
    const ale = await h.signIn('ale@npac.com.br');
    expect((await h.get(`${F}/${f.id}`, ale)).status).toBe(404);
    expect((await h.post(F, { nome: 'X', dataInicio: '' }, ale)).status).toBe(404);
    expect((await h.post(`${F}/search`, {}, ale)).status).toBe(404);
    expect((await h.post(`${F}/${f.id}/conquistas`, { version: 1 }, ale)).status).toBe(404);
  });

  it('imprimir grava audit mentoria.print com id e sem nome', async () => {
    const f = await criar();
    expect((await h.post(`${F}/${f.id}/imprimir`, {}, carla)).status).toBe(204);
    const rows = await owner<{ entity_type: string; entity_id: string; data: unknown }[]>`
      select entity_type, entity_id, data from audit_log where action = 'mentoria.print'`;
    expect(rows).toEqual([{ entity_type: 'ficha', entity_id: f.id, data: {} }]);
    expect(JSON.stringify(rows)).not.toContain('Fictício');
    expect(
      (await h.post(`${F}/00000000-0000-4000-8000-000000000000/imprimir`, {}, carla)).status,
    ).toBe(404);
  });
});
