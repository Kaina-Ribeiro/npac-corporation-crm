import { Body, Delete, Get, Inject, Injectable, Param, Post } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import {
  desfazerRenovacaoSchema,
  numerosRenovacao,
  renovarSchema,
  rotuloMesRenovacao,
  situacaoConversa,
  type AuthUser,
  type Mentoria,
  type PainelRenovacoes,
  type RenovacaoLinha,
  type RenovarPost,
  type ReuniaoStatus,
  type TipoInscricao,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId } from '../common/validate.js';
import { CiclosService } from './ciclos.service.js';
import { erroDoBanco, validarComAviso } from './erros.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis, SoAdmin } from './perfil.guard.js';

/** Uma linha de `mentoria_renovacoes_painel` (jsonb, nomes do banco). */
type LinhaBanco = {
  inscricao_id: string;
  nome: string | null;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  mentoria_variante: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  inicio_jornada: string | null;
  termino_previsto: string;
  ultimo_mes_inicio: string;
  ano: number;
  renovada_em: string | null;
  renovada_de: Mentoria | null;
  renovada_para: Mentoria | null;
  reuniao_status: ReuniaoStatus | null;
  reuniao_dia: string | null;
  interesse_renovar: boolean | null;
};
type PainelBanco = { itens: LinhaBanco[]; renovaram: number; nao_renovaram: number };

/**
 * Renovações (NPAC-79): a aba "Renovações e gestão" (1A, 5A, 8A), "Registrar renovação" (3B, 4B, 2C) e o desfazer
 * (G5). Regras e permissões no banco (`mentoria_renovacoes_painel`, `mentoria_renovar`,
 * `mentoria_renovacao_desfazer`); aqui a situação da conversa, os rótulos e os números.
 */
@Injectable()
export class RenovacoesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ciclos: CiclosService,
  ) {}

  painel(u: AuthUser): Promise<PainelRenovacoes> {
    const hoje = this.ciclos.hoje();
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ p: PainelBanco }>(
        sql`select mentoria_renovacoes_painel(${hoje}::date) as p`,
      );
      const p = r!.p;
      const itens = p.itens.map((l): RenovacaoLinha => {
        const base = {
          inscricaoId: l.inscricao_id,
          nome: l.nome ?? '',
          tipo: l.tipo,
          mentoria: l.mentoria,
          mentoriaVariante: l.mentoria_variante,
          responsavelId: l.responsavel_id,
          responsavel: l.responsavel,
          inicioJornada: l.inicio_jornada,
          terminoPrevisto: l.termino_previsto,
          ultimoMesInicio: l.ultimo_mes_inicio,
          ano: l.ano,
          renovadaEm: l.renovada_em,
          renovadaDe: l.renovada_de,
          renovadaPara: l.renovada_para,
          reuniaoStatus: l.reuniao_status,
          reuniaoDia: l.reuniao_dia,
          interesseRenovar: l.interesse_renovar,
        };
        const { situacao, rotulo } = situacaoConversa(base);
        return {
          ...base,
          situacao,
          situacaoRotulo: rotulo,
          mesRotulo: rotuloMesRenovacao(base, hoje),
        };
      });
      return { hoje, numeros: numerosRenovacao(itens, p.renovaram, p.nao_renovaram), itens };
    }).catch((e) => erroDoBanco(e));
  }

  renovar(u: AuthUser, inscricaoId: string, b: RenovarPost) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ version: number }>(sql`
        select mentoria_renovar(${inscricaoId}::uuid, ${b.version}::int, ${b.mentoria}::text,
          ${b.data}::date) as version`);
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e));
  }

  desfazer(u: AuthUser, inscricaoId: string, version: number) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ version: number }>(sql`
        select mentoria_renovacao_desfazer(${inscricaoId}::uuid, ${version}::int) as version`);
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e));
  }
}

@MentoriaController('')
export class RenovacoesController {
  constructor(private readonly renovacoes: RenovacoesService) {}

  /** A aba: Admin e Acompanhamento ("só a carteira" vê a carteira pela RLS); os outros perfis, 404. */
  @Get('renovacoes')
  @Perfis('ACOMPANHAMENTO')
  painel(@CurrentUser() u: SessionUser) {
    return this.renovacoes.painel(u);
  }

  @Post('inscricoes/:id/renovacoes')
  @Perfis('ACOMPANHAMENTO')
  renovar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.renovacoes.renovar(u, entityId(id), validarComAviso(renovarSchema, body));
  }

  @Delete('inscricoes/:id/renovacoes/ultima')
  @SoAdmin()
  desfazer(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.renovacoes.desfazer(
      u,
      entityId(id),
      validarComAviso(desfazerRenovacaoSchema, body ?? {}).version,
    );
  }
}
