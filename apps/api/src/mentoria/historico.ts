import { mentoriaHistorico, type Tx } from '@npac/db';
import { NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

/** Grava quem mudou, o tipo e os nomes dos campos, nunca valores, na transação da mudança. */
export async function registrarHistorico(
  tx: Tx,
  inscricaoId: string,
  tipo: string,
  campos: string[],
): Promise<void> {
  await tx
    .insert(mentoriaHistorico)
    .values({ inscricaoId, atorId: sql`app_user_id()`, tipo, campos });
}

export type AreaEdicao =
  | 'INSCRICAO'
  | 'MOMENTO'
  | 'ONBOARDING'
  | 'PLANO'
  | 'REUNIAO'
  | 'CONTATO'
  | 'ANOTACAO'
  | 'PME'
  | 'TAREFA'
  | 'META';

/** 404 se a inscrição não existe para quem está logado, ou se ele não edita esta área. */
export async function exigirEdicao(tx: Tx, area: AreaEdicao, inscricaoId: string): Promise<void> {
  const [r] = await tx.execute<{ ok: boolean }>(
    sql`select mentoria_edita(${area}, ${inscricaoId}::uuid)
      and exists (select 1 from mentoria_inscricoes where id = ${inscricaoId}::uuid) as ok`,
  );
  if (!r?.ok) throw new NotFoundException();
}
