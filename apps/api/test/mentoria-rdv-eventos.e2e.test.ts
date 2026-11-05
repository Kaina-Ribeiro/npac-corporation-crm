import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;

const R = '/api/mentoria/rdv';

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

const criar = async () => {
  const r = await h.post(R, { nome: 'Casal Fictício 50' }, carla);
  expect(r.status).toBe(201);
  return r.body as { id: string; version: number };
};
const evento = async (id: string, version: number, data: string, descricao: string) => {
  const r = await h.post(`${R}/${id}/eventos`, { version, data, descricao }, carla);
  expect(r.status).toBe(201);
  return r.body as { id: string; version: number };
};

describe('rdv: eventos', () => {
  it('eventos saem em ordem de data e depois id, não pela ordem de criação', async () => {
    const p = await criar();
    let v = p.version;
    for (const [d, t] of [
      ['10/03/2026', 'terceiro'],
      ['01/01/2026', 'primeiro'],
      ['15/02/2026', 'segundo'],
    ] as const)
      v = (await evento(p.id, v, d, t)).version;
    const r = await h.get(`${R}/${p.id}`, carla);
    expect(r.body.eventos.map((e: { descricao: string }) => e.descricao)).toEqual([
      'primeiro',
      'segundo',
      'terceiro',
    ]);
    expect(r.body.eventos[0]).toMatchObject({ data: '01/01/2026' });
    expect(r.body.version).toBe(4);
    const l = await h.post(`${R}/search`, {}, carla);
    expect(l.body.itens[0].eventos).toBe(3);
  });

  it('adicionar evento exige data DD/MM/AAAA (sem data padrão) e usa a version da pessoa', async () => {
    const p = await criar();
    expect(
      (await h.post(`${R}/${p.id}/eventos`, { version: 1, descricao: 'x' }, carla)).status,
    ).toBe(400);
    expect(
      (await h.post(`${R}/${p.id}/eventos`, { version: 1, data: '03/2026', descricao: 'x' }, carla))
        .status,
    ).toBe(400);
    expect(
      (
        await h.post(
          `${R}/${p.id}/eventos`,
          { version: 9, data: '01/03/2026', descricao: 'x' },
          carla,
        )
      ).status,
    ).toBe(409);
  });

  it('editar data e descrição do evento pelo PATCH da pessoa; descrição cifrada no banco', async () => {
    const p = await criar();
    const e = await evento(p.id, 1, '01/01/2026', 'texto antigo');
    const r = await h.patch(
      `${R}/${p.id}`,
      { version: e.version, eventos: { [e.id]: { data: '02/01/2026', descricao: 'texto novo' } } },
      carla,
    );
    expect(r.status).toBe(200);
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.eventos[0]).toMatchObject({ data: '02/01/2026', descricao: 'texto novo' });
    const [row] = await owner<{ descricao: string }[]>`select descricao from mentoria_rdv_eventos`;
    expect(row!.descricao).not.toContain('texto novo');
    const ruim = await h.patch(
      `${R}/${p.id}`,
      { version: r.body.version, eventos: { [e.id]: { data: 'amanhã' } } },
      carla,
    );
    expect(ruim.status).toBe(400);
  });

  it('evento de outra pessoa no PATCH → 404 e nada fica gravado', async () => {
    const p = await criar();
    const q = (await h.post(R, { nome: 'Outra Fictícia' }, carla)).body as { id: string };
    const e = await evento(q.id, 1, '01/01/2026', 'da outra');
    const r = await h.patch(
      `${R}/${p.id}`,
      { version: 1, nome: 'Nome Novo', eventos: { [e.id]: { descricao: 'invadido' } } },
      carla,
    );
    expect(r.status).toBe(404);
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.nome).toBe('Casal Fictício 50');
  });

  it('remover evento pede version e enfileira a mídia; não existe rota de restauração', async () => {
    const p = await criar();
    const e = await evento(p.id, 1, '01/01/2026', 'sai');
    const rm = await h.post(
      `/api/mentoria/registros/rdv-evento/${e.id}/excluir`,
      { version: e.version },
      carla,
    );
    expect(rm.status).toBe(204);
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.eventos).toHaveLength(0);
    expect(
      (await h.post(`/api/mentoria/registros/rdv-evento/${e.id}/restaurar`, { version: 3 }, carla))
        .status,
    ).toBe(404);
  });
});

describe('rdv: colar vários eventos', () => {
  it('prévia não grava: linha com data vira evento, "presencial" só sugere, sem data vira dúvida', async () => {
    const p = await criar();
    const r = await h.post(
      `${R}/${p.id}/eventos/colar/previa`,
      {
        texto:
          '14/08/2026 - Iniciou a mentoria RDV\n12/09/2026 - Participou do evento presencial\nfalou que talvez compre um imóvel',
      },
      carla,
    );
    expect(r.status).toBe(200);
    expect(
      r.body.linhas.map((l: { tipo: string; sugestao: string }) => [l.tipo, l.sugestao]),
    ).toEqual([
      ['EVENTO', 'EVENTO'],
      ['EVENTO', 'QUADRO'],
      ['DUVIDA', 'DUVIDA'],
    ]);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_eventos`;
    expect(n!.n).toBe(0);
  });

  it('gravar a colagem cria eventos e itens de quadro; dúvida não é enviada; sobe a version uma vez', async () => {
    const p = await criar();
    const r = await h.post(
      `${R}/${p.id}/eventos/colar`,
      {
        version: 1,
        linhas: [
          { tipo: 'EVENTO', data: '14/08/2026', descricao: 'Iniciou a mentoria RDV' },
          { tipo: 'QUADRO', data: '12/09/2026', descricao: 'Destrava (fictício)' },
        ],
      },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ version: 2, eventos: 1, quadros: 1 });
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.eventos).toHaveLength(1);
    expect(g.body.quadros).toEqual([
      expect.objectContaining({
        quadro: 'EVENTOS_PRESENCIAIS',
        data: '12/09/2026',
        descricao: 'Destrava (fictício)',
      }),
    ]);
    const [o] = await owner<{ origem: string }[]>`select origem from mentoria_rdv_eventos`;
    expect(o!.origem).toBe('COLADO');
  });

  it('linha de evento sem data na gravação → 400 e nada entra', async () => {
    const p = await criar();
    const r = await h.post(
      `${R}/${p.id}/eventos/colar`,
      {
        version: 1,
        linhas: [
          { tipo: 'EVENTO', data: '14/08/2026', descricao: 'ok' },
          { tipo: 'EVENTO', data: '', descricao: 'sem data' },
        ],
      },
      carla,
    );
    expect(r.status).toBe(400);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_rdv_eventos`;
    expect(n!.n).toBe(0);
  });
});

describe('rdv: quadros rápidos', () => {
  it('item de quadro: data opcional MM/AAAA ou DD/MM/AAAA; sem data vai para o fim', async () => {
    const p = await criar();
    let v = 1;
    for (const data of ['', '05/2026', '01/03/2026']) {
      const r = await h.post(
        `${R}/${p.id}/quadros`,
        {
          version: v,
          quadro: 'INVESTIMENTO_ATIVOS',
          data,
          descricao: `item ${data || 'sem data'}`,
        },
        carla,
      );
      expect(r.status).toBe(201);
      v = r.body.version;
    }
    const ruim = await h.post(
      `${R}/${p.id}/quadros`,
      { version: v, quadro: 'INVESTIMENTO_ATIVOS', data: 'ontem', descricao: 'x' },
      carla,
    );
    expect(ruim.status).toBe(400);
    const outro = await h.post(
      `${R}/${p.id}/quadros`,
      { version: v, quadro: 'CRIPTO', descricao: 'x' },
      carla,
    );
    expect(outro.status).toBe(400);
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.quadros.map((q: { data: string | null }) => q.data)).toEqual([
      '01/03/2026',
      '05/2026',
      null,
    ]);
  });

  it('data do item não muda depois de gravada (PATCH só aceita a descrição)', async () => {
    const p = await criar();
    const q = await h.post(
      `${R}/${p.id}/quadros`,
      { version: 1, quadro: 'IMOVEL_LEILAO', data: '05/2026', descricao: 'antes' },
      carla,
    );
    const ok = await h.patch(
      `${R}/${p.id}`,
      { version: q.body.version, quadros: { [q.body.id]: { descricao: 'depois' } } },
      carla,
    );
    expect(ok.status).toBe(200);
    const data = await h.patch(
      `${R}/${p.id}`,
      { version: ok.body.version, quadros: { [q.body.id]: { data: '06/2026' } } },
      carla,
    );
    expect(data.status).toBe(400);
    const g = await h.get(`${R}/${p.id}`, carla);
    expect(g.body.quadros[0]).toMatchObject({ data: '05/2026', descricao: 'depois' });
  });
});
