import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { user, verification, type Db } from '@npac/db';
import { normalizeEmail } from '@npac/shared';
import { and, eq, gt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { MAIL_SENDER, type MailSender } from '../mail/mail.js';
import { emailChangedMail, emailCodeMail } from '../mail/templates.js';

export const EMAIL_CODE_TTL_MS = 10 * 60_000;
export const EMAIL_CODE_MAX_TRIES = 5;
export const EMAIL_CODE_MAX_PER_HOUR = 3;
const CODE = 'npac-email:';
const SENT = 'npac-email-sent:';

const TEXTO = {
  invalido: 'Digite um e-mail válido.',
  seu: 'Esse já é o seu e-mail.',
  emUso: 'Esse e-mail já está em uso.',
  muitos: 'Muitos pedidos. Tente de novo mais tarde.',
  errado: 'Código errado. Confira e tente de novo.',
  venceu: 'Esse código venceu. Peça outro.',
};

const emailSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(200)) });
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
/** Guardado em `verification.value`: hash do código, e-mail novo e tentativas erradas. */
type Pendente = { h: string; e: string; n: number };

const digest = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}`).digest('hex');

/**
 * Troca de e-mail (NPAC-53, Meu perfil): código de 6 dígitos no endereço novo, 10 min, 5 tentativas,
 * 3 envios por hora por conta. Sem envio configurado, 404 (o perfil manda pedir à liderança, 2A).
 * Tudo sob o advisory lock da conta: duas abas não furam o limite nem as tentativas.
 */
@AllRoles()
@Controller('me/email')
export class EmailController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    private readonly audit: AuditService,
  ) {}

  @Post('code')
  @HttpCode(204)
  async pedir(@CurrentUser() u: SessionUser, @Body() body: unknown): Promise<void> {
    if (!this.mail.enabled) throw new NotFoundException();
    const parsed = emailSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(TEXTO.invalido);
    const email = normalizeEmail(parsed.data.email);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const nome = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CODE + u.id}))`);
      const [eu] = await tx
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, u.id));
      if (normalizeEmail(eu!.email) === email) throw new BadRequestException(TEXTO.seu);
      const [outro] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(sql`lower(${user.email}) = ${email}`, ne(user.id, u.id)));
      if (outro) throw new ConflictException(TEXTO.emUso);
      const [conta] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(verification)
        .where(
          and(eq(verification.identifier, SENT + u.id), gt(verification.expiresAt, new Date())),
        );
      if ((conta?.n ?? 0) >= EMAIL_CODE_MAX_PER_HOUR)
        throw new HttpException(TEXTO.muitos, HttpStatus.TOO_MANY_REQUESTS);
      const agora = Date.now();
      await tx.delete(verification).where(eq(verification.identifier, CODE + u.id));
      const pendente: Pendente = { h: digest(u.id, code), e: email, n: 0 };
      await tx.insert(verification).values([
        {
          id: randomUUID(),
          identifier: CODE + u.id,
          value: JSON.stringify(pendente),
          expiresAt: new Date(agora + EMAIL_CODE_TTL_MS),
        },
        {
          id: randomUUID(),
          identifier: SENT + u.id,
          value: '1',
          expiresAt: new Date(agora + 3_600_000),
        },
      ]);
      await this.audit.record(
        { actorId: u.id, action: 'user.email_code_sent', entityType: 'user', entityId: u.id },
        tx,
      );
      return eu!.name;
    });
    // Depois do commit e sem esperar o SMTP (como o "Esqueci minha senha").
    void this.mail.send(emailCodeMail(email, nome, code));
  }

  @Post('confirm')
  @HttpCode(200)
  async confirmar(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
  ): Promise<{ email: string }> {
    if (!this.mail.enabled) throw new NotFoundException();
    const parsed = codeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(TEXTO.errado);
    // Erros voltam como valor: lançar dentro da transação desfaria a contagem de tentativas.
    const r = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CODE + u.id}))`);
      const [row] = await tx
        .select()
        .from(verification)
        .where(eq(verification.identifier, CODE + u.id));
      if (!row || row.expiresAt.getTime() <= Date.now()) {
        if (row) await tx.delete(verification).where(eq(verification.id, row.id));
        return { erro: 'venceu' as const };
      }
      const p = JSON.parse(row.value) as Pendente;
      if (p.h !== digest(u.id, parsed.data.code)) {
        const n = p.n + 1;
        if (n >= EMAIL_CODE_MAX_TRIES)
          await tx.delete(verification).where(eq(verification.id, row.id));
        else
          await tx
            .update(verification)
            .set({ value: JSON.stringify({ ...p, n }), updatedAt: new Date() })
            .where(eq(verification.id, row.id));
        return { erro: 'errado' as const };
      }
      await tx.delete(verification).where(eq(verification.id, row.id));
      const [outro] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(sql`lower(${user.email}) = ${p.e}`, ne(user.id, u.id)));
      if (outro) return { erro: 'emUso' as const };
      const [antes] = await tx
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, u.id));
      await tx
        .update(user)
        .set({ email: p.e, emailVerified: true, updatedAt: new Date() })
        .where(eq(user.id, u.id));
      await this.audit.record(
        { actorId: u.id, action: 'user.email_changed', entityType: 'user', entityId: u.id },
        tx,
      );
      return { email: p.e, antigo: antes!.email, nome: antes!.name };
    });
    if ('erro' in r) {
      if (r.erro === 'emUso') throw new ConflictException(TEXTO.emUso);
      throw new BadRequestException(r.erro === 'venceu' ? TEXTO.venceu : TEXTO.errado);
    }
    void this.mail.send(emailChangedMail(r.antigo, r.nome));
    return { email: r.email };
  }
}
