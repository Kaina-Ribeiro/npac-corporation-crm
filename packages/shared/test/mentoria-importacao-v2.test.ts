import { describe, expect, it } from 'vitest';
import {
  chaveParecidos,
  dataImportada,
  mentoriaDoRotulo,
  montarCarteira,
  separarCasal,
  valorEmCentavos,
  type FontesImportacao,
  type PlanilhaLida,
  type RespostaForm,
} from '../src/mentoria/importacao.js';

const resposta = (r: Partial<RespostaForm> & { nome: string }): RespostaForm => ({
  carimbo: null,
  apelido: null,
  telefone: null,
  email: null,
  instagram: null,
  endereco: null,
  conjuge: null,
  conjugeParticipa: null,
  sonho: null,
  medo: null,
  pulseira: null,
  foto: null,
  motivacao: null,
  camiseta: null,
  livros: null,
  ...r,
});
const planilha = (p: Partial<PlanilhaLida>): PlanilhaLida => ({
  respostas: [],
  processos: [],
  cancelamentos: [],
  ...p,
});
const so = (planilhaLida: Partial<PlanilhaLida>): FontesImportacao => ({
  planilha: planilha(planilhaLida),
});

describe('valorEmCentavos', () => {
  it.each([
    ['R$ 8 mil', 800000],
    ['R$ 1.500,50', 150050],
    ['8000', 800000],
    ['8.000', 800000],
    ['1,5 mil', 150000],
    ['R$ 2 milhões', 200000000],
    ['10k', 1000000],
    ['0', 0],
  ])('%s vira %i', (texto, centavos) => {
    expect(valorEmCentavos(texto)).toBe(centavos);
  });

  it.each(['uns 8 ou 10', 'não sei', '', 'R$', '12.34.56', 'entre 5 e 8 mil'])(
    '%s fica nulo',
    (texto) => {
      expect(valorEmCentavos(texto)).toBeNull();
    },
  );
});

describe('separarCasal', () => {
  it('separa pelo " e " de fora dos parênteses', () => {
    expect(separarCasal('João Carlos (Gegê) e Hellen')).toEqual({
      pessoa1: 'João Carlos (Gegê)',
      pessoa2: 'Hellen',
    });
  });

  it('não acha o " e " dentro do parêntese', () => {
    expect(separarCasal('Ana (filha e mãe)')).toEqual({
      pessoa1: 'Ana (filha e mãe)',
      pessoa2: null,
    });
  });

  it('nome único fica sem pessoa 2', () => {
    expect(separarCasal('Mentorado Fictício')).toEqual({
      pessoa1: 'Mentorado Fictício',
      pessoa2: null,
    });
  });
});

describe('mentoriaDoRotulo', () => {
  it('lê mentoria, variante e casal', () => {
    expect(mentoriaDoRotulo('6M CASAL')).toEqual({ mentoria: '6M', variante: null, casal: true });
    expect(mentoriaDoRotulo('2M / 2 ENCONTROS')).toEqual({
      mentoria: '2M',
      variante: '2 encontros',
      casal: false,
    });
    expect(mentoriaDoRotulo('MENTORIA RDV + 1 BOTÃO')).toEqual({
      mentoria: 'RDV',
      variante: '+1 botão',
      casal: false,
    });
  });

  it('rótulo sem mentoria clara fica nulo', () => {
    expect(mentoriaDoRotulo('NOVO FORMATO/ PASSO FUNDO').mentoria).toBeNull();
    expect(mentoriaDoRotulo('IDR').mentoria).toBeNull();
    expect(mentoriaDoRotulo('PME').mentoria).toBeNull();
  });

  it('dois rótulos de mentoria são ambíguos', () => {
    expect(mentoriaDoRotulo('2M e 6M').mentoria).toBeNull();
  });
});

describe('dataImportada', () => {
  it('lê ISO, mês solto e data brasileira', () => {
    expect(dataImportada('2026-03-15')).toEqual({ data: '2026-03-15', aproximada: false });
    expect(dataImportada('2026-03')).toEqual({ data: '2026-03-01', aproximada: true });
    expect(dataImportada('15/03/2026')).toEqual({ data: '2026-03-15', aproximada: false });
    expect(dataImportada('03/2026')).toEqual({ data: '2026-03-01', aproximada: true });
    expect(dataImportada('qualquer dia')).toEqual({ data: null, aproximada: false });
  });
});

describe('montarCarteira: planilha', () => {
  it('duas respostas da mesma pessoa: vale a mais recente', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Fictício Um', carimbo: '2026-01-01', telefone: '11900000001' }),
          resposta({ nome: 'fictício um', carimbo: '2026-02-01', telefone: '11900000002' }),
        ],
      }),
    );
    expect(c.novos).toHaveLength(1);
    expect(c.novos[0]!.pessoas[0]!.whatsapp).toBe('11900000002');
  });

  it('respostas do casal são pareadas pelo nome do cônjuge', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({
            nome: 'Fictícia Ana',
            carimbo: '2026-01-01',
            conjuge: 'Fictício Bruno',
            conjugeParticipa: true,
            telefone: '11900000001',
          }),
          resposta({
            nome: 'Fictício Bruno',
            carimbo: '2026-01-02',
            conjuge: 'Fictícia Ana',
            conjugeParticipa: true,
            telefone: '11900000002',
          }),
        ],
      }),
    );
    expect(c.novos).toHaveLength(1);
    expect(c.novos[0]).toMatchObject({ tipo: 'CASAL', nome: 'Fictícia Ana e Fictício Bruno' });
    expect(c.novos[0]!.pessoas.map((p) => p.whatsapp)).toEqual(['11900000001', '11900000002']);
  });

  it('cônjuge que não participa não vira casal', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Fictícia Ana', conjuge: 'Fictício Bruno', conjugeParticipa: false }),
        ],
      }),
    );
    expect(c.novos[0]).toMatchObject({ tipo: 'INDIVIDUAL' });
  });

  it('cônjuge participa sem resposta própria: pessoa 2 só com o nome', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Fictícia Ana', conjuge: 'Fictício Bruno', conjugeParticipa: true }),
        ],
      }),
    );
    expect(c.novos[0]!.pessoas.map((p) => p.nome)).toEqual(['Fictícia Ana', 'Fictício Bruno']);
  });

  it('quem está em CANCELAMENTOS sai com status CANCELADO', () => {
    const c = montarCarteira(
      so({
        respostas: [resposta({ nome: 'Fictício Um' }), resposta({ nome: 'Fictício Dois' })],
        cancelamentos: [{ nome: 'Fictício Um', mentoria: null }],
      }),
    );
    const por = Object.fromEntries(c.novos.map((n) => [n.nome, n.status]));
    expect(por).toEqual({ 'Fictício Um': 'CANCELADO', 'Fictício Dois': 'ATIVO' });
  });

  it('processo dá mentoria, variante, compra e início de 2M e 6M', () => {
    const c = montarCarteira(
      so({
        respostas: [resposta({ nome: 'Fictício Um' })],
        processos: [
          {
            nome: 'Fictício Um',
            dataInicio: '2026-02-10',
            mentoria: '2M / 2 ENCONTROS',
            status: 'verde',
          },
        ],
      }),
    );
    expect(c.novos[0]).toMatchObject({
      mentoria: '2M',
      mentoriaVariante: '2 encontros',
      dataCompra: '2026-02-10',
      inicioJornada: '2026-02-10',
    });
    expect(c.novos[0]!.legado.statusPlanilha).toBe('verde');
  });

  it('RDV não usa a data de início como início da jornada', () => {
    const c = montarCarteira(
      so({
        processos: [
          { nome: 'Fictício Um', dataInicio: '2026-02-10', mentoria: 'RDV', status: null },
        ],
      }),
    );
    expect(c.novos[0]).toMatchObject({ mentoria: 'RDV', inicioJornada: null });
  });

  it('agrupa rótulos sem mentoria, inclusive quem não tem rótulo', () => {
    const c = montarCarteira(
      so({
        respostas: [resposta({ nome: 'Fictício Três' })],
        processos: [
          { nome: 'Fictício Um', dataInicio: null, mentoria: 'NOVO FORMATO', status: null },
          { nome: 'Fictício Dois', dataInicio: null, mentoria: 'NOVO FORMATO', status: null },
        ],
      }),
    );
    expect(c.rotulosSemMentoria).toEqual([
      { rotulo: 'NOVO FORMATO', total: 2 },
      { rotulo: 'Sem mentoria informada', total: 1 },
    ]);
  });

  it('decisão resolve o rótulo e guarda o original', () => {
    const c = montarCarteira({
      ...so({
        processos: [
          { nome: 'Fictício Um', dataInicio: null, mentoria: 'NOVO FORMATO', status: null },
        ],
      }),
      decisoes: { rotulos: { 'NOVO FORMATO': '6M' } },
    });
    expect(c.novos[0]).toMatchObject({ mentoria: '6M' });
    expect(c.novos[0]!.legado.rotuloOriginal).toBe('NOVO FORMATO');
    expect(c.rotulosSemMentoria).toEqual([]);
  });
});

describe('montarCarteira: gerenciador', () => {
  const gerenciador = (g: NonNullable<FontesImportacao['gerenciador']>): FontesImportacao => ({
    gerenciador: g,
  });

  it('casa os três arquivos pelo nome normalizado', () => {
    const c = montarCarteira(
      gerenciador({
        dashboard: [
          {
            nome: 'Fictício  Um',
            tipo: 'Individual',
            tipoMentoria: 'RDV',
            dataEntrada: '2026-03',
            status: 'risco',
          },
        ],
        linhaDoTempo: [{ nome: 'fictício um', pilares: { fe: '7' } }],
        rdv: [
          {
            nome: 'FICTÍCIO UM',
            planilhaLink: 'https://drive.google.com/x',
            diagnostico: { rendaAtual: 'R$ 8 mil', sonhos: 'Sonho fictício', dividas: 'não' },
          },
        ],
      }),
    );
    expect(c.novos).toHaveLength(1);
    expect(c.naoCasados).toEqual([]);
    expect(c.novos[0]).toMatchObject({
      mentoria: 'RDV',
      dataCompra: '2026-03-01',
      dataCompraAproximada: true,
      linkPasta: 'https://drive.google.com/x',
    });
    expect(c.novos[0]!.momento).toMatchObject({
      recebeCentavos: 800000,
      sonho: 'Sonho fictício',
      temDividas: false,
    });
    expect(c.novos[0]!.legado.statusEngajamento).toBe('risco');
  });

  it('lista quem não casou entre as fontes', () => {
    const c = montarCarteira(
      gerenciador({
        dashboard: [{ nome: 'Fictício Um', tipoMentoria: 'RDV', status: 'engajado' }],
        rdv: [{ nome: 'Fictício Dois', diagnostico: {} }],
      }),
    );
    expect(c.naoCasados.sort()).toEqual(['Fictício Dois', 'Fictício Um']);
  });

  it('valor ambíguo fica nulo, vai para legado e marca completar', () => {
    const c = montarCarteira(
      gerenciador({
        rdv: [{ nome: 'Fictício Um', diagnostico: { rendaAtual: 'uns 8 ou 10' } }],
      }),
    );
    expect(c.novos[0]!.momento?.recebeCentavos).toBeNull();
    expect(c.novos[0]!.completar).toContain('recebeCentavos');
    expect(c.novos[0]!.legado.valoresOriginais).toMatchObject({ recebeCentavos: 'uns 8 ou 10' });
  });

  it('nome de casal do gerenciador sugere duas pessoas e a decisão corrige', () => {
    const fonte = gerenciador({
      dashboard: [{ nome: 'João (Gegê) e Hellen', tipoMentoria: 'RDV', status: 'engajado' }],
    });
    const sugerido = montarCarteira(fonte);
    expect(sugerido.novos[0]).toMatchObject({ tipo: 'CASAL' });
    expect(sugerido.novos[0]!.pessoas.map((p) => p.nome)).toEqual(['João (Gegê)', 'Hellen']);
    const chave = sugerido.novos[0]!.chave;
    const corrigido = montarCarteira({
      ...fonte,
      decisoes: { casais: { [chave]: { pessoa1: 'João Fictício', pessoa2: null } } },
    });
    expect(corrigido.novos[0]).toMatchObject({ tipo: 'INDIVIDUAL' });
    expect(corrigido.novos[0]!.pessoas.map((p) => p.nome)).toEqual(['João Fictício']);
  });

  it('mídia antiga vai para o legado como lista', () => {
    const c = montarCarteira(
      gerenciador({
        rdv: [{ nome: 'Fictício Um', photo: 'antigo.jpg', diagnostico: {} }],
      }),
    );
    expect(c.novos[0]!.legado.midias).toHaveLength(1);
  });
});

describe('montarCarteira: as duas fontes', () => {
  it('planilha preenche contato e endereço; gerenciador, o diagnóstico', () => {
    const c = montarCarteira({
      planilha: planilha({
        respostas: [
          resposta({
            nome: 'Fictício Um',
            telefone: '11900000001',
            endereco: 'Rua Fictícia, 1',
            sonho: 'Sonho da planilha',
            medo: 'Medo fictício',
          }),
        ],
      }),
      gerenciador: {
        dashboard: [{ nome: 'Fictício Um', tipoMentoria: 'RDV', status: 'engajado' }],
        rdv: [{ nome: 'Fictício Um', diagnostico: { sonhos: 'Sonho do diagnóstico' } }],
      },
    });
    expect(c.novos).toHaveLength(1);
    const n = c.novos[0]!;
    expect(n.pessoas[0]!.whatsapp).toBe('11900000001');
    expect(n.endereco).toBe('Rua Fictícia, 1');
    expect(n.momento).toMatchObject({ sonho: 'Sonho do diagnóstico', dor: 'Medo fictício' });
  });

  it('mostra nomes parecidos e, com JUNTAR, vira um só', () => {
    const fontes: FontesImportacao = {
      planilha: planilha({ respostas: [resposta({ nome: 'João Carlos Fictício' })] }),
      gerenciador: {
        dashboard: [{ nome: 'João Fictício', tipoMentoria: 'RDV', status: 'engajado' }],
      },
    };
    const antes = montarCarteira(fontes);
    expect(antes.parecidos).toHaveLength(1);
    expect(antes.novos).toHaveLength(2);
    const [a, b] = antes.parecidos[0]!;
    const depois = montarCarteira({
      ...fontes,
      decisoes: { parecidos: { [chaveParecidos(a, b)]: 'JUNTAR' } },
    });
    expect(depois.novos).toHaveLength(1);
    expect(depois.parecidos).toHaveLength(0);
    expect(depois.novos[0]!.mentoria).toBe('RDV');
  });

  it('nome já cadastrado é ignorado', () => {
    const c = montarCarteira({
      ...so({
        respostas: [resposta({ nome: 'Fictício Um' }), resposta({ nome: 'Fictício Dois' })],
      }),
      jaCadastrados: new Set(['ficticio um']),
    });
    expect(c.novos.map((n) => n.nome)).toEqual(['Fictício Dois']);
    expect(c.ignorados).toEqual(['Fictício Um']);
  });

  it('JUNTAR com o casal mantém a segunda pessoa e o contato dela', () => {
    const fontes: FontesImportacao = {
      planilha: planilha({
        respostas: [
          resposta({
            nome: 'Maria Fictícia',
            carimbo: '2026-01-01',
            conjuge: 'João Fictício',
            conjugeParticipa: true,
            telefone: '11900000001',
          }),
          resposta({
            nome: 'João Fictício',
            carimbo: '2026-01-02',
            conjuge: 'Maria Fictícia',
            conjugeParticipa: true,
            telefone: '11900000002',
          }),
        ],
      }),
      gerenciador: { dashboard: [{ nome: 'Maria', tipoMentoria: 'RDV', status: 'engajado' }] },
    };
    const k = chaveParecidos('Maria', 'Maria Fictícia e João Fictício');
    const c = montarCarteira({ ...fontes, decisoes: { parecidos: { [k]: 'JUNTAR' } } });
    expect(c.novos).toHaveLength(1);
    expect(c.novos[0]).toMatchObject({ tipo: 'CASAL', mentoria: 'RDV' });
    expect(c.novos[0]!.pessoas.map((p) => p.whatsapp)).toEqual(['11900000001', '11900000002']);
  });

  it('guarda os apelidos da entrada para a reimportação não duplicar depois de JUNTAR', () => {
    const fontes: FontesImportacao = {
      planilha: planilha({ respostas: [resposta({ nome: 'João Carlos Fictício' })] }),
      gerenciador: {
        dashboard: [{ nome: 'João Fictício', tipoMentoria: 'RDV', status: 'engajado' }],
      },
    };
    const k = chaveParecidos('João Carlos Fictício', 'João Fictício');
    const c = montarCarteira({ ...fontes, decisoes: { parecidos: { [k]: 'JUNTAR' } } });
    const apelidos = new Set(c.novos[0]!.apelidos);
    expect(apelidos).toEqual(new Set(['joao carlos ficticio', 'joao ficticio']));
    const de_novo = montarCarteira({ ...fontes, jaCadastrados: apelidos });
    expect(de_novo.novos).toEqual([]);
  });

  it('nome parecido com quem já está na base aparece para decidir', () => {
    const fonte: FontesImportacao = {
      ...so({ respostas: [resposta({ nome: 'João Carlos Fictício' })] }),
      jaCadastrados: new Set(['joao ficticio']),
    };
    const c = montarCarteira(fonte);
    expect(c.parecidos).toEqual([['João Carlos Fictício', 'joao ficticio']]);
    expect(c.novos).toHaveLength(1);
    const k = chaveParecidos('João Carlos Fictício', 'joao ficticio');
    const junta = montarCarteira({ ...fonte, decisoes: { parecidos: { [k]: 'JUNTAR' } } });
    expect(junta.novos).toEqual([]);
    expect(junta.ignorados).toEqual(['João Carlos Fictício']);
    expect(junta.parecidos).toEqual([]);
    const separa = montarCarteira({ ...fonte, decisoes: { parecidos: { [k]: 'SEPARAR' } } });
    expect(separa.novos).toHaveLength(1);
    expect(separa.parecidos).toEqual([]);
  });

  it('primeiro nome solto do cônjuge não captura outra pessoa', () => {
    const c = montarCarteira({
      planilha: planilha({
        respostas: [resposta({ nome: 'Carlos Fictício', conjuge: 'Ana', conjugeParticipa: true })],
      }),
      gerenciador: { rdv: [{ nome: 'Ana', diagnostico: { sonhos: 'Sonho da outra Ana' } }] },
    });
    expect(c.novos).toHaveLength(2);
    const casal = c.novos.find((n) => n.tipo === 'CASAL')!;
    expect(casal.momento).toBeNull();
  });

  it('primeiro nome solto já cadastrado não derruba o casal novo', () => {
    const c = montarCarteira({
      gerenciador: {
        dashboard: [{ nome: 'Ana e Bruno', tipoMentoria: 'RDV', status: 'engajado' }],
      },
      jaCadastrados: new Set(['bruno']),
    });
    expect(c.novos).toHaveLength(1);
  });

  it('processo com nome mais curto junta com a resposta do formulário', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({
            nome: 'Ana Fictícia Souza',
            conjuge: 'Bruno Fictício Lima',
            conjugeParticipa: true,
            telefone: '11900000001',
          }),
          resposta({ nome: 'Carla Fictícia Dias', telefone: '11900000003' }),
        ],
        processos: [
          {
            nome: 'Ana Souza e Bruno Lima',
            dataInicio: '2026-02-01',
            mentoria: '2M',
            status: null,
          },
          { nome: 'Carla Dias', dataInicio: '2026-03-01', mentoria: '6M', status: null },
        ],
      }),
    );
    expect(c.parecidos).toEqual([]);
    expect(c.novos).toHaveLength(2);
    const casal = c.novos.find((n) => n.tipo === 'CASAL')!;
    expect(casal).toMatchObject({
      nome: 'Ana Fictícia Souza e Bruno Fictício Lima',
      mentoria: '2M',
      inicioJornada: '2026-02-01',
    });
    expect(casal.apelidos).toContain('ana souza e bruno lima');
    expect(c.novos.find((n) => n.tipo === 'INDIVIDUAL')).toMatchObject({
      mentoria: '6M',
      pessoas: [{ whatsapp: '11900000003' }],
    });
  });

  it('cancelamento com nome mais curto marca a inscrição que já existe', () => {
    const c = montarCarteira(
      so({
        respostas: [resposta({ nome: 'Carla Fictícia Dias' })],
        processos: [
          { nome: 'Carla Fictícia Dias', dataInicio: '2026-03-01', mentoria: '6M', status: null },
        ],
        cancelamentos: [{ nome: 'Carla Dias', mentoria: null }],
      }),
    );
    expect(c.novos).toHaveLength(1);
    expect(c.novos[0]).toMatchObject({ status: 'CANCELADO', mentoria: '6M' });
  });

  it('nome curto que serve para duas pessoas não junta sozinho', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Carla Fictícia Dias' }),
          resposta({ nome: 'Carla Dias Fictícia' }),
        ],
        processos: [
          { nome: 'Carla Dias', dataInicio: '2026-03-01', mentoria: '6M', status: null },
          { nome: 'Carla', dataInicio: '2026-03-01', mentoria: '6M', status: null },
        ],
      }),
    );
    expect(c.novos).toHaveLength(4);
    expect(c.parecidos.length).toBeGreaterThan(0);
  });

  it('processo "A e B" une duas respostas soltas num casal', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Fictícia Ana', carimbo: '2026-01-01', telefone: '11900000001' }),
          resposta({ nome: 'Fictício Bruno', carimbo: '2026-01-02', telefone: '11900000002' }),
        ],
        processos: [
          {
            nome: 'Fictícia Ana e Fictício Bruno',
            dataInicio: '2026-02-01',
            mentoria: '6M',
            status: null,
          },
        ],
      }),
    );
    expect(c.novos).toHaveLength(1);
    expect(c.novos[0]).toMatchObject({ tipo: 'CASAL' });
    expect(c.novos[0]!.pessoas.map((p) => p.whatsapp)).toEqual(['11900000001', '11900000002']);
  });

  it('do casal, usa o endereço e o sonho de quem preencheu', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({
            nome: 'Fictícia Ana',
            carimbo: '2026-01-01',
            conjuge: 'Fictício Bruno',
            conjugeParticipa: true,
          }),
          resposta({
            nome: 'Fictício Bruno',
            carimbo: '2026-01-02',
            conjuge: 'Fictícia Ana',
            conjugeParticipa: true,
            endereco: 'Rua Fictícia, 2',
            sonho: 'Sonho do Bruno',
            motivacao: 'Motivo do Bruno',
          }),
        ],
      }),
    );
    expect(c.novos[0]!.endereco).toBe('Rua Fictícia, 2');
    expect(c.novos[0]!.momento?.sonho).toBe('Sonho do Bruno');
    expect(c.novos[0]!.legado.pessoa2).toEqual({ motivacao: 'Motivo do Bruno' });
  });

  it('inverter as pessoas na decisão leva o contato junto', () => {
    const fonte = so({
      respostas: [
        resposta({
          nome: 'Fictícia Ana',
          carimbo: '2026-01-01',
          conjuge: 'Fictício Bruno',
          conjugeParticipa: true,
          telefone: '11900000001',
        }),
        resposta({
          nome: 'Fictício Bruno',
          carimbo: '2026-01-02',
          conjuge: 'Fictícia Ana',
          conjugeParticipa: true,
          telefone: '11900000002',
        }),
      ],
    });
    const chave = montarCarteira(fonte).novos[0]!.chave;
    const c = montarCarteira({
      ...fonte,
      decisoes: { casais: { [chave]: { pessoa1: 'Fictício Bruno', pessoa2: 'Fictícia Ana' } } },
    });
    expect(c.novos[0]!.pessoas.map((p) => [p.nome, p.whatsapp])).toEqual([
      ['Fictício Bruno', '11900000002'],
      ['Fictícia Ana', '11900000001'],
    ]);
  });

  it('carimbo em DD/MM/AAAA: vale a resposta mais recente de verdade', () => {
    const c = montarCarteira(
      so({
        respostas: [
          resposta({ nome: 'Fictício Um', carimbo: '20/01/2026 10:00', telefone: '11900000001' }),
          resposta({ nome: 'Fictício Um', carimbo: '05/02/2026 10:00', telefone: '11900000002' }),
        ],
      }),
    );
    expect(c.novos[0]!.pessoas[0]!.whatsapp).toBe('11900000002');
  });

  it('2M sem data de início marca completar', () => {
    const c = montarCarteira({
      gerenciador: {
        dashboard: [{ nome: 'Fictício Um', tipoMentoria: '2M', status: 'engajado' }],
      },
    });
    expect(c.novos[0]!.inicioJornada).toBeNull();
    expect(c.novos[0]!.completar).toContain('inicioJornada');
  });

  it('decisão troca o status', () => {
    const fonte = so({ respostas: [resposta({ nome: 'Fictício Um' })] });
    const c = montarCarteira({
      ...fonte,
      decisoes: { status: { 'ficticio um': 'CONCLUIDO' } },
    });
    expect(c.novos[0]!.status).toBe('CONCLUIDO');
  });
});
