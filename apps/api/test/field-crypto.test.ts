import { describe, expect, it } from 'vitest';
import { FieldCrypto } from '../src/common/crypto/field-crypto.js';

const fc = new FieldCrypto(Buffer.alloc(32, 1), Buffer.alloc(32, 2));

describe('FieldCrypto', () => {
  it('roundtrip', () => expect(fc.decrypt(fc.encrypt('+5511988887777'))).toBe('+5511988887777'));
  it('mesmo texto, cifras diferentes', () =>
    expect(fc.encrypt('a').equals(fc.encrypt('a'))).toBe(false));
  it('formato 0x01 | iv(12) | tag(16) | ciphertext', () => {
    const b = fc.encrypt('abc');
    expect(b[0]).toBe(0x01);
    expect(b.length).toBe(1 + 12 + 16 + 3);
  });
  it('índice cego determinístico', () => expect(fc.blindIndex('x')).toBe(fc.blindIndex('x')));
  it('índice cego é HMAC-SHA256 hex e depende da chave', () => {
    expect(fc.blindIndex('x')).toMatch(/^[0-9a-f]{64}$/);
    const other = new FieldCrypto(Buffer.alloc(32, 1), Buffer.alloc(32, 3));
    expect(other.blindIndex('x')).not.toBe(fc.blindIndex('x'));
  });
  it('blob adulterado falha', () => {
    const b = fc.encrypt('a');
    b[b.length - 1]! ^= 1;
    expect(() => fc.decrypt(b)).toThrow();
  });
  it('versão desconhecida falha', () => {
    const b = fc.encrypt('a');
    b[0] = 0x02;
    expect(() => fc.decrypt(b)).toThrow();
  });
  it('rejeita chave que não tem 32 bytes', () =>
    expect(() => new FieldCrypto(Buffer.alloc(16), Buffer.alloc(32))).toThrow());
});
