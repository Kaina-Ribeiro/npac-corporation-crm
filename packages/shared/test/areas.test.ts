import { describe, expect, it } from 'vitest';
import { areasDeHead, gerenciaAlguma, MOTIVO, podeGerenciar, REGRA_HTTP } from '../src/areas.js';
import { ADMIN_AC, CASOS, HEAD_COM, MESTRE, OPERACAO, SDR } from './areas-casos.js';

describe('regra única de quem gerencia quem (arquivo de casos)', () => {
  it.each(CASOS.map((c) => [c.nome, c] as const))('%s', (_, c) => {
    const v = podeGerenciar(c.pedido);
    expect(v.ok ? 'OK' : v.erro).toBe(c.esperado);
  });

  it('cobre cada ação e cada ator', () => {
    const acoes = new Set(CASOS.map((c) => c.pedido.acao));
    expect([...acoes].sort()).toEqual([
      'APROVAR',
      'CARGO',
      'CONTA',
      'CONVIDAR',
      'DESATIVAR',
      'MESTRE',
      'REMOVER_AREA',
      'VER',
      'VER_PEDIDO',
    ]);
    for (const ator of [MESTRE, HEAD_COM, ADMIN_AC, SDR, OPERACAO])
      expect(CASOS.some((c) => c.pedido.ator === ator)).toBe(true);
  });
});

describe('frases e códigos', () => {
  it('as recusas que já existiam mantêm a frase', () => {
    expect(
      podeGerenciar({ ator: HEAD_COM, acao: 'CONVIDAR', area: 'COMERCIAL', cargo: 'HEAD' }),
    ).toEqual({
      ok: false,
      erro: 'PROIBIDO',
      motivo: 'Só a Diretoria pode dar cargo de Head ou Diretoria',
    });
    expect(
      podeGerenciar({
        ator: HEAD_COM,
        acao: 'CONVIDAR',
        area: 'ACOMPANHAMENTO',
        cargo: 'OPERACAO',
      }),
    ).toMatchObject({ motivo: 'Só a Diretoria pode dar cargo de Acompanhamento' });
    expect(podeGerenciar({ ator: HEAD_COM, alvo: HEAD_COM, acao: 'CONTA' })).toMatchObject({
      motivo: 'Só a Diretoria administra contas de Head ou Diretoria',
    });
    expect(
      podeGerenciar({ ator: MESTRE, alvo: MESTRE, proprio: true, acao: 'DESATIVAR' }),
    ).toMatchObject({ motivo: 'Você não pode remover o próprio cargo' });
  });

  it('o selo de Admin tem frase própria', () => {
    expect(
      podeGerenciar({
        ator: ADMIN_AC,
        alvo: OPERACAO,
        acao: 'CARGO',
        area: 'ACOMPANHAMENTO',
        cargo: 'OPERACAO',
        head: true,
      }),
    ).toMatchObject({ erro: 'PROIBIDO', motivo: MOTIVO.DAR_HEAD_ACOMPANHAMENTO });
  });

  it('INVISIVEL é 404, PROIBIDO é 403, PROPRIO é 400', () => {
    expect(REGRA_HTTP).toEqual({ INVISIVEL: 404, PROIBIDO: 403, PROPRIO: 400 });
  });

  it('áreas de Head: a Diretoria, todas; os demais, onde têm o selo', () => {
    expect(areasDeHead(MESTRE)).toEqual(['COMERCIAL', 'ACOMPANHAMENTO']);
    expect(areasDeHead(HEAD_COM)).toEqual(['COMERCIAL']);
    expect(areasDeHead(ADMIN_AC)).toEqual(['ACOMPANHAMENTO']);
    expect(gerenciaAlguma(SDR)).toBe(false);
    expect(gerenciaAlguma(OPERACAO)).toBe(false);
  });
});
