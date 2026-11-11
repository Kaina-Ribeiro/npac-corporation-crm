import { createHmac, hkdfSync } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { MentoriaFieldCrypto } from '../common/crypto/mentoria-field-crypto.js';

/** Proteção por valor: o limite do PDF é por registro (256 KB somando os textos, Task 8). */
export const LIMITE_VALOR_BYTES = 256 * 1024;

/** AAD = `tabela.coluna.id`. O id é gerado no app antes do INSERT. */
export function aad(tabela: string, coluna: string, id: string, chave?: string): string {
  return chave ? `${tabela}.${coluna}.${id}.${chave}` : `${tabela}.${coluna}.${id}`;
}

/** Texto sensível do Acompanhamento gravado como base64 do v2, e o índice cego da busca. */
export class MentoriaCrypto {
  private readonly fc: MentoriaFieldCrypto;
  private readonly chaveIndice: Buffer;

  constructor(key: Buffer) {
    this.fc = new MentoriaFieldCrypto(key);
    this.chaveIndice = Buffer.from(hkdfSync('sha256', key, '', 'mentoria-indice-v1', 32));
  }

  /** HMAC do valor já normalizado (telefone E.164, e-mail em minúsculas): busca por igualdade. */
  indiceCego(valorNormalizado: string): string {
    return createHmac('sha256', this.chaveIndice).update(valorNormalizado).digest('hex');
  }

  cifrarTexto(valor: string, aadValue: string): string {
    if (Buffer.byteLength(valor, 'utf8') > LIMITE_VALOR_BYTES)
      throw new BadRequestException('Texto acima do limite de 256 KB');
    return this.fc.encryptV2(valor, aadValue).toString('base64');
  }

  decifrarTexto(blob: string, aadValue: string): string {
    return this.fc.decryptV2(Buffer.from(blob, 'base64'), aadValue);
  }

  cifrarOpcional(valor: string | null | undefined, aadValue: string): string | null {
    return valor == null ? null : this.cifrarTexto(valor, aadValue);
  }

  decifrarOpcional(blob: string | null | undefined, aadValue: string): string | null {
    return blob == null ? null : this.decifrarTexto(blob, aadValue);
  }
}
