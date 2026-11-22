import { describe, expect, it } from 'vitest';
import {
  CAMPOS_EVOLUCAO,
  LIMITE_CAMPO_EVOLUCAO,
  legadoParaEvolucao,
  topicos,
} from '../src/mentoria/evolucao.js';
import { conquistaCriarSchema, evolucaoPutSchema } from '../src/schemas/mentoria.js';

// NPAC-57: aba Evolução. Tópicos com rótulo em negrito e a cópia dos textos do sistema antigo (spec §5.4 e §6.4).

describe('topicos', () => {
  it('"Dor: texto" → { rotulo: "Dor", texto: "texto" }', () => {
    expect(topicos('Dor: texto')).toEqual([{ rotulo: 'Dor', texto: 'texto' }]);
  });

  it('linha em branco, "\\r\\n" e espaços somem', () => {
    expect(topicos('  primeira  \r\n\r\n   \nSonho:   casa própria  \r\n\n')).toEqual([
      { rotulo: null, texto: 'primeira' },
      { rotulo: 'Sonho', texto: 'casa própria' },
    ]);
    expect(topicos('')).toEqual([]);
    expect(topicos('   \n \r\n')).toEqual([]);
    expect(topicos(null)).toEqual([]);
    expect(topicos(undefined)).toEqual([]);
  });

  it('rótulo com 25+ caracteres não vira rótulo', () => {
    const longo = 'Um rótulo comprido demais'; // 25 caracteres
    expect(longo).toHaveLength(25);
    expect(topicos(`${longo}: texto`)).toEqual([{ rotulo: null, texto: `${longo}: texto` }]);
    const limite = 'Meta de doze meses agora'; // 24 caracteres
    expect(limite).toHaveLength(24);
    expect(topicos(`${limite}: texto`)).toEqual([{ rotulo: limite, texto: 'texto' }]);
  });

  it('"Obs:" sem texto vira { rotulo: null, texto: "Obs:" }', () => {
    expect(topicos('Obs:')).toEqual([{ rotulo: null, texto: 'Obs:' }]);
    expect(topicos('Obs:   ')).toEqual([{ rotulo: null, texto: 'Obs:' }]);
    expect(topicos(': sem rótulo')).toEqual([{ rotulo: null, texto: ': sem rótulo' }]);
    // Link e hora não viram rótulo (sem espaço depois dos dois-pontos).
    expect(topicos('https://exemplo.com')).toEqual([
      { rotulo: null, texto: 'https://exemplo.com' },
    ]);
    expect(topicos('Reunião às 10:30')).toEqual([{ rotulo: null, texto: 'Reunião às 10:30' }]);
    // Só os primeiros dois-pontos separam.
    expect(topicos('Hora: 10:30 da manhã')).toEqual([{ rotulo: 'Hora', texto: '10:30 da manhã' }]);
  });

  it('emoji e acento passam inteiros', () => {
    expect(topicos('Fé 🙏: voltou à igreja ✨\nSaúde: perdeu 8 kg 💪🏽')).toEqual([
      { rotulo: 'Fé 🙏', texto: 'voltou à igreja ✨' },
      { rotulo: 'Saúde', texto: 'perdeu 8 kg 💪🏽' },
    ]);
    // Emoji simples conta como um caractere no limite do rótulo.
    expect(topicos(`${'a'.repeat(23)}🙏: ok`)).toEqual([
      { rotulo: `${'a'.repeat(23)}🙏`, texto: 'ok' },
    ]);
  });
});

describe('legadoParaEvolucao', () => {
  const legado = {
    antesDepois: {
      RESERVA_FINANCEIRA: { antes: 'R$ 0', depois: 'R$ 30 mil' },
      EVOLUCAO_RENDA: { depois: 'De 8 para 15 mil' },
      EVOLUCAO_SAUDE: { depois: 'Academia 4x' },
      INVESTIMENTOS_MENTORIA: { depois: 'Tesouro e ações' },
      AREA_ATUACAO: { depois: 'Abriu a clínica' },
      FE: { antes: 'Afastado' },
      SAUDE: { antes: 'Sedentário' },
      DINHEIRO: { antes: 'Endividado' },
      RELACIONAMENTOS: { antes: 'Brigas frequentes' },
    },
    notasMomentoInicial: 'Chegaram cansados',
    notasMomentoAtual: 'Dívidas quitadas\nViajaram juntos',
    conquistas: [
      { id: 'x1', data: '10/03/2025', descricao: 'Quitou o carro' },
      { id: 'x2', data: null, descricao: 'Texto arquivado' },
      { id: 'x3', data: '2025-07-01', descricao: null },
    ],
    outraChave: 'ignorada',
  };

  it('antesDepois RESERVA_FINANCEIRA antes/depois → reservaAntes/reservaHoje; renda, saúde, investimentos e área .depois', () => {
    const r = legadoParaEvolucao(legado);
    expect(r.campos).toMatchObject({
      reservaAntes: 'R$ 0',
      reservaHoje: 'R$ 30 mil',
      renda: 'De 8 para 15 mil',
      saude: 'Academia 4x',
      investimentos: 'Tesouro e ações',
      areaAtuacao: 'Abriu a clínica',
    });
  });

  it('notasMomentoInicial + "Fé: …", "Saúde: …", "Dinheiro: …", "Relacionamentos: …" → inicialNotas, nessa ordem', () => {
    expect(legadoParaEvolucao(legado).campos.inicialNotas).toBe(
      'Chegaram cansados\nFé: Afastado\nSaúde: Sedentário\nDinheiro: Endividado\nRelacionamentos: Brigas frequentes',
    );
    // Sem as notas, só os pilares; sem nada, o campo não vem.
    const soPilares = legadoParaEvolucao({ antesDepois: { SAUDE: { antes: 'Ruim' } } });
    expect(soPilares.campos).toEqual({ inicialNotas: 'Saúde: Ruim' });
    expect(legadoParaEvolucao({ notasMomentoInicial: '  ' }).campos).toEqual({});
  });

  it('notasMomentoAtual → atualNotas; conquistas → [{data, descricao}]', () => {
    const r = legadoParaEvolucao(legado);
    expect(r.campos.atualNotas).toBe('Dívidas quitadas\nViajaram juntos');
    expect(r.conquistas).toEqual([
      { data: '2025-03-10', descricao: 'Quitou o carro' },
      { data: null, descricao: 'Texto arquivado' },
      { data: '2025-07-01', descricao: null },
    ]);
    // Só os campos conhecidos, nunca as outras chaves do legado.
    expect(
      Object.keys(r.campos).every((k) => (CAMPOS_EVOLUCAO as readonly string[]).includes(k)),
    ).toBe(true);
  });

  it('data da conquista que não é dia inteiro de calendário vira nula', () => {
    const r = legadoParaEvolucao({
      conquistas: [
        { data: '03/2025', descricao: 'Mês só' },
        { data: '31/02/2025', descricao: 'Dia que não existe' },
        { data: 'ontem', descricao: 'Texto' },
        { data: null, descricao: null },
        'lixo',
      ],
    });
    expect(r.conquistas).toEqual([
      { data: null, descricao: 'Mês só' },
      { data: null, descricao: 'Dia que não existe' },
      { data: null, descricao: 'Texto' },
    ]);
  });

  it('lixo (null, número, chaves faltando) → { campos: {}, conquistas: [] }', () => {
    for (const lixo of [
      null,
      undefined,
      42,
      'texto',
      [],
      {},
      { antesDepois: 3, conquistas: 'x' },
    ]) {
      expect(legadoParaEvolucao(lixo)).toEqual({ campos: {}, conquistas: [] });
    }
    expect(
      legadoParaEvolucao({
        antesDepois: { RESERVA_FINANCEIRA: 'x', EVOLUCAO_RENDA: { depois: 5 } },
      }),
    ).toEqual({
      campos: { renda: '5' },
      conquistas: [],
    });
  });
});

describe('schemas', () => {
  it('evolucaoPutSchema: aceita um campo; vazio vira nulo', () => {
    expect(evolucaoPutSchema.parse({ version: 0, renda: '  mais 5 mil  ' })).toEqual({
      version: 0,
      renda: 'mais 5 mil',
    });
    expect(evolucaoPutSchema.parse({ version: 3, atualNotas: '   ' })).toEqual({
      version: 3,
      atualNotas: null,
    });
    expect(
      evolucaoPutSchema.safeParse({ version: 1, saude: 'x'.repeat(LIMITE_CAMPO_EVOLUCAO) }).success,
    ).toBe(true);
  });

  it('evolucaoPutSchema: recusa campo fora da lista, texto com 2.001 caracteres e corpo só com version', () => {
    expect(evolucaoPutSchema.safeParse({ version: 1, dor: 'x' }).success).toBe(false);
    expect(evolucaoPutSchema.safeParse({ version: 1, legadoCopiadoEm: 'x' }).success).toBe(false);
    expect(evolucaoPutSchema.safeParse({ version: 1, renda: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    expect(evolucaoPutSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(evolucaoPutSchema.safeParse({ renda: 'x' }).success).toBe(false);
    expect(evolucaoPutSchema.safeParse({ version: -1, renda: 'x' }).success).toBe(false);
  });

  it('conquistaCriarSchema: data na faixa do módulo e descrição até 500', () => {
    expect(conquistaCriarSchema.parse({ data: '2025-03-10', descricao: ' Quitou ' })).toEqual({
      data: '2025-03-10',
      descricao: 'Quitou',
    });
    expect(conquistaCriarSchema.parse({ data: null, descricao: '' })).toEqual({
      data: null,
      descricao: null,
    });
    expect(conquistaCriarSchema.safeParse({ data: '0025-03-10', descricao: 'x' }).success).toBe(
      false,
    );
    expect(conquistaCriarSchema.safeParse({ data: '2025-02-30', descricao: 'x' }).success).toBe(
      false,
    );
    expect(conquistaCriarSchema.safeParse({ data: null, descricao: 'x'.repeat(501) }).success).toBe(
      false,
    );
    expect(conquistaCriarSchema.safeParse({ data: null, descricao: 'x', extra: 1 }).success).toBe(
      false,
    );
  });
});
