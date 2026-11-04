import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  mentoriaConquistas,
  mentoriaFichaCampos,
  mentoriaFichas,
  mentoriaMentorados,
  mentoriaMidia,
  mentoriaRdvDiagnostico,
  mentoriaRdvDuvidas,
  mentoriaRdvEventos,
  mentoriaRdvPessoas,
  mentoriaRdvQuadros,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  backupSchema,
  classificarNomes,
  DIAGNOSTICO_CHAVES,
  FICHA_CAMPO_CHAVES,
  FORMATO_BACKUP,
  linkPermitido,
  MENTORADO_STATUS,
  nomeNormalizado,
  parseColaPlanilha,
  parseData,
  secaoDoCampo,
  type AuthUser,
  type BackupJson,
  type FichaCampoChave,
  type LinhaPlanilha,
  type Modulo,
  type RegistroDashboard,
  type RegistroFicha,
  type RegistroRdv,
} from '@npac/shared';
import { asc, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco } from './erros.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

/** Limite do PDF: 25.000 registros no total, somando os três módulos. */
export const LIMITE_REGISTROS = 25_000;
const ARQUIVOS = ['FOTO', 'VIDEO', 'PDF'];

export const entradaImportacao = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('planilha'),
      texto: z.string().max(5_000_000),
      escolhas: z
        .record(
          z.string().regex(/^\d{1,6}$/),
          z
            .object({
              status: z.enum(MENTORADO_STATUS).optional(),
              tipoMentoria: z.string().trim().min(1).max(200).optional(),
            })
            .strict(),
        )
        .optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('json'), arquivo: z.unknown() }).strict(),
]);
export type EntradaImportacao = z.output<typeof entradaImportacao>;

type Plano =
  | {
      modulo: 'dashboard';
      tipo: 'planilha';
      linhas: LinhaPlanilha[];
      pendentes: { linha: number; faltando: string[] }[];
      invalidas: number[];
    }
  | { modulo: Modulo; tipo: 'json'; arquivo: BackupJson };

const nomesDe = (p: Plano): string[] =>
  p.tipo === 'planilha' ? p.linhas.map((l) => l.nome) : p.arquivo.registros.map((r) => r.nome);

/** Mídia que não volta: arquivo (fica fora do `.json`) ou link fora da allowlist (D38, D42). */
function midiasNaoRecuperadas(p: Plano): number {
  if (p.tipo !== 'json' || p.arquivo.modulo === 'dashboard') return 0;
  return (p.arquivo.registros as (RegistroFicha | RegistroRdv)[])
    .flatMap((r) => r.midias)
    .filter((m) => ARQUIVOS.includes(m.tipo) || !m.urlVideo || !linkPermitido(m.urlVideo)).length;
}

@Injectable()
export class ImportService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly audit: AuditService,
  ) {}

  private planejar(modulo: Modulo, e: EntradaImportacao): Plano {
    if (e.tipo === 'planilha') {
      if (modulo !== 'dashboard')
        throw new BadRequestException('Este módulo importa só o .json de backup');
      return { modulo, tipo: 'planilha', ...parseColaPlanilha(e.texto) };
    }
    const r = backupSchema.safeParse(e.arquivo);
    if (!r.success || r.data.modulo !== modulo || r.data.formato !== FORMATO_BACKUP)
      throw new BadRequestException('O arquivo .json não é um backup deste módulo');
    return { modulo, tipo: 'json', arquivo: r.data };
  }

  private async nomesNaBase(tx: Tx, modulo: Modulo): Promise<Set<string>> {
    const tabela =
      modulo === 'dashboard'
        ? mentoriaMentorados
        : modulo === 'linha-do-tempo'
          ? mentoriaFichas
          : mentoriaRdvPessoas;
    const rows = await tx.select({ n: tabela.nomeNorm }).from(tabela);
    return new Set(rows.map((r) => r.n));
  }

  /** Prévia (só SELECT): contagens e índices, nunca nomes. */
  previa(u: AuthUser, modulo: Modulo, e: EntradaImportacao) {
    const plano = this.planejar(modulo, e);
    return withUser(this.db, u.id, async (tx) => {
      const c = classificarNomes(await this.nomesNaBase(tx, modulo), nomesDe(plano));
      return {
        linhas: nomesDe(plano).length,
        entram: c.novos.length,
        jaExistem: c.jaExistem.length,
        repetidos: c.repetidos.length,
        pendentes: plano.tipo === 'planilha' ? plano.pendentes : [],
        invalidas: plano.tipo === 'planilha' ? plano.invalidas : [],
        midiasNaoRecuperadas: midiasNaoRecuperadas(plano),
      };
    });
  }

  /** Importa numa transação só os novos (regra 8). Base vazia + `.json` = restauração com ids (D41). */
  importar(u: AuthUser, modulo: Modulo, e: EntradaImportacao) {
    const plano = this.planejar(modulo, e);
    return withUser(this.db, u.id, async (tx) => {
      const base = await this.nomesNaBase(tx, modulo);
      const c = classificarNomes(base, nomesDe(plano));
      if (plano.tipo === 'json' && c.repetidos.length)
        throw new BadRequestException({
          message: 'O arquivo tem nomes repetidos; nada foi gravado',
          repetidos: c.repetidos,
        });
      const [total] = await tx.execute<{ n: number }>(sql`select
        (select count(*) from mentoria_mentorados) + (select count(*) from mentoria_fichas)
        + (select count(*) from mentoria_rdv_pessoas) as n`);
      if (Number(total?.n ?? 0) + c.novos.length > LIMITE_REGISTROS)
        throw new BadRequestException('A importação passaria do limite de 25.000 registros');

      const restaurar = base.size === 0;
      const novoId = (id: string) => (restaurar ? id : randomUUID());
      if (plano.tipo === 'planilha') {
        const linhas = c.novos.map((i) => plano.linhas[i]!);
        await this.gravarPlanilha(tx, u, linhas, e.tipo === 'planilha' ? (e.escolhas ?? {}) : {});
      } else if (plano.arquivo.modulo === 'dashboard') {
        const regs = c.novos.map((i) => plano.arquivo.registros[i] as RegistroDashboard);
        await this.gravarDashboardJson(tx, u, regs, novoId);
      } else if (plano.arquivo.modulo === 'linha-do-tempo') {
        for (const i of c.novos)
          await this.gravarFicha(tx, u, plano.arquivo.registros[i] as RegistroFicha, novoId);
      } else {
        for (const i of c.novos)
          await this.gravarRdv(tx, u, plano.arquivo.registros[i] as RegistroRdv, novoId);
      }
      const resultado = {
        gravados: c.novos.length,
        ignorados: c.jaExistem.length + c.repetidos.length,
        midiasNaoRecuperadas: midiasNaoRecuperadas(plano),
      };
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.import',
          entityType: 'modulo',
          data: {
            modulo,
            tipo: plano.tipo,
            gravados: resultado.gravados,
            ignorados: resultado.ignorados,
          },
        },
        tx,
      );
      return resultado;
    }).catch((err) => erroDoBanco(err));
  }

  private async gravarPlanilha(
    tx: Tx,
    u: AuthUser,
    linhas: LinhaPlanilha[],
    escolhas: Record<string, { status?: (typeof MENTORADO_STATUS)[number]; tipoMentoria?: string }>,
  ) {
    const valores = linhas.map((l) => {
      const esc = escolhas[String(l.linha)] ?? {};
      const status = l.status ?? esc.status;
      const tipoMentoria = l.tipoMentoria ?? esc.tipoMentoria;
      if (!status || !tipoMentoria)
        throw new BadRequestException(
          'Escolha o status ou o tipo de mentoria de cada linha marcada',
        );
      const d = parseData(l.dataEntrada ?? '');
      return {
        nome: l.nome,
        nomeNorm: nomeNormalizado(l.nome),
        tipoCadastro: l.tipoCadastro,
        tipoMentoria,
        dataEntradaTexto: d.texto || null,
        dataEntrada: d.data,
        status,
        createdBy: u.id,
        updatedBy: u.id,
      };
    });
    if (valores.length) await tx.insert(mentoriaMentorados).values(valores);
  }

  private async gravarDashboardJson(
    tx: Tx,
    u: AuthUser,
    regs: RegistroDashboard[],
    novoId: (id: string) => string,
  ) {
    if (!regs.length) return;
    await tx.insert(mentoriaMentorados).values(
      regs.map((r) => {
        const d = parseData(r.dataEntrada ?? '');
        return {
          id: novoId(r.id),
          nome: r.nome.trim(),
          nomeNorm: nomeNormalizado(r.nome),
          tipoCadastro: r.tipoCadastro ?? null,
          tipoMentoria: r.tipoMentoria ?? null,
          dataEntradaTexto: d.texto || null,
          dataEntrada: d.data,
          status: r.status,
          createdBy: u.id,
          updatedBy: u.id,
        };
      }),
    );
  }

  private async gravarLinks(
    tx: Tx,
    u: AuthUser,
    midias: RegistroFicha['midias'],
    ids: Map<string, string>,
  ) {
    const links = midias.filter(
      (m) =>
        m.tipo === 'LINK_VIDEO' && m.urlVideo && linkPermitido(m.urlVideo) && ids.has(m.donoId),
    );
    if (links.length)
      await tx
        .insert(mentoriaMidia)
        .values(
          links.map((m) => ({
            donoTipo: m.donoTipo,
            donoId: ids.get(m.donoId)!,
            tipo: 'LINK_VIDEO',
            urlVideo: m.urlVideo!,
            criadoPor: u.id,
          })),
        );
  }

  private async gravarFicha(tx: Tx, u: AuthUser, r: RegistroFicha, novoId: (id: string) => string) {
    const id = novoId(r.id);
    const ids = new Map([[r.id, id]]);
    const cif = (col: string, v: string | null | undefined) =>
      this.crypto.cifrarOpcional(v ?? null, aad('mentoria_fichas', col, id));
    const d = parseData(r.dataInicio ?? '');
    await tx.insert(mentoriaFichas).values({
      id,
      nome: r.nome.trim(),
      nomeNorm: nomeNormalizado(r.nome),
      dataInicioTexto: d.texto || null,
      dataInicio: d.data,
      notasMomentoInicial: cif('notas_momento_inicial', r.notasMomentoInicial),
      notasMomentoAtual: cif('notas_momento_atual', r.notasMomentoAtual),
      tempoMentoriaTexto: cif('tempo_mentoria_texto', r.tempoMentoria),
      createdBy: u.id,
      updatedBy: u.id,
    });
    const campos = Object.entries(r.campos) as [
      FichaCampoChave,
      { antes?: string | null; depois?: string | null },
    ][];
    if (campos.length)
      await tx.insert(mentoriaFichaCampos).values(
        campos.map(([chave, v]) => ({
          fichaId: id,
          secao: secaoDoCampo(chave),
          chave,
          antes: this.crypto.cifrarOpcional(
            v.antes ?? null,
            aad('mentoria_ficha_campos', 'antes', id, chave),
          ),
          depois: this.crypto.cifrarOpcional(
            v.depois ?? null,
            aad('mentoria_ficha_campos', 'depois', id, chave),
          ),
          updatedBy: u.id,
        })),
      );
    for (const c of r.conquistas) {
      const cid = novoId(c.id);
      ids.set(c.id, cid);
      const dc = parseData(c.data ?? '');
      await tx.insert(mentoriaConquistas).values({
        id: cid,
        fichaId: id,
        dataTexto: dc.texto || null,
        data: dc.data,
        descricao: this.crypto.cifrarOpcional(
          c.descricao ?? null,
          aad('mentoria_conquistas', 'descricao', cid),
        ),
        createdBy: u.id,
        updatedBy: u.id,
      });
    }
    await this.gravarLinks(tx, u, r.midias, ids);
  }

  private async gravarRdv(tx: Tx, u: AuthUser, r: RegistroRdv, novoId: (id: string) => string) {
    const id = novoId(r.id);
    const ids = new Map([[r.id, id]]);
    const pasta = r.pastaUrl && linkPermitido(r.pastaUrl) ? r.pastaUrl : null;
    await tx.insert(mentoriaRdvPessoas).values({
      id,
      nome: r.nome.trim(),
      nomeNorm: nomeNormalizado(r.nome),
      pastaUrl: pasta,
      pastaColadaEm: pasta ? new Date() : null,
      createdBy: u.id,
      updatedBy: u.id,
    });
    const diag = Object.fromEntries(
      Object.entries(r.diagnostico)
        .filter(([, v]) => v != null)
        .map(([k, v]) => [k, this.crypto.cifrarTexto(v!, aad('mentoria_rdv_diagnostico', k, id))]),
    );
    // Diagnóstico só entra pela função (campo de fonte): a pessoa acabou de nascer na version 1.
    if (Object.keys(diag).length)
      await tx.execute(
        sql`select mentoria_colar_diagnostico(${id}, 1, ${JSON.stringify(diag)}::jsonb)`,
      );
    for (const ev of r.eventos) {
      const eid = novoId(ev.id);
      ids.set(ev.id, eid);
      const d = parseData(ev.data);
      if (!d.data) throw new BadRequestException('Evento sem data válida no arquivo (DD/MM/AAAA)');
      await tx.insert(mentoriaRdvEventos).values({
        id: eid,
        pessoaId: id,
        dataTexto: d.texto,
        data: d.data,
        descricao: this.crypto.cifrarOpcional(
          ev.descricao ?? null,
          aad('mentoria_rdv_eventos', 'descricao', eid),
        ),
        origem: ev.origem,
        checklistItem: ev.checklistItem ?? null,
        createdBy: u.id,
        updatedBy: u.id,
      });
    }
    for (const du of r.duvidas) {
      const did = novoId(du.id);
      await tx.insert(mentoriaRdvDuvidas).values({
        id: did,
        pessoaId: id,
        texto: this.crypto.cifrarOpcional(
          du.texto ?? null,
          aad('mentoria_rdv_duvidas', 'texto', did),
        ),
        status: du.status,
        resolvidaEm: du.status === 'ABERTA' ? null : new Date(),
        resolvidaPor: du.status === 'ABERTA' ? null : u.id,
        createdBy: u.id,
        updatedBy: u.id,
      });
    }
    for (const q of r.quadros) {
      const qid = novoId(q.id);
      ids.set(q.id, qid);
      const d = parseData(q.data ?? '');
      await tx.insert(mentoriaRdvQuadros).values({
        id: qid,
        pessoaId: id,
        quadro: q.quadro,
        dataTexto: d.texto || null,
        data: d.data,
        descricao: this.crypto.cifrarOpcional(
          q.descricao ?? null,
          aad('mentoria_rdv_quadros', 'descricao', qid),
        ),
        createdBy: u.id,
        updatedBy: u.id,
      });
    }
    await this.gravarLinks(tx, u, r.midias, ids);
  }

  /** `.json` oficial do módulo (D6), com os textos em claro. Audita só a contagem. */
  exportar(u: AuthUser, modulo: Modulo): Promise<BackupJson> {
    return withUser(this.db, u.id, async (tx) => {
      const exportadoEm = new Date().toISOString();
      const cab = { formato: FORMATO_BACKUP, versao: 1, exportadoEm } as const;
      let arquivo: BackupJson;
      if (modulo === 'dashboard') {
        const rows = await tx
          .select()
          .from(mentoriaMentorados)
          .orderBy(asc(mentoriaMentorados.nomeNorm));
        arquivo = {
          ...cab,
          modulo,
          registros: rows.map((r) => ({
            id: r.id,
            nome: r.nome,
            tipoCadastro: r.tipoCadastro,
            tipoMentoria: r.tipoMentoria,
            dataEntrada: r.dataEntradaTexto,
            status: r.status as RegistroDashboard['status'],
          })),
        };
      } else if (modulo === 'linha-do-tempo') {
        arquivo = { ...cab, modulo, registros: await this.exportarFichas(tx) };
      } else {
        arquivo = { ...cab, modulo, registros: await this.exportarRdv(tx) };
      }
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.export',
          entityType: 'modulo',
          data: { modulo, registros: arquivo.registros.length },
        },
        tx,
      );
      return arquivo;
    });
  }

  private async midiasDe(tx: Tx, donos: string[]) {
    if (!donos.length) return [];
    return tx
      .select({
        donoTipo: mentoriaMidia.donoTipo,
        donoId: mentoriaMidia.donoId,
        tipo: mentoriaMidia.tipo,
        urlVideo: mentoriaMidia.urlVideo,
      })
      .from(mentoriaMidia)
      .where(inArray(mentoriaMidia.donoId, donos))
      .orderBy(asc(mentoriaMidia.criadoEm), asc(mentoriaMidia.id));
  }

  private async exportarFichas(tx: Tx): Promise<RegistroFicha[]> {
    const fichas = await tx.select().from(mentoriaFichas).orderBy(asc(mentoriaFichas.nomeNorm));
    const campos = await tx.select().from(mentoriaFichaCampos);
    const conquistas = await tx
      .select()
      .from(mentoriaConquistas)
      .orderBy(sql`${mentoriaConquistas.data} asc nulls last`, asc(mentoriaConquistas.id));
    const out: RegistroFicha[] = [];
    for (const f of fichas) {
      const dec = (col: string, v: string | null) =>
        this.crypto.decifrarOpcional(v, aad('mentoria_fichas', col, f.id));
      const minhas = conquistas.filter((c) => c.fichaId === f.id);
      const midias = await this.midiasDe(tx, [f.id, ...minhas.map((c) => c.id)]);
      out.push({
        id: f.id,
        nome: f.nome,
        dataInicio: f.dataInicioTexto,
        notasMomentoInicial: dec('notas_momento_inicial', f.notasMomentoInicial),
        notasMomentoAtual: dec('notas_momento_atual', f.notasMomentoAtual),
        tempoMentoria: dec('tempo_mentoria_texto', f.tempoMentoriaTexto),
        campos: Object.fromEntries(
          campos
            .filter((c) => c.fichaId === f.id)
            .sort(
              (a, b) =>
                FICHA_CAMPO_CHAVES.indexOf(a.chave as FichaCampoChave) -
                FICHA_CAMPO_CHAVES.indexOf(b.chave as FichaCampoChave),
            )
            .map((c) => [
              c.chave,
              {
                antes: this.crypto.decifrarOpcional(
                  c.antes,
                  aad('mentoria_ficha_campos', 'antes', f.id, c.chave),
                ),
                depois: this.crypto.decifrarOpcional(
                  c.depois,
                  aad('mentoria_ficha_campos', 'depois', f.id, c.chave),
                ),
              },
            ]),
        ),
        conquistas: minhas.map((c) => ({
          id: c.id,
          data: c.dataTexto,
          descricao: this.crypto.decifrarOpcional(
            c.descricao,
            aad('mentoria_conquistas', 'descricao', c.id),
          ),
        })),
        midias: midias as RegistroFicha['midias'],
      });
    }
    return out;
  }

  private async exportarRdv(tx: Tx): Promise<RegistroRdv[]> {
    const pessoas = await tx
      .select()
      .from(mentoriaRdvPessoas)
      .orderBy(asc(mentoriaRdvPessoas.nomeNorm));
    const diags = await tx.select().from(mentoriaRdvDiagnostico);
    const eventos = await tx
      .select()
      .from(mentoriaRdvEventos)
      .orderBy(asc(mentoriaRdvEventos.data), asc(mentoriaRdvEventos.id));
    const duvidas = await tx
      .select()
      .from(mentoriaRdvDuvidas)
      .orderBy(asc(mentoriaRdvDuvidas.createdAt), asc(mentoriaRdvDuvidas.id));
    const quadros = await tx
      .select()
      .from(mentoriaRdvQuadros)
      .orderBy(sql`${mentoriaRdvQuadros.data} asc nulls last`, asc(mentoriaRdvQuadros.id));
    const out: RegistroRdv[] = [];
    for (const p of pessoas) {
      const d = diags.find((x) => x.pessoaId === p.id) as Record<string, unknown> | undefined;
      const diagnostico: RegistroRdv['diagnostico'] = {};
      if (d)
        for (const k of DIAGNOSTICO_CHAVES) {
          const camel = k.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
          const v = d[camel] as string | null;
          if (v != null)
            diagnostico[k] = this.crypto.decifrarTexto(v, aad('mentoria_rdv_diagnostico', k, p.id));
        }
      const evs = eventos.filter((e) => e.pessoaId === p.id);
      const qs = quadros.filter((q) => q.pessoaId === p.id);
      out.push({
        id: p.id,
        nome: p.nome,
        pastaUrl: p.pastaUrl,
        diagnostico,
        eventos: evs.map((e) => ({
          id: e.id,
          data: e.dataTexto,
          descricao: this.crypto.decifrarOpcional(
            e.descricao,
            aad('mentoria_rdv_eventos', 'descricao', e.id),
          ),
          origem: e.origem as 'MANUAL',
          checklistItem: e.checklistItem,
        })),
        duvidas: duvidas
          .filter((x) => x.pessoaId === p.id)
          .map((x) => ({
            id: x.id,
            texto: this.crypto.decifrarOpcional(
              x.texto,
              aad('mentoria_rdv_duvidas', 'texto', x.id),
            ),
            status: x.status as 'ABERTA',
          })),
        quadros: qs.map((q) => ({
          id: q.id,
          quadro: q.quadro as 'IMOVEL_LEILAO',
          data: q.dataTexto,
          descricao: this.crypto.decifrarOpcional(
            q.descricao,
            aad('mentoria_rdv_quadros', 'descricao', q.id),
          ),
        })),
        midias: (await this.midiasDe(tx, [
          p.id,
          ...evs.map((e) => e.id),
          ...qs.map((q) => q.id),
        ])) as RegistroRdv['midias'],
      });
    }
    return out;
  }
}
