import {
  applyDecorators,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import {
  gerenciaAlguma,
  hasCommercialAccess,
  podeGerenciar,
  type Area,
  type CargoGravado,
  type ContaAreas,
  type PedidoRegra,
  type Veredito,
  type Vinculo,
} from '@npac/shared';
import type { FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import type { AuditService } from '../audit/audit.service.js';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { DB } from '../common/db/db.module.js';

/**
 * Acesso por área (NPAC-54, Fase 2): a API aplica a regra única `podeGerenciar` (shared) e grava o
 * cargo só pelas funções do banco (`area_definir_membro`, `area_remover_membro`,
 * `area_definir_mestre`), que repetem a regra com quem está logado.
 */

/** Contas com os vínculos, como a regra os lê (`area_contas()`: só para a Diretoria e os Heads). */
export async function lerContas(tx: Tx): Promise<Map<string, ContaAreas>> {
  const rows = await tx.execute<{ user_id: string; mestre: boolean; areas: Vinculo[] }>(
    sql`select user_id, mestre, areas from area_contas()`,
  );
  return new Map([...rows].map((r) => [r.user_id, { mestre: r.mestre, areas: r.areas }]));
}

/** Uma conta (nula se não existe ou se quem pede não gerencia nada). */
export async function lerConta(tx: Tx, id: string): Promise<ContaAreas | null> {
  const [r] = await tx.execute<{ mestre: boolean; areas: Vinculo[] }>(
    sql`select mestre, areas from area_contas() where user_id = ${id}`,
  );
  return r ? { mestre: r.mestre, areas: r.areas } : null;
}

/** A própria conta (lida pela RLS de `area_membros`: a própria linha sempre aparece). */
export async function lerMinhaConta(tx: Tx, id: string): Promise<ContaAreas> {
  const [u] = await tx.execute<{ mestre: boolean }>(
    sql`select mestre from "user" where id = ${id}`,
  );
  const areas = await tx.execute<Vinculo>(
    sql`select area, cargo, head from area_membros where user_id = ${id} order by area`,
  );
  return { mestre: u?.mestre ?? false, areas: [...areas] };
}

/** Veredito da regra em HTTP: invisível 404, proibido 403 com o motivo, o próprio cargo 400. */
export function exigir(v: Veredito): void {
  if (v.ok) return;
  if (v.erro === 'INVISIVEL') throw new NotFoundException();
  if (v.erro === 'PROPRIO') throw new BadRequestException(v.motivo);
  throw new ForbiddenException(v.motivo);
}

export const aplicar = (p: PedidoRegra) => exigir(podeGerenciar(p));

/** Cargo pedido (o do campo Cargo) no formato da regra e das funções do banco. */
export type VinculoPedido = { mestre: boolean; area: Area; cargo: string | null; head: boolean };

export function vinculoDoCargo(c: Pick<CargoGravado, 'role' | 'perfil' | 'moduloAdmin'>) {
  if (c.role === 'DIRETOR')
    return { mestre: true, area: 'COMERCIAL', cargo: 'DIRETOR', head: false } as VinculoPedido;
  if (c.role === 'ACOMPANHAMENTO')
    return {
      mestre: false,
      area: 'ACOMPANHAMENTO',
      cargo: c.perfil ?? null,
      head: c.perfil ? c.moduloAdmin : false,
    } as VinculoPedido;
  return {
    mestre: false,
    area: 'COMERCIAL',
    cargo: c.role,
    head: c.role === 'HEAD',
  } as VinculoPedido;
}

type Registro = { audit: AuditService; actorId: string };

/** Cria ou troca o vínculo (a regra roda de novo no banco) e audita com área, cargo e Head. */
export async function definirMembro(
  tx: Tx,
  r: Registro | null,
  alvo: string,
  antes: Vinculo | undefined,
  v: VinculoPedido,
) {
  await tx.execute(sql`select area_definir_membro(${alvo}, ${v.area}, ${v.cargo}, ${v.head})`);
  if (r)
    await r.audit.record(
      {
        actorId: r.actorId,
        action: 'area.membro.definido',
        entityType: 'user',
        entityId: alvo,
        data: {
          area: v.area,
          cargo: v.cargo,
          head: v.head,
          antes: antes ? { cargo: antes.cargo, head: antes.head } : null,
        },
      },
      tx,
    );
}

export async function removerMembro(tx: Tx, r: Registro, alvo: string, area: Area) {
  await tx.execute(sql`select area_remover_membro(${alvo}, ${area})`);
  await r.audit.record(
    {
      actorId: r.actorId,
      action: 'area.membro.removido',
      entityType: 'user',
      entityId: alvo,
      data: { area },
    },
    tx,
  );
}

export async function definirMestre(tx: Tx, r: Registro, alvo: string, v: VinculoPedido) {
  if (v.mestre) await tx.execute(sql`select area_definir_mestre(${alvo}, true)`);
  else
    await tx.execute(
      sql`select area_definir_mestre(${alvo}, false, ${v.area}, ${v.cargo}, ${v.head})`,
    );
  await r.audit.record(
    {
      actorId: r.actorId,
      action: 'area.mestre.definido',
      entityType: 'user',
      entityId: alvo,
      data: v.mestre
        ? { mestre: true }
        : { mestre: false, area: v.area, cargo: v.cargo, head: v.head },
    },
    tx,
  );
}

/**
 * Rotas de contas (`admin/users`, `admin/access-requests`): a Diretoria e o Head de alguma área
 * (Head do Comercial, Admin do Acompanhamento). Quem é do comercial e não gerencia recebe 403, como
 * antes; o cargo do Acompanhamento sem o selo, 404 (o Admin não se revela).
 */
@Injectable()
export class GerenteGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const u = ctx.switchToHttp().getRequest<FastifyRequest>().user;
    if (!u) throw new NotFoundException();
    const eu = await withUser(this.db, u.id, (tx) => lerMinhaConta(tx, u.id));
    if (gerenciaAlguma(eu)) return true;
    if (hasCommercialAccess(u.role)) throw new ForbiddenException();
    throw new NotFoundException();
  }
}

export const Gerente = () => applyDecorators(AllRoles(), UseGuards(GerenteGuard));
