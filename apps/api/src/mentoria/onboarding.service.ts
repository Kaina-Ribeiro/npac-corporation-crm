import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  mentoriaEnviosFisicos,
  mentoriaInscricoes,
  mentoriaOnboardingEtapas,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  CAMPOS_ETAPA,
  ETAPAS,
  diasParado,
  etapaAtual,
  etapaEmAlerta,
  etapaFechada,
  podeEnviar,
  type AuthUser,
  type CaixaPut,
  type CaixaPainel,
  type Etapa,
  type EtapaEstado,
  type EtapaPatch,
  type EtapaStatus,
  type IdrPainel,
  type PainelOnboarding,
  type PessoaFunil,
  type PessoaResumo,
  type TipoInscricao,
  type Mentoria,
} from '@npac/shared';
import { and, eq, sql } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { PlanoService } from './plano.service.js';

const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;

/** As seis etapas de uma inscrição nova (PENDENTE) ou importada (ANTERIOR_AO_SISTEMA). */
export async function criarEtapas(
  tx: Tx,
  inscricaoId: string,
  status: Extract<EtapaStatus, 'PENDENTE' | 'ANTERIOR_AO_SISTEMA'>,
  criadoPor: string,
): Promise<void> {
  await tx
    .insert(mentoriaOnboardingEtapas)
    .values(ETAPAS.map((etapa) => ({ inscricaoId, etapa, status, criadoPor })));
}

type LinhaPainel = {
  inscricao_id: string;
  tipo: TipoInscricao;
  mentoria: Mentoria;
  criado_em: Date;
  pessoas: PessoaResumo[];
  etapas: {
    id: string;
    etapa: Etapa;
    status: EtapaStatus;
    version: number;
    base: string | null;
    concluida_em: string | null;
    formulario: boolean | null;
    atualizado_em: string;
  }[];
  caixa: {
    status: string;
    enviado_em: string | null;
    entregue_em: string | null;
    rastreio: string | null;
  } | null;
};

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly plano: PlanoService,
  ) {}

  /** Trava a inscrição e devolve as etapas. A trava serializa quem fecha a última etapa. */
  private async carregar(tx: Tx, inscricaoId: string) {
    await exigirEdicao(tx, 'ONBOARDING', inscricaoId);
    const [i] = await tx
      .select({ status: mentoriaInscricoes.status, mentoria: mentoriaInscricoes.mentoria })
      .from(mentoriaInscricoes)
      .where(eq(mentoriaInscricoes.id, inscricaoId))
      .for('update');
    if (!i) throw new NotFoundException();
    const etapas = await tx
      .select()
      .from(mentoriaOnboardingEtapas)
      .where(eq(mentoriaOnboardingEtapas.inscricaoId, inscricaoId));
    return { inscricao: i, etapas };
  }

  private async inscricaoDaEtapa(tx: Tx, etapaId: string) {
    const [e] = await tx
      .select({ inscricaoId: mentoriaOnboardingEtapas.inscricaoId })
      .from(mentoriaOnboardingEtapas)
      .where(eq(mentoriaOnboardingEtapas.id, etapaId));
    if (!e) throw new NotFoundException();
    return e.inscricaoId;
  }

  /** 2M e 6M com tudo concluído ou dispensado viram ATIVO, mesmo sem IDR (§5, D15). */
  private async fecharSeCompleto(tx: Tx, inscricaoId: string): Promise<void> {
    const [fechou] = await tx.execute<{ inicio: string }>(sql`
      update mentoria_inscricoes i set
        status = 'ATIVO',
        version = i.version + 1,
        atualizado_em = now()
      where i.id = ${inscricaoId}::uuid and i.mentoria <> 'RDV' and i.status = 'ONBOARDING'
        and not exists (
          select 1 from mentoria_onboarding_etapas e
          where e.inscricao_id = i.id and e.status not in ('CONCLUIDA', 'DISPENSADA'))
      returning to_char(coalesce(i.inicio_jornada, ${HOJE}), 'YYYY-MM-DD') as inicio`);
    if (!fechou) return;
    await this.plano.definirInicio(tx, inscricaoId, fechou.inicio);
    await registrarHistorico(tx, inscricaoId, 'onboarding.fechado', ['status', 'inicioJornada']);
  }

  atualizar(u: AuthUser, etapaId: string, b: EtapaPatch) {
    return withUser(this.db, u.id, async (tx) => {
      const inscricaoId = await this.inscricaoDaEtapa(tx, etapaId);
      const { inscricao, etapas } = await this.carregar(tx, inscricaoId);
      const atual = etapas.find((e) => e.id === etapaId);
      if (!atual) throw new NotFoundException();
      const etapa = atual.etapa as Etapa;
      const { version, status, ...campos } = b;

      const permitidos: readonly string[] = CAMPOS_ETAPA[etapa];
      const nomes = Object.keys(campos);
      if (nomes.some((n) => !permitidos.includes(n)))
        throw new BadRequestException('Este campo não é desta etapa');

      const datas: Partial<typeof mentoriaOnboardingEtapas.$inferInsert> = {};
      if (status && status !== atual.status) {
        if (etapa === 'CAIXA' || etapa === 'IDR')
          throw new BadRequestException('Esta etapa segue o envio e a reunião');
        if (inscricao.status !== 'ONBOARDING')
          throw new BadRequestException('Esta inscrição não está em onboarding');
        const estados = etapas.map((e): EtapaEstado => ({
          etapa: e.etapa as Etapa,
          status: e.status as EtapaStatus,
          formularioPreenchido: e.formularioPreenchido,
        }));
        if (status === 'ENVIADA') {
          if (atual.status !== 'PENDENTE')
            throw new BadRequestException('Esta etapa já foi enviada');
          if (!podeEnviar(etapa, estados))
            throw new BadRequestException('Conclua a etapa anterior antes de enviar esta');
          datas.enviadaEm = sql`now()` as unknown as Date;
        } else {
          if (atual.status !== 'ENVIADA')
            throw new BadRequestException('Envie esta etapa antes de concluir');
          datas.concluidaEm = sql`now()` as unknown as Date;
        }
      }

      const [r] = await tx
        .update(mentoriaOnboardingEtapas)
        .set({
          ...campos,
          ...datas,
          ...(status ? { status } : {}),
          version: sql`${mentoriaOnboardingEtapas.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(
          and(
            eq(mentoriaOnboardingEtapas.id, etapaId),
            eq(mentoriaOnboardingEtapas.version, version),
          ),
        )
        .returning({ version: mentoriaOnboardingEtapas.version });
      if (!r) throw conflitoDeVersao();

      const mudou = status && status !== atual.status;
      await registrarHistorico(
        tx,
        inscricaoId,
        mudou
          ? status === 'ENVIADA'
            ? 'onboarding.enviada'
            : 'onboarding.concluida'
          : 'onboarding.editada',
        [etapa, ...(mudou ? ['status'] : []), ...nomes],
      );
      if (mudou) await this.fecharSeCompleto(tx, inscricaoId);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  dispensar(u: AuthUser, etapaId: string, version: number) {
    return withUser(this.db, u.id, async (tx) => {
      const inscricaoId = await this.inscricaoDaEtapa(tx, etapaId);
      const { inscricao, etapas } = await this.carregar(tx, inscricaoId);
      const atual = etapas.find((e) => e.id === etapaId);
      if (!atual) throw new NotFoundException();
      if (inscricao.mentoria === 'RDV')
        throw new BadRequestException('No RDV as etapas não podem ser dispensadas');
      if (inscricao.status !== 'ONBOARDING')
        throw new BadRequestException('Esta inscrição não está em onboarding');
      if (etapaFechada(atual.status as EtapaStatus))
        throw new BadRequestException('Esta etapa já foi fechada');
      const [r] = await tx
        .update(mentoriaOnboardingEtapas)
        .set({
          status: 'DISPENSADA',
          version: sql`${mentoriaOnboardingEtapas.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(
          and(
            eq(mentoriaOnboardingEtapas.id, etapaId),
            eq(mentoriaOnboardingEtapas.version, version),
          ),
        )
        .returning({ version: mentoriaOnboardingEtapas.version });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, inscricaoId, 'onboarding.dispensada', [atual.etapa, 'status']);
      await this.fecharSeCompleto(tx, inscricaoId);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  salvarCaixa(u: AuthUser, inscricaoId: string, b: CaixaPut) {
    return withUser(this.db, u.id, async (tx) => {
      const { inscricao, etapas } = await this.carregar(tx, inscricaoId);
      const etapa = etapas.find((e) => e.etapa === 'CAIXA');
      if (etapa?.status === 'DISPENSADA' || etapa?.status === 'ANTERIOR_AO_SISTEMA')
        throw new BadRequestException('Esta inscrição não passa pela Caixa');
      if (inscricao.status !== 'ONBOARDING' && inscricao.status !== 'ATIVO')
        throw new BadRequestException('Esta inscrição não está em andamento');
      const estados = etapas.map((e): EtapaEstado => ({
        etapa: e.etapa as Etapa,
        status: e.status as EtapaStatus,
        formularioPreenchido: e.formularioPreenchido,
      }));
      if (b.status !== 'PREPARANDO' && !podeEnviar('CAIXA', estados))
        throw new BadRequestException(
          'Marque o formulário como preenchido antes de enviar a Caixa',
        );

      const [atual] = await tx
        .select()
        .from(mentoriaEnviosFisicos)
        .where(
          and(
            eq(mentoriaEnviosFisicos.inscricaoId, inscricaoId),
            eq(mentoriaEnviosFisicos.tipo, 'CAIXA'),
          ),
        );
      const { version, ...campos } = b;
      const enviadoEm = campos.enviadoEm ?? atual?.enviadoEm ?? null;
      const entregueEm = campos.entregueEm ?? atual?.entregueEm ?? null;
      if (b.status !== 'PREPARANDO' && !enviadoEm)
        throw new BadRequestException('Informe a data de envio');
      if (b.status === 'ENTREGUE' && !entregueEm)
        throw new BadRequestException('Informe a data de recebimento');
      if (b.status === 'ENTREGUE' && enviadoEm! > entregueEm!)
        throw new BadRequestException('O recebimento não pode ser antes do envio');

      const valores = {
        status: b.status,
        enviadoEm: b.status === 'PREPARANDO' ? null : enviadoEm,
        entregueEm: b.status === 'ENTREGUE' ? entregueEm : null,
        ...(campos.rastreio !== undefined ? { rastreio: campos.rastreio } : {}),
      };
      const [r] =
        version === 0
          ? await tx
              .insert(mentoriaEnviosFisicos)
              .values({ ...valores, inscricaoId, tipo: 'CAIXA', criadoPor: u.id })
              .onConflictDoNothing()
              .returning({ version: mentoriaEnviosFisicos.version })
          : await tx
              .update(mentoriaEnviosFisicos)
              .set({
                ...valores,
                version: sql`${mentoriaEnviosFisicos.version} + 1`,
                atualizadoEm: sql`now()`,
              })
              .where(
                and(
                  eq(mentoriaEnviosFisicos.inscricaoId, inscricaoId),
                  eq(mentoriaEnviosFisicos.tipo, 'CAIXA'),
                  eq(mentoriaEnviosFisicos.version, version),
                ),
              )
              .returning({ version: mentoriaEnviosFisicos.version });
      if (!r) throw conflitoDeVersao();
      const tipo =
        atual?.status === b.status
          ? 'caixa.editada'
          : b.status === 'ENVIADO'
            ? 'caixa.enviada'
            : b.status === 'ENTREGUE'
              ? 'caixa.entregue'
              : 'caixa.preparando';
      await registrarHistorico(tx, inscricaoId, tipo, Object.keys(campos));
      await this.fecharSeCompleto(tx, inscricaoId);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  /** A aba Onboarding: só inscrições em onboarding, cada uma na etapa em que está parada. */
  painel(u: AuthUser): Promise<PainelOnboarding> {
    return withUser(this.db, u.id, async (tx) => {
      const linhas = await tx.execute<LinhaPainel>(sql`
        select i.id as inscricao_id, i.tipo, i.mentoria, i.criado_em,
          (select json_agg(json_build_object('nome', p.nome, 'apelido', p.apelido,
             'fotoMidiaId', p.foto_midia_id) order by p.ordem)
           from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas,
          (select json_agg(json_build_object('id', e.id, 'etapa', e.etapa, 'status', e.status,
             'version', e.version, 'base', mentoria_onboarding_base(e.id),
             'concluida_em', e.concluida_em, 'formulario', e.formulario_preenchido,
             'atualizado_em', e.atualizado_em))
           from mentoria_onboarding_etapas e where e.inscricao_id = i.id) as etapas,
          (select json_build_object('status', v.status, 'enviado_em', v.enviado_em,
             'entregue_em', v.entregue_em, 'rastreio', v.rastreio)
           from mentoria_envios_fisicos v
           where v.inscricao_id = i.id and v.tipo = 'CAIXA') as caixa
        from mentoria_inscricoes i
        join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
        where i.status = 'ONBOARDING'
        order by p1.nome_norm, i.id`);
      const agora = new Date();
      const funil = ETAPAS.map((etapa) => ({
        etapa,
        total: 0,
        alertas: 0,
        pessoas: [] as PessoaFunil[],
      }));
      const caixasEmTransito: CaixaPainel[] = [];
      const idrsAAgendar: IdrPainel[] = [];
      let total = 0;

      for (const l of linhas) {
        total += 1;
        const nome = l.pessoas.map((p) => p.nome).join(' e ');
        const estados = l.etapas.map((e): EtapaEstado => ({
          etapa: e.etapa,
          status: e.status,
          formularioPreenchido: e.formulario,
        }));
        const atual = etapaAtual(estados);
        if (atual) {
          const e = l.etapas.find((x) => x.etapa === atual)!;
          const dias = diasParado(this.base(l, e), agora);
          const alerta = etapaEmAlerta(atual, e.status, dias);
          const coluna = funil.find((c) => c.etapa === atual)!;
          coluna.total += 1;
          if (alerta) coluna.alertas += 1;
          coluna.pessoas.push({
            inscricaoId: l.inscricao_id,
            nome,
            tipo: l.tipo,
            mentoria: l.mentoria,
            pessoas: l.pessoas,
            etapaId: e.id,
            version: e.version,
            etapa: atual,
            status: e.status,
            dias,
            alerta,
          });
        }
        const caixa = l.etapas.find((e) => e.etapa === 'CAIXA')!;
        if (caixa.status === 'ENVIADA' && l.caixa?.enviado_em) {
          const dias = diasParado(caixa.base ?? l.caixa.enviado_em, agora);
          caixasEmTransito.push({
            inscricaoId: l.inscricao_id,
            nome,
            pessoas: l.pessoas,
            enviadoEm: l.caixa.enviado_em,
            rastreio: l.caixa.rastreio,
            dias,
            alerta: etapaEmAlerta('CAIXA', 'ENVIADA', dias),
          });
        }
        const idr = l.etapas.find((e) => e.etapa === 'IDR')!;
        if (etapaFechada(caixa.status) && idr.status === 'PENDENTE')
          idrsAAgendar.push({
            inscricaoId: l.inscricao_id,
            nome,
            pessoas: l.pessoas,
            entregueEm: l.caixa?.entregue_em ?? null,
          });
      }
      for (const c of funil) c.pessoas.sort((a, b) => b.dias - a.dias);
      caixasEmTransito.sort((a, b) => b.dias - a.dias);
      return { total, funil, caixasEmTransito, idrsAAgendar };
    });
  }

  /**
   * De quando contam os dias parado: enviada, a base da etapa; em aberto, a conclusão da anterior
   * (a equipe devendo o próximo passo), ou o cadastro no primeiro passo.
   */
  private base(l: LinhaPainel, e: LinhaPainel['etapas'][number]): Date | string {
    if (e.status === 'ENVIADA' && e.base) return e.base;
    const i = ETAPAS.indexOf(e.etapa);
    const anterior = i > 0 ? l.etapas.find((x) => x.etapa === ETAPAS[i - 1]) : undefined;
    const desde = anterior?.concluida_em ?? anterior?.atualizado_em ?? l.criado_em;
    // Em etapa ainda não enviada, a base é só a última retomada, se houve.
    return e.base && new Date(e.base) > new Date(desde) ? e.base : desde;
  }
}
