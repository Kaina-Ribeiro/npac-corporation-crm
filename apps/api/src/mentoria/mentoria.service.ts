import { hkdfSync } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaMentorados, withUser, type Db } from '@npac/db';
import { MENTORADO_STATUS, nomeNormalizado, type AuthUser } from '@npac/shared';
import { and, asc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { CursorSigner } from './cursor.js';

export const PAGINA = 50;

export const buscaMentorados = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(MENTORADO_STATUS).optional(),
    tipoMentoria: z.string().trim().max(200).optional(),
    cursor: z.string().max(400).optional(),
  })
  .strict();
export type BuscaMentorados = z.output<typeof buscaMentorados>;

const colunas = {
  id: mentoriaMentorados.id,
  nome: mentoriaMentorados.nome,
  tipoCadastro: mentoriaMentorados.tipoCadastro,
  tipoMentoria: mentoriaMentorados.tipoMentoria,
  dataEntradaTexto: mentoriaMentorados.dataEntradaTexto,
  dataEntrada: mentoriaMentorados.dataEntrada,
  status: mentoriaMentorados.status,
  version: mentoriaMentorados.version,
};

/** Escapa curingas do LIKE: o termo da busca é texto, nunca padrão. */
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class MentoriaService {
  private readonly cursor: CursorSigner;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly audit: AuditService,
  ) {
    const key = hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'npac:mentoria:cursor', 32);
    this.cursor = new CursorSigner(Buffer.from(key));
  }

  /** Lista A–Z (D31), 50 por página. Sem auditoria (D35). */
  listarMentorados(u: AuthUser, f: BuscaMentorados) {
    return withUser(this.db, u.id, async (tx) => {
      const where: SQL[] = [];
      if (f.q)
        where.push(ilike(mentoriaMentorados.nomeNorm, `%${semCuringa(nomeNormalizado(f.q))}%`));
      if (f.status) where.push(eq(mentoriaMentorados.status, f.status));
      if (f.tipoMentoria) where.push(eq(mentoriaMentorados.tipoMentoria, f.tipoMentoria));
      if (f.cursor) {
        const depoisDe = this.cursor.verify(f.cursor);
        const [ultimo] = await tx
          .select({ nomeNorm: mentoriaMentorados.nomeNorm, id: mentoriaMentorados.id })
          .from(mentoriaMentorados)
          .where(eq(mentoriaMentorados.id, depoisDe));
        // Item do cursor saiu da base: recomeça do início em vez de pular registros.
        if (ultimo)
          where.push(
            or(
              gt(mentoriaMentorados.nomeNorm, ultimo.nomeNorm),
              and(
                eq(mentoriaMentorados.nomeNorm, ultimo.nomeNorm),
                gt(mentoriaMentorados.id, ultimo.id),
              ),
            )!,
          );
      }
      const rows = await tx
        .select(colunas)
        .from(mentoriaMentorados)
        .where(where.length ? and(...where) : sql`true`)
        .orderBy(asc(mentoriaMentorados.nomeNorm), asc(mentoriaMentorados.id))
        .limit(PAGINA + 1);
      const itens = rows.slice(0, PAGINA);
      const ultimo = itens.at(-1);
      return {
        itens,
        cursor: rows.length > PAGINA && ultimo ? this.cursor.sign(ultimo.id) : null,
      };
    });
  }

  /** Abre um registro e grava `mentoria.open` (só id, sem nome) na mesma transação. */
  abrirMentorado(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .select(colunas)
        .from(mentoriaMentorados)
        .where(eq(mentoriaMentorados.id, id));
      if (!row) throw new NotFoundException();
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.open',
          entityType: 'mentorado',
          entityId: id,
          data: { fields: [] },
        },
        tx,
      );
      return row;
    });
  }
}
