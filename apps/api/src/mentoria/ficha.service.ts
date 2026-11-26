import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  mentoriaAnotacoes,
  mentoriaAvaliacoes,
  mentoriaEnderecos,
  mentoriaEnviosFisicos,
  mentoriaHistorico,
  mentoriaInscricoes,
  mentoriaMomentoInicial,
  mentoriaOnboardingEtapas,
  mentoriaPausas,
  mentoriaPessoas,
  mentoriaRenovacoes,
  user,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  ETAPAS,
  type AuthUser,
  type AvaliacaoDTO,
  type AvaliacaoPut,
  type CaixaDTO,
  type EnderecoDTO,
  type EnderecoPut,
  type Etapa,
  type EtapaDTO,
  type FichaDTO,
  type HistoricoItem,
  MOMENTO_TEXTOS,
  type MomentoDTO,
  type MomentoPut,
  type MomentoTexto,
  type PessoaDTO,
  type RenovacaoDTO,
  STATUS_QUE_RENOVA,
} from '@npac/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { CheckinsService } from './checkins.service.js';
import { CiclosService, POR_REUNIAO } from './ciclos.service.js';
import { MetasService } from './metas.service.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { PlanoService } from './plano.service.js';
import { ReunioesService } from './reunioes.service.js';

const LIMITE_HISTORICO = 200;

/** Coluna de cada texto do Momento inicial; vai no AAD, como dor, sonho e meta desde a 0045. */
const COLUNA_TEXTO: Record<MomentoTexto, string> = {
  dor: 'dor',
  sonho: 'sonho',
  meta: 'meta',
  idade: 'idade',
  parceiroNome: 'parceiro_nome',
  filho1: 'filho_1',
  filho2: 'filho_2',
  trabalho: 'trabalho',
  bem1: 'bem_1',
  bem2: 'bem_2',
  investimento1: 'investimento_1',
  investimento2: 'investimento_2',
  divida1: 'divida_1',
  divida2: 'divida_2',
  divida3: 'divida_3',
  buscouAjuda: 'buscou_ajuda',
  anotacoes: 'anotacoes',
};
const ehTexto = (k: string): k is MomentoTexto => (MOMENTO_TEXTOS as readonly string[]).includes(k);
const VALORES_DIVIDA = ['divida1Centavos', 'divida2Centavos', 'divida3Centavos'];

@Injectable()
export class FichaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly plano: PlanoService,
    private readonly reunioes: ReunioesService,
    private readonly ciclos: CiclosService,
    private readonly metas: MetasService,
    private readonly checkins: CheckinsService,
  ) {}

  /** Monta a ficha dentro da transação; RLS decide: invisível = 404. */
  async montar(tx: Tx, id: string): Promise<FichaDTO> {
    const [i] = await tx.select().from(mentoriaInscricoes).where(eq(mentoriaInscricoes.id, id));
    if (!i) throw new NotFoundException();
    const hoje = this.ciclos.hoje();
    const pessoas = await tx
      .select()
      .from(mentoriaPessoas)
      .where(eq(mentoriaPessoas.inscricaoId, id))
      .orderBy(asc(mentoriaPessoas.ordem));
    const avaliacoes = pessoas.length
      ? await tx
          .select()
          .from(mentoriaAvaliacoes)
          .where(
            inArray(
              mentoriaAvaliacoes.pessoaId,
              pessoas.map((p) => p.id),
            ),
          )
      : [];
    const [endereco] = await tx
      .select()
      .from(mentoriaEnderecos)
      .where(eq(mentoriaEnderecos.inscricaoId, id));
    const [momento] = await tx
      .select()
      .from(mentoriaMomentoInicial)
      .where(eq(mentoriaMomentoInicial.inscricaoId, id));
    const etapas = await tx
      .select()
      .from(mentoriaOnboardingEtapas)
      .where(eq(mentoriaOnboardingEtapas.inscricaoId, id));
    const [caixa] = await tx
      .select()
      .from(mentoriaEnviosFisicos)
      .where(
        and(eq(mentoriaEnviosFisicos.inscricaoId, id), eq(mentoriaEnviosFisicos.tipo, 'CAIXA')),
      );
    const [pausa] = await tx
      .select()
      .from(mentoriaPausas)
      .where(and(eq(mentoriaPausas.inscricaoId, id), isNull(mentoriaPausas.fim)));
    const renovacoes = await tx
      .select({
        id: mentoriaRenovacoes.id,
        ano: mentoriaRenovacoes.ano,
        data: mentoriaRenovacoes.data,
        mentoriaAnterior: mentoriaRenovacoes.mentoriaAnterior,
        mentoriaNova: mentoriaRenovacoes.mentoriaNova,
        terminoAnterior: mentoriaRenovacoes.terminoAnterior,
        terminoNovo: mentoriaRenovacoes.terminoNovo,
        registradaPor: user.name,
      })
      .from(mentoriaRenovacoes)
      .leftJoin(user, eq(user.id, mentoriaRenovacoes.registradaPor))
      .where(eq(mentoriaRenovacoes.inscricaoId, id))
      .orderBy(asc(mentoriaRenovacoes.ano));
    const [extra] = await tx.execute<{
      mes: number | null;
      inscricao: boolean;
      momento: boolean;
      anotacao: boolean;
      onboarding: boolean;
      plano: boolean;
      reuniao: boolean;
      contato: boolean;
      pme: boolean;
      tarefa: boolean;
      meta: boolean;
      checkin: boolean;
      segunda_chance: boolean;
      ver_evolucao: boolean;
      ver_cronograma: boolean;
      evolucao: boolean;
      ver_engajamento: boolean;
      engajamento: boolean;
      renovacao: boolean;
      desfazivel: boolean | null;
      so_carteira: boolean;
      admin: boolean;
      travado_por: string | null;
      pausa_dias: number | null;
      financeiro: string | null;
    }>(sql`
      select mentoria_mes_jornada(${id}::uuid, (now() at time zone 'America/Sao_Paulo')::date) as mes,
        mentoria_edita('INSCRICAO', ${id}::uuid) as inscricao,
        mentoria_edita('MOMENTO', ${id}::uuid) as momento,
        mentoria_edita('ANOTACAO', ${id}::uuid) as anotacao,
        mentoria_edita('ONBOARDING', ${id}::uuid) as onboarding,
        mentoria_edita('PLANO', ${id}::uuid) as plano,
        mentoria_edita('REUNIAO', ${id}::uuid) as reuniao,
        mentoria_edita('CONTATO', ${id}::uuid) as contato,
        mentoria_edita('PME', ${id}::uuid) as pme,
        mentoria_edita('TAREFA', ${id}::uuid) as tarefa,
        mentoria_edita('META', ${id}::uuid) as meta,
        mentoria_edita('CHECKIN', ${id}::uuid) as checkin,
        mentoria_edita('SEGUNDA_CHANCE', ${id}::uuid) as segunda_chance,
        mentoria_ve_evolucao(${id}::uuid) as ver_evolucao,
        coalesce(mentoria_admin() or mentoria_perfil() in ('ACOMPANHAMENTO', 'OPERACAO'), false)
          as ver_cronograma,
        mentoria_edita('EVOLUCAO', ${id}::uuid) as evolucao,
        mentoria_ve_engajamento() as ver_engajamento,
        mentoria_edita('ENGAJAMENTO', ${id}::uuid) as engajamento,
        mentoria_edita('RENOVACAO', ${id}::uuid) as renovacao,
        (select not exists (select 1 from mentoria_acoes a where a.id = any (r.acoes) and a.status = 'FEITA')
         from mentoria_renovacoes r where r.inscricao_id = ${id}::uuid
         order by r.ano desc limit 1) as desfazivel,
        mentoria_admin() as admin,
        mentoria_so_carteira() as so_carteira,
        mentoria_status_financeiro(${id}::uuid) as financeiro,
        (select name from "user" where id = ${momento?.travadoPor ?? null}) as travado_por,
        (select (now() at time zone 'America/Sao_Paulo')::date - p.inicio
         from mentoria_pausas p where p.inscricao_id = ${id}::uuid and p.fim is null) as pausa_dias`);

    const pessoasDto: PessoaDTO[] = pessoas.map((p) => ({
      id: p.id,
      ordem: p.ordem,
      version: p.version,
      nome: p.nome,
      apelido: p.apelido,
      fotoMidiaId: p.fotoMidiaId,
      nascimento: p.nascimento,
      cidade: p.cidade,
      uf: p.uf,
      whatsapp: this.crypto.decifrarOpcional(p.whatsapp, aad('mentoria_pessoas', 'whatsapp', p.id)),
      email: this.crypto.decifrarOpcional(p.email, aad('mentoria_pessoas', 'email', p.id)),
      instagram: p.instagram,
      profissao: p.profissao,
      ocupacao: p.ocupacao as PessoaDTO['ocupacao'],
      filhosQuantidade: p.filhosQuantidade,
      filhosIdades: p.filhosIdades,
      tecnologia: p.tecnologia as PessoaDTO['tecnologia'],
      melhorHorario: p.melhorHorario,
      canalPreferido: p.canalPreferido,
      pulseira: p.pulseira,
      avaliacoes: avaliacoes
        .filter((a) => a.pessoaId === p.id && a.momento === 'INICIAL')
        .map((a): AvaliacaoDTO => ({
          id: a.id,
          tipo: a.tipo as AvaliacaoDTO['tipo'],
          version: a.version,
          data: a.data,
          notaFe: a.notaFe,
          notaSaude: a.notaSaude,
          notaDinheiro: a.notaDinheiro,
          notaRelacionamentos: a.notaRelacionamentos,
          resultadoProva: a.resultadoProva,
        })),
    }));

    const enderecoDto: EnderecoDTO | null = endereco
      ? {
          version: endereco.version,
          endereco: this.crypto.decifrarOpcional(
            endereco.endereco,
            aad('mentoria_enderecos', 'endereco', id),
          ),
          cep: endereco.cep,
          origem: endereco.origem as EnderecoDTO['origem'],
        }
      : null;

    const textos = (m: NonNullable<typeof momento>) =>
      Object.fromEntries(
        MOMENTO_TEXTOS.map((c) => [
          c,
          this.crypto.decifrarOpcional(m[c], aad('mentoria_momento_inicial', COLUNA_TEXTO[c], id)),
        ]),
      ) as Record<MomentoTexto, string | null>;
    const momentoDto: MomentoDTO | null = momento
      ? {
          version: momento.version,
          data: momento.data,
          recebeCentavos: momento.recebeCentavos,
          custoCentavos: momento.custoCentavos,
          temDividas: momento.temDividas,
          dividasCentavos: momento.dividasCentavos,
          guardadoCentavos: momento.guardadoCentavos,
          divida1Centavos: momento.divida1Centavos,
          divida2Centavos: momento.divida2Centavos,
          divida3Centavos: momento.divida3Centavos,
          ...textos(momento),
          travadoEm: momento.travadoEm?.toISOString() ?? null,
          travadoPor: extra?.travado_por ?? null,
        }
      : null;

    return {
      id: i.id,
      version: i.version,
      nome: pessoas.map((p) => p.nome).join(' e '),
      tipo: i.tipo as FichaDTO['tipo'],
      mentoria: i.mentoria as FichaDTO['mentoria'],
      mentoriaVariante: i.mentoriaVariante,
      dataCompra: i.dataCompra,
      dataCompraAproximada: i.dataCompraAproximada,
      dataIdr: i.dataIdr,
      inicioJornada: i.inicioJornada,
      terminoPrevisto: i.terminoPrevisto,
      mesJornada: extra?.mes ?? null,
      valorCentavos: i.valorCentavos,
      formaPagamento: i.formaPagamento,
      // Com venda, das parcelas do comercial (NPAC-56, G6/M8); sem venda, a coluna.
      statusFinanceiro: (extra?.financeiro ?? null) as FichaDTO['statusFinanceiro'],
      dealId: i.dealId,
      status: i.status as FichaDTO['status'],
      // A coluna sai só para quem vê o engajamento (NPAC-75): a Especialista recebe nulo.
      engajamento:
        extra?.ver_engajamento === true ? (i.engajamento as FichaDTO['engajamento']) : null,
      responsavelId: i.responsavelId,
      origem: i.origem as FichaDTO['origem'],
      linkPasta: i.linkPasta,
      linkGrupo: i.linkGrupo,
      fotoFamiliaMidiaId: i.fotoFamiliaMidiaId,
      importada: i.importada,
      pessoas: pessoasDto,
      endereco: enderecoDto,
      momento: momentoDto,
      onboarding: etapas
        .sort((a, b) => ETAPAS.indexOf(a.etapa as Etapa) - ETAPAS.indexOf(b.etapa as Etapa))
        .map((e): EtapaDTO => ({
          id: e.id,
          etapa: e.etapa as Etapa,
          status: e.status as EtapaDTO['status'],
          version: e.version,
          enviadaEm: e.enviadaEm?.toISOString() ?? null,
          concluidaEm: e.concluidaEm?.toISOString() ?? null,
          grupoCriadoEm: e.grupoCriadoEm,
          formularioPreenchido: e.formularioPreenchido,
          grupoAvisos: e.grupoAvisos,
          grupoClube: e.grupoClube,
          grupoNacao: e.grupoNacao,
          aulasConcluidas: e.aulasConcluidas,
          aulasConcluidasEm: e.aulasConcluidasEm,
        })),
      caixa: caixa
        ? {
            version: caixa.version,
            status: caixa.status as CaixaDTO['status'],
            enviadoEm: caixa.enviadoEm,
            rastreio: caixa.rastreio,
            entregueEm: caixa.entregueEm,
          }
        : null,
      completarCampos: i.completarCampos,
      acoes: await this.plano.daInscricao(tx, id),
      reunioes: await this.reunioes.daInscricao(tx, id),
      contatos: await this.reunioes.contatosDaInscricao(tx, id),
      ciclos: await this.ciclos.daInscricao(tx, id, hoje),
      hoje,
      metas: await this.metas.daInscricao(tx, id),
      tarefasReuniao: await this.ciclos.tarefas(
        tx,
        sql`t.inscricao_id = ${id}::uuid and t.origem = 'REUNIAO'`,
        POR_REUNIAO,
      ),
      ...(await this.checkins.semaforo(tx, id, hoje)),
      checkins: await this.checkins.daInscricao(tx, id),
      pausa: pausa
        ? {
            inicio: pausa.inicio,
            dias: extra?.pausa_dias ?? 0,
            motivo: this.crypto.decifrarOpcional(
              pausa.motivo,
              aad('mentoria_pausas', 'motivo', pausa.id),
            ),
          }
        : null,
      renovacoes: renovacoes.map((r): RenovacaoDTO => ({
        ...r,
        mentoriaAnterior: r.mentoriaAnterior as RenovacaoDTO['mentoriaAnterior'],
        mentoriaNova: r.mentoriaNova as RenovacaoDTO['mentoriaNova'],
      })),
      pode: {
        inscricao: extra?.inscricao === true,
        momento: extra?.momento === true,
        anotacao: extra?.anotacao === true,
        onboarding: extra?.onboarding === true,
        plano: extra?.plano === true,
        reuniao: extra?.reuniao === true,
        contato: extra?.contato === true,
        pme: extra?.pme === true,
        tarefa: extra?.tarefa === true,
        meta: extra?.meta === true,
        checkin: extra?.checkin === true,
        segundaChance: extra?.segunda_chance === true,
        verEvolucao: extra?.ver_evolucao === true,
        verCronograma: extra?.ver_cronograma === true,
        evolucao: extra?.ver_evolucao === true && extra?.evolucao === true,
        responsavel: extra?.inscricao === true && extra?.so_carteira !== true,
        verEngajamento: extra?.ver_engajamento === true,
        engajamento: extra?.ver_engajamento === true && extra?.engajamento === true,
        renovar:
          extra?.renovacao === true &&
          STATUS_QUE_RENOVA.includes(i.status as FichaDTO['status']) &&
          i.inicioJornada !== null &&
          i.terminoPrevisto !== null,
        desfazerRenovacao:
          extra?.admin === true && i.status === 'ATIVO' && extra?.desfazivel === true,
        admin: extra?.admin === true,
      },
    };
  }

  abrir(u: AuthUser, id: string) {
    return withUser(this.db, u.id, (tx) => this.montar(tx, id));
  }

  salvarEndereco(u: AuthUser, id: string, b: EnderecoPut) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'INSCRICAO', id);
      const { version, endereco, ...resto } = b;
      const cifrado =
        endereco === undefined
          ? {}
          : {
              endereco: this.crypto.cifrarOpcional(
                endereco,
                aad('mentoria_enderecos', 'endereco', id),
              ),
            };
      const campos = { ...resto, ...cifrado };
      const [r] =
        version === 0
          ? await tx
              .insert(mentoriaEnderecos)
              .values({ ...campos, inscricaoId: id, criadoPor: u.id })
              .onConflictDoNothing()
              .returning({ version: mentoriaEnderecos.version })
          : await tx
              .update(mentoriaEnderecos)
              .set({
                ...campos,
                version: sql`${mentoriaEnderecos.version} + 1`,
                atualizadoEm: sql`now()`,
              })
              .where(
                and(eq(mentoriaEnderecos.inscricaoId, id), eq(mentoriaEnderecos.version, version)),
              )
              .returning({ version: mentoriaEnderecos.version });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, id, 'endereco.editado', Object.keys(campos));
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  salvarMomento(u: AuthUser, id: string, b: MomentoPut) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'MOMENTO', id);
      const { version, ...resto } = b;
      // Texto vai cifrado com o AAD da própria coluna; número e data vão como vieram.
      const campos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(resto)) {
        if (v === undefined) continue;
        campos[k] = ehTexto(k)
          ? this.crypto.cifrarOpcional(
              v as string | null,
              aad('mentoria_momento_inicial', COLUNA_TEXTO[k], id),
            )
          : v;
      }
      const [r] =
        version === 0
          ? await tx
              .insert(mentoriaMomentoInicial)
              .values({ ...campos, inscricaoId: id, criadoPor: u.id })
              .onConflictDoNothing()
              .returning({ version: mentoriaMomentoInicial.version })
          : await tx
              .update(mentoriaMomentoInicial)
              .set({
                ...campos,
                version: sql`${mentoriaMomentoInicial.version} + 1`,
                atualizadoEm: sql`now()`,
              })
              .where(
                and(
                  eq(mentoriaMomentoInicial.inscricaoId, id),
                  eq(mentoriaMomentoInicial.version, version),
                ),
              )
              .returning({ version: mentoriaMomentoInicial.version });
      if (!r) throw conflitoDeVersao();
      // Campo preenchido sai da lista "completar a ficha". Sem version: não briga com outro PATCH.
      const preenchidos = Object.entries(resto)
        .filter(([k, v]) => !ehTexto(k) && v !== null && v !== undefined)
        .map(([k]) => k);
      // O valor de uma dívida refaz o total (gatilho da 0086): o total deixa de faltar.
      if (preenchidos.some((k) => VALORES_DIVIDA.includes(k))) preenchidos.push('dividasCentavos');
      if (preenchidos.length)
        await tx.execute(sql`update mentoria_inscricoes set completar_campos = array(
            select unnest(completar_campos)
            except select unnest(${sql.param(preenchidos)}::text[]))
          where id = ${id}::uuid and cardinality(completar_campos) > 0`);
      await registrarHistorico(tx, id, 'momento.editado', Object.keys(campos));
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  concluirMomento(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'MOMENTO', id);
      const [r] = await tx.execute<{ version: number }>(
        sql`select mentoria_concluir_momento(${id}::uuid) as version`,
      );
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e));
  }

  destravarMomento(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'MOMENTO', id);
      const [r] = await tx.execute<{ version: number }>(
        sql`select mentoria_destravar_momento(${id}::uuid) as version`,
      );
      return { version: r!.version };
    }).catch((e) => erroDoBanco(e));
  }

  salvarAvaliacao(u: AuthUser, pessoaId: string, b: AvaliacaoPut) {
    return withUser(this.db, u.id, async (tx) => {
      const [p] = await tx
        .select({ inscricaoId: mentoriaPessoas.inscricaoId })
        .from(mentoriaPessoas)
        .where(eq(mentoriaPessoas.id, pessoaId));
      if (!p) throw new NotFoundException();
      await exigirEdicao(tx, 'MOMENTO', p.inscricaoId);
      // Uma coluna por envio, sem `version`: duas pessoas em notas diferentes não colidem.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tipo, version: _version, ...campos } = b;
      const [r] = await tx
        .insert(mentoriaAvaliacoes)
        .values({ ...campos, pessoaId, tipo, momento: 'INICIAL', criadoPor: u.id })
        .onConflictDoUpdate({
          target: [
            mentoriaAvaliacoes.pessoaId,
            mentoriaAvaliacoes.tipo,
            mentoriaAvaliacoes.momento,
          ],
          set: {
            ...campos,
            version: sql`${mentoriaAvaliacoes.version} + 1`,
            atualizadoEm: sql`now()`,
          },
        })
        .returning({ id: mentoriaAvaliacoes.id, version: mentoriaAvaliacoes.version });
      await registrarHistorico(tx, p.inscricaoId, 'avaliacao.editada', Object.keys(campos));
      return r!;
    }).catch((e) => erroDoBanco(e));
  }

  anotar(u: AuthUser, inscricaoId: string, texto: string) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'ANOTACAO', inscricaoId);
      const id = randomUUID();
      await tx.insert(mentoriaAnotacoes).values({
        id,
        inscricaoId,
        autorId: u.id,
        texto: this.crypto.cifrarTexto(texto, aad('mentoria_anotacoes', 'texto', id)),
      });
      return { id };
    }).catch((e) => erroDoBanco(e));
  }

  /** NPAC-70: só a Admin (ou a Diretoria); o banco confere e grava `anotacao.excluida` no histórico. */
  excluirAnotacao(u: AuthUser, anotacaoId: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_anotacao_excluir(${anotacaoId}::uuid)`);
    }).catch((e) => erroDoBanco(e));
  }

  /** NPAC-70: só a Admin (ou a Diretoria); o banco confere e grava `contato.excluido` no histórico. */
  excluirContato(u: AuthUser, contatoId: string): Promise<void> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_contato_excluir(${contatoId}::uuid)`);
    }).catch((e) => erroDoBanco(e));
  }

  /** Alterações e anotações, da mais recente para a mais antiga. */
  historico(u: AuthUser, inscricaoId: string): Promise<{ itens: HistoricoItem[] }> {
    return withUser(this.db, u.id, async (tx) => {
      const [existe] = await tx
        .select({ id: mentoriaInscricoes.id })
        .from(mentoriaInscricoes)
        .where(eq(mentoriaInscricoes.id, inscricaoId));
      if (!existe) throw new NotFoundException();
      const alteracoes = await tx
        .select({
          id: mentoriaHistorico.id,
          tipo: mentoriaHistorico.tipo,
          quando: mentoriaHistorico.quando,
          campos: mentoriaHistorico.campos,
          ator: user.name,
        })
        .from(mentoriaHistorico)
        .innerJoin(user, eq(user.id, mentoriaHistorico.atorId))
        .where(eq(mentoriaHistorico.inscricaoId, inscricaoId))
        .orderBy(desc(mentoriaHistorico.quando))
        .limit(LIMITE_HISTORICO);
      const anotacoes = await tx
        .select({
          id: mentoriaAnotacoes.id,
          texto: mentoriaAnotacoes.texto,
          quando: mentoriaAnotacoes.criadoEm,
          ator: user.name,
        })
        .from(mentoriaAnotacoes)
        .innerJoin(user, eq(user.id, mentoriaAnotacoes.autorId))
        .where(eq(mentoriaAnotacoes.inscricaoId, inscricaoId))
        .orderBy(desc(mentoriaAnotacoes.criadoEm))
        .limit(LIMITE_HISTORICO);
      const itens: HistoricoItem[] = [
        ...alteracoes.map((a) => ({
          id: `h${a.id}`,
          tipo: a.tipo,
          quando: a.quando.toISOString(),
          ator: a.ator,
          campos: a.campos,
          texto: null,
        })),
        ...anotacoes.map((a) => ({
          id: a.id,
          tipo: 'anotacao',
          quando: a.quando.toISOString(),
          ator: a.ator,
          campos: [],
          texto: this.crypto.decifrarTexto(a.texto, aad('mentoria_anotacoes', 'texto', a.id)),
        })),
      ];
      itens.sort((a, b) => b.quando.localeCompare(a.quando));
      return { itens: itens.slice(0, LIMITE_HISTORICO) };
    });
  }
}
