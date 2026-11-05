import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, closeTestApp, createTestApp, owner, resetAuthState } from './helpers.js';

let app: NestFastifyApplication;
let h: ReturnType<typeof api>;
let carla: string;

const B = '/api/mentoria';
const contar = async (t: string) =>
  (await owner<{ n: number }[]>`select count(*)::int as n from ${owner(t)}`)[0]!.n;

// Exemplos inventados no formato da ferramenta antiga (P3, Eduarda 04/11/2026).
const dashboardAntigo = () => [
  {
    id: 'd_1',
    nome: 'Maria Exemplo',
    tipo: 'Individual',
    tipoMentoria: 'RDV',
    dataEntrada: '2026-08-14',
    status: 'engajado',
  },
  {
    id: 'd_2',
    nome: 'João Exemplo',
    tipo: 'Casal',
    tipoMentoria: '2M',
    dataEntrada: '',
    status: 'risco',
  },
];
const linhaAntiga = () => [
  {
    id: 'm_1',
    name: 'Fulano Exemplo',
    submittedAt: '2026-07-25',
    fotoAntes: 'https://antiga/x.jpg',
    fotoAntesAssetId: 'a1',
    fotoDepois: '',
    fotoDepoisAssetId: '',
    pilares: { fe: 'Pouca', saude: '', dinheiro: 'Endividado', relacionamentos: '' },
    notasIniciais: 'Profissão: exemplo',
    evolucao: 'Comprometimento (0 a 10): 8',
    tempoMentoria: '1 ano',
    evoCards: { reservaAntes: '0', reservaDepois: '10 mil' },
    conquistasArquivadas: '',
    conquistasGallery: [
      { id: 'g1', image: '<url>', type: 'image', date: '2026-09-01', caption: 'Viagem' },
    ],
  },
];
const rdvAntigo = () => [
  {
    id: 'r_1',
    name: 'Casal Exemplo',
    photo: '',
    photoAssetId: '',
    planilhaLink: 'https://docs.google.com/spreadsheets/d/exemplo',
    notasImportantes: 'Nota fictícia',
    diagnostico: { idade: '40', sonhos: 'Viajar' },
    events: [
      {
        id: 'ev1',
        date: '2026-08-14',
        caption: 'Iniciou a mentoria RDV.',
        media: [],
        videoLinks: [{ id: 'v1', url: 'https://www.youtube.com/watch?v=exemplo' }],
      },
    ],
    eventosPresenciais: [{ id: 'p1', data: '2026-09-12', nome: 'Destrava (fictício)', media: [] }],
    investimentosAtivos: [],
    imovelLeilao: [],
    mercadoImobiliario: [],
  },
];

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

describe('12B: .json da ferramenta antiga', () => {
  it('dashboard: prévia conta, importar grava com status e data convertidos', async () => {
    const p = await h.post(
      `${B}/dashboard/importar/previa`,
      { tipo: 'json', arquivo: dashboardAntigo() },
      carla,
    );
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ linhas: 2, entram: 2, jaExistem: 0 });
    const r = await h.post(
      `${B}/dashboard/importar`,
      { tipo: 'json', arquivo: dashboardAntigo() },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ gravados: 2 });
    const rows =
      await owner`select nome, tipo_cadastro, tipo_mentoria, status, data_entrada_texto, data_entrada::text as d from mentoria_mentorados order by nome_norm`;
    expect(rows).toEqual([
      {
        nome: 'João Exemplo',
        tipo_cadastro: 'Casal',
        tipo_mentoria: '2M',
        status: 'EM_RISCO',
        data_entrada_texto: null,
        d: null,
      },
      {
        nome: 'Maria Exemplo',
        tipo_cadastro: 'Individual',
        tipo_mentoria: 'RDV',
        status: 'ENGAJADO',
        data_entrada_texto: '14/08/2026',
        d: '2026-08-14',
      },
    ]);
  });

  it('linha do tempo: grava ficha, pilares e conquistas; fotos antigas vão para o relatório', async () => {
    const r = await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'json', arquivo: linhaAntiga() },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ gravados: 1, midiasNaoRecuperadas: 2 });
    const f = await h.post(`${B}/fichas/search`, {}, carla);
    const ficha = await h.get(`${B}/fichas/${f.body.itens[0].id}`, carla);
    expect(ficha.body).toMatchObject({
      nome: 'Fulano Exemplo',
      dataInicioTexto: '25/07/2026',
      notasMomentoInicial: 'Profissão: exemplo',
      notasMomentoAtual: 'Comprometimento (0 a 10): 8',
      tempoMentoria: '1 ano',
    });
    expect(ficha.body.pilares[0]).toMatchObject({ chave: 'FE', antes: 'Pouca' });
    expect(ficha.body.evolucao[0]).toMatchObject({ antes: '0', depois: '10 mil' });
    expect(ficha.body.conquistas).toEqual([
      expect.objectContaining({ data: '01/09/2026', descricao: 'Viagem' }),
    ]);
  });

  it('rdv: diagnóstico, evento com link de vídeo, quadro e pasta; prévia avisa a nota de fora', async () => {
    const p = await h.post(
      `${B}/rdv/importar/previa`,
      { tipo: 'json', arquivo: rdvAntigo() },
      carla,
    );
    expect(p.body).toMatchObject({ entram: 1, notasDeFora: 1 });
    const r = await h.post(`${B}/rdv/importar`, { tipo: 'json', arquivo: rdvAntigo() }, carla);
    expect(r.status).toBe(200);
    const l = await h.post(`${B}/rdv/search`, {}, carla);
    const g = await h.get(`${B}/rdv/${l.body.itens[0].id}`, carla);
    expect(g.body.pastaUrl).toBe('https://docs.google.com/spreadsheets/d/exemplo');
    expect(
      g.body.diagnostico.find((d: { chave: string }) => d.chave === 'sonhos_objetivos').valor,
    ).toBe('Viajar');
    expect(g.body.eventos).toEqual([
      expect.objectContaining({ data: '14/08/2026', descricao: 'Iniciou a mentoria RDV.' }),
    ]);
    expect(g.body.quadros).toEqual([
      expect.objectContaining({ quadro: 'EVENTOS_PRESENCIAIS', data: '12/09/2026' }),
    ]);
    expect(g.body.midias).toEqual([
      expect.objectContaining({
        tipo: 'LINK_VIDEO',
        urlVideo: 'https://www.youtube.com/watch?v=exemplo',
      }),
    ]);
  });

  it('.json antigo de outro módulo → 400 e nada é gravado', async () => {
    const r = await h.post(
      `${B}/rdv/importar`,
      { tipo: 'json', arquivo: dashboardAntigo() },
      carla,
    );
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('O arquivo .json não é um backup deste módulo');
    expect(await contar('mentoria_rdv_pessoas')).toBe(0);
  });

  it('status desconhecido no .json antigo → 400 com a mensagem', async () => {
    const a = dashboardAntigo();
    a[1]!.status = 'sumiu';
    const r = await h.post(`${B}/dashboard/importar`, { tipo: 'json', arquivo: a }, carla);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Status desconhecido no registro 2');
  });
});

describe('12B: planilha .csv do formulário', () => {
  const csv = [
    'Carimbo,Nome,Fé,Saúde,Dinheiro,Relacionamentos,Notas,Tempo,Evolução',
    '25/07/2026 14:03:22,Fulano Exemplo,Pouca,,,Bom,"Profissão: exemplo, autônomo",1 ano,"Comprometimento: 8"',
    '26/07/2026,,a,b,c,d,e,f,g',
  ].join('\n');

  it('na Linha do tempo cria a ficha pelas 9 colunas; linha sem nome fica de fora', async () => {
    const p = await h.post(
      `${B}/linha-do-tempo/importar/previa`,
      { tipo: 'formulario', texto: csv },
      carla,
    );
    expect(p.body).toMatchObject({ linhas: 1, entram: 1, invalidas: [3] });
    const r = await h.post(
      `${B}/linha-do-tempo/importar`,
      { tipo: 'formulario', texto: csv },
      carla,
    );
    expect(r.status).toBe(200);
    const f = await h.post(`${B}/fichas/search`, {}, carla);
    const ficha = await h.get(`${B}/fichas/${f.body.itens[0].id}`, carla);
    expect(ficha.body).toMatchObject({
      nome: 'Fulano Exemplo',
      dataInicioTexto: '25/07/2026',
      notasMomentoInicial: 'Profissão: exemplo, autônomo',
      notasMomentoAtual: 'Comprometimento: 8',
    });
    expect(ficha.body.pilares[3]).toMatchObject({ chave: 'RELACIONAMENTOS', antes: 'Bom' });
  });

  it('fora da Linha do tempo → 400', async () => {
    const r = await h.post(
      `${B}/dashboard/importar/previa`,
      { tipo: 'formulario', texto: csv },
      carla,
    );
    expect(r.status).toBe(400);
  });
});

describe('12C: coincidências de nome com confirmação', () => {
  it('prévia traz os índices das coincidências (na base e no arquivo), nunca nomes', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Maria Exemplo', 'maria exemplo', 'EM_RISCO')`;
    const a = [...dashboardAntigo(), { ...dashboardAntigo()[1]!, nome: 'JOÃO  exemplo' }];
    const p = await h.post(`${B}/dashboard/importar/previa`, { tipo: 'json', arquivo: a }, carla);
    expect(p.body).toMatchObject({
      entram: 1,
      jaExistem: 1,
      repetidos: 1,
      coincidencias: { naBase: [0], noArquivo: [2] },
    });
    expect(JSON.stringify(p.body)).not.toContain('Exemplo');
  });

  it('Dashboard: a mesma pessoa atualiza a ficha existente (correção do PDF)', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status, tipo_mentoria) values ('Maria Exemplo', 'maria exemplo', 'EM_RISCO', 'Antiga')`;
    const r = await h.post(
      `${B}/dashboard/importar`,
      { tipo: 'json', arquivo: dashboardAntigo(), coincidencias: { '0': { acao: 'MESMA' } } },
      carla,
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ gravados: 1, atualizados: 1, ignorados: 0 });
    const [m] = await owner<
      {
        nome: string;
        status: string;
        tipo_mentoria: string;
        data_entrada_texto: string;
        version: number;
      }[]
    >`select nome, status, tipo_mentoria, data_entrada_texto, version from mentoria_mentorados where nome_norm = 'maria exemplo'`;
    expect(m).toEqual({
      nome: 'Maria Exemplo',
      status: 'ENGAJADO',
      tipo_mentoria: 'RDV',
      data_entrada_texto: '14/08/2026',
      version: 2,
    });
  });

  it('Linha do tempo e RDV: a mesma pessoa é ignorada', async () => {
    await h.post(`${B}/rdv`, { nome: 'casal exemplo' }, carla);
    const r = await h.post(`${B}/rdv/importar`, { tipo: 'json', arquivo: rdvAntigo() }, carla);
    expect(r.body).toMatchObject({ gravados: 0, atualizados: 0, ignorados: 1 });
    expect(await contar('mentoria_rdv_eventos')).toBe(0);
  });

  it('pessoa diferente com outro nome entra como nova; sem nome ou com nome que também existe → 400', async () => {
    await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Maria Exemplo', 'maria exemplo', 'EM_RISCO')`;
    const sem = await h.post(
      `${B}/dashboard/importar`,
      {
        tipo: 'json',
        arquivo: dashboardAntigo(),
        coincidencias: { '0': { acao: 'OUTRA', nome: ' ' } },
      },
      carla,
    );
    expect(sem.status).toBe(400);
    const tambem = await h.post(
      `${B}/dashboard/importar`,
      {
        tipo: 'json',
        arquivo: dashboardAntigo(),
        coincidencias: { '0': { acao: 'OUTRA', nome: 'joão exemplo' } },
      },
      carla,
    );
    expect(tambem.status).toBe(400);
    expect(tambem.body.message).toBe('Um dos nomes novos também já existe. Escolha outro.');
    expect(await contar('mentoria_mentorados')).toBe(1);
    const ok = await h.post(
      `${B}/dashboard/importar`,
      {
        tipo: 'json',
        arquivo: dashboardAntigo(),
        coincidencias: { '0': { acao: 'OUTRA', nome: 'Maria Exemplo Souza' } },
      },
      carla,
    );
    expect(ok.body).toMatchObject({ gravados: 2, atualizados: 0 });
    const nomes = (
      await owner<{ nome: string }[]>`select nome from mentoria_mentorados order by nome`
    ).map((x) => x.nome);
    expect(nomes).toEqual(['João Exemplo', 'Maria Exemplo', 'Maria Exemplo Souza']);
  });

  it('repetido dentro do arquivo: sem escolha fica de fora; com outro nome entra', async () => {
    const a = [...linhaAntiga(), { ...linhaAntiga()[0]!, name: 'fulano  EXEMPLO' }];
    const r = await h.post(`${B}/linha-do-tempo/importar`, { tipo: 'json', arquivo: a }, carla);
    expect(r.body).toMatchObject({ gravados: 1, ignorados: 1 });
    await owner`truncate mentoria_fichas cascade`;
    const b = await h.post(
      `${B}/linha-do-tempo/importar`,
      {
        tipo: 'json',
        arquivo: a,
        coincidencias: { '1': { acao: 'OUTRA', nome: 'Fulano Exemplo Filho' } },
      },
      carla,
    );
    expect(b.body).toMatchObject({ gravados: 2, ignorados: 0 });
  });
});
