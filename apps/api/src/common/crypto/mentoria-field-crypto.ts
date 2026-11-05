import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 0x02;
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Cifra v2 do Acompanhamento (D19): AES-256-GCM com AAD (`tabela.coluna.id`), para que um blob
 * copiado para outra linha ou coluna não decifre. Chave própria (MENTORADO_ENCRYPTION_KEY),
 * sem índice cego. Formato: 0x02 | iv | tag | cifra. O `FieldCrypto` (v1) não muda.
 */
export class MentoriaFieldCrypto {
  constructor(private readonly encKey: Buffer) {
    if (encKey.length !== 32) throw new Error('MentoriaFieldCrypto exige chave de 32 bytes');
  }

  encryptV2(plain: string, aad: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), ct]);
  }

  decryptV2(blob: Buffer, aad: string): string {
    if (blob.length < 1 + IV_LEN + TAG_LEN || blob[0] !== VERSION)
      throw new Error('Blob cifrado inválido');
    const iv = blob.subarray(1, 1 + IV_LEN);
    const tag = blob.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    try {
      return Buffer.concat([
        decipher.update(blob.subarray(1 + IV_LEN + TAG_LEN)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Falha ao decifrar campo');
    }
  }
}
