import { describe, expect, it } from 'vitest';
import { leadCreateSchema } from '../src/schemas/lead.js';

const base = { name: 'Maria', instagram: '@maria', incomeBand: 'R8_15K', tier: 'P1' };

describe('leadCreateSchema', () => {
  it('aceita lead válido e normaliza', () =>
    expect(leadCreateSchema.parse(base).instagram).toBe('maria'));
  it('aplica defaults', () => {
    const r = leadCreateSchema.parse(base);
    expect(r.source).toBe('INSTAGRAM');
    expect(r.stageKey).toBe('SONDAGEM');
  });
  it('exige faixa de renda', () =>
    expect(leadCreateSchema.safeParse({ ...base, incomeBand: undefined }).success).toBe(false));
  it('não aceita faixa abaixo de 5k', () =>
    expect(leadCreateSchema.safeParse({ ...base, incomeBand: 'R0_5K' }).success).toBe(false));
  it('exige telefone ou instagram', () =>
    expect(leadCreateSchema.safeParse({ ...base, instagram: undefined }).success).toBe(false));
  it('telefone inválido falha', () =>
    expect(leadCreateSchema.safeParse({ ...base, phone: '123' }).success).toBe(false));
  it('telefone válido é normalizado', () =>
    expect(leadCreateSchema.parse({ ...base, phone: '(11) 98888-7777' }).phone).toBe(
      '+5511988887777',
    ));
  it('string vazia equivale a ausente', () => {
    const r = leadCreateSchema.parse({ ...base, phone: '' });
    expect(r.phone).toBeUndefined();
    expect(leadCreateSchema.safeParse({ ...base, instagram: '', phone: '' }).success).toBe(false);
  });
  it('nextContactAt vira Date', () => {
    const r = leadCreateSchema.parse({ ...base, nextContactAt: '2026-10-28T12:00:00Z' });
    expect(r.nextContactAt).toBeInstanceOf(Date);
  });
  it('nome curto falha', () =>
    expect(leadCreateSchema.safeParse({ ...base, name: 'M' }).success).toBe(false));
});
