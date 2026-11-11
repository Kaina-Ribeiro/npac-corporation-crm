import { describe, expect, it } from 'vitest';
import {
  dataHoraValida,
  mesValido,
  proximosEstados,
  taxaComparecimento,
} from '../src/mentoria/reunioes.js';

describe('reuniões', () => {
  it('estado só anda adiante; realizada e faltou só depois do horário', () => {
    expect(proximosEstados('AGENDADA', false)).toEqual(['CONFIRMADA', 'LINK_ENVIADO']);
    expect(proximosEstados('CONFIRMADA', true)).toEqual(['LINK_ENVIADO', 'REALIZADA', 'FALTOU']);
    expect(proximosEstados('LINK_ENVIADO', false)).toEqual([]);
    expect(proximosEstados('REALIZADA', true)).toEqual([]);
    expect(proximosEstados('REMARCADA', true)).toEqual([]);
  });

  it('taxa de comparecimento = realizadas ÷ (realizadas + faltas)', () => {
    expect(taxaComparecimento(3, 1)).toBe(75);
    expect(taxaComparecimento(2, 1)).toBe(67);
    expect(taxaComparecimento(0, 0)).toBeNull();
  });

  it('data e hora e mês válidos', () => {
    expect(dataHoraValida('2026-03-10T21:00')).toBe(true);
    expect(dataHoraValida('2026-02-30T21:00')).toBe(false);
    expect(dataHoraValida('2026-03-10T24:00')).toBe(false);
    expect(dataHoraValida('2026-03-10 21:00')).toBe(false);
    expect(mesValido('2026-12')).toBe(true);
    expect(mesValido('2026-13')).toBe(false);
  });
});
