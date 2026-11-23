import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Db, Tx } from '@npac/db';
import { CAMPOS_EVOLUCAO, legadoParaEvolucao } from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { COLUNA_EVOLUCAO } from './evolucao.service.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

/** Inscrições lidas por vez. */
const LOTE = 50;

type Pendente = { inscricao_id: string; dados: string };

/**
 * Cópia única dos textos do sistema antigo para a aba Evolução (NPAC-57, spec §6.4, "A, ao subir"). Roda ao subir a
 * API, sem pessoa logada: o banco só aceita as duas funções da cópia fora de sessão. Uma instância por vez
 * (`pg_try_advisory_xact_lock` a cada lote: sem a trava, sai); cada inscrição é conferida e travada de novo no banco,
 * que nunca sobrescreve campo escrito nem duplica conquista. Texto ilegível: loga só o id, pula e fica pendente para
 * a próxima subida. Log só com contagem e ids; a cópia não grava histórico.
 */
@Injectable()
export class EvolucaoLegado implements OnApplicationBootstrap {
  private readonly log = new Logger('EvolucaoLegado');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    // Nos testes roda sob demanda (`copiarPendentes`), como o worker da mídia.
    if (this.env.NODE_ENV === 'test') return;
    void this.copiarSemLancar();
  }

  /**
   * Depois de cada importação (a importação grava `mentoria_legado`): sem isso os textos só entravam na aba na
   * próxima subida da API. Nunca lança; se outra cópia estiver rodando, esta sai e o resto fica para a próxima.
   */
  copiarDepoisDeImportar(): Promise<void> {
    return this.copiarSemLancar();
  }

  private async copiarSemLancar(): Promise<void> {
    try {
      await this.copiarPendentes();
    } catch (e: unknown) {
      const codigo = (e as { code?: string })?.code ?? 'erro';
      this.log.error(`evolução: cópia do legado interrompida (${codigo})`);
    }
  }

  /** Copia o que falta e devolve quantas inscrições foram copiadas agora. */
  async copiarPendentes(): Promise<number> {
    let copiadas = 0;
    let depois: string | null = null;
    for (;;) {
      const lote = await this.db.transaction((tx) => this.copiarLote(tx, depois));
      if (!lote) break;
      copiadas += lote.copiadas;
      if (lote.lidas < LOTE) break;
      depois = lote.ultimo;
    }
    this.log.log(`evolução: ${copiadas} inscrições copiadas do legado`);
    return copiadas;
  }

  /** `null` = outra instância está copiando. */
  private async copiarLote(
    tx: Tx,
    depois: string | null,
  ): Promise<{ copiadas: number; lidas: number; ultimo: string | null } | null> {
    const [trava] = await tx.execute<{ ok: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtext('npac.mentoria_evolucao_legado')) as ok`,
    );
    if (!trava?.ok) return null;
    const pendentes = await tx.execute<Pendente>(
      sql`select inscricao_id, dados from mentoria_evolucao_legado_pendentes(${LOTE}, ${depois}::uuid)`,
    );
    let copiadas = 0;
    for (const p of pendentes) {
      const args = this.preparar(p);
      if (!args) continue;
      try {
        // Ponto de salvamento: erro numa inscrição não desfaz as outras do lote.
        const ok = await tx.transaction(async (sp) => {
          const [r] = await sp.execute<{ ok: boolean }>(sql`
            select mentoria_evolucao_legado_gravar(${p.inscricao_id}::uuid,
              ${args.campos[0]}, ${args.campos[1]}, ${args.campos[2]}, ${args.campos[3]},
              ${args.campos[4]}, ${args.campos[5]}, ${args.campos[6]}, ${args.campos[7]},
              ${args.conquistas}::jsonb) as ok`);
          return r?.ok === true;
        });
        if (ok) copiadas += 1;
      } catch {
        this.log.warn(`evolução: legado ilegível ${p.inscricao_id}`);
      }
    }
    return {
      copiadas,
      lidas: pendentes.length,
      ultimo: pendentes.at(-1)?.inscricao_id ?? null,
    };
  }

  /** Decifra o legado e cifra cada campo com o AAD da tabela nova. `null` = ilegível (logado). */
  private preparar(p: Pendente): { campos: (string | null)[]; conquistas: string } | null {
    const id = p.inscricao_id;
    try {
      const dados: unknown = JSON.parse(
        this.crypto.decifrarTexto(p.dados, aad('mentoria_legado', 'dados', id)),
      );
      const ev = legadoParaEvolucao(dados);
      const campos = CAMPOS_EVOLUCAO.map((c) =>
        this.crypto.cifrarOpcional(
          ev.campos[c] ?? null,
          aad('mentoria_evolucao', COLUNA_EVOLUCAO[c], id),
        ),
      );
      const conquistas = ev.conquistas.map((c) => {
        const cid = randomUUID();
        return {
          id: cid,
          data: c.data,
          descricao: this.crypto.cifrarOpcional(
            c.descricao,
            aad('mentoria_conquistas', 'descricao', cid),
          ),
        };
      });
      return { campos, conquistas: JSON.stringify(conquistas) };
    } catch {
      this.log.warn(`evolução: legado ilegível ${id}`);
      return null;
    }
  }
}
