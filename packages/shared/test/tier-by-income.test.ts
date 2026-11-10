import { describe, expect, it } from 'vitest';
import {
  INCOME_BAND_LABELS,
  INCOME_BANDS,
  TIER_BY_INCOME_BAND,
  TIER_LABELS,
  TIERS,
} from '../src/enums.js';
import { MEETING_VALUE_CENTS } from '../src/money.js';

// Pedido do cliente (Igor, 05/11/2026): a faixa de renda define o perfil do lead.
describe('perfil pela faixa de renda', () => {
  it('5–8 mil = P2, 8–15 mil = P1, 15 mil para cima = P0', () => {
    expect(TIER_BY_INCOME_BAND).toEqual({
      R5_8K: 'P2',
      R8_15K: 'P1',
      R15_50K: 'P0',
      R50K_PLUS: 'P0',
      DESCOBRINDO: 'DESCOBRINDO',
    });
  });

  // Igor, 10/11/2026 ("1C"): renda ainda desconhecida vira faixa e perfil próprios.
  it('"Descobrindo renda" é faixa e perfil, no fim das listas', () => {
    expect(INCOME_BANDS.at(-1)).toBe('DESCOBRINDO');
    expect(TIERS.at(-1)).toBe('DESCOBRINDO');
    expect(INCOME_BAND_LABELS.DESCOBRINDO).toBe('Descobrindo renda');
    expect(TIER_LABELS).toEqual({ P0: 'P0', P1: 'P1', P2: 'P2', DESCOBRINDO: 'Descobrindo renda' });
  });

  it('reunião de lead "Descobrindo renda" não soma valor', () => {
    expect(MEETING_VALUE_CENTS.DESCOBRINDO).toBe(0);
  });

  it('toda faixa tem perfil', () => {
    for (const band of INCOME_BANDS) expect(TIER_BY_INCOME_BAND[band]).toBeDefined();
  });
});
