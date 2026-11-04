import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/**
 * Cursor de paginação opaco e assinado: leva só o id do último item (nunca nome) e um HMAC.
 * O servidor lê o nome_norm desse id para continuar a ordem A–Z.
 */
export class CursorSigner {
  constructor(private readonly key: Buffer) {}

  private mac(id: string): string {
    return createHmac('sha256', this.key).update(`mentoria-cursor:${id}`).digest('base64url');
  }

  sign(id: string): string {
    return Buffer.from(`${id}.${this.mac(id)}`, 'utf8').toString('base64url');
  }

  /** Devolve o id ou lança 400 se o cursor foi adulterado. */
  verify(cursor: string): string {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const dot = raw.indexOf('.');
    const id = raw.slice(0, dot);
    const got = Buffer.from(raw.slice(dot + 1));
    const want = Buffer.from(this.mac(id));
    if (dot < 1 || got.length !== want.length || !timingSafeEqual(got, want))
      throw new BadRequestException('Página inválida. Recarregue a lista.');
    return id;
  }
}
