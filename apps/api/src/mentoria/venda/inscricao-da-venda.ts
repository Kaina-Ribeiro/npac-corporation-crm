import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { deals, leads, products, type Tx } from '@npac/db';
import { nomeNormalizado, normalizeEmail, normalizePhoneBR } from '@npac/shared';
import { eq, sql } from 'drizzle-orm';
import { FieldCrypto } from '../../common/crypto/field-crypto.js';
import { aad, MentoriaCrypto } from '../mentoria-crypto.js';

/** Texto da falha (G9): a venda inteira volta. */
export const ERRO_INSCRICAO_DA_VENDA =
  'Não foi possível criar o mentorado no Acompanhamento. Tente de novo; se continuar, avise a liderança.';

/**
 * Venda vira mentorado (NPAC-56, G2–G4, G9): na transação da venda, lê o contato do lead (chave do
 * comercial), cifra com a chave do Acompanhamento (AAD da pessoa) e chama
 * `mentoria_inscricao_da_venda`. O contato só existe em memória aqui: nada em log nem auditoria.
 */
@Injectable()
export class InscricaoDaVenda {
  private readonly log = new Logger('InscricaoDaVenda');

  constructor(
    private readonly comercial: FieldCrypto,
    private readonly mentoria: MentoriaCrypto,
  ) {}

  /** Id da inscrição criada, ou `null` quando o produto da venda não vira mentorado. */
  async criar(tx: Tx, dealId: string, leadId: string): Promise<string | null> {
    try {
      const [d] = await tx
        .select({ mentoria: products.mentoria })
        .from(deals)
        .innerJoin(products, eq(products.id, deals.productId))
        .where(eq(deals.id, dealId));
      if (!d?.mentoria) return null;
      const [l] = await tx
        .select({
          name: leads.name,
          phoneEnc: leads.phoneEnc,
          emailEnc: leads.emailEnc,
          instagram: leads.instagram,
        })
        .from(leads)
        .where(eq(leads.id, leadId));
      if (!l) throw new Error('lead');
      const inscricao = randomUUID();
      const pessoa = randomUUID();
      const fone = l.phoneEnc ? normalizePhoneBR(this.comercial.decrypt(l.phoneEnc)) : null;
      const email = l.emailEnc ? normalizeEmail(this.comercial.decrypt(l.emailEnc)) : null;
      const nome = l.name.trim();
      await tx.execute(sql`select mentoria_inscricao_da_venda(${dealId}::uuid, ${inscricao}::uuid,
        ${pessoa}::uuid, ${nome}, ${nomeNormalizado(nome)},
        ${this.mentoria.cifrarOpcional(fone, aad('mentoria_pessoas', 'whatsapp', pessoa))},
        ${fone ? this.mentoria.indiceCego(fone) : null},
        ${this.mentoria.cifrarOpcional(email, aad('mentoria_pessoas', 'email', pessoa))},
        ${email ? this.mentoria.indiceCego(email) : null}, ${l.instagram})`);
      return inscricao;
    } catch (e) {
      // Só o código do erro: nunca a mensagem do banco com valores nem o contato.
      const code =
        (e as { cause?: { code?: string }; code?: string }).cause?.code ??
        (e as { code?: string }).code;
      this.log.warn(`inscrição da venda não criada: ${code ?? 'erro'}`);
      throw new ConflictException(ERRO_INSCRICAO_DA_VENDA);
    }
  }
}
