import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const VERSION = 0x01;
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Criptografia de campo (AES-256-GCM) para contatos, com índice cego (HMAC-SHA256)
 * para busca e detecção de duplicado sem decifrar. Formato: 0x01 | iv | tag | cifra.
 */
export class FieldCrypto {
  constructor(
    private readonly encKey: Buffer,
    private readonly bidxKey: Buffer,
  ) {
    if (encKey.length !== 32 || bidxKey.length !== 32) {
      throw new Error('FieldCrypto exige chaves de 32 bytes');
    }
  }

  encrypt(plain: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
  }

  decrypt(blob: Buffer): string {
    if (blob.length < 1 + IV_LEN + TAG_LEN || blob[0] !== VERSION) {
      throw new Error('Blob cifrado inválido');
    }
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(blob.subarray(1 + IV_LEN + TAG_LEN)),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Recebe o valor já normalizado (ex.: telefone E.164). */
  blindIndex(normalized: string): string {
    return createHmac('sha256', this.bidxKey).update(normalized, 'utf8').digest('hex');
  }
}
