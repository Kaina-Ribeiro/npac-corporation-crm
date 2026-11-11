import { describe, expect, it } from 'vitest';
import {
  brasiliaDay,
  dashboardRules,
  isoDate,
  oneOf,
  readLeadFilters,
  readPrefs,
  readTabUrls,
  reportRules,
  writePrefs,
  writeTabUrls,
} from '../src/screen-prefs.js';

const rules = { stage: oneOf(['SONDAGEM', 'VENDA']), from: isoDate };
const catalog = {
  stages: [{ key: 'SONDAGEM' }],
  team: [
    { id: 'u1', canProspect: true, canClose: false },
    { id: 'c1', canProspect: false, canClose: true },
  ],
} as never;

describe('screen-prefs', () => {
  it('lê só chave e valor aceitos', () => {
    expect(readPrefs('stage=VENDA&from=2026-11-01&x=1', rules)).toEqual({
      stage: 'VENDA',
      from: '2026-11-01',
    });
    expect(readPrefs('stage=OUTRA&from=01%2F11%2F2026', rules)).toEqual({});
    expect(readPrefs(undefined, rules)).toEqual({});
    expect(readPrefs('%E0%A4%A', rules)).toEqual({});
  });

  it('grava sem vazio nem chave desconhecida', () => {
    expect(writePrefs({ from: '2026-11-01', stage: 'VENDA', x: '1' }, rules)).toBe(
      'stage=VENDA&from=2026-11-01',
    );
    expect(writePrefs({ stage: '' }, rules)).toBe('');
    expect(writePrefs({ stage: 'OUTRA' }, rules)).toBe('');
  });

  it('filtro de leads derruba quem saiu, padrão e intervalo incompleto', () => {
    expect(
      readLeadFilters('sdrId=u9&stage=SONDAGEM&sort=createdAt&direction=desc', catalog),
    ).toEqual({ stage: 'SONDAGEM' });
    expect(readLeadFilters('period=RANGE&from=2026-11-01', catalog)).toEqual({});
    expect(readLeadFilters('from=2026-11-01&to=2026-11-02', catalog)).toEqual({});
    expect(readLeadFilters('sdrId=c1&closerId=u1', catalog)).toEqual({});
    expect(
      readLeadFilters(
        'period=RANGE&from=2026-11-01&to=2026-11-02&sort=name&direction=asc',
        catalog,
      ),
    ).toEqual({
      period: 'RANGE',
      from: '2026-11-01',
      to: '2026-11-02',
      sort: 'name',
      direction: 'asc',
    });
  });

  it('relatório descarta mês (padrão), quem saiu e produto excluído', () => {
    const r = reportRules(catalog, ['p1']);
    expect(readPrefs('period=MONTH&sdrId=u9&closerId=c1&productId=p9&tier=P0', r)).toEqual({
      closerId: 'c1',
      tier: 'P0',
    });
    expect(readPrefs('productId=p1&period=TODAY', r)).toEqual({ productId: 'p1', period: 'TODAY' });
  });

  it('dashboard: só a liderança lembra o SDR', () => {
    expect(readPrefs('preset=WEEK&sdrId=u1', dashboardRules(catalog, true))).toEqual({
      preset: 'WEEK',
      sdrId: 'u1',
    });
    expect(readPrefs('preset=MONTH&sdrId=u1', dashboardRules(catalog, false))).toEqual({});
  });

  it('última URL por aba: semana e mês só no mesmo dia', () => {
    const raw = writeTabUrls(
      { tabs: {} },
      'agenda',
      'aba=agenda&dia=2026-11-09&condutor=u1',
      '2026-11-10',
    );
    const tabs = ['agenda', 'controle', 'sem'];
    expect(readTabUrls(raw, tabs, '2026-11-10', ['dia', 'mes'])).toEqual({
      last: 'agenda',
      tabs: { agenda: 'aba=agenda&dia=2026-11-09&condutor=u1' },
    });
    expect(readTabUrls(raw, tabs, '2026-11-11', ['dia', 'mes'])).toEqual({
      last: 'agenda',
      tabs: { agenda: 'aba=agenda&condutor=u1' },
    });
    expect(readTabUrls('outra=aba%3Doutra&last=outra', tabs, '2026-11-10', [])).toEqual({
      tabs: {},
    });
  });

  it('brasiliaDay usa o dia de Brasília', () => {
    expect(brasiliaDay(new Date('2026-11-11T02:30:00Z'))).toBe('2026-11-10');
  });
});
