import { describe, expect, it } from 'vitest';
import { ordenarPorData, parseData } from '../src/mentoria/datas.js';

describe('parseData', () => {
  it('DD/MM/AAAA vira data', () => {
    expect(parseData('05/03/2026')).toEqual({ texto: '05/03/2026', data: '2026-03-05' });
  });
  it('MM/AAAA vira dia 1 só na ordem, texto preservado', () => {
    expect(parseData('03/2026')).toEqual({ texto: '03/2026', data: '2026-03-01' });
  });
  it('data ilegível vira null e vai para o fim', () => {
    expect(parseData('começo do ano')).toEqual({ texto: 'começo do ano', data: null });
    expect(parseData('31/02/2026').data).toBeNull();
    expect(parseData('13/2026').data).toBeNull();
    const itens = [
      { id: 'b', data: null },
      { id: 'a', data: '2026-01-02' },
      { id: 'c', data: '2025-12-31' },
    ];
    expect(ordenarPorData(itens).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
  it('só tira espaços das bordas; vazio vira texto vazio e data nula', () => {
    expect(parseData('  05/03/2026 ')).toEqual({ texto: '05/03/2026', data: '2026-03-05' });
    expect(parseData('   ')).toEqual({ texto: '', data: null });
  });
  it('empate de data ordena pelo id', () => {
    const itens = [
      { id: 'z', data: '2026-01-01' },
      { id: 'a', data: '2026-01-01' },
    ];
    expect(ordenarPorData(itens).map((i) => i.id)).toEqual(['a', 'z']);
  });
});
