import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;

const B = '/api/mentoria';
const contar = async (t: string) =>
  (await owner<{ n: number }[]>`select count(*)::int as n from ${owner(t)}`)[0]!.n;

const planilha = [
  'Nome\tTipo\tTipo de mentoria\tData de entrada\tStatus',
  'Mentorado Fictício 01\tIndividual\tMentoria Fictícia A\t05/03/2026\tEngajado',
  'Mentorado Fictício 02\tCasal\t\t03/2026\tEm atenção',
  'Mentorado Fictício 03\tIndividual\tMentoria Fictícia B\t\t',
  'MENTORADO FICTICIO 01\tIndividual\tMentoria Fictícia A\t\tEngajado',
].join('\n');

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

describe('importação do dashboard (colar planilha)', () => {
  it('prévia não grava nada (contagem de linhas igual antes e depois)', async () => {
    const r = await h.post(
      `${B}/dashboard/importar/previa`,
      { tipo: 'planilha', texto: planilha },
      carla,
    );
    expect(r.status).toBe(200);
    expect(await contar('mentoria_mentorados')).toBe(0);
    expect(r.body).toEqual({
      linhas: 4,
      entram: 3,
      jaExistem: 0,
      repetidos: 1,
      pendentes: [
        { linha: 3, faltando: ['TIPO_MENTORIA'] },
        { linha: 4, faltando: ['STATUS'] },
      ],
      invalidas: [],
      midiasNaoRecuperadas: 0,
      coincidencias: { naBase: [], noArquivo: [3] },
      notasDeFora: 0,
      eventosSemData: 0,
    });
  });

  it('resposta da prévia não contém nomes', async () => {
    const r = await h.post(
      `${B}/dashboard/importar/previa`,
      { tipo: 'planilha', texto: planilha },
      carla,
    );
    expect(JSON.stringify(r.body)).not.toContain('Fictício');
  });

  it('importar com linha pendente sem escolha → 400', async () => {
    const r = await h.post(
      `${B}/dashboard/importar`,
      {
        tipo: 'planilha',
        texto: planilha,
        escolhas: { '3': { tipoMentoria: 'Mentoria Fictícia A' } },
      },
      carla,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Escolha o status ou o tipo de mentoria de cada linha marcada');
    expect(await contar('mentoria_mentorados')).toBe(0);
  });

  it('importar grava os novos, atualiza o nome que já existe (correção do PDF) e responde contagens', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 03', 'mentorado ficticio 03', 'EM_RISCO')`;
    const escolhas = { '3': { tipoMentoria: 'Mentoria Fictícia A' } };
    const previa = await h.post(
      `${B}/dashboard/importar/previa`,
      { tipo: 'planilha', texto: planilha },
      carla,
    );
    expect(previa.body).toMatchObject({ entram: 2, jaExistem: 1, repetidos: 1 });
    const r = await h.post(
      `${B}/dashboard/importar`,
      { tipo: 'planilha', texto: planilha, escolhas },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ gravados: 2, atualizados: 1, ignorados: 1, midiasNaoRecuperadas: 0 });
    const rows =
      await owner`select nome, tipo_mentoria, status, data_entrada_texto from mentoria_mentorados order by nome_norm`;
    expect(rows).toEqual([
      {
        nome: 'Mentorado Fictício 01',
        tipo_mentoria: 'Mentoria Fictícia A',
        status: 'ENGAJADO',
        data_entrada_texto: '05/03/2026',
      },
      {
        nome: 'Mentorado Fictício 02',
        tipo_mentoria: 'Mentoria Fictícia A',
        status: 'EM_ATENCAO',
        data_entrada_texto: '03/2026',
      },
      {
        // Já existia: o tipo de mentoria veio na planilha; status vazio não apaga o gravado.
        nome: 'Mentorado Fictício 03',
        tipo_mentoria: 'Mentoria Fictícia B',
        status: 'EM_RISCO',
        data_entrada_texto: null,
      },
    ]);
    const [a] = await owner<
      { data: unknown }[]
    >`select data from audit_log where action = 'mentoria.import'`;
    expect(a?.data).toEqual({
      modulo: 'dashboard',
      tipo: 'planilha',
      gravados: 2,
      atualizados: 1,
      ignorados: 1,
    });
  });

  it('SDR recebe 404 na prévia e na importação', async () => {
    const ale = await h.signIn('ale@npac.com.br');
    expect(
      (await h.post(`${B}/dashboard/importar/previa`, { tipo: 'planilha', texto: planilha }, ale))
        .status,
    ).toBe(404);
    expect((await h.get(`${B}/dashboard/exportar.json`, ale)).status).toBe(404);
  });

  it('módulo desconhecido → 404', async () => {
    expect(
      (await h.post(`${B}/leads/importar/previa`, { tipo: 'planilha', texto: planilha }, carla))
        .status,
    ).toBe(404);
  });
});

describe('exportar e importar .json', () => {
  const baixar = async (modulo: string) => {
    const r = await h.get(`${B}/${modulo}/exportar.json`, carla);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(
      new RegExp(`attachment; filename="acompanhamento-${modulo}-\\d{4}-\\d{2}-\\d{2}\\.json"`),
    );
    return JSON.parse(r.text);
  };

  it('exportar .json e importar o mesmo arquivo restaura a base sem duplicar (round-trip)', async () => {
    await h.post(
      `${B}/dashboard/importar`,
      {
        tipo: 'planilha',
        texto: planilha,
        escolhas: { '3': { tipoMentoria: 'X' }, '4': { status: 'EM_RISCO' } },
      },
      carla,
    );
    const arquivo = await baixar('dashboard');
    expect(arquivo.registros).toHaveLength(3);
    const de_novo = await h.post(`${B}/dashboard/importar`, { tipo: 'json', arquivo }, carla);
    expect(de_novo.body).toMatchObject({ gravados: 0, atualizados: 3, ignorados: 0 });
    await owner`truncate mentoria_mentorados cascade`;
    const restaura = await h.post(`${B}/dashboard/importar`, { tipo: 'json', arquivo }, carla);
    expect(restaura.body).toMatchObject({ gravados: 3, ignorados: 0 });
    const ids = (await owner<{ id: string }[]>`select id from mentoria_mentorados order by id`).map(
      (r) => r.id,
    );
    expect(ids).toEqual(arquivo.registros.map((r: { id: string }) => r.id).sort());
  });

  it('exportar grava mentoria.export com contagem e sem nome', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 09', 'mentorado ficticio 09', 'ENGAJADO')`;
    await baixar('dashboard');
    const rows = await owner<
      { data: unknown }[]
    >`select data from audit_log where action = 'mentoria.export'`;
    expect(rows).toEqual([{ data: { modulo: 'dashboard', registros: 1 } }]);
  });

  it('restauração em módulo vazio: contagem por entidade (ficha, campo, conquista, pessoa, diagnóstico, evento, dúvida, quadro, mídia) bate antes e depois', async () => {
    const ficha = randomUUID();
    await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'json', arquivo: fichaJson(ficha) },
      carla,
    );
    await h.post(`${B}/rdv/importar`, { tipo: 'json', arquivo: rdvJson(randomUUID()) }, carla);
    const tabelas = [
      'mentoria_fichas',
      'mentoria_ficha_campos',
      'mentoria_conquistas',
      'mentoria_rdv_pessoas',
      'mentoria_rdv_diagnostico',
      'mentoria_rdv_eventos',
      'mentoria_rdv_duvidas',
      'mentoria_rdv_quadros',
      'mentoria_midia',
    ];
    const antes = Object.fromEntries(
      await Promise.all(tabelas.map(async (t) => [t, await contar(t)])),
    );
    expect(Object.values(antes).every((n) => Number(n) > 0)).toBe(true);
    const lt = await baixar('linha-do-tempo');
    const rdv = await baixar('rdv');
    await owner`truncate mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
    await h.post(`${B}/linha-do-tempo/importar`, { tipo: 'json', arquivo: lt }, carla);
    await h.post(`${B}/rdv/importar`, { tipo: 'json', arquivo: rdv }, carla);
    const depois = Object.fromEntries(
      await Promise.all(tabelas.map(async (t) => [t, await contar(t)])),
    );
    expect(depois).toEqual(antes);
    // Texto volta igual (cifrado no banco, em claro só no arquivo baixado).
    const lt2 = await baixar('linha-do-tempo');
    expect(lt2.registros).toEqual(lt.registros);
  });

  it('export do módulo tem todas as fichas, conquistas e campos', async () => {
    const ficha = randomUUID();
    await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'json', arquivo: fichaJson(ficha) },
      carla,
    );
    const lt = await baixar('linha-do-tempo');
    expect(lt.registros).toHaveLength(1);
    expect(lt.registros[0]).toMatchObject({
      id: ficha,
      notasMomentoInicial: 'Profissão: engenheira fictícia',
      campos: { FE: { antes: 'Fé antes', depois: 'Fé depois' } },
      conquistas: [{ data: '03/2026', descricao: 'Primeira conquista fictícia' }],
    });
  });

  it('.json com cabeçalho diferente → 400 sem gravar nada', async () => {
    const r = await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'json', arquivo: { ...fichaJson(randomUUID()), formato: 'outro' } },
      carla,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('O arquivo .json não é um backup deste módulo');
    const outroModulo = await h.post(
      `${B}/rdv/importar`,
      { tipo: 'json', arquivo: fichaJson(randomUUID()) },
      carla,
    );
    expect(outroModulo.status).toBe(400);
    expect(await contar('mentoria_fichas')).toBe(0);
  });

  it('nome repetido dentro do arquivo: o primeiro entra e o repetido fica de fora sem escolha (12C)', async () => {
    const a = fichaJson(randomUUID());
    const b = fichaJson(randomUUID());
    b.registros[0]!.nome = 'MENTORADO  ficticio 05';
    const arquivo = { ...a, registros: [...a.registros, ...b.registros] };
    const p = await h.post(`${B}/linha-do-tempo/importar/previa`, { tipo: 'json', arquivo }, carla);
    expect(p.body.coincidencias).toEqual({ naBase: [], noArquivo: [1] });
    const r = await h.post(`${B}/linha-do-tempo/importar`, { tipo: 'json', arquivo }, carla);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ gravados: 1, ignorados: 1 });
    expect(await contar('mentoria_fichas')).toBe(1);
  });

  it('endereço de mídia do .json vai para o relatório como mídia não recuperada', async () => {
    const r = await h.post(
      `${B}/linha-do-tempo/importar/previa`,
      { tipo: 'json', arquivo: fichaJson(randomUUID()) },
      carla,
    );
    expect(r.body.midiasNaoRecuperadas).toBe(1);
  });

  it('endereço javascript:, data: ou http: não vira link', async () => {
    const arquivo = fichaJson(randomUUID());
    const ficha = arquivo.registros[0]!;
    ficha.midias = ['javascript:alert(1)', 'data:text/html,x', 'http://youtu.be/x'].map(
      (urlVideo) => ({ donoTipo: 'FICHA_ANTES', donoId: ficha.id, tipo: 'LINK_VIDEO', urlVideo }),
    );
    const r = await h.post(`${B}/linha-do-tempo/importar`, { tipo: 'json', arquivo }, carla);
    expect(r.status).toBe(200);
    expect(r.body.midiasNaoRecuperadas).toBe(3);
    expect(await contar('mentoria_midia')).toBe(0);
  });

  it('importação acima de 25.000 registros totais é recusada', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) select 'Fictício ' || g, 'ficticio ' || g, 'ENGAJADO' from generate_series(1, 25000) g`;
    const r = await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'json', arquivo: fichaJson(randomUUID()) },
      carla,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('A importação passaria do limite de 25.000 registros');
    expect(await contar('mentoria_fichas')).toBe(0);
  });
});

function fichaJson(id: string) {
  const conquista = randomUUID();
  return {
    formato: 'npac-acompanhamento',
    versao: 1,
    modulo: 'linha-do-tempo',
    exportadoEm: '2026-11-04T12:00:00.000Z',
    registros: [
      {
        id,
        nome: 'Mentorado Fictício 05',
        dataInicio: '01/02/2026',
        notasMomentoInicial: 'Profissão: engenheira fictícia',
        notasMomentoAtual: null,
        tempoMentoria: '6 meses',
        campos: {
          FE: { antes: 'Fé antes', depois: 'Fé depois' },
          AREA_ATUACAO: { antes: 'Área', depois: null },
        },
        conquistas: [{ id: conquista, data: '03/2026', descricao: 'Primeira conquista fictícia' }],
        midias: [
          { donoTipo: 'CONQUISTA', donoId: conquista, tipo: 'FOTO' },
          {
            donoTipo: 'CONQUISTA',
            donoId: conquista,
            tipo: 'LINK_VIDEO',
            urlVideo: 'https://youtu.be/ficticio',
          },
        ] as { donoTipo: string; donoId: string; tipo: string; urlVideo?: string }[],
      },
    ],
  };
}

function rdvJson(id: string) {
  return {
    formato: 'npac-acompanhamento',
    versao: 1,
    modulo: 'rdv',
    exportadoEm: '2026-11-04T12:00:00.000Z',
    registros: [
      {
        id,
        nome: 'Mentorado Fictício 06',
        pastaUrl: 'https://drive.google.com/drive/folders/ficticia',
        diagnostico: { idade: '40', renda_atual: 'R$ 8 mil' },
        eventos: [
          {
            id: randomUUID(),
            data: '05/03/2026',
            descricao: 'Recebeu a caixa',
            origem: 'MANUAL',
            checklistItem: 3,
          },
        ],
        duvidas: [{ id: randomUUID(), texto: 'Talvez vá ao encontro', status: 'ABERTA' }],
        quadros: [
          {
            id: randomUUID(),
            quadro: 'IMOVEL_LEILAO',
            data: '04/2026',
            descricao: 'Leilão fictício',
          },
        ],
        midias: [
          {
            donoTipo: 'RDV_PESSOA',
            donoId: id,
            tipo: 'LINK_VIDEO',
            urlVideo: 'https://vimeo.com/1',
          },
        ],
      },
    ],
  };
}
