import { describe, expect, it } from 'vitest';
import {
  ETAPAS,
  PASSOS_MENSAGEM,
  PRAZOS,
  diasParado,
  etapaAtual,
  etapaEmAlerta,
  podeEnviar,
  type EtapaEstado,
} from '../src/mentoria/onboarding.js';

const pendentes = (): EtapaEstado[] =>
  ETAPAS.map((etapa) => ({ etapa, status: 'PENDENTE', formularioPreenchido: null }));

const com = (mudancas: Partial<Record<(typeof ETAPAS)[number], Partial<EtapaEstado>>>) =>
  pendentes().map((e) => ({ ...e, ...mudancas[e.etapa] }));

describe('ordem do onboarding', () => {
  it('as etapas seguem a ordem do SPEC', () => {
    expect(ETAPAS).toEqual([
      'BOAS_VINDAS',
      'GRUPOS',
      'AQUECIMENTO',
      'PME_AQUECIMENTO',
      'CAIXA',
      'IDR',
    ]);
    expect(PASSOS_MENSAGEM).toEqual(ETAPAS.slice(0, 4));
  });

  it('o primeiro passo não depende de nada', () => {
    expect(podeEnviar('BOAS_VINDAS', pendentes())).toBe(true);
  });

  it('um passo só é enviado com o anterior concluído', () => {
    expect(podeEnviar('GRUPOS', pendentes())).toBe(false);
    expect(podeEnviar('GRUPOS', com({ BOAS_VINDAS: { status: 'ENVIADA' } }))).toBe(false);
    expect(podeEnviar('GRUPOS', com({ BOAS_VINDAS: { status: 'CONCLUIDA' } }))).toBe(true);
  });

  it('dispensada conta como concluída para liberar a próxima', () => {
    expect(podeEnviar('AQUECIMENTO', com({ GRUPOS: { status: 'DISPENSADA' } }))).toBe(true);
  });

  it('a Caixa corre em paralelo: depende só do formulário', () => {
    expect(podeEnviar('CAIXA', pendentes())).toBe(false);
    expect(podeEnviar('CAIXA', com({ BOAS_VINDAS: { formularioPreenchido: true } }))).toBe(true);
  });

  it('boas-vindas dispensada não trava a Caixa', () => {
    expect(podeEnviar('CAIXA', com({ BOAS_VINDAS: { status: 'DISPENSADA' } }))).toBe(true);
  });

  it('a IDR espera a Caixa entregue ou dispensada', () => {
    expect(podeEnviar('IDR', com({ CAIXA: { status: 'ENVIADA' } }))).toBe(false);
    expect(podeEnviar('IDR', com({ CAIXA: { status: 'CONCLUIDA' } }))).toBe(true);
    expect(podeEnviar('IDR', com({ CAIXA: { status: 'DISPENSADA' } }))).toBe(true);
  });
});

describe('etapa atual', () => {
  it('é o primeiro passo de mensagem em aberto, mesmo com a Caixa andando', () => {
    expect(
      etapaAtual(com({ BOAS_VINDAS: { status: 'CONCLUIDA' }, CAIXA: { status: 'ENVIADA' } })),
    ).toBe('GRUPOS');
  });

  it('com as mensagens fechadas, passa para a Caixa e depois a IDR', () => {
    const msgs = {
      BOAS_VINDAS: { status: 'CONCLUIDA' },
      GRUPOS: { status: 'CONCLUIDA' },
      AQUECIMENTO: { status: 'DISPENSADA' },
      PME_AQUECIMENTO: { status: 'CONCLUIDA' },
    } as const;
    expect(etapaAtual(com(msgs))).toBe('CAIXA');
    expect(etapaAtual(com({ ...msgs, CAIXA: { status: 'CONCLUIDA' } }))).toBe('IDR');
  });

  it('tudo fechado não tem etapa atual', () => {
    expect(
      etapaAtual(ETAPAS.map((etapa) => ({ etapa, status: 'ANTERIOR_AO_SISTEMA' }))),
    ).toBeNull();
  });
});

describe('dias parado e prazos', () => {
  it('conta dias de calendário de Brasília', () => {
    // 23h30 do dia 10 em Brasília (02h30 UTC do dia 11) até 00h30 do dia 11: 1 dia.
    expect(diasParado('2026-11-11T02:30:00Z', new Date('2026-11-11T03:30:00Z'))).toBe(1);
    // Mesmo dia em Brasília, mesmo com o dia UTC diferente.
    expect(diasParado('2026-11-10T12:00:00Z', new Date('2026-11-11T02:00:00Z'))).toBe(0);
  });

  it('não dá negativo', () => {
    expect(diasParado('2026-11-12T12:00:00Z', new Date('2026-11-10T12:00:00Z'))).toBe(0);
  });

  it('atravessa o fim do mês', () => {
    expect(diasParado('2026-01-31T15:00:00Z', new Date('2026-03-01T15:00:00Z'))).toBe(29);
  });

  it('passo curto alerta depois de 3 dias', () => {
    expect(PRAZOS.PASSO_CURTO_DIAS).toBe(3);
    expect(etapaEmAlerta('GRUPOS', 'ENVIADA', 3)).toBe(false);
    expect(etapaEmAlerta('GRUPOS', 'ENVIADA', 4)).toBe(true);
  });

  it('o PME de aquecimento enviado corre junto com a Caixa e não alerta sozinho', () => {
    expect(etapaEmAlerta('PME_AQUECIMENTO', 'ENVIADA', 30)).toBe(false);
  });

  it('passo em aberto com a equipe devendo alerta depois de 3 dias', () => {
    expect(etapaEmAlerta('PME_AQUECIMENTO', 'PENDENTE', 4)).toBe(true);
  });

  it('Caixa alerta depois de 20 dias do envio, e não antes', () => {
    expect(PRAZOS.CAIXA_TRANSITO_DIAS).toBe(20);
    expect(etapaEmAlerta('CAIXA', 'ENVIADA', 20)).toBe(false);
    expect(etapaEmAlerta('CAIXA', 'ENVIADA', 21)).toBe(true);
  });

  it('Caixa sem envio alerta depois de 3 dias', () => {
    expect(PRAZOS.CAIXA_SEM_ENVIO_DIAS).toBe(3);
    expect(etapaEmAlerta('CAIXA', 'PENDENTE', 3)).toBe(false);
    expect(etapaEmAlerta('CAIXA', 'PENDENTE', 4)).toBe(true);
  });

  it('etapa fechada e IDR não alertam', () => {
    expect(etapaEmAlerta('GRUPOS', 'CONCLUIDA', 40)).toBe(false);
    expect(etapaEmAlerta('IDR', 'PENDENTE', 40)).toBe(false);
  });
});
