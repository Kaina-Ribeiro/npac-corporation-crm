import { describe, expect, it } from 'vitest';
import FIXTURE from './fixtures/cronograma-ficticio.csv?raw';
import {
  casarColunas,
  dicaDaDuvida,
  lerCelula,
  lerCronograma,
  lerCsv,
  maiorMes,
  pessoasDaColuna,
  type InscricaoParaCasar,
} from '../src/mentoria/cronograma-planilha.js';

// NPAC-60, fase 3: importação da planilha CRONOGRAMA (desenho §2, §8, C9, C14, C15). A fixture é fictícia, com a
// forma do arquivo real (BOM, célula com quebra de linha, 5 blocos, "Column N", casais "A e B" e "A/B", modelo no fim).
const CSV = FIXTURE;
const p = lerCronograma(CSV);
const coluna = (indice: number) => p.colunas.find((c) => c.indice === indice)!;
const linhaDe = (texto: string) => p.itens.find((i) => i.texto.startsWith(texto))!.linha;
const marca = (indice: number, texto: string) =>
  coluna(indice).marcas.find((m) => m.linhaItem === linhaDe(texto));

describe('lerCsv', () => {
  it('tira o BOM e respeita aspas, vírgula e quebra de linha dentro da célula', () => {
    expect(lerCsv('﻿a,"b, c","d\r\ne"\r\n"x ""y""",z')).toEqual([
      ['a', 'b, c', 'd\r\ne'],
      ['x "y"', 'z'],
    ]);
    expect(CSV.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('lerCelula (C9)', () => {
  it.each([
    ['1º mês', 1],
    ['6 mes', 6],
    ['8 MÊS', 8],
    ['4° Mês', 4],
    ['12', 12],
    [' 3º mês\n', 3],
    ['2ª mes', 2],
  ])('"%s" vira o mês %i', (t, n) => {
    expect(lerCelula(t)).toEqual({ tipo: 'MARCA', pmeNumero: n, resultado: 'RECEBIDO' });
  });
  it.each(['já leu', 'já leram', 'Já viram', 'já leu antes da 2M'])('"%s" é "já tinha"', (t) => {
    expect(lerCelula(t)).toEqual({ tipo: 'MARCA', pmeNumero: null, resultado: 'JA_TINHA' });
  });
  it('"não fez", "não concluiu" e "Não fizeram no 1º mês" são "não fez" (com o mês quando vem)', () => {
    expect(lerCelula('não fez')).toEqual({ tipo: 'MARCA', pmeNumero: null, resultado: 'NAO_FEZ' });
    expect(lerCelula('Não concluiu')).toMatchObject({ resultado: 'NAO_FEZ', pmeNumero: null });
    expect(lerCelula('Não fizeram no 1º mês')).toMatchObject({
      resultado: 'NAO_FEZ',
      pmeNumero: 1,
    });
  });
  it('"13º mês", "0" e nome solto ficam de fora, contados pelo motivo', () => {
    expect(lerCelula('13º mês')).toEqual({ tipo: 'IGNORADA', motivo: 'MES_FORA' });
    expect(lerCelula('0')).toEqual({ tipo: 'IGNORADA', motivo: 'MES_FORA' });
    expect(lerCelula('Ana')).toEqual({ tipo: 'IGNORADA', motivo: 'TEXTO' });
    expect(lerCelula('  ')).toEqual({ tipo: 'VAZIA' });
  });
});

describe('lerCronograma com a fixture', () => {
  it('5 blocos com a contagem certa; títulos, "Column N" e o modelo do fim não viram item', () => {
    const por = (b: string) => p.itens.filter((i) => i.bloco === b).length;
    expect([por('EXPERIENCIA'), por('DESAFIO'), por('FILME'), por('LIVRO'), por('EAP')]).toEqual([
      3, 3, 3, 3, 3,
    ]);
    const textos = p.itens.map((i) => i.texto);
    for (const fora of ['DESAFIOS', 'FILMES', 'PME 01', 'EAP 1', 'Experiência', 'Filme 2'])
      expect(textos).not.toContain(fora);
  });

  it('célula com quebra de linha vira um texto só; item repetido junta no primeiro (C15)', () => {
    expect(p.itens.find((i) => i.bloco === 'DESAFIO')!.texto).toBe(
      'Passar 24 horas em jejum, só com água. (Mande uma foto no grupo.)',
    );
    expect(p.juntados.EAP).toBe(1);
    // A linha repetida marcava o 3º mês na coluna C e o 2º na K: fica o menor.
    expect(marca(2, 'EAP 01')).toMatchObject({ pmeNumero: 1, resultado: 'RECEBIDO' });
    expect(marca(10, 'EAP 01')).toMatchObject({ pmeNumero: 2 });
  });

  it('a pessoa de cada coluna é a do cabeçalho de cima; coluna vazia sem nome não entra', () => {
    expect(p.colunas.map((c) => [c.indice, c.cabecalho])).toEqual([
      [2, 'Mentorado Fictício 301'],
      [3, 'Mentorada Fictícia 302 e Mentorado Fictício 303'],
      [4, 'Mentorada Fictícia 304/Mentorado Fictício 305'],
      [5, 'Mentorado Fictício 306'],
      [6, 'Mentorada'],
      [7, 'Pessoa Inexistente 399'],
      [9, 'Mentorado Fictício 307'],
      [10, 'Mentorado Fictício 301'],
    ]);
  });

  it('marcas da coluna C: meses, "já leu" e o maior mês', () => {
    const c = coluna(2);
    expect(c.marcas).toHaveLength(12);
    expect(marca(2, 'Visitar')).toMatchObject({ pmeNumero: 3, resultado: 'RECEBIDO' });
    expect(marca(2, 'Em busca')).toEqual({
      linhaItem: linhaDe('Em busca'),
      pmeNumero: null,
      resultado: 'JA_TINHA',
    });
    expect(maiorMes(c)).toBe(3);
    expect(maiorMes(coluna(5))).toBe(12);
  });

  it('"8 MÊS", "12", "4° Mês", "já leram", "já viram", "não concluiu", "Não fizeram no 1º mês"', () => {
    expect(marca(4, 'Subir')).toMatchObject({ pmeNumero: 8 });
    expect(marca(5, 'Subir')).toMatchObject({ pmeNumero: 12 });
    expect(marca(5, 'Fazer')).toMatchObject({ pmeNumero: 4 });
    expect(marca(3, 'Em busca')).toMatchObject({ resultado: 'JA_TINHA' });
    expect(marca(4, 'Pai Rico')).toMatchObject({ resultado: 'JA_TINHA' });
    expect(marca(3, 'Pra Sempre')).toMatchObject({ resultado: 'NAO_FEZ', pmeNumero: null });
    expect(marca(4, 'À Procura')).toMatchObject({ resultado: 'NAO_FEZ', pmeNumero: 1 });
    expect(marca(4, 'Vender')).toMatchObject({ resultado: 'NAO_FEZ' });
  });

  it('"13º mês" e o nome solto ficam fora, contados por motivo e por coluna, sem o texto', () => {
    expect(p.ignoradasPorMotivo).toEqual({ MES_FORA: 1, TEXTO: 1 });
    expect(coluna(3).ignoradas).toBe(2);
    expect(coluna(3).marcas).toHaveLength(5);
    expect(JSON.stringify(p)).not.toContain('"Ana"');
  });

  it('coluna com nome e nada marcado aparece sem marcas', () => {
    expect(coluna(9).marcas).toEqual([]);
  });
});

describe('casarColunas (C14)', () => {
  const insc = (
    id: string,
    nomes: string[],
    mentoria = 'RDV',
    o: Partial<InscricaoParaCasar> = {},
  ): InscricaoParaCasar => ({
    id,
    nomes,
    tipo: nomes.length === 2 ? 'CASAL' : 'INDIVIDUAL',
    mentoria,
    status: 'ATIVO',
    pmeAtual: null,
    ...o,
  });
  const base = [
    insc('i301', ['Mentorado Fictício 301']),
    insc('i302', ['Mentorado Fictício 303', 'Mentorada Fictícia 302']),
    insc('i304', ['Mentorada Fictícia 304', 'Mentorado Fictício 305'], '6M'),
    insc('i306r', ['Mentorado Fictício 306'], 'RDV', { status: 'CONCLUIDO', pmeAtual: 12 }),
    insc('i306d', ['Mentorado Fictício 306'], '2M', { pmeAtual: 2 }),
  ];
  const r = Object.fromEntries(casarColunas(p.colunas, base).map((c) => [c.indice, c]));

  it('nome com uma ficha só liga sozinho (também a coluna repetida)', () => {
    expect(r[2]).toEqual({ indice: 2, situacao: 'LIGADA', candidatas: ['i301'], maiorMes: 3 });
    expect(r[10]).toMatchObject({ situacao: 'LIGADA', candidatas: ['i301'] });
  });

  it('casal "A e B" e "A/B" casam com a inscrição CASAL pelas duas pessoas, em qualquer ordem', () => {
    expect(r[3]).toMatchObject({ situacao: 'LIGADA', candidatas: ['i302'] });
    expect(r[4]).toMatchObject({ situacao: 'LIGADA', candidatas: ['i304'] });
    expect(pessoasDaColuna('Ana / Bruno Souza')).toEqual([['ana'], ['bruno', 'souza']]);
    expect(pessoasDaColuna('Ana & Bruno')).toHaveLength(2);
  });

  it('RDV e 2M da mesma pessoa ficam em dúvida, nunca ligam sozinhos', () => {
    expect(r[5]).toEqual({
      indice: 5,
      situacao: 'DUVIDA',
      candidatas: ['i306r', 'i306d'],
      maiorMes: 12,
    });
  });

  it('só o primeiro nome casa com várias fichas: dúvida; sem ficha e sem marcação', () => {
    expect(r[6]).toMatchObject({ situacao: 'DUVIDA', candidatas: ['i302', 'i304'] });
    expect(r[7]).toMatchObject({ situacao: 'SEM_FICHA', candidatas: [] });
    expect(r[9]).toMatchObject({ situacao: 'SEM_MARCACAO', candidatas: [] });
  });

  it('casal não casa com inscrição individual de uma das pessoas', () => {
    const so = casarColunas([coluna(3)], [insc('x', ['Mentorada Fictícia 302'])]);
    expect(so[0]).toMatchObject({ situacao: 'SEM_FICHA' });
  });

  it('dica do RDV × 2M: só uma chega ao maior mês', () => {
    const [rdv, dois] = [base[3]!, base[4]!];
    expect(dicaDaDuvida(12, [rdv, dois])).toBe(
      'Vai até o 12º mês: deve ser o RDV. Vale também na 2M.',
    );
    expect(dicaDaDuvida(1, [rdv, dois])).toBeNull();
    expect(dicaDaDuvida(12, [rdv])).toBeNull();
  });
});
