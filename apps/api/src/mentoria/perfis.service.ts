import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import type { AuthUser, PerfilLinha, Responsavel } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { aplicar, lerConta, lerMinhaConta } from '../admin/areas.js';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';

@Injectable()
export class PerfisService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /**
   * Quem pode receber perfil: conta ativa com vínculo no Acompanhamento (NPAC-54: a fonte é
   * `area_membros`, lida pela RLS do Admin). A Diretoria é Admin sem linha.
   */
  listar(u: AuthUser): Promise<PerfilLinha[]> {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<PerfilLinha>(sql`
        select u.id, u.name as nome, m.cargo as perfil, m.head as admin
        from "user" u join area_membros m on m.user_id = u.id and m.area = 'ACOMPANHAMENTO'
        where u.active
        order by u.name`);
      return [...rows];
    });
  }

  /**
   * Troca o perfil pela regra única (NPAC-54, Fase 2): o Admin do módulo troca o perfil de quem é da
   * área e não é Admin; dar ou tirar o selo é só da Diretoria (403); ninguém troca o próprio (400).
   */
  definir(u: AuthUser, alvo: string, perfil: string | null, admin: boolean) {
    return withUser(this.db, u.id, async (tx) => {
      const conta = await lerConta(tx, alvo);
      if (!conta) throw new NotFoundException();
      const antes = conta.areas.find((a) => a.area === 'ACOMPANHAMENTO');
      aplicar({
        ator: await lerMinhaConta(tx, u.id),
        alvo: conta,
        proprio: alvo === u.id,
        acao: 'CARGO',
        area: 'ACOMPANHAMENTO',
        cargo: perfil,
        head: admin,
      });
      await tx.execute(sql`select mentoria_definir_perfil(${alvo}, ${perfil}, ${admin})`);
      const head = perfil !== null && admin;
      for (const [action, data] of [
        ['mentoria.perfil.definido', { perfil, admin, registro: 2 }],
        [
          'area.membro.definido',
          {
            area: 'ACOMPANHAMENTO',
            cargo: perfil,
            head,
            antes: antes ? { cargo: antes.cargo, head: antes.head } : null,
          },
        ],
      ] as const)
        await this.audit.record(
          { actorId: u.id, action, entityType: 'user', entityId: alvo, data },
          tx,
        );
      return { perfil, admin };
    }).catch((e) => erroDoBanco(e));
  }

  /** Quem pode conduzir uma reunião: qualquer usuário ativo (§3), sem dar acesso ao módulo. */
  condutores(u: AuthUser) {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<{ id: string; nome: string }>(
        sql`select id, name as nome from "user" where active order by name`,
      );
      return [...rows];
    });
  }

  /**
   * Responsáveis pelo acompanhamento. `elegivel` = pode ser escolhido (perfil Acompanhamento,
   * conta ativa: a mesma regra de quem recebe uma carteira). Quem ainda é responsável por alguma
   * inscrição também vem, mesmo desativado ou sem perfil, para a ficha mostrar o nome, o filtro
   * achar e o Admin transferir a carteira de quem saiu. `carteira` = inscrições em andamento.
   */
  responsaveis(u: AuthUser): Promise<Responsavel[]> {
    return withUser(this.db, u.id, async (tx) => {
      const rows = await tx.execute<Responsavel>(sql`
        with dono as (
          select responsavel_id as id,
            (count(*) filter (where status in ('ONBOARDING', 'ATIVO', 'PAUSADO')))::int as n
          from mentoria_inscricoes where responsavel_id is not null group by responsavel_id
        )
        select u.id, u.name as nome, u.active as ativo,
          coalesce(mentoria_perfil_de(u.id) = 'ACOMPANHAMENTO', false) as elegivel,
          coalesce(d.n, 0) as carteira
        from "user" u left join dono d on d.id = u.id
        where d.id is not null or mentoria_perfil_de(u.id) = 'ACOMPANHAMENTO'
        order by u.name`);
      return [...rows];
    });
  }
}
