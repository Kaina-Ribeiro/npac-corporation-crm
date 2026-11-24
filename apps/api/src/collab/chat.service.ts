import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { PushService } from '../push/push.service.js';

const PAGE = 50;
/** Prévia da lista de conversas: cabe em 2 linhas no celular. */
const PREVIEW = 120;

export type ChatMessageDTO = {
  id: number;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Nome nulo = lead mencionado que o leitor não enxerga. */
  lead: { id: string; name: string | null } | null;
};

/** Toda leitura passa pela RLS: Geral para usuários ativos, DM só para os dois membros. */
@Injectable()
export class ChatService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly push: PushService,
  ) {}

  /**
   * Conversas da pessoa (RLS: Geral e as DMs dela) com a prévia da última mensagem: o começo do
   * texto numa linha, cortado no banco. A prévia nunca vai para log, URL ou auditoria.
   */
  channels(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<{
        id: string;
        kind: 'GENERAL' | 'DM';
        name: string | null;
        unread: number;
        last_at: Date | null;
        last_author_id: string | null;
        last_author_name: string | null;
        last_text: string | null;
      }>(sql`
        select c.id, c.kind,
          (select ou.name from chat_members om join "user" ou on ou.id = om.user_id
            where om.channel_id = c.id and om.user_id <> ${u.id} limit 1) as name,
          (select count(*)::int from chat_messages m where m.channel_id = c.id and m.author_id <> ${u.id}
            and m.id > coalesce((select r.last_read_id from chat_reads r
              where r.channel_id = c.id and r.user_id = ${u.id}), 0)) as unread,
          last.created_at as last_at, last.author_id as last_author_id,
          (select a.name from "user" a where a.id = last.author_id) as last_author_name,
          left(regexp_replace(btrim(last.body), '\\s+', ' ', 'g'), ${PREVIEW + 1}) as last_text
        from chat_channels c
        left join lateral (
          select m.author_id, m.body, m.created_at from chat_messages m
          where m.channel_id = c.id order by m.id desc limit 1
        ) last on true
        order by c.kind = 'GENERAL' desc, last_at desc nulls last, c.created_at`);
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.kind === 'GENERAL' ? 'Geral' : (r.name ?? 'Conversa'),
        unread: r.unread,
        lastMessageAt: r.last_at ? new Date(r.last_at).toISOString() : null,
        lastMessage:
          r.last_author_id && r.last_text !== null
            ? {
                authorId: r.last_author_id,
                authorName: r.last_author_name ?? '',
                text:
                  r.last_text.length > PREVIEW
                    ? `${r.last_text.slice(0, PREVIEW - 1).trimEnd()}…`
                    : r.last_text,
              }
            : null,
      }));
    });
  }

  users(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => [
      ...(await tx.execute<{ id: string; name: string; role: string }>(
        sql`select id, name, role from "user" where active and id <> ${u.id} order by name`,
      )),
    ]);
  }

  openDm(u: AuthUser, other: string) {
    return withUser(this.db, u.id, async (tx) => {
      const valid = await tx.execute<{ ok: boolean }>(
        sql`select exists(select 1 from "user" where id = ${other} and active and id <> ${u.id}) as ok`,
      );
      if (!valid[0]?.ok) throw new BadRequestException('Destinatário inválido');
      const rows = await tx.execute<{ id: string }>(sql`select chat_open_dm(${other}) as id`);
      return { id: rows[0]!.id };
    });
  }

  messages(u: AuthUser, channelId: string, before?: number) {
    return withUser(this.db, u.id, async (tx) => {
      await this.visible(tx, channelId);
      const cursor = before ?? null;
      const rows = await tx.execute<{
        id: string;
        author_id: string;
        author_name: string;
        body: string;
        created_at: Date;
        lead_id: string | null;
        lead_name: string | null;
      }>(sql`
        select m.id, m.author_id, a.name as author_name, m.body, m.created_at, m.lead_id,
          (select l.name from leads l where l.id = m.lead_id and l.deleted_at is null) as lead_name
        from chat_messages m join "user" a on a.id = m.author_id
        where m.channel_id = ${channelId} and (${cursor}::bigint is null or m.id < ${cursor}::bigint)
        order by m.id desc limit ${PAGE + 1}`);
      return {
        messages: rows
          .slice(0, PAGE)
          .reverse()
          .map((r): ChatMessageDTO => ({
            id: Number(r.id),
            authorId: r.author_id,
            authorName: r.author_name,
            body: r.body,
            createdAt: new Date(r.created_at).toISOString(),
            lead: r.lead_id ? { id: r.lead_id, name: r.lead_name } : null,
          })),
        hasMore: rows.length > PAGE,
      };
    });
  }

  async send(u: AuthUser, channelId: string, input: { body: string; leadId?: string }) {
    const sent = await withUser(this.db, u.id, async (tx) => {
      await this.visible(tx, channelId);
      if (input.leadId) {
        const lead = await tx.execute(
          sql`select 1 from leads where id = ${input.leadId} and deleted_at is null`,
        );
        if (!lead.length) throw new BadRequestException('Lead indisponível');
      }
      const rows = await tx.execute<{ id: string }>(sql`
        insert into chat_messages (channel_id, author_id, body, lead_id)
        values (${channelId}, ${u.id}, ${input.body}, ${input.leadId ?? null}) returning id`);
      const id = Number(rows[0]!.id);
      await this.markRead(tx, u, channelId, id);
      // Geral: a equipe ativa inteira; DM: o outro membro. Nunca o autor.
      const [channel] = await tx.execute<{ kind: 'GENERAL' | 'DM'; author: string }>(
        sql`select kind, (select name from "user" where id = ${u.id}) as author
          from chat_channels where id = ${channelId}`,
      );
      const to = await tx.execute<{ id: string }>(
        channel!.kind === 'GENERAL'
          ? sql`select id from "user" where active and id <> ${u.id}`
          : sql`select m.user_id as id from chat_members m join "user" x on x.id = m.user_id
              where m.channel_id = ${channelId} and m.user_id <> ${u.id} and x.active`,
      );
      return { id, kind: channel!.kind, author: channel!.author, to: to.map((r) => r.id) };
    });
    // Depois do commit e sem o texto da mensagem (pode ter dado de lead).
    await this.push.notify(sent.to, {
      title: sent.kind === 'GENERAL' ? 'Nova mensagem no Chat' : `Nova mensagem de ${sent.author}`,
      url: '/chat',
      tag: 'chat',
    });
    return { id: sent.id };
  }

  read(u: AuthUser, channelId: string, lastReadId: number) {
    return withUser(this.db, u.id, async (tx) => {
      await this.visible(tx, channelId);
      await this.markRead(tx, u, channelId, lastReadId);
      return { ok: true };
    });
  }

  private async visible(tx: Tx, channelId: string) {
    const rows = await tx.execute(sql`select 1 from chat_channels where id = ${channelId}`);
    if (!rows.length) throw new NotFoundException();
  }

  private async markRead(tx: Tx, u: AuthUser, channelId: string, id: number) {
    await tx.execute(sql`
      insert into chat_reads (channel_id, user_id, last_read_id) values (${channelId}, ${u.id}, ${id})
      on conflict (channel_id, user_id)
      do update set last_read_id = greatest(chat_reads.last_read_id, excluded.last_read_id)`);
  }
}
