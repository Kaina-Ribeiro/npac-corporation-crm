import { describe, expect, it } from 'vitest';
import { nomeNormalizado } from '../src/mentoria/normalizar.js';

describe('nomeNormalizado', () => {
  it('ignora caixa, acento e espaços repetidos', () => {
    expect(nomeNormalizado('  Mentorado   FICTÍCIO  Ção ')).toBe('mentorado ficticio cao');
  });
  it('nomes diferentes continuam diferentes', () => {
    expect(nomeNormalizado('Mentorado Fictício 01')).not.toBe(
      nomeNormalizado('Mentorado Fictício 02'),
    );
  });
  it('tabs e quebras de linha contam como espaço', () => {
    expect(nomeNormalizado('Ana\te\nBia')).toBe('ana e bia');
  });
});
