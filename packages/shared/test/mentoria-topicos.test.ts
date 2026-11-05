import { describe, expect, it } from 'vitest';
import { quebrarTopicos } from '../src/mentoria/topicos.js';

describe('quebrarTopicos', () => {
  it('linha "Profissão: engenheiro" vira rótulo Profissão e texto', () => {
    expect(quebrarTopicos('Profissão: engenheiro')).toEqual([
      { rotulo: 'Profissão', texto: 'engenheiro' },
    ]);
  });
  it('linha sem ":" antes do caractere 40 fica como texto comum', () => {
    const longa = `${'a'.repeat(45)}: depois`;
    expect(quebrarTopicos(longa)).toEqual([{ texto: longa }]);
    expect(quebrarTopicos('Sem dois-pontos aqui')).toEqual([{ texto: 'Sem dois-pontos aqui' }]);
  });
  it('HTML na nota aparece como texto, nunca como tag', () => {
    expect(quebrarTopicos('<b>Renda</b>: <script>x</script>')).toEqual([
      { rotulo: '<b>Renda</b>', texto: '<script>x</script>' },
    ]);
  });
  it('linha vazia é descartada; cada Enter vira tópico', () => {
    expect(quebrarTopicos('um\n\n  \r\ndois\nTrês: 3')).toEqual([
      { texto: 'um' },
      { texto: 'dois' },
      { rotulo: 'Três', texto: '3' },
    ]);
    expect(quebrarTopicos(null)).toEqual([]);
  });
});
