import { Controller, Get, Inject, Injectable, NotFoundException, Query } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import type { AuthUser } from '@npac/shared';
import type { Acesso } from '@npac/shared/acessos';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AllRoles } from '../auth/all-roles.decorator.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { validate } from '../common/validate.js';
import { lerMinhaConta } from './areas.js';

/**
 * Registro de acessos da Diretoria (NPAC-54, D10, D11; spec "Registro de acessos da Diretoria"): o
 * que mudou em contas e acessos, lido da auditoria que já existe. Sem logins, sem lead, venda ou
 * mentorado. A auditoria não guarda nome nem e-mail: os nomes vêm da conta na hora de ler. A frase é
 * montada no web (`fraseAcesso`, `@npac/shared/acessos`, onde ficam também os tipos).
 */
const POR_PAGINA = 20;
const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();

type Linha = {
  id: number;
  at: Date | string;
  action: string;
  data: Record<string, unknown>;
  ator_id: string | null;
  ator_nome: string | null;
  alvo_id: string | null;
  alvo_nome: string | null;
};

const texto = (v: unknown) => (typeof v === 'string' ? v : null);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const CAMPOS_DE_CARGO = ['role', 'perfil', 'moduloAdmin'];

/** Tipo e detalhe de cada linha da auditoria (as que não são acesso nem chegam aqui). */
function tipoDe(action: string, d: Record<string, unknown>) {
  const detalhe = {
    area: texto(d.area),
    cargo: texto(d.cargo),
    head: bool(d.head),
    ...(d.alcance === 'CARTEIRA' ? { alcance: 'CARTEIRA' as const } : {}),
  };
  const antes = (d.antes ?? null) as { head?: boolean } | null;
  switch (action) {
    case 'admin.user.invite':
      return { tipo: 'CONTA_CRIADA' as const, ...detalhe };
    case 'admin.access_request.approve':
      return { tipo: 'PEDIDO_APROVADO' as const, ...detalhe };
    case 'admin.access_request.reject':
      return {
        tipo: 'PEDIDO_RECUSADO' as const,
        area: texto(d.pedidoArea),
        cargo: null,
        head: null,
      };
    case 'area.membro.definido': {
      if (!antes) return { tipo: 'AREA_ADICIONADA' as const, ...detalhe };
      if (detalhe.head && !antes.head) return { tipo: 'HEAD_DADO' as const, ...detalhe };
      if (!detalhe.head && antes.head) return { tipo: 'HEAD_TIRADO' as const, ...detalhe };
      return { tipo: 'CARGO_TROCADO' as const, ...detalhe };
    }
    case 'area.membro.removido':
      return { tipo: 'AREA_REMOVIDA' as const, ...detalhe };
    case 'area.mestre.definido':
      return d.mestre
        ? { tipo: 'DIRETORIA_DADA' as const, area: null, cargo: 'DIRETOR', head: null }
        : { tipo: 'DIRETORIA_TIRADA' as const, ...detalhe };
    case 'admin.user.reset_password':
      return { tipo: 'SENHA_REDEFINIDA' as const, area: null, cargo: null, head: null };
    case 'admin.user.reset_mfa':
      return { tipo: 'MFA_ZERADO' as const, area: null, cargo: null, head: null };
    case 'mentoria.perfil.definido':
      // Antigo (aba Perfis antes da Fase 2): o perfil era o cargo do Acompanhamento.
      return {
        tipo: 'CARGO_TROCADO' as const,
        area: 'ACOMPANHAMENTO',
        cargo: texto(d.perfil),
        head: bool(d.admin),
      };
    default: {
      // admin.user.update
      if (typeof d.ativo === 'boolean')
        return {
          tipo: d.ativo ? ('CONTA_REATIVADA' as const) : ('CONTA_DESATIVADA' as const),
          area: null,
          cargo: null,
          head: null,
        };
      const fields = Array.isArray(d.fields) ? (d.fields as string[]) : [];
      if (fields.some((f) => CAMPOS_DE_CARGO.includes(f)))
        return { tipo: 'CARGO_TROCADO' as const, area: null, cargo: null, head: null };
      return { tipo: 'CONTA_ATIVO_ALTERADO' as const, area: null, cargo: null, head: null };
    }
  }
}

@Injectable()
export class AcessosService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(actor: AuthUser, page: number) {
    return withUser(this.db, actor.id, async (tx) => {
      if (!(await lerMinhaConta(tx, actor.id)).mestre) throw new NotFoundException();
      // Ações de acesso. admin.user.update: a partir da Fase 2 (registro 2) só ativar/desativar (o
      // cargo vem de area.*); antes, só os campos. mentoria.perfil.definido: só o antigo (o novo vem
      // junto de area.membro.definido).
      const filtro = sql`(
        a.action in ('admin.user.invite', 'admin.access_request.approve',
          'admin.access_request.reject', 'area.membro.definido', 'area.membro.removido',
          'area.mestre.definido', 'admin.user.reset_password', 'admin.user.reset_mfa')
        or (a.action = 'admin.user.update' and (a.data->'ativo' is not null
          or (a.data->'registro' is null and (a.data->'fields' @> '["active"]'
            or a.data->'fields' @> '["role"]' or a.data->'fields' @> '["perfil"]'
            or a.data->'fields' @> '["moduloAdmin"]'))))
        or (a.action = 'mentoria.perfil.definido' and a.data->'registro' is null))`;
      const linhas = await tx.execute<Linha>(sql`
        select a.id, a.at, a.action, a.data, ua.id as ator_id, ua.name as ator_nome,
          ut.id as alvo_id, ut.name as alvo_nome
        from audit_log a
        left join "user" ua on ua.id = a.actor_id
        left join "user" ut on ut.id = case
          when a.action = 'admin.access_request.approve' then a.data->>'userId'
          when a.entity_type = 'user' then a.entity_id end
        where ${filtro}
        order by a.id desc
        limit ${POR_PAGINA + 1} offset ${(page - 1) * POR_PAGINA}`);
      const [total] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from audit_log a where ${filtro}`,
      );
      const items: Acesso[] = [...linhas].slice(0, POR_PAGINA).map((l) => ({
        id: Number(l.id),
        at: new Date(l.at).toISOString(),
        ...tipoDe(l.action, l.data ?? {}),
        ator: l.ator_id ? { id: l.ator_id, nome: l.ator_nome ?? '' } : null,
        alvo: l.alvo_id ? { id: l.alvo_id, nome: l.alvo_nome ?? '' } : null,
      }));
      return { items, page, hasMore: linhas.length > POR_PAGINA, total: total?.n ?? 0 };
    });
  }
}

/** Só a Diretoria; os demais cargos (Head inclusive) recebem 404. */
@Controller('admin/acessos')
@AllRoles()
export class AcessosController {
  constructor(private readonly acessos: AcessosService) {}
  @Get() list(@CurrentUser() u: SessionUser, @Query() q: unknown) {
    return this.acessos.list(u, validate(query, q).page);
  }
}
