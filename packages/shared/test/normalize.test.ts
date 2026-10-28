import { describe, expect, it } from 'vitest';
import { normalizeInstagram, normalizePhoneBR } from '../src/normalize.js';

describe('normalizePhoneBR', () => {
  it.each([
    ['(11) 98888-7777', '+5511988887777'],
    ['+55 11 98888-7777', '+5511988887777'],
    ['11988887777', '+5511988887777'],
    ['5511988887777', '+5511988887777'],
    ['(11) 3333-4444', '+551133334444'],
    ['(55) 98888-7777', '+5555988887777'],
  ])('normalizePhoneBR(%s)', (i, o) => expect(normalizePhoneBR(i)).toBe(o));

  it('rejeita telefone curto', () => expect(normalizePhoneBR('98888-77')).toBeNull());
  it('rejeita DDD iniciado em 0', () => expect(normalizePhoneBR('(01) 98888-7777')).toBeNull());
  it('rejeita celular sem 9 inicial', () => expect(normalizePhoneBR('11 88888-7777')).toBeNull());
  it('rejeita texto sem dígitos', () => expect(normalizePhoneBR('abc')).toBeNull());
});

describe('normalizeInstagram', () => {
  it.each([
    ['@Fulano.Silva', 'fulano.silva'],
    ['https://instagram.com/fulano/', 'fulano'],
    ['instagram.com/Fulano?igsh=x', 'fulano'],
  ])('normalizeInstagram(%s)', (i, o) => expect(normalizeInstagram(i)).toBe(o));

  it('rejeita handle inválido', () => expect(normalizeInstagram('fu lano!')).toBeNull());
  it('rejeita vazio', () => expect(normalizeInstagram('  ')).toBeNull());
});
