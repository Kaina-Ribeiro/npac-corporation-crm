import { describe, expect, it } from 'vitest';
import { entrouHa } from '../src/acessos.js';

// "Entrou há X" (NPAC-54, D12): frases da spec, contadas no fuso de Brasília.
const agora = new Date('2026-11-19T15:00:00-03:00');
const antes = (ms: number) => new Date(agora.getTime() - ms).toISOString();
const MIN = 60_000;
const HORA = 60 * MIN;

describe('entrouHa', () => {
  it.each([
    [null, 'nunca entrou'],
    [antes(20_000), 'entrou agora'],
    [antes(MIN), 'entrou há 1 minuto'],
    [antes(5 * MIN), 'entrou há 5 minutos'],
    [antes(59 * MIN), 'entrou há 59 minutos'],
    [antes(HORA), 'entrou há 1 hora'],
    [antes(3 * HORA), 'entrou há 3 horas'],
    // 15:00 de hoje × 13:00 de ontem: mais de 24 h, um dia de calendário.
    [antes(26 * HORA), 'entrou ontem'],
    [antes(3 * 24 * HORA), 'entrou há 3 dias'],
    [antes(6 * 24 * HORA), 'entrou há 6 dias'],
    [antes(7 * 24 * HORA), 'não entra há 7 dias'],
    [antes(12 * 24 * HORA), 'não entra há 12 dias'],
  ])('%s → %s', (uso, frase) => {
    expect(entrouHa(uso, agora)).toBe(frase);
  });

  it('menos de 24 h é em horas, mesmo que tenha sido ontem no calendário', () => {
    const meiaNoite = new Date('2026-11-19T01:00:00-03:00');
    expect(entrouHa(new Date('2026-11-18T23:00:00-03:00').toISOString(), meiaNoite)).toBe(
      'entrou há 2 horas',
    );
  });

  it('dias pelo calendário de Brasília, não por blocos de 24 h', () => {
    const cedo = new Date('2026-11-19T01:00:00-03:00');
    // 18/11 às 22h → 17/11 às 22h: 27 h antes da 01h do dia 19, dois dias de calendário.
    expect(entrouHa(new Date('2026-11-17T22:00:00-03:00').toISOString(), cedo)).toBe(
      'entrou há 2 dias',
    );
  });

  it('relógio do aparelho atrasado (uso "no futuro") vira "entrou agora"', () => {
    expect(entrouHa(new Date(agora.getTime() + 5 * MIN).toISOString(), agora)).toBe('entrou agora');
  });
});
