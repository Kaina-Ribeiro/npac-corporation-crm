import { describe, expect, it } from 'vitest';
import { parseDiagnostico } from '../src/mentoria/diagnostico.js';
import { parseEventosColados } from '../src/mentoria/eventos-colados.js';

describe('parseDiagnostico', () => {
  it('"RENDA ATUAL :" é reconhecido e grava "R$ 8 mil" literal', () => {
    const r = parseDiagnostico('RENDA ATUAL : R$ 8 mil');
    expect(r.campos).toEqual({ renda_atual: 'R$ 8 mil' });
  });

  it('os 9 rótulos do PDF, sem caixa nem acento', () => {
    const r = parseDiagnostico(
      [
        'idade: 40',
        'Situacao conjugal: casada',
        'FILHO(S): 2',
        'Trabalho: autônoma',
        'Renda atual: R$ 8 mil',
        'Dinheiro guardado: pouco',
        'Patrimônio: casa',
        'DÍVIDAS: cartão: R$ 2 mil',
        'Sonhos e objetivos: viajar',
      ].join('\n'),
    );
    expect(Object.keys(r.campos)).toHaveLength(9);
    expect(r.campos.dividas).toBe('cartão: R$ 2 mil');
    expect(r.campos.filhos).toBe('2');
    expect(r.desconhecidos).toBe(0);
  });

  it('rótulo desconhecido fica de fora e é contado', () => {
    const r = parseDiagnostico('Profissão: engenheira\nIdade: 30\nCPF: 000');
    expect(r.campos).toEqual({ idade: '30' });
    expect(r.desconhecidos).toBe(2);
  });

  it('linha sem rótulo continua o campo anterior', () => {
    const r = parseDiagnostico('Sonhos e objetivos: viajar\ne abrir um negócio');
    expect(r.campos.sonhos_objetivos).toBe('viajar\ne abrir um negócio');
  });
});

describe('parseEventosColados', () => {
  it('"DD/MM/AAAA - descrição" vira evento com data', () => {
    const r = parseEventosColados('05/03/2026 - Recebeu a caixa e avisou');
    expect(r).toEqual([
      {
        linha: 1,
        tipo: 'EVENTO',
        sugestao: 'EVENTO',
        dataTexto: '05/03/2026',
        data: '2026-03-05',
        descricao: 'Recebeu a caixa e avisou',
      },
    ]);
  });

  it('linha sem data vira dúvida, não evento', () => {
    const r = parseEventosColados('Disse que talvez vá ao encontro');
    expect(r[0]).toMatchObject({
      tipo: 'DUVIDA',
      sugestao: 'DUVIDA',
      data: null,
      descricao: 'Disse que talvez vá ao encontro',
    });
  });

  it('palavra "presencial" só sugere quadro; a linha vai para evento até a equipe escolher', () => {
    const r = parseEventosColados('10/04/2026 - Participou do evento presencial');
    expect(r[0]).toMatchObject({ tipo: 'EVENTO', sugestao: 'QUADRO' });
  });

  it('data inválida vira dúvida; linhas vazias são ignoradas', () => {
    const r = parseEventosColados('\n31/02/2026 - x\n\n');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ linha: 2, tipo: 'DUVIDA' });
  });
});
