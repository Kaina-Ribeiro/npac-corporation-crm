import { BadRequestException } from '@nestjs/common';
import { user, type Tx } from '@npac/db';
import {
  CARGO_ERRO_MSG,
  resolverCargo,
  type CargoGravado,
  type CargoPedido,
  type ContaAreas,
  type Perfil,
} from '@npac/shared';
import { eq } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service.js';
import { definirMembro, vinculoDoCargo } from './areas.js';

/**
 * Resolvedor único do cargo (spec 2026-11-11-cargos-design, "Regras de gravação"), usado por
 * convite, aprovação de pedido e troca no Admin. A regra pura vem de `resolverCargo` (shared); aqui
 * ela vira 400.
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

/** Cargo, área e selo que vão para a auditoria (cargo não é dado pessoal). */
export function cargoNaAuditoria(v: CargoGravado) {
  const p = vinculoDoCargo(v);
  return { area: p.mestre ? null : p.area, cargo: p.cargo, head: p.head };
}

/**
 * Cargo gravado hoje: caixas e resumo em `user`, perfil e selo do vínculo do Acompanhamento
 * (NPAC-54: `area_membros` é a fonte).
 */
export async function cargoAtual(
  tx: Tx,
  id: string,
  conta: ContaAreas,
): Promise<CargoGravado | undefined> {
  const [row] = await tx
    .select({ role: user.role, canProspect: user.canProspect, canClose: user.canClose })
    .from(user)
    .where(eq(user.id, id));
  if (!row) return undefined;
  const ac = conta.areas.find((a) => a.area === 'ACOMPANHAMENTO');
  return { ...row, perfil: (ac?.cargo as Perfil | null) ?? null, moduloAdmin: ac?.head ?? false };
}

/**
 * Conta nova (convite, aprovação): o INSERT em `user` já criou o vínculo provisório (gatilho de
 * compatibilidade da Fase 1); aqui o cargo é gravado por `area_definir_membro`, que aplica a regra com
 * quem está logado. A Diretoria nasce do próprio INSERT (só a Diretoria a dá; a API conferiu).
 */
export async function gravarCargoNovo(
  tx: Tx,
  audit: AuditService,
  actorId: string,
  alvo: string,
  cargo: CargoGravado,
) {
  const v = vinculoDoCargo(cargo);
  if (v.mestre) return;
  await definirMembro(tx, null, alvo, undefined, v);
  if (cargo.role === 'ACOMPANHAMENTO')
    await audit.record(
      {
        actorId,
        action: 'mentoria.perfil.definido',
        entityType: 'user',
        entityId: alvo,
        data: { perfil: cargo.perfil, admin: cargo.moduloAdmin, registro: 2 },
      },
      tx,
    );
}
