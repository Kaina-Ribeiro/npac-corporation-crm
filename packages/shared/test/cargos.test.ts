import { describe, expect, it } from 'vitest';
import {
  CARGOS,
  CARGO_INFO,
  CARGOS_POR_AREA,
  cargoDe,
  caixasFixas,
  resolverCargo,
  temCaixas,
} from '../src/cargos.js';
import { accessApprovalSchema, userChangeSchema, userInviteSchema } from '../src/index.js';

describe('mapa cargo ↔ (role, perfil)', () => {
  it('cada cargo tem rótulo, área e dica', () => {
    for (const c of CARGOS) {
      expect(CARGO_INFO[c].label.length).toBeGreaterThan(0);
      expect(CARGO_INFO[c].dica.length).toBeGreaterThan(10);
    }
    expect(CARGOS_POR_AREA.COMERCIAL).toEqual(['SDR', 'CLOSER', 'HEAD', 'DIRETOR']);
    expect(CARGOS_POR_AREA.ACOMPANHAMENTO).toEqual([
      'ACOMPANHAMENTO',
      'OPERACAO',
      'ESPECIALISTA',
      'MENTOR',
    ]);
  });

  it('cargo do Acompanhamento grava role ACOMPANHAMENTO + perfil', () => {
    expect(CARGO_INFO.OPERACAO).toMatchObject({ role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' });
    expect(CARGO_INFO.MENTOR).toMatchObject({ role: 'ACOMPANHAMENTO', perfil: 'MENTOR' });
    expect(CARGO_INFO.SDR).toMatchObject({ role: 'SDR', perfil: null });
    expect(CARGO_INFO.DIRETOR.label).toBe('Diretoria');
  });

  it('volta de (role, perfil) para o cargo; Acompanhamento sem perfil não tem cargo', () => {
    for (const c of CARGOS) expect(cargoDe(CARGO_INFO[c].role, CARGO_INFO[c].perfil)).toBe(c);
    expect(cargoDe('ACOMPANHAMENTO', null)).toBeNull();
    expect(cargoDe('SDR', 'OPERACAO')).toBe('SDR');
  });

  it('caixas só para Head e Diretoria; os outros cargos têm valor fixo', () => {
    expect(temCaixas('HEAD')).toBe(true);
    expect(temCaixas('DIRETOR')).toBe(true);
    expect(temCaixas('SDR')).toBe(false);
    expect(caixasFixas('SDR')).toEqual({ canProspect: true, canClose: false });
    expect(caixasFixas('CLOSER')).toEqual({ canProspect: false, canClose: true });
    expect(caixasFixas('ACOMPANHAMENTO')).toEqual({ canProspect: false, canClose: false });
    expect(caixasFixas('HEAD')).toBeNull();
  });
});

describe('resolverCargo', () => {
  it('SDR e Closer ganham as caixas do cargo; valor igual ao fixo é aceito', () => {
    expect(resolverCargo({ role: 'SDR' })).toEqual({
      ok: true,
      valor: { role: 'SDR', canProspect: true, canClose: false, perfil: null, moduloAdmin: false },
    });
    expect(resolverCargo({ role: 'CLOSER', canClose: true })).toMatchObject({
      ok: true,
      valor: { canProspect: false, canClose: true },
    });
  });

  it('caixa contrária ao cargo é recusada', () => {
    expect(resolverCargo({ role: 'SDR', canClose: true })).toEqual({
      ok: false,
      erro: 'OPCAO_INVALIDA',
    });
    expect(resolverCargo({ role: 'CLOSER', canProspect: true })).toMatchObject({ ok: false });
    expect(resolverCargo({ role: 'ACOMPANHAMENTO', perfil: 'MENTOR', canClose: true })).toEqual({
      ok: false,
      erro: 'OPCAO_INVALIDA',
    });
  });

  it('Head/Diretoria usam o que veio; sem vir, mantêm o que a pessoa tinha', () => {
    expect(resolverCargo({ role: 'HEAD', canProspect: true })).toMatchObject({
      ok: true,
      valor: { canProspect: true, canClose: false },
    });
    const sdr = {
      role: 'SDR' as const,
      canProspect: true,
      canClose: false,
      perfil: null,
      moduloAdmin: false,
    };
    expect(resolverCargo({ role: 'HEAD' }, sdr)).toMatchObject({
      ok: true,
      valor: { role: 'HEAD', canProspect: true, canClose: false },
    });
    expect(resolverCargo({ role: 'DIRETOR', canClose: true }, sdr)).toMatchObject({
      ok: true,
      valor: { canProspect: true, canClose: true },
    });
    // Conta nova sem informar: nenhuma.
    expect(resolverCargo({ role: 'DIRETOR' })).toMatchObject({
      ok: true,
      valor: { canProspect: false, canClose: false },
    });
  });

  it('Acompanhamento exige perfil; perfil e selo fora do Acompanhamento são recusados', () => {
    expect(resolverCargo({ role: 'ACOMPANHAMENTO' })).toEqual({
      ok: false,
      erro: 'PERFIL_OBRIGATORIO',
    });
    expect(resolverCargo({ role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' })).toEqual({
      ok: true,
      valor: {
        role: 'ACOMPANHAMENTO',
        canProspect: false,
        canClose: false,
        perfil: 'OPERACAO',
        moduloAdmin: false,
      },
    });
    expect(
      resolverCargo({ role: 'ACOMPANHAMENTO', perfil: 'ACOMPANHAMENTO', moduloAdmin: true }),
    ).toMatchObject({ ok: true, valor: { moduloAdmin: true } });
    expect(resolverCargo({ role: 'SDR', perfil: 'OPERACAO' })).toEqual({
      ok: false,
      erro: 'OPCAO_INVALIDA',
    });
    expect(resolverCargo({ role: 'HEAD', moduloAdmin: false })).toEqual({
      ok: false,
      erro: 'OPCAO_INVALIDA',
    });
  });

  it('quem já é Acompanhamento troca só o selo ou só o perfil', () => {
    const op = {
      role: 'ACOMPANHAMENTO' as const,
      canProspect: false,
      canClose: false,
      perfil: 'OPERACAO' as const,
      moduloAdmin: false,
    };
    expect(resolverCargo({ role: 'ACOMPANHAMENTO', moduloAdmin: true }, op)).toMatchObject({
      ok: true,
      valor: { perfil: 'OPERACAO', moduloAdmin: true },
    });
    expect(resolverCargo({ role: 'ACOMPANHAMENTO', perfil: 'MENTOR' }, op)).toMatchObject({
      ok: true,
      valor: { perfil: 'MENTOR', moduloAdmin: false },
    });
    // Conta antiga sem perfil continua precisando escolher.
    expect(
      resolverCargo({ role: 'ACOMPANHAMENTO', moduloAdmin: true }, { ...op, perfil: null }),
    ).toEqual({ ok: false, erro: 'PERFIL_OBRIGATORIO' });
    // Vindo de outro cargo, o selo começa desligado.
    const sdr = { ...op, role: 'SDR' as const, perfil: null, canProspect: true };
    expect(resolverCargo({ role: 'ACOMPANHAMENTO', perfil: 'MENTOR' }, sdr)).toMatchObject({
      ok: true,
      valor: { canProspect: false, moduloAdmin: false },
    });
  });
});

describe('schemas de cargo', () => {
  const base = { name: 'Nova', email: 'nova@x.test', username: 'nova' };
  it('convite aceita cargo sem caixas e com perfil', () => {
    expect(userInviteSchema.safeParse({ ...base, role: 'SDR' }).success).toBe(true);
    expect(
      userInviteSchema.safeParse({ ...base, role: 'ACOMPANHAMENTO', perfil: 'OPERACAO' }).success,
    ).toBe(true);
    expect(userInviteSchema.safeParse({ ...base, role: 'SDR', perfil: 'X' }).success).toBe(false);
  });
  it('aprovação e troca aceitam os mesmos campos', () => {
    expect(accessApprovalSchema.safeParse({ role: 'HEAD', canClose: true }).success).toBe(true);
    expect(userChangeSchema.safeParse({ moduloAdmin: true }).success).toBe(true);
    expect(userChangeSchema.safeParse({}).success).toBe(false);
  });
});
