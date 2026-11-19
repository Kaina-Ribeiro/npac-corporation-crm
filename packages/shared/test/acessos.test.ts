import { describe, expect, it } from 'vitest';
import { entrouHa, fraseAcesso, quandoAcesso, type Acesso } from '../src/acessos.js';

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

// Registro de acessos da Diretoria (D10, D11; textos de D13).
const EU = 'u-diretor';
const ana = { id: 'u-ana', nome: 'Ana' };
const maria = { id: 'u-maria', nome: 'Maria Souza' };
const linha = (o: Partial<Acesso>): Acesso => ({
  id: 1,
  at: agora.toISOString(),
  tipo: 'CONTA_CRIADA',
  ator: ana,
  alvo: maria,
  area: null,
  cargo: null,
  head: null,
  ...o,
});
const texto = (o: Partial<Acesso>) => {
  const f = fraseAcesso(linha(o), EU);
  return `${f.antes}${f.alvo ?? ''}${f.depois}`;
};

describe('fraseAcesso', () => {
  it.each<[Partial<Acesso>, string]>([
    [
      { area: 'ACOMPANHAMENTO', cargo: 'OPERACAO', head: false },
      'Ana criou a conta de Maria Souza · Acompanhamento, Operação',
    ],
    [
      { tipo: 'PEDIDO_APROVADO', area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA' },
      'Ana aprovou o pedido de Maria Souza · Acompanhamento, Especialista',
    ],
    [
      { tipo: 'PEDIDO_RECUSADO', alvo: null, area: 'COMERCIAL' },
      'Ana recusou um pedido de acesso · Comercial',
    ],
    [
      { tipo: 'CARGO_TROCADO', area: 'COMERCIAL', cargo: 'CLOSER' },
      'Ana trocou o cargo de Maria Souza · Comercial, Closer',
    ],
    [{ tipo: 'CARGO_TROCADO' }, 'Ana trocou o cargo de Maria Souza'],
    [
      { tipo: 'HEAD_DADO', ator: { id: EU, nome: 'Diretor' }, area: 'ACOMPANHAMENTO' },
      'Você deu Admin do Acompanhamento a Maria Souza',
    ],
    [{ tipo: 'HEAD_TIRADO', area: 'COMERCIAL' }, 'Ana tirou Head de Maria Souza'],
    [
      { tipo: 'AREA_ADICIONADA', area: 'ACOMPANHAMENTO', cargo: 'ESPECIALISTA' },
      'Ana adicionou Maria Souza a outra área · Acompanhamento, Especialista',
    ],
    [{ tipo: 'AREA_REMOVIDA', area: 'ACOMPANHAMENTO' }, 'Ana tirou Maria Souza do Acompanhamento'],
    [{ tipo: 'DIRETORIA_DADA', cargo: 'DIRETOR' }, 'Ana deu Diretoria a Maria Souza'],
    [
      { tipo: 'DIRETORIA_TIRADA', area: 'COMERCIAL', cargo: 'HEAD' },
      'Ana tirou a Diretoria de Maria Souza · Comercial, Head',
    ],
    [{ tipo: 'SENHA_REDEFINIDA' }, 'Ana redefiniu a senha de Maria Souza'],
    [{ tipo: 'MFA_ZERADO' }, 'Ana resetou o MFA de Maria Souza'],
    [{ tipo: 'CONTA_DESATIVADA' }, 'Ana desativou a conta de Maria Souza'],
    [{ tipo: 'CONTA_REATIVADA' }, 'Ana reativou a conta de Maria Souza'],
    [{ tipo: 'CONTA_ATIVO_ALTERADO' }, 'Ana alterou a conta de Maria Souza'],
    [{ tipo: 'SENHA_REDEFINIDA', alvo: null }, 'Ana redefiniu a senha de uma conta apagada'],
    [
      { area: 'ACOMPANHAMENTO', cargo: 'ACOMPANHAMENTO', head: true },
      'Ana criou a conta de Maria Souza · Acompanhamento, Acompanhamento e Admin do Acompanhamento',
    ],
    [{ cargo: 'DIRETOR' }, 'Ana criou a conta de Maria Souza · Diretoria'],
  ])('%j', (o, frase) => {
    expect(texto(o)).toBe(frase);
  });

  it('o alvo vem separado, para ficar em destaque', () => {
    expect(fraseAcesso(linha({ tipo: 'SENHA_REDEFINIDA' }), EU)).toEqual({
      antes: 'Ana redefiniu a senha de ',
      alvo: 'Maria Souza',
      depois: '',
    });
  });
});

describe('quandoAcesso', () => {
  it('hoje, ontem e data', () => {
    expect(quandoAcesso('2026-11-19T14:02:00-03:00', agora)).toBe('hoje 14:02');
    expect(quandoAcesso('2026-11-18T09:10:00-03:00', agora)).toBe('ontem 09:10');
    expect(quandoAcesso('2026-11-17T23:59:00-03:00', agora)).toBe('17/11');
  });
});
