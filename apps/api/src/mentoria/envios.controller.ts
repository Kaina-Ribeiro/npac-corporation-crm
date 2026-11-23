import { BadRequestException, Body, Get, HttpCode, Inject, Injectable, Post } from '@nestjs/common';
import { withUser, type Db } from '@npac/db';
import {
  envioMarcarSchema,
  envioNovoSchema,
  type AuthUser,
  type EnvioDTO,
  type EnvioMarcar,
  type EnvioNovo,
  type EnviosDTO,
  type EnvioStatus,
  type EnvioTipo,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { erroDoBanco, validarComAviso } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis } from './perfil.guard.js';
import { MENTORIA_CLOCK, type Clock } from './relogio.js';

type Linha = {
  envio_id: string | null;
  inscricao_id: string;
  tipo: EnvioTipo;
  status: EnvioStatus;
  nome1: string | null;
  nome2: string | null;
  endereco: string | null;
  cep: string | null;
  foto_midia_id: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  rastreio: string | null;
  version: number;
};

const DIA_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/**
 * Envios físicos (NPAC-56, Parte 2). Tudo passa pelas funções do banco (`mentoria_envios_lista` e
 * `mentoria_envio_marcar`, 0078): o cargo Envios não lê nada do módulo pela RLS. O endereço é decifrado
 * aqui, só em memória; a lista não traz contato, valor nem textos do mentorado.
 */
@Injectable()
export class EnviosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    @Inject(MENTORIA_CLOCK) private readonly clock: Clock,
  ) {}

  private agora(): string {
    return new Date(this.clock.now()).toISOString();
  }

  async listar(u: AuthUser): Promise<EnviosDTO> {
    const linhas = await withUser(this.db, u.id, async (tx) => [
      ...(await tx
        .execute<Linha>(sql`select * from mentoria_envios_lista(${this.agora()}::timestamptz)`)
        .catch(erroDoBanco)),
    ]);
    const dto = linhas.map((l): EnvioDTO => ({
      id: l.envio_id,
      inscricaoId: l.inscricao_id,
      tipo: l.tipo,
      status: l.status,
      nomes: [l.nome1, l.nome2].filter((n): n is string => !!n),
      endereco: this.crypto.decifrarOpcional(
        l.endereco,
        aad('mentoria_enderecos', 'endereco', l.inscricao_id),
      ),
      cep: l.cep,
      fotoMidiaId: l.foto_midia_id,
      enviadoEm: l.enviado_em,
      entregueEm: l.entregue_em,
      rastreio: l.rastreio,
      version: l.version,
    }));
    return {
      hoje: DIA_BR.format(new Date(this.clock.now())),
      aEnviar: dto.filter((e) => e.status === 'PREPARANDO'),
      emTransito: dto.filter((e) => e.status === 'ENVIADO'),
      entregues: dto.filter((e) => e.status === 'ENTREGUE'),
    };
  }

  /** A única escrita de envio pela aba; a Caixa entregue conclui a etapa CAIXA (gatilho do banco). */
  marcar(u: AuthUser, b: EnvioMarcar): Promise<{ version: number }> {
    return withUser(this.db, u.id, async (tx) => {
      const [r] = await tx
        .execute<{ v: number }>(
          sql`select mentoria_envio_marcar(${b.inscricaoId}::uuid, ${b.tipo}, ${b.envioId}::uuid,
            ${b.version}, ${b.status}, ${b.data ?? null}::date, ${b.rastreio ?? null},
            ${this.agora()}::timestamptz) as v`,
        )
        .catch(erroDoBanco);
      return { version: r!.v };
    });
  }

  /** "Novo envio": kit ou certificado (G10), pela RLS de quem gere o onboarding. */
  criar(u: AuthUser, b: EnvioNovo): Promise<{ id: string }> {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'ONBOARDING', b.inscricaoId);
      const [i] = await tx.execute<{ status: string }>(
        sql`select status from mentoria_inscricoes where id = ${b.inscricaoId}::uuid`,
      );
      if (!['ONBOARDING', 'ATIVO', 'PAUSADO'].includes(i!.status))
        throw new BadRequestException(
          'Novo envio só para mentorado em Onboarding, Ativo ou Pausado',
        );
      const [r] = await tx
        .execute<{ id: string }>(
          sql`insert into mentoria_envios_fisicos (inscricao_id, tipo, criado_por)
            values (${b.inscricaoId}::uuid, ${b.tipo}, app_user_id()) returning id`,
        )
        .catch(erroDoBanco);
      await registrarHistorico(
        tx,
        b.inscricaoId,
        b.tipo === 'KIT' ? 'kit.criado' : 'certificado.criado',
        ['tipo'],
      );
      return { id: r!.id };
    });
  }
}

/** Admin, Acompanhamento, Operação e Envios. A Especialista e o Mentor recebem 404. */
@MentoriaController('envios')
export class EnviosController {
  constructor(private readonly servico: EnviosService) {}

  @Get()
  @Perfis('ACOMPANHAMENTO', 'OPERACAO', 'ENVIOS')
  listar(@CurrentUser() u: SessionUser) {
    return this.servico.listar(u);
  }

  @Post('marcar')
  @HttpCode(200)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO', 'ENVIOS')
  marcar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.servico.marcar(u, validarComAviso(envioMarcarSchema, body));
  }

  @Post()
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.servico.criar(u, validarComAviso(envioNovoSchema, body));
  }
}
