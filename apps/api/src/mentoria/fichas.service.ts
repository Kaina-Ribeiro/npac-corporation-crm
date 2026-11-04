import { hkdfSync, randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  mentoriaConquistas,
  mentoriaFichaCampos,
  mentoriaFichas,
  mentoriaMidia,
  withUser,
  type Db,
} from '@npac/db';
import {
  EVOLUCAO_CHAVES,
  FICHA_CAMPO_ROTULO,
  nomeNormalizado,
  parseData,
  PILAR_CHAVES,
  type AuthUser,
  type CriarFicha,
  type FichaCampoChave,
  type FichaDetalhe,
  type FichaItem,
  type MidiaDTO,
} from '@npac/shared';
import { and, asc, eq, gt, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { CursorSigner } from './cursor.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

export const buscaFichas = z
  .object({ q: z.string().trim().max(200).optional(), cursor: z.string().max(400).optional() })
  .strict();
const PAGINA = 50;
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Linha do tempo (Módulo 2): lista A–Z, ficha aberta (auditada), cadastro manual e conquistas. */
@Injectable()
export class FichasService {
  private readonly cursor: CursorSigner;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly crypto: MentoriaCrypto,
    private readonly audit: AuditService,
  ) {
    const key = hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'npac:mentoria:cursor', 32);
    this.cursor = new CursorSigner(Buffer.from(key));
  }

  criar(u: AuthUser, input: CriarFicha) {
    const id = randomUUID();
    const d = parseData(input.dataInicio);
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .insert(mentoriaFichas)
        .values({
          id,
          nome: input.nome,
          nomeNorm: nomeNormalizado(input.nome),
          dataInicioTexto: d.texto || null,
          dataInicio: d.data,
          createdBy: u.id,
          updatedBy: u.id,
        })
        .returning({ id: mentoriaFichas.id, version: mentoriaFichas.version });
      return row!;
    }).catch((e) => erroDoBanco(e, 'Já existe uma ficha com este nome'));
  }

  /** Lista A–Z com busca por nome (POST). Sem auditoria (D35). */
  buscar(u: AuthUser, f: z.output<typeof buscaFichas>) {
    return withUser(this.db, u.id, async (tx) => {
      const where: SQL[] = [];
      if (f.q) where.push(ilike(mentoriaFichas.nomeNorm, `%${semCuringa(nomeNormalizado(f.q))}%`));
      const filtros = [...where];
      if (f.cursor) {
        const [ult] = await tx
          .select({ nomeNorm: mentoriaFichas.nomeNorm, id: mentoriaFichas.id })
          .from(mentoriaFichas)
          .where(eq(mentoriaFichas.id, this.cursor.verify(f.cursor)));
        if (ult)
          where.push(
            or(
              gt(mentoriaFichas.nomeNorm, ult.nomeNorm),
              and(eq(mentoriaFichas.nomeNorm, ult.nomeNorm), gt(mentoriaFichas.id, ult.id)),
            )!,
          );
      }
      const rows = await tx
        .select({
          id: mentoriaFichas.id,
          nome: mentoriaFichas.nome,
          dataInicioTexto: mentoriaFichas.dataInicioTexto,
          tempo: mentoriaFichas.tempoMentoriaTexto,
          conquistas: sql<number>`(select count(*)::int from mentoria_conquistas c where c.ficha_id = ${mentoriaFichas.id})`,
        })
        .from(mentoriaFichas)
        .where(where.length ? and(...where) : sql`true`)
        .orderBy(asc(mentoriaFichas.nomeNorm), asc(mentoriaFichas.id))
        .limit(PAGINA + 1);
      const itens: FichaItem[] = rows.slice(0, PAGINA).map((r) => ({
        id: r.id,
        nome: r.nome,
        dataInicioTexto: r.dataInicioTexto,
        tempoMentoria: this.crypto.decifrarOpcional(
          r.tempo,
          aad('mentoria_fichas', 'tempo_mentoria_texto', r.id),
        ),
        conquistas: r.conquistas,
      }));
      const ultimo = itens.at(-1);
      const [t] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(mentoriaFichas)
        .where(filtros.length ? and(...filtros) : sql`true`);
      return {
        itens,
        cursor: rows.length > PAGINA && ultimo ? this.cursor.sign(ultimo.id) : null,
        total: t?.n ?? 0,
      };
    });
  }

  /** Ficha aberta: textos decifrados, linhas fixas, conquistas em ordem (data, id), mídias. */
  abrir(u: AuthUser, id: string): Promise<FichaDetalhe> {
    return withUser(this.db, u.id, async (tx) => {
      const [f] = await tx.select().from(mentoriaFichas).where(eq(mentoriaFichas.id, id));
      if (!f) throw new NotFoundException();
      const campos = await tx
        .select()
        .from(mentoriaFichaCampos)
        .where(eq(mentoriaFichaCampos.fichaId, id));
      const conquistas = await tx
        .select()
        .from(mentoriaConquistas)
        .where(eq(mentoriaConquistas.fichaId, id))
        .orderBy(sql`${mentoriaConquistas.data} asc nulls last`, asc(mentoriaConquistas.id));
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
        .where(inArray(mentoriaMidia.donoId, [id, ...conquistas.map((c) => c.id)]))
        .orderBy(asc(mentoriaMidia.criadoEm), asc(mentoriaMidia.id));
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.open',
          entityType: 'ficha',
          entityId: id,
          data: { fields: [] },
        },
        tx,
      );
      const dec = (col: string, v: string | null) =>
        this.crypto.decifrarOpcional(v, aad('mentoria_fichas', col, id));
      const linha = (chave: FichaCampoChave) => {
        const c = campos.find((x) => x.chave === chave);
        return {
          chave,
          rotulo: FICHA_CAMPO_ROTULO[chave],
          antes: this.crypto.decifrarOpcional(
            c?.antes ?? null,
            aad('mentoria_ficha_campos', 'antes', id, chave),
          ),
          depois: this.crypto.decifrarOpcional(
            c?.depois ?? null,
            aad('mentoria_ficha_campos', 'depois', id, chave),
          ),
        };
      };
      return {
        id,
        nome: f.nome,
        dataInicioTexto: f.dataInicioTexto,
        notasMomentoInicial: dec('notas_momento_inicial', f.notasMomentoInicial),
        notasMomentoAtual: dec('notas_momento_atual', f.notasMomentoAtual),
        tempoMentoria: dec('tempo_mentoria_texto', f.tempoMentoriaTexto),
        version: f.version,
        pessoaRef: f.pessoaRef,
        pilares: PILAR_CHAVES.map(linha),
        evolucao: EVOLUCAO_CHAVES.map(linha),
        conquistas: conquistas.map((c) => ({
          id: c.id,
          data: c.dataTexto,
          descricao: this.crypto.decifrarOpcional(
            c.descricao,
            aad('mentoria_conquistas', 'descricao', c.id),
          ),
        })),
        midias: midias as MidiaDTO[],
      };
    });
  }

  /** Nova conquista vazia (a equipe preenche data e descrição na galeria). Sem data padrão. */
  novaConquista(u: AuthUser, fichaId: string, version: number) {
    return withUser(this.db, u.id, async (tx) => {
      // Filho usa a version do pai (D5): sobe a da ficha ou responde 409.
      const [r] = await tx
        .update(mentoriaFichas)
        .set({
          version: sql`${mentoriaFichas.version} + 1`,
          updatedBy: u.id,
          updatedAt: new Date(),
        })
        .where(and(eq(mentoriaFichas.id, fichaId), eq(mentoriaFichas.version, version)))
        .returning({ v: mentoriaFichas.version });
      if (!r) {
        const [existe] = await tx
          .select({ id: mentoriaFichas.id })
          .from(mentoriaFichas)
          .where(eq(mentoriaFichas.id, fichaId));
        throw existe ? conflitoDeVersao() : new NotFoundException();
      }
      const id = randomUUID();
      await tx.insert(mentoriaConquistas).values({ id, fichaId, createdBy: u.id, updatedBy: u.id });
      return { id, version: r.v };
    }).catch((e) => erroDoBanco(e));
  }
}
