import { describe, expect, it } from 'vitest';
import { leadCreateSchema } from '../src/schemas/lead.js';
import { leadUpdateSchema } from '../src/schemas/lead-update.js';

const base = {
  name: 'Maria',
  instagram: '@maria',
  incomeBand: 'R8_15K',
  source: 'BIO',
  tier: 'P1',
};

describe('leadCreateSchema', () => {
  it('aceita lead válido e normaliza', () =>
    expect(leadCreateSchema.parse(base).instagram).toBe('maria'));
  it('aplica defaults', () => expect(leadCreateSchema.parse(base).stageKey).toBe('SONDAGEM'));
  it('origem: obrigatória, só a lista nova e "Outro" com texto', () => {
    expect(leadCreateSchema.safeParse({ ...base, source: undefined }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...base, source: 'INSTAGRAM' }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...base, source: 'OUTRO', sourceOther: ' ' }).success).toBe(
      false,
    );
    expect(
      leadCreateSchema.parse({ ...base, source: 'OUTRO', sourceOther: ' Feira ' }).sourceOther,
    ).toBe('Feira');
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

// Campos por etapa (NPAC-38): o formato é validado aqui; quando cada um é exigido, a API decide.
describe('campos por etapa', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  it('reunião: data futura e closer', () => {
    const r = leadCreateSchema.parse({
      ...base,
      stageKey: 'AGENDADO_DIRETO',
      meeting: { scheduledAt: future, closerId: 'u-sonia' },
    });
    expect(r.meeting?.scheduledAt).toBeInstanceOf(Date);
    const past = { scheduledAt: '2020-01-01T12:00:00Z', closerId: 'u-sonia' };
    expect(leadCreateSchema.safeParse({ ...base, meeting: past }).success).toBe(false);
    expect(leadCreateSchema.safeParse({ ...base, meeting: { scheduledAt: future } }).success).toBe(
      false,
    );
  });
  it('pagamento: produto uuid e valor inteiro positivo', () => {
    const paymentProductId = '6f1d1c3e-2b8a-4c55-9d7e-0a1b2c3d4e5f';
    expect(
      leadCreateSchema.parse({ ...base, paymentProductId, paymentAmountCents: 450000 })
        .paymentAmountCents,
    ).toBe(450000);
    expect(
      leadCreateSchema.safeParse({ ...base, paymentProductId, paymentAmountCents: 0 }).success,
    ).toBe(false);
    expect(
      leadCreateSchema.safeParse({ ...base, paymentProductId, paymentAmountCents: 10.5 }).success,
    ).toBe(false);
    expect(leadCreateSchema.safeParse({ ...base, paymentProductId: 'x' }).success).toBe(false);
  });
  it('motivo: só a lista; texto aparado até 80', () => {
    expect(leadCreateSchema.safeParse({ ...base, lostReason: 'OUTRA' }).success).toBe(false);
    expect(
      leadCreateSchema.parse({ ...base, lostReason: 'OUTRO', lostReasonOther: ' Mudou ' })
        .lostReasonOther,
    ).toBe('Mudou');
    expect(
      leadCreateSchema.parse({ ...base, lostReason: 'OUTRO', lostReasonOther: ' ' })
        .lostReasonOther,
    ).toBeUndefined();
    expect(
      leadCreateSchema.safeParse({ ...base, lostReason: 'OUTRO', lostReasonOther: 'a'.repeat(81) })
        .success,
    ).toBe(false);
  });
  it('PATCH aceita os mesmos campos', () => {
    const r = leadUpdateSchema.parse({
      version: 1,
      stageKey: 'PERDIDO',
      lostReason: 'SEM_RENDA',
    });
    expect(r.lostReason).toBe('SEM_RENDA');
    expect(
      leadUpdateSchema.safeParse({
        version: 1,
        stageKey: 'AGENDADO_FOLLOW',
        meeting: { scheduledAt: future, closerId: 'u-sonia' },
      }).success,
    ).toBe(true);
  });
});
