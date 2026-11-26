import { describe, expect, it } from 'vitest';
import {
  filtrarRenovacoes,
  mesesDaJornada,
  numerosRenovacao,
  pctRenovacao,
  rotuloMesRenovacao,
  situacaoConversa,
} from '../src/mentoria/renovacoes.js';

// NPAC-79 (5A, 8A, G4, G6): situação da conversa, rótulo do mês e os números do topo.
const base = {
  renovadaEm: null,
  renovadaDe: null,
  renovadaPara: null,
  reuniaoStatus: null,
  reuniaoDia: null,
  interesseRenovar: null,
} as const;

describe('situação da conversa (5A)', () => {
  it('renovou vence tudo; com troca de mentoria diz para qual', () => {
    expect(
      situacaoConversa({
        ...base,
        renovadaEm: '2026-11-20',
        renovadaDe: 'RDV',
        renovadaPara: 'RDV',
        reuniaoStatus: 'REALIZADA',
        interesseRenovar: false,
      }),
    ).toEqual({ situacao: 'RENOVOU', rotulo: 'Renovou em 20/11' });
    expect(
      situacaoConversa({
        ...base,
        renovadaEm: '2026-11-20',
        renovadaDe: 'RDV',
        renovadaPara: '2M',
      }).rotulo,
    ).toBe('Renovou para 2M em 20/11');
  });

  it('reunião realizada: pela resposta do "Quer renovar?"', () => {
    const feita = { ...base, reuniaoStatus: 'REALIZADA' as const, reuniaoDia: '2026-11-10' };
    expect(situacaoConversa({ ...feita, interesseRenovar: true })).toEqual({
      situacao: 'QUER_RENOVAR',
      rotulo: 'Quer renovar',
    });
    expect(situacaoConversa({ ...feita, interesseRenovar: false })).toEqual({
      situacao: 'NAO_QUER',
      rotulo: 'Não quer renovar',
    });
    expect(situacaoConversa(feita)).toEqual({
      situacao: 'FALTA_RESPOSTA',
      rotulo: 'Reunião feita, falta o “Quer renovar?”',
    });
  });

  it('agendada, confirmada ou link enviado: marcada; faltou ou nenhuma: sem reunião', () => {
    for (const reuniaoStatus of ['AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO'] as const)
      expect(situacaoConversa({ ...base, reuniaoStatus, reuniaoDia: '2026-12-03' })).toEqual({
        situacao: 'MARCADA',
        rotulo: 'Reunião marcada para 03/12',
      });
    expect(situacaoConversa({ ...base, reuniaoStatus: 'FALTOU', reuniaoDia: '2026-11-01' })).toEqual(
      { situacao: 'SEM_REUNIAO', rotulo: 'Sem reunião · faltou em 01/11' },
    );
    expect(situacaoConversa(base)).toEqual({ situacao: 'SEM_REUNIAO', rotulo: 'Sem reunião' });
  });
});

describe('rótulo do mês', () => {
  const l = { ano: 1, terminoPrevisto: '2027-01-10', ultimoMesInicio: '2026-12-10' };
  it('antes do último mês, no último mês e depois do término', () => {
    expect(rotuloMesRenovacao(l, '2026-11-26')).toBe('O 12º mês começa em 10/12');
    expect(rotuloMesRenovacao(l, '2026-12-10')).toBe('Mês 12 de 12');
    expect(rotuloMesRenovacao(l, '2027-01-10')).toBe('Mês 12 de 12');
    expect(rotuloMesRenovacao(l, '2027-01-11')).toBe('Terminou em 10/01');
  });
  it('no 2º ano o último mês é o 24º', () => {
    expect(rotuloMesRenovacao({ ...l, ano: 2 }, '2026-12-15')).toBe('Mês 24 de 24');
    expect(mesesDaJornada(0)).toBe(12);
    expect(mesesDaJornada(1)).toBe(24);
  });
});

describe('números (8A, G4)', () => {
  it('chegando = sem renovação; já tiveram = desses, com a reunião realizada', () => {
    const itens = [
      { situacao: 'RENOVOU', reuniaoStatus: 'REALIZADA' },
      { situacao: 'QUER_RENOVAR', reuniaoStatus: 'REALIZADA' },
      { situacao: 'FALTA_RESPOSTA', reuniaoStatus: 'REALIZADA' },
      { situacao: 'MARCADA', reuniaoStatus: 'AGENDADA' },
      { situacao: 'SEM_REUNIAO', reuniaoStatus: null },
    ] as const;
    expect(numerosRenovacao(itens, 3, 1)).toEqual({
      chegando: 4,
      jaTiveramReuniao: 2,
      renovaram: 3,
      naoRenovaram: 1,
      pct: 75,
    });
  });
  it('% inteiro; sem base, nulo ("—")', () => {
    expect(pctRenovacao(0, 0)).toBeNull();
    expect(pctRenovacao(1, 2)).toBe(33);
    expect(pctRenovacao(2, 1)).toBe(67);
    expect(pctRenovacao(0, 4)).toBe(0);
  });
});

describe('filtros', () => {
  it('situação e responsável', () => {
    const itens = [
      { situacao: 'MARCADA', responsavelId: 'a' },
      { situacao: 'MARCADA', responsavelId: 'b' },
      { situacao: 'SEM_REUNIAO', responsavelId: 'a' },
    ] as const;
    expect(filtrarRenovacoes(itens, {})).toHaveLength(3);
    expect(filtrarRenovacoes(itens, { situacao: 'MARCADA' })).toHaveLength(2);
    expect(filtrarRenovacoes(itens, { situacao: 'MARCADA', responsavelId: 'a' })).toEqual([
      itens[0],
    ]);
  });
});
