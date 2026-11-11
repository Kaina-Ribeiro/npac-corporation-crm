import { BadRequestException, Body, HttpCode, Inject, Injectable, Post, Res } from '@nestjs/common';
import { withUser, type Db, type Tx } from '@npac/db';
import {
  exportarSchema,
  FILA_TIPO_LABEL,
  filaTitulo,
  INSCRICAO_STATUS_LABEL,
  ORIGEM_LABEL,
  PERFIL_LABEL,
  PLATAFORMA_LABEL,
  REUNIAO_STATUS_LABEL,
  REUNIAO_TIPO_LABEL,
  STATUS_FINANCEIRO_LABEL,
  TIPO_INSCRICAO_LABEL,
  type AuthUser,
  type Exportar,
  type FilaTipo,
  type InscricaoStatus,
  type Origem,
  type Perfil,
  type Plataforma,
  type ReuniaoStatus,
  type ReuniaoTipo,
  type StatusFinanceiro,
  type TipoInscricao,
} from '@npac/shared';
import { money } from '@npac/shared/money';
import { sql, type SQL } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { csvHeaders, toCsv } from '../common/csv.js';
import { DB } from '../common/db/db.module.js';
import { validarComAviso } from './erros.js';
import { FilaService } from './fila.service.js';
import { MentoriaController } from './mentoria.guard.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { Perfis } from './perfil.guard.js';

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;
/** Mesmo teto do CRM: planilha maior que isso vira filtro. */
const LIMITE = 10_000;
const data = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const BRASILIA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

type LinhaMentorado = {
  id: string;
  tipo: TipoInscricao;
  mentoria: string;
  variante: string | null;
  status: InscricaoStatus;
  mes: number | null;
  inicio: string | null;
  termino: string | null;
  idr: string | null;
  responsavel: string | null;
  origem: Origem | null;
  financeiro: StatusFinanceiro | null;
  valor: number | null;
  ultimo: string | null;
  pessoas: {
    id: string;
    nome: string;
    cidade: string | null;
    uf: string | null;
    whatsapp: string | null;
    email: string | null;
  }[];
};

/**
 * Planilha das abas (§6): Admin e Acompanhamento, auditada, fórmulas neutralizadas (`toCsv`).
 * WhatsApp e e-mail só para Admin; dor, sonho, meta, anotações e textos de reunião nunca saem.
 */
@Injectable()
export class ExportacaoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly fila: FilaService,
    private readonly audit: AuditService,
  ) {}

  async exportar(u: AuthUser, b: Exportar): Promise<string> {
    const linhas =
      b.aba === 'FILA'
        ? await this.filaCsv(u, b)
        : await withUser(this.db, u.id, async (tx) => {
            const [eu] = await tx.execute<{ admin: boolean }>(
              sql`select mentoria_admin() as admin`,
            );
            const admin = eu?.admin === true;
            const rows =
              b.aba === 'MENTORADOS'
                ? await this.mentorados(tx, b, admin)
                : b.aba === 'PLANO'
                  ? await this.plano(tx, b)
                  : await this.reunioes(tx, b);
            if (rows.length - 1 > LIMITE)
              throw new BadRequestException('Mais de 10 mil linhas: use um filtro');
            await this.audit.record(
              {
                actorId: u.id,
                action: 'mentoria.csv',
                entityType: 'mentoria',
                data: {
                  aba: b.aba,
                  linhas: rows.length - 1,
                  contato: admin && b.aba === 'MENTORADOS',
                },
              },
              tx,
            );
            return rows;
          });
    return toCsv(linhas);
  }

  private where(b: Exportar): SQL[] {
    const f = b.filtros ?? {};
    const w: SQL[] = [];
    if (f.status) w.push(sql`i.status = ${f.status}`);
    if (f.mentoria) w.push(sql`i.mentoria = ${f.mentoria}`);
    if (f.responsavelId) w.push(sql`i.responsavel_id = ${f.responsavelId}`);
    return w;
  }

  private filtro(w: SQL[]) {
    return w.length ? sql`where ${sql.join(w, sql` and `)}` : sql``;
  }

  private async mentorados(tx: Tx, b: Exportar, admin: boolean): Promise<unknown[][]> {
    const linhas = await tx.execute<LinhaMentorado>(sql`
      select i.id, i.tipo, i.mentoria, i.mentoria_variante as variante, i.status,
        mentoria_mes_jornada(i.id, ${HOJE}) as mes,
        to_char(i.inicio_jornada, 'YYYY-MM-DD') as inicio,
        to_char(i.termino_previsto, 'YYYY-MM-DD') as termino,
        to_char(i.data_idr, 'YYYY-MM-DD') as idr, u.name as responsavel, i.origem,
        i.status_financeiro as financeiro, i.valor_centavos as valor,
        to_char(mentoria_ultimo_contato(i.id), 'YYYY-MM-DD') as ultimo,
        (select json_agg(json_build_object('id', p.id, 'nome', p.nome, 'cidade', p.cidade,
           'uf', p.uf, 'whatsapp', p.whatsapp, 'email', p.email) order by p.ordem)
         from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas
      from mentoria_inscricoes i
      join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
      left join "user" u on u.id = i.responsavel_id
      ${this.filtro(this.where(b))}
      order by p1.nome_norm, i.id
      limit ${LIMITE + 1}`);
    const cab = [
      'Mentorado',
      'Tipo',
      'Mentoria',
      'Variante',
      'Status',
      'Mês da jornada',
      'Início',
      'Término previsto',
      'IDR',
      'Responsável',
      'Origem',
      'Financeiro',
      'Valor',
      'Cidade',
      'Último contato',
      ...(admin ? ['WhatsApp', 'E-mail'] : []),
    ];
    const abrir = (blob: string | null, id: string, campo: 'whatsapp' | 'email') =>
      this.crypto.decifrarOpcional(blob, aad('mentoria_pessoas', campo, id)) ?? '';
    return [
      cab,
      ...linhas.map((l) => {
        const pessoas = l.pessoas ?? [];
        return [
          pessoas.map((p) => p.nome).join(' e '),
          TIPO_INSCRICAO_LABEL[l.tipo],
          l.mentoria,
          l.variante ?? '',
          INSCRICAO_STATUS_LABEL[l.status],
          l.mes ?? '',
          data(l.inicio),
          data(l.termino),
          data(l.idr),
          l.responsavel ?? '',
          l.origem ? ORIGEM_LABEL[l.origem] : '',
          l.financeiro ? STATUS_FINANCEIRO_LABEL[l.financeiro] : '',
          l.valor === null ? '' : money(l.valor),
          pessoas
            .map((p) => [p.cidade, p.uf].filter(Boolean).join('/'))
            .filter(Boolean)
            .join(' e '),
          data(l.ultimo),
          ...(admin
            ? [
                pessoas
                  .map((p) => abrir(p.whatsapp, p.id, 'whatsapp'))
                  .filter(Boolean)
                  .join(' e '),
                pessoas
                  .map((p) => abrir(p.email, p.id, 'email'))
                  .filter(Boolean)
                  .join(' e '),
              ]
            : []),
        ];
      }),
    ];
  }

  private async plano(tx: Tx, b: Exportar): Promise<unknown[][]> {
    const linhas = await tx.execute<{
      nome: string;
      mentoria: string;
      mes: number;
      foco: string;
      acao: string;
      prevista: string;
      perfil: Perfil;
      responsavel: string | null;
      status: string;
      atrasada: boolean;
      feita: string | null;
    }>(sql`
      select (select string_agg(p.nome, ' e ' order by p.ordem) from mentoria_pessoas p
          where p.inscricao_id = i.id) as nome,
        i.mentoria, a.mes, a.foco, a.acao, to_char(a.data_prevista, 'YYYY-MM-DD') as prevista,
        a.responsavel_perfil as perfil, u.name as responsavel, a.status,
        mentoria_acao_atrasada(a.status, a.anterior_ao_sistema, a.data_limite, ${HOJE}) as atrasada,
        to_char(a.feita_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as feita
      from mentoria_acoes a
      join mentoria_inscricoes i on i.id = a.inscricao_id
      left join "user" u on u.id = a.responsavel_id
      ${this.filtro(this.where(b))}
      order by nome, a.mes
      limit ${LIMITE + 1}`);
    return [
      [
        'Mentorado',
        'Mentoria',
        'Mês',
        'Foco',
        'Ação',
        'Prevista',
        'Responsável',
        'Status',
        'Feita em',
      ],
      ...linhas.map((l) => [
        l.nome,
        l.mentoria,
        l.mes,
        l.foco,
        l.acao,
        data(l.prevista),
        l.responsavel ?? PERFIL_LABEL[l.perfil],
        l.status === 'FEITA' ? 'Feita' : l.atrasada ? 'Atrasada' : 'Pendente',
        data(l.feita),
      ]),
    ];
  }

  private async reunioes(tx: Tx, b: Exportar): Promise<unknown[][]> {
    const linhas = await tx.execute<{
      nome: string;
      tipo: ReuniaoTipo;
      inicio: Date | string;
      status: ReuniaoStatus;
      condutor: string | null;
      plataforma: Plataforma | null;
    }>(sql`
      select (select string_agg(p.nome, ' e ' order by p.ordem) from mentoria_pessoas p
          where p.inscricao_id = i.id) as nome,
        r.tipo, r.inicio, r.status, u.name as condutor, r.plataforma
      from mentoria_reunioes r
      join mentoria_inscricoes i on i.id = r.inscricao_id
      left join "user" u on u.id = r.conduzida_por
      ${this.filtro(this.where(b))}
      order by r.inicio desc
      limit ${LIMITE + 1}`);
    return [
      ['Mentorado', 'Tipo', 'Data e hora', 'Status', 'Conduz', 'Plataforma'],
      ...linhas.map((l) => [
        l.nome,
        REUNIAO_TIPO_LABEL[l.tipo],
        BRASILIA.format(new Date(l.inicio)),
        REUNIAO_STATUS_LABEL[l.status],
        l.condutor ?? '',
        l.plataforma ? PLATAFORMA_LABEL[l.plataforma] : '',
      ]),
    ];
  }

  /** A Fila como está na tela de quem exporta, sem contato. */
  private async filaCsv(u: AuthUser, b: Exportar): Promise<unknown[][]> {
    const dados = await this.fila.listar(u, { escopo: b.filtros?.escopo });
    await this.audit.record({
      actorId: u.id,
      action: 'mentoria.csv',
      entityType: 'mentoria',
      data: { aba: b.aba, linhas: dados.itens.length, contato: false },
    });
    return [
      ['Tipo', 'O que fazer', 'Mentorado', 'Responsável', 'Desde', 'Atrasado'],
      ...dados.itens.map((i) => [
        FILA_TIPO_LABEL[i.tipo as FilaTipo],
        filaTitulo(i),
        i.mentorado?.nome ?? 'Toda a carteira',
        i.responsavelNome ?? PERFIL_LABEL[i.responsavelPerfil],
        BRASILIA.format(new Date(i.venceEm)),
        i.atrasado ? 'Sim' : 'Não',
      ]),
    ];
  }
}

@MentoriaController('exportar')
export class ExportacaoController {
  constructor(private readonly exportacao: ExportacaoService) {}

  /** Operação e Especialista: 404 (o perfil ACOMPANHAMENTO e o Admin exportam). */
  @Post()
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO')
  async exportar(
    @CurrentUser() u: SessionUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const b = validarComAviso(exportarSchema, body);
    const csv = await this.exportacao.exportar(u, b);
    csvHeaders(reply, `acompanhamento-${b.aba.toLowerCase()}.csv`);
    return csv;
  }
}
