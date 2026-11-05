import { describe, expect, it } from 'vitest';
import { INCOME_BANDS, TIER_BY_INCOME_BAND } from '../src/enums.js';

// Pedido do cliente (Igor, 05/11/2026): a faixa de renda define o perfil do lead.
describe('perfil pela faixa de renda', () => {
  it('5–8 mil = P2, 8–15 mil = P1, 15 mil para cima = P0', () => {
    expect(TIER_BY_INCOME_BAND).toEqual({
      R5_8K: 'P2',
      R8_15K: 'P1',
      R15_50K: 'P0',
      R50K_PLUS: 'P0',
    });
  });

  it('toda faixa tem perfil', () => {
    for (const band of INCOME_BANDS) expect(TIER_BY_INCOME_BAND[band]).toBeDefined();
  });
});
