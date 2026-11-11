import { BadRequestException } from '@nestjs/common';
import { mentoriaPerfis, user, type Tx } from '@npac/db';
import {
  CARGO_ERRO_MSG,
  resolverCargo,
  type CargoGravado,
  type CargoPedido,
  type Perfil,
} from '@npac/shared';
import { eq, sql } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service.js';

/**
 * Resolvedor único do cargo (spec 2026-11-11-cargos-design, "Regras de gravação"), usado por
 * convite, aprovação de pedido e troca no Admin. A regra pura vem de `resolverCargo` (shared); aqui
 * ela vira 400 e o perfil do módulo é gravado na mesma transação do cargo.
 */
export function resolverOuRecusar(pedido: CargoPedido, atual?: CargoGravado): CargoGravado {
  const r = resolverCargo(pedido, atual);
  if (!r.ok) throw new BadRequestException(CARGO_ERRO_MSG[r.erro]);
  return r.valor;
}

/** Nomes dos campos que o cargo grava, para a auditoria (nunca valores). */
export const camposDoCargo = (v: CargoGravado) =>
  v.role === 'ACOMPANHAMENTO'
    ? ['role', 'canProspect', 'canClose', 'perfil', 'moduloAdmin']
    : ['role', 'canProspect', 'canClose'];

/** Cargo gravado hoje, com o perfil do módulo lido pela RLS de quem pede (`app.user_id` na tx). */
export async function cargoAtual(tx: Tx, id: string): Promise<CargoGravado | undefined> {
  const [row] = await tx
    .select({
      role: user.role,
      canProspect: user.canProspect,
      canClose: user.canClose,
      perfil: mentoriaPerfis.perfil,
      moduloAdmin: mentoriaPerfis.admin,
    })
    .from(user)
    .leftJoin(mentoriaPerfis, eq(mentoriaPerfis.userId, user.id))
    .where(eq(user.id, id));
  if (!row) return undefined;
  return {
    ...row,
    perfil: (row.perfil as Perfil | null) ?? null,
    moduloAdmin: row.moduloAdmin ?? false,
  };
}

/**
 * Grava (ou apaga, ao sair do cargo Acompanhamento) o perfil do módulo pela função do banco, que
 * exige `mentoria_admin()` de quem faz: só a Diretoria dá esse cargo, então passa. Devolve se
 * mexeu no perfil.
 */
export async function gravarPerfil(
  tx: Tx,
  audit: AuditService,
  actorId: string,
  alvo: string,
  novo: CargoGravado,
  antes?: CargoGravado,
): Promise<boolean> {
  const era = antes?.role === 'ACOMPANHAMENTO';
  const fica = novo.role === 'ACOMPANHAMENTO';
  if (!era && !fica) return false;
  if (era && fica && antes.perfil === novo.perfil && antes.moduloAdmin === novo.moduloAdmin)
    return false;
  const perfil = fica ? novo.perfil : null;
  const admin = fica && novo.moduloAdmin;
  await tx.execute(sql`select set_config('app.user_id', ${actorId}, true)`);
  await tx.execute(sql`select mentoria_definir_perfil(${alvo}, ${perfil}, ${admin})`);
  await audit.record(
    {
      actorId,
      action: 'mentoria.perfil.definido',
      entityType: 'user',
      entityId: alvo,
      data: { perfil, admin },
    },
    tx,
  );
  return true;
}
