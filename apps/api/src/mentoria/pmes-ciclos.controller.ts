import { Body, HttpCode, Inject, Injectable, Post } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import {
  pmesCiclosSchema,
  ULTIMO_PME,
  type AuthUser,
  type CicloStatus,
  type Mentoria,
  type PmeCicloLinha,
  type PmesCiclosFiltro,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { CiclosService } from './ciclos.service.js';
import { validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis } from './perfil.guard.js';

type Linha = {
  inscricao_id: string;
  nome: string;
  mentoria: Mentoria;
  responsavel: string | null;
  termino: string | null;
  ciclo_id: string | null;
  numero: number | null;
  titulo: string | null;
  enviado_em: string | null;
  prazo_atual: string | null;
  status: CicloStatus | null;
  dias_atraso: number | null;
  pct: number | null;
  extras_feitas: number;
  extras_total: number;
  encerramento_feito: boolean;
};

/**
 * Aba 7 "PMEs e ciclos" (E22, PDF p. 6): quem está em qual PME, envio, prazo, status, % de tarefas,
 * extras feitas, encerramento e o próximo PME a enviar. Mentorados ATIVO, como o envio de PME.
 */
@Injectable()
export class PmesCiclosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ciclos: CiclosService,
  ) {}

  listar(u: AuthUser, f: PmesCiclosFiltro): Promise<PmeCicloLinha[]> {
    const hoje = this.ciclos.hoje();
    return withUser(this.db, u.id, async (tx) => {
      const linhas = await tx.execute<Linha>(sql`
        with ult as (
          select distinct on (c.inscricao_id) c.*
          from mentoria_ciclos c join mentoria_inscricoes i on i.id = c.inscricao_id
          where i.status = 'ATIVO'
          order by c.inscricao_id, c.numero desc
        ),
        t as (
          select t.ciclo_id,
            count(*) filter (where t.origem = 'EXTRA' and t.status = 'FEITA')::int as extras_feitas,
            count(*) filter (where t.origem = 'EXTRA')::int as extras_total,
            bool_or(t.origem = 'ENCERRAMENTO' and t.status = 'FEITA') as encerramento
          from mentoria_tarefas t join ult on ult.id = t.ciclo_id
          group by t.ciclo_id
        )
        select i.id as inscricao_id,
          (select string_agg(p.nome, ' e ' order by p.ordem) from mentoria_pessoas p
            where p.inscricao_id = i.id) as nome,
          i.mentoria, u.name as responsavel,
          to_char(i.termino_previsto, 'YYYY-MM-DD') as termino,
          c.id as ciclo_id, c.numero, pm.titulo,
          to_char(c.enviado_em, 'YYYY-MM-DD') as enviado_em,
          to_char(coalesce(c.segunda_chance_ate, c.prazo), 'YYYY-MM-DD') as prazo_atual,
          case when c.id is not null then mentoria_ciclo_status(c.concluido_em, c.nao_concluido_em,
            c.prazo, c.segunda_chance_ate, ${hoje}::date) end as status,
          case when c.id is not null and c.concluido_em is null and c.nao_concluido_em is null
            then greatest(${hoje}::date - coalesce(c.segunda_chance_ate, c.prazo), 0) else 0 end
            as dias_atraso,
          case when c.id is not null then mentoria_pct_tarefas(c.id) end as pct,
          coalesce(t.extras_feitas, 0) as extras_feitas, coalesce(t.extras_total, 0) as extras_total,
          coalesce(t.encerramento, false) or c.concluido_em is not null as encerramento_feito
        from mentoria_inscricoes i
        join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
        left join "user" u on u.id = i.responsavel_id
        left join ult c on c.inscricao_id = i.id
        left join mentoria_pmes pm on pm.id = c.pme_id
        left join t on t.ciclo_id = c.id
        where i.status = 'ATIVO'
        order by c.numero desc nulls last, p1.nome_norm, i.id
        limit 2000`);
      const todas = [...linhas].map((l): PmeCicloLinha => {
        const cabe = !l.termino || hoje <= l.termino;
        const proximoPme = !cabe
          ? null
          : l.numero === null
            ? 1
            : l.status === 'CONCLUIDO' && l.numero < ULTIMO_PME
              ? l.numero + 1
              : null;
        return {
          inscricaoId: l.inscricao_id,
          nome: l.nome,
          mentoria: l.mentoria,
          responsavel: l.responsavel,
          ciclo:
            l.ciclo_id && l.numero !== null
              ? {
                  id: l.ciclo_id,
                  numero: l.numero,
                  titulo: l.titulo,
                  enviadoEm: l.enviado_em!,
                  prazoAtual: l.prazo_atual!,
                  status: l.status!,
                  diasAtraso: l.dias_atraso ?? 0,
                  pctTarefas: l.pct === null ? null : Number(l.pct),
                  extrasFeitas: l.extras_feitas,
                  extrasTotal: l.extras_total,
                  encerramentoFeito: l.encerramento_feito,
                }
              : null,
          proximoPme,
        };
      });
      return todas.filter(
        (l) =>
          (!f.numero || l.ciclo?.numero === f.numero) &&
          (!f.status || (f.status === 'SEM_PME' ? !l.ciclo : l.ciclo?.status === f.status)),
      );
    });
  }
}

/** Especialista e Mentor: 404 (a aba é de quem gere os ciclos). */
@MentoriaController('pmes-ciclos')
export class PmesCiclosController {
  constructor(private readonly servico: PmesCiclosService) {}

  @Post()
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  listar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.servico.listar(u, validarComAviso(pmesCiclosSchema, body ?? {}));
  }
}
