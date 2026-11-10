// Módulo Acompanhamento (mentorados). Base à parte do comercial, sem FK para leads ou vendas.
// Sem GRANT DELETE: exclusão só por função.
import { LINK_PERMITIDO_SQL } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { bigint, bigserial, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/**
 * Mídia (regra 7): o registro guarda só o endereço; o arquivo fica fora do banco (MEDIA_DIR).
 * `dono_id` é polimórfico, sem FK: a exclusão do dono enfileira a mídia pela função.
 */
export const mentoriaMidia = pgTable(
  'mentoria_midia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donoTipo: text('dono_tipo').notNull(),
    donoId: uuid('dono_id').notNull(),
    tipo: text('tipo').notNull(),
    chaveObjeto: text('chave_objeto'),
    urlVideo: text('url_video'),
    mime: text('mime'),
    tamanhoBytes: bigint('tamanho_bytes', { mode: 'number' }),
    criadoPor: text('criado_por').references(() => user.id),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'mentoria_midia_dono',
      sql`${t.donoTipo} in ('FICHA_ANTES', 'FICHA_DEPOIS', 'CONQUISTA', 'RDV_PESSOA', 'RDV_EVENTO', 'RDV_QUADRO_ITEM')`,
    ),
    check('mentoria_midia_tipo', sql`${t.tipo} in ('FOTO', 'VIDEO', 'PDF', 'LINK_VIDEO')`),
    check('mentoria_midia_link', sql`(${t.tipo} = 'LINK_VIDEO') = (${t.urlVideo} is not null)`),
    check('mentoria_midia_chave', sql`(${t.tipo} = 'LINK_VIDEO') = (${t.chaveObjeto} is null)`),
    check('mentoria_midia_url', sql`${t.urlVideo} ~ ${sql.raw(`'${LINK_PERMITIDO_SQL}'`)}`),
    check('mentoria_midia_tamanho', sql`${t.tamanhoBytes} between 0 and 20971520`),
  ],
);

/** Fila de arquivos a apagar do volume. Sem RLS de usuário: só as funções do worker leem. */
export const mentoriaMidiaExclusao = pgTable('mentoria_midia_exclusao', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chaveObjeto: text('chave_objeto').notNull(),
  enfileiradoEm: timestamp('enfileirado_em', { withTimezone: true }).notNull().defaultNow(),
  removidoEm: timestamp('removido_em', { withTimezone: true }),
});
