import { describe, expect, it } from 'vitest';
import { classificarNomes } from '../src/mentoria/dedupe.js';
import { parseColaPlanilha } from '../src/mentoria/planilha.js';

describe('parseColaPlanilha', () => {
  const porTab = [
    'Nome\tTipo\tTipo de mentoria\tData de entrada\tStatus',
    'Mentorado Fictício 01\tIndividual\tMentoria Fictícia A\t05/03/2026\tEngajado',
    'Mentorado Fictício 02\tCasal\tMentoria Fictícia B\t03/2026\tEm atenção',
  ].join('\n');

  it('colagem por tab e por ; grava os mesmos registros', () => {
    const porPontoVirgula = porTab.replaceAll('\t', ';');
    const a = parseColaPlanilha(porTab);
    const b = parseColaPlanilha(porPontoVirgula);
    expect(a.linhas).toEqual(b.linhas);
    expect(a.linhas).toHaveLength(2);
    expect(a.linhas[0]).toEqual({
      linha: 2,
      nome: 'Mentorado Fictício 01',
      tipoCadastro: 'Individual',
      tipoMentoria: 'Mentoria Fictícia A',
      dataEntrada: '05/03/2026',
      status: 'ENGAJADO',
    });
    expect(a.linhas[1]?.status).toBe('EM_ATENCAO');
  });

  it('sem cabeçalho também lê, na ordem das colunas do PDF', () => {
    const r = parseColaPlanilha(
      'Mentorado Fictício 03\tIndividual\tMentoria Fictícia A\t\tem risco',
    );
    expect(r.linhas[0]).toMatchObject({
      linha: 1,
      nome: 'Mentorado Fictício 03',
      status: 'EM_RISCO',
    });
  });

  it('linha sem status ou tipo de mentoria vai para pendentes e não grava', () => {
    const r = parseColaPlanilha(
      [
        'Mentorado Fictício 04\tIndividual\t\t01/01/2026\tEngajado',
        'Mentorado Fictício 05\tIndividual\tMentoria Fictícia A\t\tqualquer',
      ].join('\n'),
    );
    expect(r.pendentes).toEqual([
      { linha: 1, faltando: ['TIPO_MENTORIA'] },
      { linha: 2, faltando: ['STATUS'] },
    ]);
    expect(r.linhas.find((l) => l.linha === 1)?.tipoMentoria).toBeNull();
    expect(r.linhas.find((l) => l.linha === 2)?.status).toBeNull();
  });

  it('texto colado fica como veio (só sem espaços nas bordas)', () => {
    const r = parseColaPlanilha(
      '  Renda atual: R$ 8 mil \t Casal  feliz \tMentoria\t começo do ano \tEngajado',
    );
    expect(r.linhas[0]).toMatchObject({
      nome: 'Renda atual: R$ 8 mil',
      tipoCadastro: 'Casal  feliz',
      dataEntrada: 'começo do ano',
    });
  });

  it('linha sem nome é inválida; linhas vazias são ignoradas', () => {
    const r = parseColaPlanilha('\n\t\tMentoria\t\tEngajado\n\n');
    expect(r.invalidas).toEqual([2]);
    expect(r.linhas).toHaveLength(0);
  });
});

describe('classificarNomes', () => {
  it('nome com acento, caixa e espaço duplo é o mesmo nome', () => {
    const r = classificarNomes(new Set(['mentorado ficticio 01']), ['MENTORADO  Fictício 01']);
    expect(r.jaExistem).toEqual([0]);
    expect(r.novos).toEqual([]);
  });

  it('duplicado contra a base é ignorado', () => {
    const r = classificarNomes(new Set(['ana ficticia']), ['Ana Fictícia', 'Bia Fictícia']);
    expect(r).toEqual({ novos: [1], jaExistem: [0], repetidos: [] });
  });

  it('duplicado dentro da própria colagem conta uma vez', () => {
    const r = classificarNomes(new Set(), ['Bia Fictícia', 'bia ficticia', 'Cris Fictícia']);
    expect(r).toEqual({ novos: [0, 2], jaExistem: [], repetidos: [1] });
  });
});
