import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { mentoriaCronogramaItens, withUser, type Db, type Tx } from '@npac/db';
import {
  BLOCOS,
  casarColunas,
  dicaDaDuvida,
  lerCronograma,
  LIMITE_TEXTO_ITEM,
  marcaPrimeiro,
  normalizarItem,
  numeroDaColuna,
  type AuthUser,
  type Bloco,
  type CasamentoColuna,
  type ColunaCronogramaPrevia,
  type ContagemCronograma,
  type FichaCronogramaImportacao,
  type ImportarCronograma,
  type InscricaoStatus,
  type MarcaColuna,
  type PlanilhaCronograma,
  type PreviaCronograma,
  type ResultadoCronograma,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { AuditService } from '../../audit/audit.service.js';
import { DB } from '../../common/db/db.module.js';
import { CiclosService, type ItemParaTarefa } from '../ciclos.service.js';
import { erroDoBanco } from '../erros.js';

export const SO_CSV = 'Baixe a aba CRONOGRAMA em CSV';

/** Uma inscrição como a importação precisa: nomes para casar, PME atual e o ciclo aberto (C8). */
type Ficha = FichaCronogramaImportacao & {
  tipo: 'INDIVIDUAL' | 'CASAL';
  nomes: string[];
  aberto: { id: string; numero: number; prazo: string; ordem: number } | null;
};

/** O que cada ficha recebe: tarefas do ciclo aberto e linhas do histórico da planilha. */
type Destino = {
  ficha: Ficha;
  tarefas: { linhaItem: number }[];
  anteriores: { linhaItem: number; pmeNumero: number | null; resultado: string }[];
};

type Plano = {
  planilha: PlanilhaCronograma;
  casamento: CasamentoColuna[];
  fichas: Map<string, Ficha>;
  escolha: Map<number, string | null>;
  /** Id do item já no banco por linha do arquivo; ausente = item novo. */
  existentes: Map<number, string>;
  destinos: Destino[];
  contagem: ContagemCronograma;
};

const chaveItem = (bloco: Bloco, texto: string) => `${bloco}:${normalizarItem(texto)}`;

/**
 * Importação única da planilha CRONOGRAMA (NPAC-60, fase 3; desenho §8, C8, C13–C15). A prévia e a
 * importação montam o mesmo plano; a importação o refaz dentro da transação e grava só o que falta.
 * Nomes das colunas só na resposta para a Admin; nada de nome em log ou auditoria.
 */
@Injectable()
export class CronogramaImportacaoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ciclos: CiclosService,
    private readonly audit: AuditService,
  ) {}

  /** C13: só o CSV da aba. Planilha do Excel (zip, começa com "PK") ou .xls/.xlsx: 400. */
  private ler(b: ImportarCronograma): PlanilhaCronograma {
    if (/\.xls[xm]?$/i.test(b.arquivo ?? '') || b.csv.startsWith('PK\u0003\u0004'))
      throw new BadRequestException(SO_CSV);
    const p = lerCronograma(b.csv);
    if (!p.itens.length || !p.colunas.length)
      throw new BadRequestException(`Não achei os blocos do cronograma neste arquivo. ${SO_CSV}`);
    const longo = p.itens.find((i) => i.texto.length > LIMITE_TEXTO_ITEM);
    if (longo)
      throw new BadRequestException(
        `O item da linha ${longo.linha} passa de ${LIMITE_TEXTO_ITEM} caracteres. Encurte na planilha.`,
      );
    return p;
  }

  /** Inscrições não anonimizadas que a Admin vê, com os nomes e o ciclo aberto. */
  private async fichas(tx: Tx): Promise<Map<string, Ficha>> {
    const linhas = await tx.execute<{
      id: string;
      tipo: 'INDIVIDUAL' | 'CASAL';
      mentoria: string;
      status: InscricaoStatus;
      nomes: string[];
      pme_atual: number | null;
      aberto_id: string | null;
      aberto_numero: number | null;
      aberto_prazo: string | null;
      aberto_ordem: number | null;
    }>(sql`
      select i.id, i.tipo, i.mentoria, i.status,
        array(select p.nome from mentoria_pessoas p where p.inscricao_id = i.id order by p.ordem) as nomes,
        (select max(c.numero)::int from mentoria_ciclos c where c.inscricao_id = i.id) as pme_atual,
        a.id as aberto_id, a.numero as aberto_numero, to_char(a.prazo, 'YYYY-MM-DD') as aberto_prazo,
        (select coalesce(max(t.ordem) + 1, 0)::int from mentoria_tarefas t where t.ciclo_id = a.id)
          as aberto_ordem
      from mentoria_inscricoes i
      left join lateral (
        select c.id, c.numero, c.prazo from mentoria_ciclos c
        where c.inscricao_id = i.id and c.concluido_em is null and c.nao_concluido_em is null
        order by c.numero desc limit 1
      ) a on true
      where exists (select 1 from mentoria_pessoas p
        where p.inscricao_id = i.id and p.nome_norm <> 'anonimizado')
      order by (select p.nome_norm from mentoria_pessoas p where p.inscricao_id = i.id
        order by p.ordem limit 1), i.criado_em, i.id`);
    return new Map(
      [...linhas].map((l): [string, Ficha] => [
        l.id,
        {
          id: l.id,
          nome: l.nomes.join(' e '),
          nomes: l.nomes,
          tipo: l.tipo,
          mentoria: l.mentoria,
          status: l.status,
          pmeAtual: l.pme_atual,
          aberto: l.aberto_id
            ? {
                id: l.aberto_id,
                numero: l.aberto_numero!,
                prazo: l.aberto_prazo!,
                ordem: l.aberto_ordem!,
              }
            : null,
        },
      ]),
    );
  }

  private async plano(tx: Tx, b: ImportarCronograma, planilha: PlanilhaCronograma) {
    const fichas = await this.fichas(tx);
    const casamento = casarColunas(planilha.colunas, [...fichas.values()]);

    // Escolha de cada coluna: a decisão da Admin vence; sem ela, só a coluna com uma candidata (C14).
    const indices = new Set(planilha.colunas.map((c) => c.indice));
    const escolha = new Map<number, string | null>();
    for (const c of casamento)
      escolha.set(c.indice, c.situacao === 'LIGADA' ? c.candidatas[0]! : null);
    for (const [k, v] of Object.entries(b.decisoes ?? {})) {
      const indice = Number(k);
      if (!indices.has(indice)) throw new BadRequestException('Coluna não encontrada no arquivo');
      if (v !== 'IGNORAR' && !fichas.has(v)) throw new BadRequestException('Ficha não encontrada');
      escolha.set(indice, v === 'IGNORAR' ? null : v);
    }

    const banco = await tx.execute<{ id: string; bloco: Bloco; texto_norm: string }>(
      sql`select id, bloco, texto_norm from mentoria_cronograma_itens`,
    );
    const porChave = new Map([...banco].map((i) => [`${i.bloco}:${i.texto_norm}`, i.id]));
    const existentes = new Map<number, string>();
    for (const i of planilha.itens) {
      const id = porChave.get(chaveItem(i.bloco, i.texto));
      if (id) existentes.set(i.linha, id);
    }

    // Duas colunas na mesma ficha juntam (C15): fica o "já tinha" e depois o menor mês.
    const porFicha = new Map<string, Map<number, MarcaColuna>>();
    for (const c of planilha.colunas) {
      const id = escolha.get(c.indice);
      if (!id) continue;
      const m = porFicha.get(id) ?? new Map<number, MarcaColuna>();
      porFicha.set(id, m);
      for (const x of c.marcas) {
        const ja = m.get(x.linhaItem);
        m.set(x.linhaItem, ja ? marcaPrimeiro(ja, x) : x);
      }
    }

    // Só acrescenta: item que a ficha já tem (tarefa do PME ou linha da planilha) fica como está.
    const ids = [...porFicha.keys()];
    const jaTem = new Set<string>();
    if (ids.length)
      for (const r of await tx.execute<{ inscricao_id: string; item_id: string }>(sql`
        select t.inscricao_id, t.cronograma_item_id as item_id from mentoria_tarefas t
        where t.inscricao_id = any (${sql.param(ids)}::uuid[]) and t.cronograma_item_id is not null
        union
        select x.inscricao_id, x.item_id from mentoria_cronograma_anteriores x
        where x.inscricao_id = any (${sql.param(ids)}::uuid[])`))
        jaTem.add(`${r.inscricao_id}:${r.item_id}`);

    const contagem: ContagemCronograma = {
      tarefas: 0,
      recebidos: 0,
      planejados: 0,
      jaTinha: 0,
      naoFez: 0,
    };
    const destinos: Destino[] = [];
    for (const [id, marcas] of porFicha) {
      const ficha = fichas.get(id)!;
      const d: Destino = { ficha, tarefas: [], anteriores: [] };
      for (const m of [...marcas.values()].sort((a, z) => a.linhaItem - z.linhaItem)) {
        const item = existentes.get(m.linhaItem);
        if (item && jaTem.has(`${id}:${item}`)) continue;
        const n = ficha.aberto?.numero;
        // C8: com o ciclo aberto Nº N, o mês N vira tarefa dele; antes, recebido; depois, planejado.
        if (m.resultado === 'RECEBIDO' && n !== undefined && m.pmeNumero === n) {
          d.tarefas.push({ linhaItem: m.linhaItem });
          contagem.tarefas += 1;
          continue;
        }
        const resultado =
          m.resultado === 'RECEBIDO' && n !== undefined && m.pmeNumero! > n
            ? 'PLANEJADO'
            : m.resultado;
        d.anteriores.push({ linhaItem: m.linhaItem, pmeNumero: m.pmeNumero, resultado });
        if (resultado === 'PLANEJADO') contagem.planejados += 1;
        else if (resultado === 'JA_TINHA') contagem.jaTinha += 1;
        else if (resultado === 'NAO_FEZ') contagem.naoFez += 1;
        else contagem.recebidos += 1;
      }
      destinos.push(d);
    }
    return { planilha, casamento, fichas, escolha, existentes, destinos, contagem } satisfies Plano;
  }

  private resumoFicha = (f: Ficha): FichaCronogramaImportacao => ({
    id: f.id,
    nome: f.nome,
    mentoria: f.mentoria,
    status: f.status,
    pmeAtual: f.pmeAtual,
  });

  async previa(u: AuthUser, b: ImportarCronograma): Promise<PreviaCronograma> {
    const planilha = this.ler(b);
    const pl = await withUser(this.db, u.id, (tx) => this.plano(tx, b, planilha));
    const colunas = pl.planilha.colunas.map((c, k): ColunaCronogramaPrevia => {
      const m = pl.casamento[k]!;
      const candidatas = m.candidatas.map((id) => pl.fichas.get(id)!);
      return {
        indice: c.indice,
        coluna: numeroDaColuna(c.indice),
        nome: c.cabecalho,
        situacao: m.situacao,
        marcas: c.marcas.length,
        maiorMes: m.maiorMes,
        candidatas: candidatas.map(this.resumoFicha),
        dica: m.situacao === 'DUVIDA' ? dicaDaDuvida(m.maiorMes, candidatas) : null,
        inscricaoId: pl.escolha.get(c.indice) ?? null,
      };
    });
    const porFicha = new Map<string, number[]>();
    for (const c of colunas)
      if (c.inscricaoId && c.marcas)
        porFicha.set(c.inscricaoId, [...(porFicha.get(c.inscricaoId) ?? []), c.coluna]);
    return {
      ...pl.contagem,
      itens: BLOCOS.map((bloco) => {
        const doBloco = pl.planilha.itens.filter((i) => i.bloco === bloco);
        const existentes = doBloco.filter((i) => pl.existentes.has(i.linha)).length;
        return {
          bloco,
          novos: doBloco.length - existentes,
          existentes,
          juntados: pl.planilha.juntados[bloco],
        };
      }),
      colunas,
      ligadas: colunas.filter((c) => c.inscricaoId && c.marcas).length,
      ignoradas: pl.planilha.ignoradasPorMotivo,
      mesmaFicha: [...porFicha]
        .filter(([, cs]) => cs.length > 1)
        .map(([inscricaoId, cs]) => ({
          inscricaoId,
          nome: pl.fichas.get(inscricaoId)!.nome,
          colunas: cs,
        })),
      fichas: [...pl.fichas.values()].map(this.resumoFicha),
    };
  }

  /** Uma transação: itens novos no banco, histórico da planilha e tarefas do PME em andamento. */
  async importar(u: AuthUser, b: ImportarCronograma): Promise<ResultadoCronograma> {
    const planilha = this.ler(b);
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('mentoria_cronograma_importacao'))`,
      );
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mentoria_cronograma_itens'))`);
      // Itens novos primeiro, na ordem do arquivo, depois dos que o bloco já tem.
      const antes = await this.plano(tx, b, planilha);
      const faltam = planilha.itens.filter((i) => !antes.existentes.has(i.linha));
      let itens = 0;
      for (const bloco of BLOCOS) {
        const doBloco = faltam.filter((i) => i.bloco === bloco);
        if (!doBloco.length) continue;
        const [m] = await tx.execute<{ max: number }>(sql`
          select coalesce(max(ordem), 0)::int as max from mentoria_cronograma_itens
          where bloco = ${bloco}`);
        const r = await tx
          .insert(mentoriaCronogramaItens)
          .values(
            doBloco.map((i, k) => ({
              bloco,
              texto: i.texto,
              textoNorm: normalizarItem(i.texto),
              ordem: m!.max + k + 1,
              criadoPor: u.id,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: mentoriaCronogramaItens.id });
        itens += r.length;
      }
      const pl = itens ? await this.plano(tx, b, planilha) : antes;
      const texto = new Map(planilha.itens.map((i) => [i.linha, i]));

      let colunas = 0;
      for (const d of pl.destinos) {
        if (!d.tarefas.length && !d.anteriores.length) continue;
        colunas += 1;
        if (d.anteriores.length)
          await tx.execute(sql`select mentoria_cronograma_importar(${d.ficha.id}::uuid,
            ${sql.param(d.anteriores.map((a) => pl.existentes.get(a.linhaItem)!))}::uuid[],
            ${sql.param(d.anteriores.map((a) => a.pmeNumero))}::smallint[],
            ${sql.param(d.anteriores.map((a) => a.resultado))}::text[])`);
        if (d.tarefas.length && d.ficha.aberto)
          await this.ciclos.inserirCronograma(
            tx,
            d.ficha.id,
            { id: d.ficha.aberto.id, prazo: d.ficha.aberto.prazo },
            d.tarefas.map((t): ItemParaTarefa => {
              const i = texto.get(t.linhaItem)!;
              return { bloco: i.bloco, itemId: pl.existentes.get(t.linhaItem)!, texto: i.texto };
            }),
            d.ficha.aberto.ordem,
          );
      }
      const resultado: ResultadoCronograma = { ...pl.contagem, itens, colunas };
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.cronograma_importado',
          entityType: 'mentoria_cronograma',
          data: { ...resultado },
        },
        tx,
      );
      return resultado;
    }).catch((e) => erroDoBanco(e));
  }
}
