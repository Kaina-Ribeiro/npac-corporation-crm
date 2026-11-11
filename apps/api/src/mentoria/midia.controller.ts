import {
  BadRequestException,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  mentoriaAcoes,
  mentoriaInscricoes,
  mentoriaMidia,
  mentoriaPessoas,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId } from '../common/validate.js';
import { erroDoBanco } from './erros.js';
import { farejar, semMetadados } from './media-sniff.js';
import { MEDIA_STORE, type MediaStore } from './media-store.js';
import { MentoriaController } from './mentoria.guard.js';

/** Limite do PDF: 20 MB por foto, vídeo ou PDF. */
export const LIMITE_ARQUIVO = 20 * 1024 * 1024;
const FOLGA_MULTIPART = 64 * 1024;

/** Dono da mídia na URL → tipo gravado e tabela onde o dono precisa existir (via RLS). */
const DONOS = {
  'pessoa-foto': { tipo: 'PESSOA_FOTO', tabela: mentoriaPessoas },
  'foto-familia': { tipo: 'FOTO_FAMILIA', tabela: mentoriaInscricoes },
  'acao-evidencia': { tipo: 'ACAO_EVIDENCIA', tabela: mentoriaAcoes },
} as const;
type DonoUrl = keyof typeof DONOS;

const dono = (d: string) => {
  if (!Object.hasOwn(DONOS, d)) throw new NotFoundException();
  return DONOS[d as DonoUrl];
};

/**
 * Mídia (regra 7, D2, D16, D17): o arquivo vai para o volume com nome UUID, o tipo vem da
 * assinatura e a imagem perde EXIF/GPS. Download por stream autenticado e auditado. O "×"
 * remove na hora (exceção da regra 6), pela função que enfileira o arquivo.
 */
@MentoriaController('')
export class MidiaController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
    private readonly audit: AuditService,
  ) {}

  private async donoExiste(u: AuthUser, d: DonoUrl, id: string) {
    const { tabela } = DONOS[d];
    const achou = await withUser(this.db, u.id, (tx) =>
      tx.select({ id: tabela.id }).from(tabela).where(eq(tabela.id, id)),
    );
    if (!achou.length) throw new NotFoundException();
  }

  /** A foto nova passa a ser a do dono; a anterior vai para a fila de exclusão. */
  private async apontarFoto(tx: Tx, d: DonoUrl, donoId: string, midiaId: string) {
    if (d === 'acao-evidencia') {
      const [a] = await tx
        .select({ midia: mentoriaAcoes.evidenciaMidiaId })
        .from(mentoriaAcoes)
        .where(eq(mentoriaAcoes.id, donoId));
      if (a?.midia) await tx.execute(sql`select mentoria_excluir_midia(${a.midia})`);
      await tx
        .update(mentoriaAcoes)
        .set({
          evidenciaMidiaId: midiaId,
          version: sql`${mentoriaAcoes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(eq(mentoriaAcoes.id, donoId));
      return;
    }
    if (d === 'pessoa-foto') {
      const [p] = await tx
        .select({ foto: mentoriaPessoas.fotoMidiaId })
        .from(mentoriaPessoas)
        .where(eq(mentoriaPessoas.id, donoId));
      if (p?.foto) await tx.execute(sql`select mentoria_excluir_midia(${p.foto})`);
      await tx
        .update(mentoriaPessoas)
        .set({ fotoMidiaId: midiaId })
        .where(eq(mentoriaPessoas.id, donoId));
      return;
    }
    const [i] = await tx
      .select({ foto: mentoriaInscricoes.fotoFamiliaMidiaId })
      .from(mentoriaInscricoes)
      .where(eq(mentoriaInscricoes.id, donoId));
    if (i?.foto) await tx.execute(sql`select mentoria_excluir_midia(${i.foto})`);
    await tx
      .update(mentoriaInscricoes)
      .set({ fotoFamiliaMidiaId: midiaId })
      .where(eq(mentoriaInscricoes.id, donoId));
  }

  @Post(':dono/:donoId/midia')
  @HttpCode(201)
  async enviar(
    @CurrentUser() u: SessionUser,
    @Param('dono') d: string,
    @Param('donoId') donoId: string,
    @Req() req: FastifyRequest,
  ) {
    const { tipo: donoTipo } = dono(d);
    entityId(donoId);
    // Recusa antes de ler o corpo quando o tamanho declarado já passa do limite (R10).
    if (Number(req.headers['content-length'] ?? 0) > LIMITE_ARQUIVO + FOLGA_MULTIPART)
      throw new PayloadTooLargeException('Arquivo acima de 20 MB');
    await this.donoExiste(u, d as DonoUrl, donoId);
    const parte = await req.file({ limits: { fileSize: LIMITE_ARQUIVO, files: 1 } });
    if (!parte) throw new BadRequestException('Envie um arquivo');
    let dados: Buffer;
    try {
      dados = await parte.toBuffer();
    } catch {
      throw new PayloadTooLargeException('Arquivo acima de 20 MB');
    }
    const f = farejar(dados);
    if (!f || f.tipo !== 'FOTO')
      throw new BadRequestException('Envie uma foto (JPEG, PNG ou WEBP)');
    const limpo = semMetadados(dados, f.mime);
    const chave = await this.store.put(limpo);
    try {
      return await withUser(this.db, u.id, async (tx) => {
        const [row] = await tx
          .insert(mentoriaMidia)
          .values({
            donoTipo,
            donoId,
            tipo: f.tipo,
            chaveObjeto: chave,
            mime: f.mime,
            tamanhoBytes: limpo.length,
            criadoPor: u.id,
          })
          .returning({
            id: mentoriaMidia.id,
            tipo: mentoriaMidia.tipo,
            tamanhoBytes: mentoriaMidia.tamanhoBytes,
          });
        await this.apontarFoto(tx, d as DonoUrl, donoId, row!.id);
        await this.audit.record(
          {
            actorId: u.id,
            action: 'mentoria.media.upload',
            entityType: 'midia',
            entityId: row!.id,
            data: { donoTipo, tipo: f.tipo, bytes: limpo.length },
          },
          tx,
        );
        return row!;
      });
    } catch (e) {
      await this.store.delete(chave);
      return erroDoBanco(e);
    }
  }

  @Get('midia/:id')
  async baixar(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    entityId(id);
    const m = await withUser(this.db, u.id, async (tx) => {
      const [row] = await tx.select().from(mentoriaMidia).where(eq(mentoriaMidia.id, id));
      if (!row?.chaveObjeto) throw new NotFoundException();
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.media.download',
          entityType: 'midia',
          entityId: id,
          data: { tipo: row.tipo },
        },
        tx,
      );
      return row;
    });
    res.header('Content-Type', m.mime ?? 'application/octet-stream');
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Cache-Control', 'private, no-store');
    res.header(
      'Content-Disposition',
      m.tipo === 'FOTO' ? 'inline' : `attachment; filename="midia-${id}"`,
    );
    return new StreamableFile(this.store.get(m.chaveObjeto!));
  }

  @Delete('midia/:id')
  @HttpCode(204)
  async excluir(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    entityId(id);
    await withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_excluir_midia(${id})`);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.media.delete',
          entityType: 'midia',
          entityId: id,
          data: {},
        },
        tx,
      );
    }).catch((e) => erroDoBanco(e));
  }
}
