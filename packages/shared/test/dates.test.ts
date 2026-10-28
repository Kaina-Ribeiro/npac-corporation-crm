import { describe, expect, it } from 'vitest';
import { BUSINESS_TZ, spDayRange } from '../src/dates.js';

describe('spDayRange', () => {
  it('usa o fuso de negócio', () => expect(BUSINESS_TZ).toBe('America/Sao_Paulo'));

  it('23:30 BRT ainda é o mesmo dia', () => {
    const r = spDayRange(new Date('2026-10-27T02:30:00Z')); // 26/10 23:30 BRT
    expect(r.start.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-10-27T03:00:00.000Z');
  });

  it('início do dia é inclusivo', () => {
    const r = spDayRange(new Date('2026-10-26T03:00:00Z'));
    expect(r.start.toISOString()).toBe('2026-10-26T03:00:00.000Z');
  });
});
