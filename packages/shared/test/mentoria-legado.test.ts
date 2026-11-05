import { describe, expect, it } from 'vitest';
import { backupSchema } from '../src/mentoria/json-backup.js';
import {
  converterFormulario,
  converterLegado,
  nomesDoArquivo,
  parseCsv,
} from '../src/mentoria/legado.js';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

// Exemplos inventados, no formato que a Eduarda descreveu (P3, 04/11/2026).
const dashboardAntigo = [
  {
    id: 'd_abc1',
    nome: 'Maria Exemplo',
    tipo: 'Individual',
    tipoMentoria: 'RDV',
    dataEntrada: '2026-08-14',
    status: 'engajado',
  },
  {
    id: 'd_abc2',
    nome: 'João Exemplo',
    tipo: 'Casal',
    tipoMentoria: '2M',
    dataEntrada: '',
    status: 'atencao',
  },
  {
    id: 'd_abc3',
    nome: 'Ana Exemplo',
    tipo: '',
    tipoMentoria: '',
    dataEntrada: '2026-01-02',
    status: 'risco',
  },
];

const linhaAntiga = [
  {
    id: 'm_x1',
    name: 'Fulano Exemplo',
    submittedAt: '2026-07-25',
    fotoAntes: 'https://antiga/x.jpg',
    fotoAntesAssetId: 'a1',
    fotoDepois: '',
    fotoDepoisAssetId: '',
    pilares: { fe: 'Pouca', saude: 'Sedentário', dinheiro: 'Endividado', relacionamentos: 'Bom' },
    notasIniciais: 'Profissão: exemplo\n\nComo conheceu a mentoria: indicação',
    evolucao: 'Comprometimento (0 a 10): 8',
    tempoMentoria: '1 ano e 2 meses',
    evoCards: {
      reservaAntes: '0',
      reservaDepois: '10 mil',
      evolucaoRenda: 'dobrou',
      saude: 'melhorou',
      investimentos: 'renda fixa',
      areaAtuacao: 'comércio',
    },
    conquistasArquivadas: 'Quitou o carro',
    conquistasGallery: [
      {
        id: 'g1',
        image: '<url>',
        assetId: 'x',
        type: 'image',
        date: '2026-09-01',
        caption: 'Viagem',
      },
    ],
  },
];

const rdvAntigo = [
  {
    id: 'r_x1',
    name: 'Casal Exemplo',
    photo: 'https://antiga/p.jpg',
    photoAssetId: 'p1',
    planilhaLink: 'https://docs.google.com/spreadsheets/d/exemplo',
    notasImportantes: 'Nota fictícia',
    diagnostico: {
      idade: '40',
      situacaoConjugal: 'Casados',
      filhos: '2',
      trabalho: 'Autônomo',
      rendaAtual: '',
      dinheiroGuardado: '',
      patrimonio: '',
      dividas: 'Nenhuma',
      sonhos: 'Viajar',
    },
    events: [
      {
        id: 'ev1',
        date: '2026-08-14',
        caption: 'Iniciou a mentoria RDV.',
        media: [{ id: 'md1', data: '<url>', assetId: 'x', type: 'image', name: 'foto.jpg' }],
        videoLinks: [{ id: 'vl1', url: 'https://www.youtube.com/watch?v=exemplo' }],
      },
    ],
    eventosPresenciais: [
      { id: 'p1', data: '2026-09-12', nome: 'Destrava - Passo Fundo', media: [] },
    ],
    investimentosAtivos: [
      { id: 'i1', data: '2026-10', nome: 'Renda fixa', media: [{ type: 'pdf' }] },
    ],
    imovelLeilao: [],
    mercadoImobiliario: [],
  },
];

describe('converterLegado: .json da ferramenta antiga → backup do CRM', () => {
  it('dashboard: status engajado/atencao/risco, data AAAA-MM-DD vira DD/MM/AAAA', () => {
    const { arquivo } = converterLegado('dashboard', dashboardAntigo, uuid);
    expect(backupSchema.safeParse(arquivo).success).toBe(true);
    expect(arquivo.registros).toEqual([
      {
        id: expect.any(String),
        nome: 'Maria Exemplo',
        tipoCadastro: 'Individual',
        tipoMentoria: 'RDV',
        dataEntrada: '14/08/2026',
        status: 'ENGAJADO',
      },
      expect.objectContaining({ status: 'EM_ATENCAO', dataEntrada: null, tipoCadastro: 'Casal' }),
      expect.objectContaining({ status: 'EM_RISCO', tipoCadastro: null, tipoMentoria: null }),
    ]);
  });

  it('dashboard: status desconhecido → erro com o número da linha', () => {
    expect(() =>
      converterLegado('dashboard', [{ ...dashboardAntigo[0], status: 'outro' }], uuid),
    ).toThrow('Status desconhecido no registro 1');
  });

  it('linha do tempo: pilares como "antes", evoCards na evolução, galeria vira conquistas', () => {
    const { arquivo } = converterLegado('linha-do-tempo', linhaAntiga, uuid);
    expect(backupSchema.safeParse(arquivo).success).toBe(true);
    const r = arquivo.registros[0] as Extract<
      (typeof arquivo.registros)[number],
      { conquistas: unknown }
    >;
    expect(r).toMatchObject({
      nome: 'Fulano Exemplo',
      dataInicio: '25/07/2026',
      notasMomentoInicial: 'Profissão: exemplo\n\nComo conheceu a mentoria: indicação',
      notasMomentoAtual: 'Comprometimento (0 a 10): 8',
      tempoMentoria: '1 ano e 2 meses',
      campos: {
        FE: { antes: 'Pouca' },
        SAUDE: { antes: 'Sedentário' },
        DINHEIRO: { antes: 'Endividado' },
        RELACIONAMENTOS: { antes: 'Bom' },
        RESERVA_FINANCEIRA: { antes: '0', depois: '10 mil' },
        EVOLUCAO_RENDA: { depois: 'dobrou' },
        EVOLUCAO_SAUDE: { depois: 'melhorou' },
        INVESTIMENTOS_MENTORIA: { depois: 'renda fixa' },
        AREA_ATUACAO: { depois: 'comércio' },
      },
    });
    expect(r.conquistas.map((c) => [c.data, c.descricao])).toEqual([
      ['01/09/2026', 'Viagem'],
      [null, 'Quitou o carro'],
    ]);
    // Foto de antes e a imagem da galeria só têm endereço da ferramenta antiga: não voltam.
    expect(r.midias.filter((m) => m.tipo !== 'LINK_VIDEO')).toHaveLength(2);
  });

  it('rdv: diagnóstico nos 9 campos, eventos com link de vídeo, quatro quadros, pasta', () => {
    const { arquivo, notasDeFora } = converterLegado('rdv', rdvAntigo, uuid);
    expect(backupSchema.safeParse(arquivo).success).toBe(true);
    const r = arquivo.registros[0] as Extract<
      (typeof arquivo.registros)[number],
      { eventos: unknown }
    >;
    expect(r.nome).toBe('Casal Exemplo');
    expect(r.pastaUrl).toBe('https://docs.google.com/spreadsheets/d/exemplo');
    expect(r.diagnostico).toEqual({
      idade: '40',
      situacao_conjugal: 'Casados',
      filhos: '2',
      trabalho: 'Autônomo',
      dividas: 'Nenhuma',
      sonhos_objetivos: 'Viajar',
    });
    expect(r.eventos).toEqual([
      expect.objectContaining({
        data: '14/08/2026',
        descricao: 'Iniciou a mentoria RDV.',
        origem: 'MANUAL',
      }),
    ]);
    expect(r.quadros.map((q) => [q.quadro, q.data, q.descricao])).toEqual([
      ['EVENTOS_PRESENCIAIS', '12/09/2026', 'Destrava - Passo Fundo'],
      ['INVESTIMENTO_ATIVOS', '10/2026', 'Renda fixa'],
    ]);
    expect(r.duvidas).toEqual([]);
    const links = r.midias.filter((m) => m.tipo === 'LINK_VIDEO');
    expect(links).toEqual([
      expect.objectContaining({
        donoTipo: 'RDV_EVENTO',
        donoId: r.eventos[0]!.id,
        urlVideo: 'https://www.youtube.com/watch?v=exemplo',
      }),
    ]);
    // Foto de perfil, foto do evento e o PDF do quadro: endereço da ferramenta antiga.
    expect(r.midias.filter((m) => m.tipo !== 'LINK_VIDEO')).toHaveLength(3);
    // "notasImportantes" não tem campo no RDV do PDF: conta para o aviso da prévia.
    expect(notasDeFora).toBe(1);
  });

  it('arquivo que não é lista de registros → erro', () => {
    expect(() => converterLegado('rdv', [{ semNome: true }], uuid)).toThrow('Registro 1 sem nome');
  });
});

describe('formulário (Google Forms → planilha → CSV)', () => {
  it('parseCsv: aspas, vírgula e quebra de linha dentro do campo', () => {
    expect(parseCsv('a,"b, c","linha 1\nlinha 2"\r\nd,"diz ""oi""",\n')).toEqual([
      ['a', 'b, c', 'linha 1\nlinha 2'],
      ['d', 'diz "oi"', ''],
    ]);
  });

  it('9 colunas pela posição; 1ª linha ignorada; data com hora fica só com o dia', () => {
    const csv = [
      'Carimbo,Nome,Fé,Saúde,Dinheiro,Relacionamentos,Notas,Tempo,Evolução',
      '25/07/2026 14:03:22,Fulano Exemplo,Pouca,Sedentário,Endividado,Bom,"Profissão: exemplo",1 ano,"Comprometimento: 8"',
      '26/07/2026,,a,b,c,d,e,f,g',
    ].join('\n');
    const { arquivo, invalidas } = converterFormulario(csv, uuid);
    expect(backupSchema.safeParse(arquivo).success).toBe(true);
    expect(arquivo.registros).toEqual([
      expect.objectContaining({
        nome: 'Fulano Exemplo',
        dataInicio: '25/07/2026',
        notasMomentoInicial: 'Profissão: exemplo',
        tempoMentoria: '1 ano',
        notasMomentoAtual: 'Comprometimento: 8',
        campos: {
          FE: { antes: 'Pouca' },
          SAUDE: { antes: 'Sedentário' },
          DINHEIRO: { antes: 'Endividado' },
          RELACIONAMENTOS: { antes: 'Bom' },
        },
        conquistas: [],
        midias: [],
      }),
    ]);
    expect(invalidas).toEqual([3]);
  });
});

describe('nomesDoArquivo: a tela mostra os nomes da prévia pelo índice', () => {
  it('lê o formato do CRM e o da ferramenta antiga', () => {
    expect(nomesDoArquivo(dashboardAntigo)).toEqual([
      'Maria Exemplo',
      'João Exemplo',
      'Ana Exemplo',
    ]);
    expect(nomesDoArquivo(linhaAntiga)).toEqual(['Fulano Exemplo']);
    expect(nomesDoArquivo({ registros: [{ nome: 'A' }, { nome: 'B' }] })).toEqual(['A', 'B']);
  });
});

describe('evento sem data no RDV antigo (revisão final)', () => {
  it('fica de fora e é contado, sem travar a importação dos outros', () => {
    const r = JSON.parse(JSON.stringify(rdvAntigo)) as typeof rdvAntigo;
    r[0]!.events.push({ id: 'ev2', date: '', caption: 'Sem data', media: [], videoLinks: [] });
    const { arquivo, eventosSemData } = converterLegado('rdv', r, uuid);
    expect(backupSchema.safeParse(arquivo).success).toBe(true);
    const reg = arquivo.registros[0] as { eventos: { descricao: string | null }[] };
    expect(reg.eventos.map((e) => e.descricao)).toEqual(['Iniciou a mentoria RDV.']);
    expect(eventosSemData).toBe(1);
  });
});
