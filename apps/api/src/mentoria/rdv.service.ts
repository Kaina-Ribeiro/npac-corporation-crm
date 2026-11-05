import { hkdfSync, randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  mentoriaMidia,
  mentoriaRdvDiagnostico,
  mentoriaRdvEventos,
  mentoriaRdvPessoas,
  mentoriaRdvQuadros,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  bytesDeTexto,
  DATA_COMPLETA,
  DIAGNOSTICO_CHAVES,
  DIAGNOSTICO_ROTULOS,
  LIMITE_REGISTRO_BYTES,
  nomeNormalizado,
  parseData,
  parseDiagnostico,
  parseEventosColados,
  type AtualizarRdv,
  type AuthUser,
  type ColarEventos,
  type CriarRdv,
  type DiagnosticoChave,
  type DiagnosticoPrevia,
  type MidiaDTO,
  type NovoQuadro,
  type PaginaRdv,
  type RdvDetalhe,
} from '@npac/shared';
import { and, asc, eq, gt, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { CursorSigner } from './cursor.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

export const buscaRdv = z
  .object({ q: z.string().trim().max(200).optional(), cursor: z.string().max(400).optional() })
  .strict();
const PAGINA = 50;
const NOME_RDV = 'Já existe um mentorado com este nome no RDV';
const MSG_DATA_EVENTO = 'Use a data no formato DD/MM/AAAA';
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Coluna do banco (camelCase do Drizzle) de cada chave do diagnóstico. */
const COLUNA: Record<DiagnosticoChave, keyof typeof mentoriaRdvDiagnostico.$inferSelect> = {
  idade: 'idade',
  situacao_conjugal: 'situacaoConjugal',
  filhos: 'filhos',
  trabalho: 'trabalho',
  renda_atual: 'rendaAtual',
  dinheiro_guardado: 'dinheiroGuardado',
  patrimonio: 'patrimonio',
  dividas: 'dividas',
  sonhos_objetivos: 'sonhosObjetivos',
};

/**
 * Linha do tempo RDV (Módulo 3): lista A–Z, pessoa aberta (auditada), nome, eventos e quadros
 * editáveis com a version da pessoa (D5). Diagnóstico, pasta e data de item de quadro são
 * campos de fonte: só mudam pelas funções de "Colar" ou na criação (regra 5, D34).
 */
@Injectable()
export class RdvService {
  private readonly cursor: CursorSigner;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly crypto: MentoriaCrypto,
    private readonly audit: AuditService,
  ) {
    const key = hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'npac:mentoria:cursor:rdv', 32);
    this.cursor = new CursorSigner(Buffer.from(key));
  }

  criar(u: AuthUser, input: CriarRdv) {
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .insert(mentoriaRdvPessoas)
        .values({
          id: randomUUID(),
          nome: input.nome,
          nomeNorm: nomeNormalizado(input.nome),
          createdBy: u.id,
          updatedBy: u.id,
        })
        .returning({ id: mentoriaRdvPessoas.id, version: mentoriaRdvPessoas.version });
      return row!;
    }).catch((e) => erroDoBanco(e, NOME_RDV));
  }

  /** Lista A–Z com busca por nome (POST) e o número de eventos. Sem auditoria (D35). */
  buscar(u: AuthUser, f: z.output<typeof buscaRdv>): Promise<PaginaRdv> {
    return withUser(this.db, u.id, async (tx) => {
      const filtros: SQL[] = [];
      if (f.q)
        filtros.push(ilike(mentoriaRdvPessoas.nomeNorm, `%${semCuringa(nomeNormalizado(f.q))}%`));
      const where = [...filtros];
      if (f.cursor) {
        const [ult] = await tx
          .select({ nomeNorm: mentoriaRdvPessoas.nomeNorm, id: mentoriaRdvPessoas.id })
          .from(mentoriaRdvPessoas)
          .where(eq(mentoriaRdvPessoas.id, this.cursor.verify(f.cursor)));
        if (ult)
          where.push(
            or(
              gt(mentoriaRdvPessoas.nomeNorm, ult.nomeNorm),
              and(eq(mentoriaRdvPessoas.nomeNorm, ult.nomeNorm), gt(mentoriaRdvPessoas.id, ult.id)),
            )!,
          );
      }
      const rows = await tx
        .select({
          id: mentoriaRdvPessoas.id,
          nome: mentoriaRdvPessoas.nome,
          eventos: sql<number>`(select count(*)::int from mentoria_rdv_eventos e where e.pessoa_id = mentoria_rdv_pessoas.id)`,
        })
        .from(mentoriaRdvPessoas)
        .where(where.length ? and(...where) : sql`true`)
        .orderBy(asc(mentoriaRdvPessoas.nomeNorm), asc(mentoriaRdvPessoas.id))
        .limit(PAGINA + 1);
      const itens = rows.slice(0, PAGINA);
      const ultimo = itens.at(-1);
      const [t] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(mentoriaRdvPessoas)
        .where(filtros.length ? and(...filtros) : sql`true`);
      return {
        itens,
        cursor: rows.length > PAGINA && ultimo ? this.cursor.sign(ultimo.id) : null,
        total: t?.n ?? 0,
      };
    });
  }

  private async diagnosticoAtual(tx: Tx, id: string) {
    const [d] = await tx
      .select()
      .from(mentoriaRdvDiagnostico)
      .where(eq(mentoriaRdvDiagnostico.pessoaId, id));
    return Object.fromEntries(
      DIAGNOSTICO_CHAVES.map((k) => [
        k,
        this.crypto.decifrarOpcional(
          (d?.[COLUNA[k]] as string | null | undefined) ?? null,
          aad('mentoria_rdv_diagnostico', k, id),
        ),
      ]),
    ) as Record<DiagnosticoChave, string | null>;
  }

  /** Eventos (data, id) e itens de quadro (data, id; sem data no fim), decifrados. */
  private async filhos(tx: Tx, id: string) {
    const ev = await tx
      .select()
      .from(mentoriaRdvEventos)
      .where(eq(mentoriaRdvEventos.pessoaId, id))
      .orderBy(asc(mentoriaRdvEventos.data), asc(mentoriaRdvEventos.id));
    const qd = await tx
      .select()
      .from(mentoriaRdvQuadros)
      .where(eq(mentoriaRdvQuadros.pessoaId, id))
      .orderBy(sql`${mentoriaRdvQuadros.data} asc nulls last`, asc(mentoriaRdvQuadros.id));
    return {
      eventos: ev.map((e) => ({
        id: e.id,
        data: e.dataTexto,
        descricao: this.crypto.decifrarOpcional(
          e.descricao,
          aad('mentoria_rdv_eventos', 'descricao', e.id),
        ),
      })),
      quadros: qd.map((q) => ({
        id: q.id,
        quadro: q.quadro,
        data: q.dataTexto,
        descricao: this.crypto.decifrarOpcional(
          q.descricao,
          aad('mentoria_rdv_quadros', 'descricao', q.id),
        ),
      })),
    };
  }

  private async existe(tx: Tx, id: string) {
    const [p] = await tx.select().from(mentoriaRdvPessoas).where(eq(mentoriaRdvPessoas.id, id));
    if (!p) throw new NotFoundException();
    return p;
  }

  /** Trava a pessoa e sobe a version (filhos usam a version do pai, D5); 409 se mudou. */
  private async travar(tx: Tx, id: string, version: number, u?: AuthUser) {
    const [r] = await tx
      .update(mentoriaRdvPessoas)
      .set({
        version: sql`${mentoriaRdvPessoas.version} + 1`,
        ...(u && { updatedBy: u.id }),
        updatedAt: new Date(),
      })
      .where(and(eq(mentoriaRdvPessoas.id, id), eq(mentoriaRdvPessoas.version, version)))
      .returning({ v: mentoriaRdvPessoas.version });
    if (!r) throw conflitoDeVersao();
    return r.v;
  }

  /**
   * Limite de 256 KB por registro (PDF): nome, diagnóstico, eventos e quadros depois da
   * edição. `extra` são os textos novos que ainda não estão no banco.
   */
  private async checarLimite(tx: Tx, id: string, nome: string, extra: unknown) {
    const diag = await this.diagnosticoAtual(tx, id);
    const { eventos, quadros } = await this.filhos(tx, id);
    const total = bytesDeTexto([nome, Object.values(diag), eventos, quadros, extra]);
    if (total > LIMITE_REGISTRO_BYTES)
      throw new BadRequestException('Registro acima do limite de 256 KB');
  }

  /** Pessoa aberta: diagnóstico nos 9 campos fixos, pasta, eventos, quadros e mídias. */
  abrir(u: AuthUser, id: string): Promise<RdvDetalhe> {
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      const diag = await this.diagnosticoAtual(tx, id);
      const { eventos, quadros } = await this.filhos(tx, id);
      const donos = [id, ...eventos.map((e) => e.id), ...quadros.map((q) => q.id)];
      const midias = await tx
        .select({
          id: mentoriaMidia.id,
          donoTipo: mentoriaMidia.donoTipo,
          donoId: mentoriaMidia.donoId,
          tipo: mentoriaMidia.tipo,
          urlVideo: mentoriaMidia.urlVideo,
          mime: mentoriaMidia.mime,
          tamanhoBytes: mentoriaMidia.tamanhoBytes,
        })
        .from(mentoriaMidia)
        .where(inArray(mentoriaMidia.donoId, donos))
        .orderBy(asc(mentoriaMidia.criadoEm), asc(mentoriaMidia.id));
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.open',
          entityType: 'rdv_pessoa',
          entityId: id,
          data: { fields: [] },
        },
        tx,
      );
      return {
        id,
        nome: p.nome,
        version: p.version,
        pessoaRef: p.pessoaRef,
        pastaUrl: p.pastaUrl,
        diagnostico: DIAGNOSTICO_CHAVES.map((k) => ({
          chave: k,
          rotulo: DIAGNOSTICO_ROTULOS[k],
          valor: diag[k],
        })),
        eventos,
        quadros,
        midias: midias as MidiaDTO[],
      };
    });
  }

  /** Nome, eventos (data e descrição) e itens de quadro (só descrição), com a version da pessoa. */
  atualizar(u: AuthUser, id: string, input: AtualizarRdv) {
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      const v = await this.travar(tx, id, input.version, u);
      if (input.nome !== undefined)
        await tx
          .update(mentoriaRdvPessoas)
          .set({ nome: input.nome, nomeNorm: nomeNormalizado(input.nome) })
          .where(eq(mentoriaRdvPessoas.id, id));
      for (const [eid, e] of Object.entries(input.eventos ?? {})) {
        const d = e.data === undefined ? undefined : parseData(e.data);
        const [ok] = await tx
          .update(mentoriaRdvEventos)
          .set({
            ...(d?.data && { dataTexto: d.texto, data: d.data }),
            ...(e.descricao !== undefined && {
              descricao: this.crypto.cifrarOpcional(
                e.descricao || null,
                aad('mentoria_rdv_eventos', 'descricao', eid),
              ),
            }),
            updatedBy: u.id,
            updatedAt: new Date(),
          })
          .where(and(eq(mentoriaRdvEventos.id, eid), eq(mentoriaRdvEventos.pessoaId, id)))
          .returning({ id: mentoriaRdvEventos.id });
        // Evento de outra pessoa (ou apagado): 404, e nada da edição fica gravado.
        if (!ok) throw new NotFoundException();
      }
      for (const [qid, q] of Object.entries(input.quadros ?? {})) {
        if (q.descricao === undefined) continue;
        const [ok] = await tx
          .update(mentoriaRdvQuadros)
          .set({
            descricao: this.crypto.cifrarOpcional(
              q.descricao || null,
              aad('mentoria_rdv_quadros', 'descricao', qid),
            ),
            updatedBy: u.id,
            updatedAt: new Date(),
          })
          .where(and(eq(mentoriaRdvQuadros.id, qid), eq(mentoriaRdvQuadros.pessoaId, id)))
          .returning({ id: mentoriaRdvQuadros.id });
        if (!ok) throw new NotFoundException();
      }
      await this.checarLimite(tx, id, input.nome ?? p.nome, null);
      return { id, version: v };
    }).catch((e) => erroDoBanco(e, NOME_RDV));
  }

  private async inserirEvento(
    tx: Tx,
    u: AuthUser,
    pessoaId: string,
    dataTexto: string,
    descricao: string,
    origem: 'MANUAL' | 'COLADO',
  ) {
    const d = parseData(dataTexto);
    if (!DATA_COMPLETA.test(d.texto) || !d.data) throw new BadRequestException(MSG_DATA_EVENTO);
    const eid = randomUUID();
    await tx.insert(mentoriaRdvEventos).values({
      id: eid,
      pessoaId,
      dataTexto: d.texto,
      data: d.data,
      descricao: this.crypto.cifrarOpcional(
        descricao || null,
        aad('mentoria_rdv_eventos', 'descricao', eid),
      ),
      origem,
      createdBy: u.id,
      updatedBy: u.id,
    });
    return eid;
  }

  private async inserirQuadro(
    tx: Tx,
    u: AuthUser,
    pessoaId: string,
    quadro: NovoQuadro['quadro'],
    dataTexto: string | undefined,
    descricao: string,
  ) {
    const d = parseData(dataTexto ?? '');
    if (d.texto && !d.data) throw new BadRequestException('Use MM/AAAA ou DD/MM/AAAA');
    const qid = randomUUID();
    await tx.insert(mentoriaRdvQuadros).values({
      id: qid,
      pessoaId,
      quadro,
      dataTexto: d.texto || null,
      data: d.data,
      descricao: this.crypto.cifrarOpcional(
        descricao || null,
        aad('mentoria_rdv_quadros', 'descricao', qid),
      ),
      createdBy: u.id,
      updatedBy: u.id,
    });
    return qid;
  }

  /** "Adicionar um evento": data obrigatória, sem data padrão (regra 4). */
  novoEvento(u: AuthUser, id: string, version: number, data: string, descricao: string) {
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      const v = await this.travar(tx, id, version, u);
      await this.checarLimite(tx, id, p.nome, [data, descricao]);
      const eid = await this.inserirEvento(tx, u, id, data, descricao, 'MANUAL');
      return { id: eid, version: v };
    }).catch((e) => erroDoBanco(e));
  }

  /** Item de quadro: data opcional (MM/AAAA ou DD/MM/AAAA), que não muda depois (D34). */
  novoQuadro(u: AuthUser, id: string, input: NovoQuadro) {
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      const v = await this.travar(tx, id, input.version, u);
      await this.checarLimite(tx, id, p.nome, [input.data, input.descricao]);
      const qid = await this.inserirQuadro(tx, u, id, input.quadro, input.data, input.descricao);
      return { id: qid, version: v };
    }).catch((e) => erroDoBanco(e));
  }

  /** Prévia de "Colar vários eventos": tipo por linha e a sugestão; nada é gravado (D22). */
  previaEventos(u: AuthUser, id: string, texto: string) {
    return withUser(this.db, u.id, async (tx) => {
      await this.existe(tx, id);
      return { linhas: parseEventosColados(texto) };
    });
  }

  /**
   * Grava a colagem escolhida na prévia: Evento (data obrigatória) ou item do quadro "Eventos
   * presenciais". Dúvida não chega aqui: fato ambíguo não vira registro. Tudo ou nada.
   */
  colarEventos(u: AuthUser, id: string, input: ColarEventos) {
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      const v = await this.travar(tx, id, input.version, u);
      await this.checarLimite(tx, id, p.nome, input.linhas);
      let eventos = 0;
      let quadros = 0;
      for (const l of input.linhas) {
        if (l.tipo === 'EVENTO') {
          await this.inserirEvento(tx, u, id, l.data, l.descricao, 'COLADO');
          eventos += 1;
        } else {
          await this.inserirQuadro(tx, u, id, 'EVENTOS_PRESENCIAIS', l.data, l.descricao);
          quadros += 1;
        }
      }
      return { id, version: v, eventos, quadros };
    }).catch((e) => erroDoBanco(e));
  }

  /** Prévia do diagnóstico colado (D30): "atual → novo" por campo. Não grava nem registra. */
  previaDiagnostico(u: AuthUser, id: string, texto: string): Promise<DiagnosticoPrevia> {
    return withUser(this.db, u.id, async (tx) => {
      await this.existe(tx, id);
      const atual = await this.diagnosticoAtual(tx, id);
      const { campos, desconhecidos } = parseDiagnostico(texto);
      return {
        campos: DIAGNOSTICO_CHAVES.filter((k) => campos[k] !== undefined).map((k) => ({
          chave: k,
          rotulo: DIAGNOSTICO_ROTULOS[k],
          atual: atual[k],
          novo: campos[k]!,
        })),
        faltam: DIAGNOSTICO_CHAVES.filter((k) => campos[k] === undefined).map(
          (k) => DIAGNOSTICO_ROTULOS[k],
        ),
        desconhecidos,
      };
    });
  }

  /** Grava o diagnóstico colado: só os rótulos reconhecidos mudam (mescla por campo, D30). */
  colarDiagnostico(u: AuthUser, id: string, version: number, texto: string) {
    const { campos } = parseDiagnostico(texto);
    const chaves = DIAGNOSTICO_CHAVES.filter((k) => campos[k] !== undefined);
    if (!chaves.length)
      throw new BadRequestException('Nenhum campo do diagnóstico reconhecido no texto colado');
    return withUser(this.db, u.id, async (tx) => {
      const p = await this.existe(tx, id);
      await this.checarLimite(tx, id, p.nome, Object.values(campos));
      const dados = Object.fromEntries(
        chaves.map((k) => [
          k,
          campos[k]
            ? this.crypto.cifrarTexto(campos[k], aad('mentoria_rdv_diagnostico', k, id))
            : null,
        ]),
      );
      const [r] = await tx.execute<{ v: number }>(
        sql`select mentoria_colar_diagnostico(${id}, ${version}, ${JSON.stringify(dados)}::jsonb) as v`,
      );
      // Só os nomes dos campos, nunca os valores.
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.paste_diagnostico',
          entityType: 'rdv_pessoa',
          entityId: id,
          data: { fields: chaves },
        },
        tx,
      );
      return { id, version: r!.v };
    }).catch((e) => erroDoBanco(e));
  }

  colarLink(u: AuthUser, id: string, version: number, url: string) {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx.execute<{ v: number }>(
        sql`select mentoria_colar_link_pasta(${id}, ${version}, ${url}) as v`,
      );
      return { id, version: r!.v };
    }).catch((e) => erroDoBanco(e));
  }

  /** Exportar PDF (D25): registra quem baixou, só com o id. */
  imprimir(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await this.existe(tx, id);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.print',
          entityType: 'rdv_pessoa',
          entityId: id,
          data: {},
        },
        tx,
      );
    });
  }
}
