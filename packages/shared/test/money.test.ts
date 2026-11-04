import { expect, it } from 'vitest';
import { MEETING_VALUE_CENTS, parseCents } from '../src/money.js';
it('converte por dígitos, sem arredondamento de ponto flutuante', () => {
  expect(parseCents('104.29')).toBe(10429);
  expect(parseCents('0,29')).toBe(29);
  expect(parseCents('18000')).toBe(1800000);
});
it('recusa frações de centavo, valores negativos e valores excessivos', () => {
  for (const v of ['-1', '1.999', '1e3', '9999999999999']) expect(() => parseCents(v)).toThrow();
});

it('valor por reunião realizada por perfil (pedido do cliente de 04/11)', () => {
  expect(MEETING_VALUE_CENTS).toEqual({ P0: 900, P1: 700, P2: 500 });
});
