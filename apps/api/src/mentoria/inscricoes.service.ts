import { hkdfSync, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { mentoriaInscricoes, mentoriaPessoas, withUser, type Db, type Tx } from '@npac/db';
import {
  nomeNormalizado,
  normalizePhoneBR,
  type AuthUser,
  type InscricaoItem,
  type InscricaoNova,
  type InscricaoPatch,
  type InscricoesLista,
  type PaginaInscricoes,
  type PessoaNova,
  type PessoaPatch,
  type ResumoCarteira,
} from '@npac/shared';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { DB } from '../common/db/db.module.js';
import { ENV, type Env } from '../config/env.js';
import { CursorSigner } from './cursor.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { FichaService } from './ficha.service.js';
import { exigirEdicao, registrarHistorico } from './historico.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';
import { criarEtapas } from './onboarding.service.js';
import { PlanoService } from './plano.service.js';

const PAGINA = 50;
const LIMITE_BUSCA = 20;
const HOJE = sql`(now() at time zone 'America/Sao_Paulo')::date`;
/** Escapa curingas do LIKE: o termo da busca é texto, nunca padrão. */
const semCuringa = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const TELEFONE = /^[\d\s()+.-]+$/;

type LinhaBruta = {
  id: string;
  tipo: InscricaoItem['tipo'];
  mentoria: InscricaoItem['mentoria'];
  status: InscricaoItem['status'];
  mes: number | null;
  responsavel_id: string | null;
  responsavel: string | null;
  completar: boolean;
  pessoas: InscricaoItem['pessoas'];
  plano: InscricaoItem['plano'];
};

const emItem = (r: LinhaBruta): InscricaoItem => ({
  id: r.id,
  nome: r.pessoas.map((p) => p.nome).join(' e '),
  tipo: r.tipo,
  mentoria: r.mentoria,
  status: r.status,
  mesJornada: r.mes,
  responsavel:
    r.responsavel_id && r.responsavel ? { id: r.responsavel_id, nome: r.responsavel } : null,
  // Reuniões e contatos chegam na Parte 4 (Tarefa 4.3).
  ultimoContato: null,
  completar: r.completar,
  pessoas: r.pessoas,
  plano: r.plano,
});

const COMPLETAR = sql`(i.importada and ((i.mentoria = 'RDV' and i.data_idr is null)
  or cardinality(i.completar_campos) > 0))`;

@Injectable()
export class InscricoesService {
  private readonly cursor: CursorSigner;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly crypto: MentoriaCrypto,
    private readonly ficha: FichaService,
    private readonly plano: PlanoService,
  ) {
    const key = hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'npac:mentoria:cursor', 32);
    this.cursor = new CursorSigner(Buffer.from(key));
  }

  /** Valores de gravação da pessoa: contato normalizado, cifrado e com índice cego. */
  private contato(id: string, p: Pick<PessoaPatch, 'whatsapp' | 'email'>) {
    const out: Partial<typeof mentoriaPessoas.$inferInsert> = {};
    if (p.whatsapp !== undefined) {
      const fone = p.whatsapp === null ? null : normalizePhoneBR(p.whatsapp);
      if (p.whatsapp !== null && !fone)
        throw new BadRequestException('WhatsApp inválido. Use o número com DDD.');
      out.whatsapp = this.crypto.cifrarOpcional(fone, aad('mentoria_pessoas', 'whatsapp', id));
      out.whatsappIdx = fone ? this.crypto.indiceCego(fone) : null;
    }
    if (p.email !== undefined) {
      const email = p.email?.toLowerCase() ?? null;
      out.email = this.crypto.cifrarOpcional(email, aad('mentoria_pessoas', 'email', id));
      out.emailIdx = email ? this.crypto.indiceCego(email) : null;
    }
    return out;
  }

  private async inserirPessoa(
    tx: Tx,
    u: AuthUser,
    inscricaoId: string,
    ordem: number,
    p: PessoaNova,
  ) {
    const id = randomUUID();
    const { whatsapp, email, ...resto } = p;
    await tx.insert(mentoriaPessoas).values({
      ...resto,
      ...this.contato(id, { whatsapp, email }),
      id,
      inscricaoId,
      ordem,
      nomeNorm: nomeNormalizado(p.nome),
      criadoPor: u.id,
    });
  }

  criar(u: AuthUser, b: InscricaoNova) {
    const esperadas = b.tipo === 'CASAL' ? 2 : 1;
    if (b.pessoas.length !== esperadas)
      throw new BadRequestException(
        b.tipo === 'CASAL' ? 'Informe as duas pessoas do casal' : 'Individual tem uma pessoa só',
      );
    return withUser(this.db, u.id, async (tx) => {
      const { pessoas, ...campos } = b;
      const id = randomUUID();
      await tx.insert(mentoriaInscricoes).values({
        ...campos,
        id,
        criadoPor: u.id,
        terminoPrevisto:
          campos.terminoPrevisto ??
          (campos.inicioJornada
            ? sql`(${campos.inicioJornada}::date + interval '12 months')::date`
            : null),
      });
      for (const [i, p] of pessoas.entries()) await this.inserirPessoa(tx, u, id, i + 1, p);
      await criarEtapas(tx, id, 'PENDENTE', u.id);
      await registrarHistorico(tx, id, 'inscricao.criada', []);
      return this.ficha.montar(tx, id);
    }).catch((e) => erroDoBanco(e));
  }

  private async consultar(tx: Tx, where: SQL[], limite: number, depois?: SQL) {
    const todos = [...where, ...(depois ? [depois] : [])];
    const filtro = todos.length ? sql`where ${sql.join(todos, sql` and `)}` : sql``;
    return tx.execute<LinhaBruta>(sql`
      select i.id, i.tipo, i.mentoria, i.status, i.responsavel_id, u.name as responsavel,
        mentoria_mes_jornada(i.id, ${HOJE}) as mes,
        ${COMPLETAR} as completar,
        (select json_agg(json_build_object('nome', p.nome, 'apelido', p.apelido,
           'fotoMidiaId', p.foto_midia_id) order by p.ordem)
         from mentoria_pessoas p where p.inscricao_id = i.id) as pessoas,
        (select json_build_object('total', count(*),
           'feitas', count(*) filter (where a.status = 'FEITA'),
           'atrasadas', count(*) filter (where mentoria_acao_atrasada(a.status,
             a.anterior_ao_sistema, a.data_limite, ${HOJE})))
         from mentoria_acoes a where a.inscricao_id = i.id) as plano
      from mentoria_inscricoes i
      join mentoria_pessoas p1 on p1.inscricao_id = i.id and p1.ordem = 1
      left join "user" u on u.id = i.responsavel_id
      ${filtro}
      order by p1.nome_norm, i.id
      limit ${limite}`);
  }

  listar(u: AuthUser, f: InscricoesLista): Promise<PaginaInscricoes> {
    return withUser(this.db, u.id, async (tx) => {
      const where: SQL[] = [];
      if (f.status) where.push(sql`i.status = ${f.status}`);
      if (f.responsavelId) where.push(sql`i.responsavel_id = ${f.responsavelId}`);
      if (f.mes) where.push(sql`mentoria_mes_jornada(i.id, ${HOJE}) = ${f.mes}`);
      if (f.completar) where.push(COMPLETAR);
      let depois: SQL | undefined;
      if (f.cursor) {
        const id = this.cursor.verify(f.cursor);
        depois = sql`(p1.nome_norm, i.id) > (
          select p.nome_norm, p.inscricao_id from mentoria_pessoas p
          where p.inscricao_id = ${id}::uuid and p.ordem = 1)`;
      }
      const linhas = await this.consultar(tx, where, PAGINA + 1, depois);
      const pagina = [...linhas].slice(0, PAGINA);
      const filtro = where.length ? sql`where ${sql.join(where, sql` and `)}` : sql``;
      const [t] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from mentoria_inscricoes i ${filtro}`,
      );
      const [resumo] = await tx.execute<ResumoCarteira>(sql`
        select count(*)::int as total,
          (count(*) filter (where i.status = 'ATIVO'))::int as ativos,
          (count(*) filter (where i.status = 'ONBOARDING'))::int as onboarding,
          (count(*) filter (where i.status = 'PAUSADO'))::int as pausados,
          (count(*) filter (where ${COMPLETAR}))::int as completar
        from mentoria_inscricoes i`);
      return {
        itens: pagina.map(emItem),
        cursor: linhas.length > PAGINA ? this.cursor.sign(pagina.at(-1)!.id) : null,
        total: t?.n ?? 0,
        resumo: resumo!,
      };
    });
  }

  /** Telefone e e-mail acham só o valor completo (índice cego); o nome acha por trecho. */
  buscar(u: AuthUser, termo: string) {
    return withUser(this.db, u.id, async (tx) => {
      let pessoa: SQL | null;
      if (termo.includes('@')) {
        pessoa = sql`p.email_idx = ${this.crypto.indiceCego(termo.toLowerCase())}`;
      } else if (TELEFONE.test(termo)) {
        const fone = normalizePhoneBR(termo);
        pessoa = fone ? sql`p.whatsapp_idx = ${this.crypto.indiceCego(fone)}` : null;
      } else {
        pessoa = sql`p.nome_norm like ${`%${semCuringa(nomeNormalizado(termo))}%`}`;
      }
      if (!pessoa) return { itens: [] };
      const linhas = await this.consultar(
        tx,
        [sql`exists (select 1 from mentoria_pessoas p where p.inscricao_id = i.id and ${pessoa})`],
        LIMITE_BUSCA,
      );
      return { itens: [...linhas].map(emItem) };
    });
  }

  atualizar(u: AuthUser, id: string, b: InscricaoPatch) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'INSCRICAO', id);
      const { version, ...campos } = b;
      const [atual] = await tx
        .select({
          status: mentoriaInscricoes.status,
          mentoria: mentoriaInscricoes.mentoria,
          inicio: mentoriaInscricoes.inicioJornada,
          termino: mentoriaInscricoes.terminoPrevisto,
        })
        .from(mentoriaInscricoes)
        .where(eq(mentoriaInscricoes.id, id))
        .for('update');
      if (!atual) throw new NotFoundException();
      const mudaInicio =
        campos.inicioJornada !== undefined && campos.inicioJornada !== atual.inicio;
      const mudaMentoria = campos.mentoria !== undefined && campos.mentoria !== atual.mentoria;
      if (mudaInicio && (campos.mentoria ?? atual.mentoria) === 'RDV')
        throw new BadRequestException('No RDV o início é a data da IDR');
      const comPlano = (mudaInicio || mudaMentoria) && (await this.plano.temAcoes(tx, id));
      if (comPlano) {
        if (!(await this.plano.editaPlano(tx, id)))
          throw new BadRequestException('Só o Acompanhamento muda o início ou a mentoria do plano');
        if (mudaInicio && !campos.inicioJornada)
          throw new BadRequestException('O plano já começou: o início não pode ficar vazio');
      }
      // No RDV não se dispensa etapa: trocar a mentoria não pode servir de atalho.
      if (campos.mentoria === 'RDV' && atual.mentoria !== 'RDV') {
        const [q] = await tx.execute<{ tem: boolean }>(sql`select exists (
          select 1 from mentoria_onboarding_etapas
          where inscricao_id = ${id}::uuid and status = 'DISPENSADA') as tem`);
        if (q?.tem)
          throw new BadRequestException(
            'Esta inscrição tem etapas dispensadas: não pode virar RDV',
          );
      }
      if (campos.status && campos.status !== atual.status) {
        if (campos.status === 'PAUSADO') throw new BadRequestException('Use a ação de pausar');
        if (atual.status === 'PAUSADO') throw new BadRequestException('Use a ação de retomar');
        const [q] = await tx.execute<{ ok: boolean }>(
          sql`select mentoria_admin() or coalesce(mentoria_perfil() = 'ACOMPANHAMENTO', false) as ok`,
        );
        if (!q?.ok) throw new BadRequestException('Só o Acompanhamento muda o status');
      }
      const padraoTermino =
        campos.inicioJornada && campos.terminoPrevisto === undefined
          ? {
              terminoPrevisto: sql`coalesce(${mentoriaInscricoes.terminoPrevisto},
                (${campos.inicioJornada}::date + interval '12 months')::date)`,
            }
          : {};
      const [r] = await tx
        .update(mentoriaInscricoes)
        .set({
          ...campos,
          ...padraoTermino,
          version: sql`${mentoriaInscricoes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaInscricoes.id, id), eq(mentoriaInscricoes.version, version)))
        .returning({ version: mentoriaInscricoes.version });
      if (!r) throw conflitoDeVersao();
      if (campos.inicioJornada)
        await tx.execute(sql`update mentoria_inscricoes
          set completar_campos = array_remove(completar_campos, 'inicioJornada')
          where id = ${id}::uuid`);
      // Em onboarding as ações esperam o fechamento, que usa o início já gravado.
      if (mudaInicio && campos.inicioJornada && atual.status !== 'ONBOARDING')
        await this.plano.aplicarInicio(
          tx,
          id,
          campos.inicioJornada,
          campos.terminoPrevisto === undefined
            ? atual
            : { inicio: atual.inicio, termino: campos.terminoPrevisto },
        );
      if (mudaMentoria && comPlano) await this.plano.trocarPlano(tx, id);
      await registrarHistorico(tx, id, 'inscricao.editada', Object.keys(campos));
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  atualizarPessoa(u: AuthUser, pessoaId: string, b: PessoaPatch) {
    return withUser(this.db, u.id, async (tx) => {
      const [p] = await tx
        .select({ inscricaoId: mentoriaPessoas.inscricaoId })
        .from(mentoriaPessoas)
        .where(eq(mentoriaPessoas.id, pessoaId));
      if (!p) throw new NotFoundException();
      await exigirEdicao(tx, 'INSCRICAO', p.inscricaoId);
      const { version, whatsapp, email, ...campos } = b;
      const [r] = await tx
        .update(mentoriaPessoas)
        .set({
          ...campos,
          ...(campos.nome ? { nomeNorm: nomeNormalizado(campos.nome) } : {}),
          ...this.contato(pessoaId, { whatsapp, email }),
          version: sql`${mentoriaPessoas.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(and(eq(mentoriaPessoas.id, pessoaId), eq(mentoriaPessoas.version, version)))
        .returning({ version: mentoriaPessoas.version });
      if (!r) throw conflitoDeVersao();
      const nomes = [
        ...Object.keys(campos),
        ...(whatsapp !== undefined ? ['whatsapp'] : []),
        ...(email !== undefined ? ['email'] : []),
      ];
      await registrarHistorico(tx, p.inscricaoId, 'pessoa.editada', nomes);
      return r;
    }).catch((e) => erroDoBanco(e));
  }

  adicionarPessoa2(u: AuthUser, id: string, p: PessoaNova) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'INSCRICAO', id);
      const [atual] = await tx
        .select({ tipo: mentoriaInscricoes.tipo })
        .from(mentoriaInscricoes)
        .where(eq(mentoriaInscricoes.id, id));
      if (atual?.tipo === 'CASAL') throw new ConflictException('Esta inscrição já é de casal');
      await this.inserirPessoa(tx, u, id, 2, p);
      await tx
        .update(mentoriaInscricoes)
        .set({
          tipo: 'CASAL',
          version: sql`${mentoriaInscricoes.version} + 1`,
          atualizadoEm: sql`now()`,
        })
        .where(eq(mentoriaInscricoes.id, id));
      await tx.execute(sql`update mentoria_inscricoes
        set completar_campos = array_remove(completar_campos, 'pessoa_2') where id = ${id}::uuid`);
      await registrarHistorico(tx, id, 'inscricao.virou_casal', ['tipo', 'pessoa_2']);
      return this.ficha.montar(tx, id);
    }).catch((e) => erroDoBanco(e));
  }

  removerPessoa2(u: AuthUser, id: string) {
    return withUser(this.db, u.id, async (tx) => {
      await exigirEdicao(tx, 'INSCRICAO', id);
      await tx.execute(sql`select mentoria_remover_pessoa_2(${id}::uuid)`);
      return this.ficha.montar(tx, id);
    }).catch((e) => erroDoBanco(e));
  }
}
