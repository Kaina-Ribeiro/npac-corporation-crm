import { describe, expect, it } from 'vitest';
import {
  montarEngajamento,
  pctDoTotal,
  rotuloMentoria,
  type PessoaEngajamento,
} from '../src/mentoria/engajamento.js';

// NPAC-75: o bloco do Dashboard soma o que está marcado nas fichas; tipos por mentoria + variante (4B).
const p = (
  n: number,
  mentoria: PessoaEngajamento['mentoria'],
  variante: string | null,
  engajamento: PessoaEngajamento['engajamento'],
): PessoaEngajamento => ({
  inscricaoId: `i${n}`,
  nome: `Fictício ${n}`,
  tipo: 'INDIVIDUAL',
  mentoria,
  variante,
  engajamento,
  pessoas: [],
});

describe('rotuloMentoria', () => {
  it('junta a variante e limpa os espaços', () => {
    expect(rotuloMentoria('2M', '  2   encontros ')).toBe('2M / 2 encontros');
    expect(rotuloMentoria('RDV', null)).toBe('RDV');
    expect(rotuloMentoria('6M', '   ')).toBe('6M');
  });
});

describe('montarEngajamento', () => {
  const r = montarEngajamento([
    p(1, '2M', '2 encontros', 'ENGAJADO'),
    p(2, '2M', '2  Encontros', 'EM_RISCO'),
    p(3, 'RDV', null, null),
    p(4, '2M', null, 'EM_ATENCAO'),
    p(5, '2M', 'sem encontro', 'ENGAJADO'),
    p(6, 'RDV', '', null),
  ]);

  it('os quatro grupos somam o Total, na ordem fixa', () => {
    expect(r.total).toBe(6);
    expect(r.grupos.map((g) => [g.grupo, g.total])).toEqual([
      ['ENGAJADO', 2],
      ['EM_ATENCAO', 1],
      ['EM_RISCO', 1],
      ['SEM', 2],
    ]);
    expect(r.grupos[0]!.pessoas.map((x) => x.inscricaoId)).toEqual(['i1', 'i5']);
  });

  it('tipos sem diferença de maiúsculas e espaços, maior primeiro', () => {
    expect(r.tipos).toEqual([
      { rotulo: '2M / 2 encontros', total: 2 },
      { rotulo: 'RDV', total: 2 },
      { rotulo: '2M', total: 1 },
      { rotulo: '2M / sem encontro', total: 1 },
    ]);
  });

  it('vazio', () => {
    const v = montarEngajamento([]);
    expect(v.total).toBe(0);
    expect(v.grupos.every((g) => g.total === 0)).toBe(true);
    expect(v.tipos).toEqual([]);
  });
});

describe('pctDoTotal', () => {
  it('arredonda e não divide por zero', () => {
    expect(pctDoTotal(96, 182)).toBe('53% do total');
    expect(pctDoTotal(0, 0)).toBe('0% do total');
  });
});
