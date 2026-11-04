import { describe, expect, it } from 'vitest';
import { FieldCrypto } from '../src/common/crypto/field-crypto.js';
import { MentoriaFieldCrypto } from '../src/common/crypto/mentoria-field-crypto.js';

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

describe('MentoriaFieldCrypto (v2 com AAD)', () => {
  const mc = new MentoriaFieldCrypto(Buffer.alloc(32, 5));

  it('blob v2 decifra com o mesmo AAD', () => {
    const b = mc.encryptV2('Renda atual: R$ 8 mil', 'mentoria_fichas.notas_momento_inicial.x');
    expect(b[0]).toBe(0x02);
    expect(mc.decryptV2(b, 'mentoria_fichas.notas_momento_inicial.x')).toBe(
      'Renda atual: R$ 8 mil',
    );
  });
  it('blob v2 com AAD trocado (outra linha ou coluna) falha', () => {
    const b = mc.encryptV2('segredo', 'mentoria_fichas.notas_momento_inicial.a');
    expect(() => mc.decryptV2(b, 'mentoria_fichas.notas_momento_inicial.b')).toThrow();
    expect(() => mc.decryptV2(b, 'mentoria_fichas.notas_momento_atual.a')).toThrow();
  });
  it('blob v1 já existente continua decifrando', () => {
    const v1 = fc.encrypt('+5511988887777');
    expect(v1[0]).toBe(0x01);
    expect(fc.decrypt(v1)).toBe('+5511988887777');
    expect(() => mc.decryptV2(v1, 'qualquer')).toThrow();
  });
  it('a chave não aparece em mensagem de erro', () => {
    const chave = Buffer.alloc(31, 0x41);
    let msg = '';
    try {
      new MentoriaFieldCrypto(chave);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBeTruthy();
    expect(msg).not.toContain(chave.toString('base64'));
    expect(msg).not.toContain('AAAA');
    const b = mc.encryptV2('x', 'a');
    try {
      mc.decryptV2(b, 'b');
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).not.toContain(Buffer.alloc(32, 5).toString('base64'));
  });
});
