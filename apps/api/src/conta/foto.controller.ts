import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { user, userPhotos, type Db } from '@npac/db';
import { eq, isNotNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { farejar, semMetadados } from '../mentoria/media-sniff.js';
import { FOTO_MAX_BYTES, photoUrl } from './photo-url.js';

const FOTO_INVALIDA = 'Não deu para abrir essa imagem. Use JPG, PNG ou WebP.';
const MUITO_GRANDE = 'A foto passou de 200 KB.';
/** Cabeçalhos do multipart além do arquivo. */
const FOLGA_MULTIPART = 16 * 1024;
/** Ids do Better Auth: letras, números, `_` e `-`. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Foto do perfil (NPAC-53). Cada um troca só a própria (`me`); quem está logado vê a de todos, como
 * já vê os nomes. `user` não tem RLS: a guarda é a sessão; a auditoria não leva nome nem foto.
 */
@AllRoles()
@Controller()
export class FotoController {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  @Put('me/photo')
  async enviar(@CurrentUser() u: SessionUser, @Req() req: FastifyRequest) {
    if (Number(req.headers['content-length'] ?? 0) > FOTO_MAX_BYTES + FOLGA_MULTIPART)
      throw new PayloadTooLargeException(MUITO_GRANDE);
    const parte = await req.file({ limits: { fileSize: FOTO_MAX_BYTES, files: 1 } });
    if (!parte) throw new BadRequestException(FOTO_INVALIDA);
    let dados: Buffer;
    try {
      dados = await parte.toBuffer();
    } catch {
      throw new PayloadTooLargeException(MUITO_GRANDE);
    }
    const f = farejar(dados);
    if (!f || f.tipo !== 'FOTO') throw new BadRequestException(FOTO_INVALIDA);
    const bytes = semMetadados(dados, f.mime);
    const versao = Date.now().toString(36);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(userPhotos)
        .values({ userId: u.id, bytes, mime: f.mime, size: bytes.length })
        .onConflictDoUpdate({
          target: userPhotos.userId,
          set: { bytes, mime: f.mime, size: bytes.length, updatedAt: new Date() },
        });
      await tx.update(user).set({ image: versao, updatedAt: new Date() }).where(eq(user.id, u.id));
      await this.audit.record(
        {
          actorId: u.id,
          action: 'user.photo_set',
          entityType: 'user',
          entityId: u.id,
          data: { mime: f.mime, size: bytes.length },
        },
        tx,
      );
    });
    return { photo: photoUrl(u.id, versao) };
  }

  @Delete('me/photo')
  @HttpCode(204)
  async remover(@CurrentUser() u: SessionUser): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(userPhotos).where(eq(userPhotos.userId, u.id));
      await tx.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, u.id));
      await this.audit.record(
        { actorId: u.id, action: 'user.photo_removed', entityType: 'user', entityId: u.id },
        tx,
      );
    });
  }

  @Get('users/:id/photo')
  async ver(@Param('id') id: string, @Res({ passthrough: true }) res: FastifyReply) {
    if (!ID.test(id)) throw new NotFoundException();
    const [row] = await this.db
      .select({ bytes: userPhotos.bytes, mime: userPhotos.mime })
      .from(userPhotos)
      .where(eq(userPhotos.userId, id));
    if (!row) throw new NotFoundException();
    // A URL leva a versão: foto nova = URL nova. O gancho global de `no-store` respeita este.
    res.header('Cache-Control', 'private, max-age=31536000, immutable');
    res.header('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(row.bytes), { type: row.mime, disposition: 'inline' });
  }

  /** Mapa id → URL de quem tem foto: as telas mostram a foto dos outros sem mudar cada DTO. */
  @Get('team/photos')
  async equipe(): Promise<{ photos: Record<string, string> }> {
    const rows = await this.db
      .select({ id: user.id, image: user.image })
      .from(user)
      .where(isNotNull(user.image));
    return { photos: Object.fromEntries(rows.map((r) => [r.id, photoUrl(r.id, r.image)!])) };
  }
}
