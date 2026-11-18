import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { mentoriaCheckins, withUser, type Db, type Tx } from '@npac/db';
import type {
  AuthUser,
  CheckinCriar,
  CheckinDTO,
  CheckinPatch,
  SemaforoDTO,
  SemaforoSemanaDTO,
} from '@npac/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { MENTORIA_CLOCK, type Clock } from './relogio.js';

type LinhaCheckin = Omit<CheckinDTO, 'enviadoEm' | 'respondidoEm'> & {
  enviadoEm: Date | string;
  respondidoEm: Date | string | null;
};

const TEXTOS = ['avanco', 'travou', 'proximoPasso'] as const;
const COLUNA: Record<(typeof TEXTOS)[number], string> = {
  avanco: 'avanco',
  travou: 'travou',
  proximoPasso: 'proximo_passo',
};

/** `datetime-local` de Brasília (sem horário de verão desde 2019) para um instante. */
const deBrasilia = (s: string) => new Date(`${s}:00-03:00`);
const DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/**
 * Check-in da semana (Fase 2, Parte 3, E9) e semáforo (§5). O check-in é lançado na ficha por Admin e
 * Acompanhamento (área CHECKIN); Operação lê; a Especialista não vê. A regra do semáforo é do banco
 * (`mentoria_semaforo`), com o dia do relógio do módulo.
 */
@Injectable()
export class CheckinsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    @Inject(MENTORIA_CLOCK) private readonly clock: Clock,
  ) {}

  /** Dia de Brasília (`AAAA-MM-DD`) pelo relógio do módulo. */
  hoje(): string {
    return DIA_BR.format(new Date(this.clock.now()));
  }

  async consultar(tx: Tx, filtro: SQL): Promise<CheckinDTO[]> {
    const linhas = await tx.execute<LinhaCheckin>(sql`
      select c.id, c.version, to_char(c.semana, 'YYYY-MM-DD') as semana, c.enviado_em as "enviadoEm",
        c.respondeu, c.respondido_em as "respondidoEm", c.avanco, c.travou,
        c.proximo_passo as "proximoPasso", mentoria_edita('CHECKIN', c.inscricao_id) as "podeEditar"
      from mentoria_checkins c
      where ${filtro}
      order by c.semana desc
      limit 200`);
    return linhas.map((c) => ({
      ...c,
      enviadoEm: new Date(c.enviadoEm).toISOString(),
      respondidoEm: c.respondidoEm ? new Date(c.respondidoEm).toISOString() : null,
      avanco: this.crypto.decifrarOpcional(c.avanco, aad('mentoria_checkins', 'avanco', c.id)),
      travou: this.crypto.decifrarOpcional(c.travou, aad('mentoria_checkins', 'travou', c.id)),
      proximoPasso: this.crypto.decifrarOpcional(
        c.proximoPasso,
        aad('mentoria_checkins', 'proximo_passo', c.id),
      ),
    }));
  }

  daInscricao(tx: Tx, inscricaoId: string): Promise<CheckinDTO[]> {
    return this.consultar(tx, sql`c.inscricao_id = ${inscricaoId}::uuid`);
  }

  /** Semáforo de hoje, histórico e sequência (nulos e vazios para quem não vê). */
  async semaforo(tx: Tx, inscricaoId: string, hoje: string) {
    const [atual] = await tx.execute<SemaforoDTO>(
      sql`select cor, motivos from mentoria_semaforo(${inscricaoId}::uuid, ${hoje}::date)`,
    );
    const historico = await tx.execute<SemaforoSemanaDTO>(sql`
      select to_char(h.semana, 'YYYY-MM-DD') as semana, h.cor, h.motivos
      from mentoria_semaforo_historico h
      where h.inscricao_id = ${inscricaoId}::uuid
      order by h.semana desc
      limit 104`);
    const [seq] = await tx.execute<{ n: number | null }>(
      sql`select mentoria_sequencia_checkins(${inscricaoId}::uuid, ${hoje}::date) as n`,
    );
    return {
      semaforo: atual ? { cor: atual.cor, motivos: atual.motivos } : null,
      semaforoHistorico: [...historico],
      sequenciaCheckins: seq?.n ?? null,
    };
  }

  /** Resposta coerente: respondeu ⇔ data da resposta; nada no futuro; resposta não antes do envio. */
  private validar(enviadoEm: string, respondeu: boolean, respondidoEm: string | null) {
    const agora = this.clock.now();
    if (deBrasilia(enviadoEm).getTime() > agora)
      throw new BadRequestException('O envio não pode ser no futuro');
    if (respondeu && !respondidoEm) throw new BadRequestException('Informe quando respondeu');
    if (respondidoEm) {
      if (deBrasilia(respondidoEm).getTime() > agora)
        throw new BadRequestException('A resposta não pode ser no futuro');
      if (respondidoEm < enviadoEm)
        throw new BadRequestException('A resposta não pode ser antes do envio');
    }
  }

  private textos(id: string, b: Pick<CheckinPatch, (typeof TEXTOS)[number]>) {
    const out: Partial<Record<(typeof TEXTOS)[number], string | null>> = {};
    for (const k of TEXTOS) {
      if (b[k] === undefined) continue;
      out[k] = this.crypto.cifrarOpcional(b[k], aad('mentoria_checkins', COLUNA[k], id));
    }
    return out;
  }

  /** Data e hora gravadas, de volta no formato da tela (para validar o PATCH). */
  private paraTela(d: Date): string {
    const p = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
    return p.replace(' ', 'T');
  }

  criar(u: AuthUser, inscricaoId: string, b: CheckinCriar): Promise<CheckinDTO> {
    const id = randomUUID();
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'CHECKIN', inscricaoId);
      const respondeu = b.respondeu ?? !!b.respondidoEm;
      const respondidoEm = respondeu ? (b.respondidoEm ?? null) : null;
      this.validar(b.enviadoEm, respondeu, respondidoEm);
      await tx.insert(mentoriaCheckins).values({
        id,
        inscricaoId,
        enviadoEm: deBrasilia(b.enviadoEm),
        respondeu,
        respondidoEm: respondidoEm ? deBrasilia(respondidoEm) : null,
        ...this.textos(id, b),
      });
      await registrarHistorico(tx, inscricaoId, 'checkin.lancado', [
        'enviadoEm',
        ...(respondeu ? ['respondeu', 'respondidoEm'] : []),
        ...TEXTOS.filter((k) => b[k]),
      ]);
      const [c] = await this.consultar(tx, sql`c.id = ${id}::uuid`);
      return c!;
    }).catch((e) => erroDoBanco(e, 'Já há check-in nesta semana'));
  }

  atualizar(u: AuthUser, id: string, b: CheckinPatch): Promise<CheckinDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [c] = await tx.select().from(mentoriaCheckins).where(eq(mentoriaCheckins.id, id));
      if (!c) throw new NotFoundException();
      await exigirEdicao(tx, 'CHECKIN', c.inscricaoId);
      const enviadoEm = b.enviadoEm ?? this.paraTela(c.enviadoEm);
      const respondeu = b.respondeu ?? (b.respondidoEm ? true : c.respondeu);
      const respondidoEm = !respondeu
        ? null
        : b.respondidoEm !== undefined
          ? b.respondidoEm
          : c.respondidoEm
            ? this.paraTela(c.respondidoEm)
            : null;
      this.validar(enviadoEm, respondeu, respondidoEm);
      const set = {
        ...(b.enviadoEm !== undefined ? { enviadoEm: deBrasilia(b.enviadoEm) } : {}),
        ...(respondeu !== c.respondeu ? { respondeu } : {}),
        ...(b.respondidoEm !== undefined || respondeu !== c.respondeu
          ? { respondidoEm: respondidoEm ? deBrasilia(respondidoEm) : null }
          : {}),
        ...this.textos(id, b),
      };
      const campos = Object.keys(set);
      if (!campos.length) throw new BadRequestException('Nada para alterar');
      const [r] = await tx
        .update(mentoriaCheckins)
        .set({ ...set, version: sql`${mentoriaCheckins.version} + 1`, atualizadoEm: sql`now()` })
        .where(and(eq(mentoriaCheckins.id, id), eq(mentoriaCheckins.version, b.version)))
        .returning({ id: mentoriaCheckins.id });
      if (!r) throw conflitoDeVersao();
      await registrarHistorico(tx, c.inscricaoId, 'checkin.editado', campos);
      const [d] = await this.consultar(tx, sql`c.id = ${id}::uuid`);
      return d!;
    }).catch((e) => erroDoBanco(e, 'Já há check-in nesta semana'));
  }
}
