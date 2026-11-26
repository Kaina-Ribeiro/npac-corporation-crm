import {
  BadRequestException,
  Body,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { mentoriaCronogramaItens, withUser, type Db, type Tx } from '@npac/db';
import {
  BLOCOS,
  cronogramaBlocoSchema,
  cronogramaIncluirSchema,
  cronogramaItemCriarSchema,
  cronogramaItemPatchSchema,
  cronogramaRemoverSchema,
  LIMITE_CRONOGRAMA_ENVIO,
  normalizarItem,
  semCronograma,
  sugerirItens,
  ULTIMO_PME,
  type AuthUser,
  type Bloco,
  type CicloDTO,
  type CronogramaDTO,
  type CronogramaEscolha,
  type CronogramaItemCriar,
  type CronogramaItemPatch,
  type ItemBanco,
  type ItemBancoDTO,
} from '@npac/shared';
import { and, eq, sql } from 'drizzle-orm';
import { CurrentUser, type SessionUser } from '../auth/current-user.decorator.js';
import { DB } from '../common/db/db.module.js';
import { entityId } from '../common/validate.js';
import { CiclosService, lerRecebidos } from './ciclos.service.js';
import { conflitoDeVersao, erroDoBanco, validarComAviso } from './erros.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { MentoriaController } from './mentoria.guard.js';
import { Perfis, SoAdmin } from './perfil.guard.js';

const REPETIDO = 'Esse item já está no banco';
const ORDEM_BLOCO = sql.raw(
  `array_position(array[${BLOCOS.map((b) => `'${b}'`).join(', ')}], i.bloco)`,
);

/**
 * Cronograma do PME (NPAC-60, desenho docs/superpowers/specs/2026-11-24-cronograma-design.md): dados da
 * janela de envio e da aba da ficha, itens que entram ou saem do PME em andamento e o banco de itens
 * (só a Admin). Quem vê: Admin, Acompanhamento e Operação; a Especialista recebe 404 (C12).
 */
@Injectable()
export class CronogramaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly ciclos: CiclosService,
  ) {}

  private async banco(tx: Tx, bloco?: Bloco): Promise<ItemBancoDTO[]> {
    return [
      ...(await tx.execute<ItemBancoDTO>(sql`
        select i.id, i.bloco, i.texto, i.ordem, i.ativo, i.version,
          (select count(*)::int from mentoria_tarefas t where t.cronograma_item_id = i.id) as envios
        from mentoria_cronograma_itens i
        where ${bloco ? sql`i.bloco = ${bloco}` : sql`true`}
        order by ${ORDEM_BLOCO}, i.ordem, i.criado_em, i.id`)),
    ];
  }

  doMentorado(u: AuthUser, inscricaoId: string): Promise<CronogramaDTO> {
    const hoje = this.ciclos.hoje();
    return withUser(this.db, u.id, async (tx) => {
      const [i] = await tx.execute<{
        status: string;
        variante: string | null;
        termino: string | null;
        ultimo: number | null;
        pode: boolean;
      }>(sql`
        select i.status, i.mentoria_variante as variante,
          to_char(i.termino_previsto, 'YYYY-MM-DD') as termino,
          (select max(c.numero) from mentoria_ciclos c where c.inscricao_id = i.id) as ultimo,
          mentoria_edita('PME', i.id) as pode
        from mentoria_inscricoes i where i.id = ${inscricaoId}::uuid`);
      if (!i) throw new NotFoundException();
      const banco: ItemBanco[] = (await this.banco(tx)).map(
        ({ id, bloco, texto, ordem, ativo }) => ({ id, bloco, texto, ordem, ativo }),
      );
      const recebidos = await lerRecebidos(tx, inscricaoId);
      const numero = (i.ultimo ?? 0) + 1;
      const proximo =
        i.status === 'ATIVO' && numero <= ULTIMO_PME && !(i.termino && hoje > i.termino)
          ? numero
          : null;
      const sem = semCronograma(i.variante);
      return {
        banco,
        recebidos,
        proximo,
        sugestao: sugerirItens(banco, recebidos, proximo ?? 0, sem || proximo === null),
        semCronograma: sem,
        podeEscolher: i.pode,
      };
    });
  }

  /** Itens que entram no PME em andamento (§7), com as mesmas regras do envio. */
  incluir(u: AuthUser, cicloId: string, escolhas: CronogramaEscolha[]): Promise<CicloDTO> {
    return withUser(this.db, u.id, async (tx) => {
      const [c] = await tx.execute<{
        inscricao_id: string;
        numero: number;
        prazo: string;
        aberto: boolean;
        ja: number;
        ordem: number;
      }>(sql`
        select c.inscricao_id, c.numero, to_char(c.prazo, 'YYYY-MM-DD') as prazo,
          c.concluido_em is null and c.nao_concluido_em is null as aberto,
          (select count(*)::int from mentoria_tarefas t
            where t.ciclo_id = c.id and t.origem = 'PME') as ja,
          (select coalesce(max(t.ordem) + 1, 0) from mentoria_tarefas t where t.ciclo_id = c.id) as ordem
        from mentoria_ciclos c where c.id = ${cicloId}::uuid`);
      if (!c) throw new NotFoundException();
      await exigirEdicao(tx, 'PME', c.inscricao_id);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`mentoria_ciclos:${c.inscricao_id}`}))`,
      );
      if (!c.aberto) throw new BadRequestException('Só entra item no PME em andamento');
      if (c.ja + escolhas.length > LIMITE_CRONOGRAMA_ENVIO)
        throw new BadRequestException(`Até ${LIMITE_CRONOGRAMA_ENVIO} itens do cronograma por PME`);
      const itens = await this.ciclos.prepararCronograma(tx, c.inscricao_id, c.numero, escolhas);
      await this.ciclos.inserirCronograma(
        tx,
        c.inscricao_id,
        { id: cicloId, prazo: c.prazo },
        itens,
        c.ordem,
      );
      await registrarHistorico(tx, c.inscricao_id, 'pme.cronograma_incluido', [
        ...new Set(itens.map((x) => x.bloco)),
      ]);
      return this.ciclos.um(tx, c.inscricao_id, cicloId);
    }).catch((e) => erroDoBanco(e, 'Esse item já está neste PME'));
  }

  /** Tirar um item do PME em andamento (C11): pela função do banco, que confere tudo. */
  async remover(u: AuthUser, tarefaId: string, version: number): Promise<void> {
    await withUser(this.db, u.id, (tx) =>
      tx.execute(sql`select mentoria_cronograma_remover(${tarefaId}::uuid, ${version}::int)`),
    ).catch((e) => erroDoBanco(e));
  }

  listarItens(u: AuthUser, bloco?: Bloco): Promise<ItemBancoDTO[]> {
    return withUser(this.db, u.id, (tx) => this.banco(tx, bloco));
  }

  private async umItem(tx: Tx, id: string): Promise<ItemBancoDTO> {
    const [r] = await tx.execute<ItemBancoDTO>(sql`
      select i.id, i.bloco, i.texto, i.ordem, i.ativo, i.version,
        (select count(*)::int from mentoria_tarefas t where t.cronograma_item_id = i.id) as envios
      from mentoria_cronograma_itens i where i.id = ${id}::uuid`);
    if (!r) throw new NotFoundException();
    return r;
  }

  private chave(texto: string): string {
    const norm = normalizarItem(texto);
    if (!norm) throw new BadRequestException('Escreva o texto do item');
    return norm;
  }

  criarItem(u: AuthUser, b: CronogramaItemCriar): Promise<ItemBancoDTO> {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mentoria_cronograma_itens'))`);
      const [r] = await tx
        .insert(mentoriaCronogramaItens)
        .values({
          bloco: b.bloco,
          texto: b.texto,
          textoNorm: this.chave(b.texto),
          ordem: sql`(select coalesce(max(x.ordem), 0) + 1 from mentoria_cronograma_itens x
            where x.bloco = ${b.bloco})`,
        })
        .returning({ id: mentoriaCronogramaItens.id });
      return this.umItem(tx, r!.id);
    }).catch((e) => erroDoBanco(e, REPETIDO));
  }

  editarItem(u: AuthUser, id: string, b: CronogramaItemPatch): Promise<ItemBancoDTO> {
    return withUser(this.db, u.id, async (tx) => {
      if (b.texto === undefined && b.ativo === undefined)
        throw new BadRequestException('Nada para alterar');
      const [r] = await tx
        .update(mentoriaCronogramaItens)
        .set({
          ...(b.texto !== undefined ? { texto: b.texto, textoNorm: this.chave(b.texto) } : {}),
          ...(b.ativo !== undefined ? { ativo: b.ativo } : {}),
          version: sql`${mentoriaCronogramaItens.version} + 1`,
        })
        .where(
          and(eq(mentoriaCronogramaItens.id, id), eq(mentoriaCronogramaItens.version, b.version)),
        )
        .returning({ id: mentoriaCronogramaItens.id });
      if (r) return this.umItem(tx, r.id);
      await this.umItem(tx, id); // 404 se não existe
      throw conflitoDeVersao();
    }).catch((e) => erroDoBanco(e, REPETIDO));
  }
}

/** Janela de envio, aba da ficha e itens do PME em andamento. */
@MentoriaController('')
export class CronogramaController {
  constructor(private readonly cronograma: CronogramaService) {}

  @Get('inscricoes/:id/cronograma')
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  doMentorado(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.cronograma.doMentorado(u, entityId(id));
  }

  @Post('ciclos/:id/cronograma')
  @HttpCode(201)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  incluir(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validarComAviso(cronogramaIncluirSchema, body);
    return this.cronograma.incluir(u, entityId(id), b.cronograma);
  }

  @Delete('tarefas/:id/cronograma')
  @HttpCode(204)
  @Perfis('ACOMPANHAMENTO', 'OPERACAO')
  async remover(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    const b = validarComAviso(cronogramaRemoverSchema, body ?? {});
    await this.cronograma.remover(u, entityId(id), b.version);
  }
}

/** Banco de itens (Configurações → Cronograma): só a Admin (C2). */
@MentoriaController('cronograma')
export class CronogramaBancoController {
  constructor(private readonly cronograma: CronogramaService) {}

  @Get('itens')
  @SoAdmin()
  listar(@CurrentUser() u: SessionUser, @Query('bloco') bloco?: string) {
    return this.cronograma.listarItens(
      u,
      validarComAviso(cronogramaBlocoSchema, bloco || undefined),
    );
  }

  @Post('itens')
  @HttpCode(201)
  @SoAdmin()
  criar(@CurrentUser() u: SessionUser, @Body() body: unknown) {
    return this.cronograma.criarItem(u, validarComAviso(cronogramaItemCriarSchema, body));
  }

  @Patch('itens/:id')
  @SoAdmin()
  editar(@CurrentUser() u: SessionUser, @Param('id') id: string, @Body() body: unknown) {
    return this.cronograma.editarItem(
      u,
      entityId(id),
      validarComAviso(cronogramaItemPatchSchema, body),
    );
  }
}
