import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  mentoriaConquistas,
  mentoriaFichaCampos,
  mentoriaFichas,
  mentoriaMentorados,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  bytesDeTexto,
  LIMITE_REGISTRO_BYTES,
  nomeNormalizado,
  parseData,
  secaoDoCampo,
  type AtualizarFicha,
  type AtualizarMentorado,
  type AuthUser,
  type CriarMentorado,
  type FichaCampoChave,
} from '@npac/shared';
import { and, eq, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import { DB } from '../common/db/db.module.js';
import { conflitoDeVersao, erroDoBanco } from './erros.js';
import { aad, MentoriaCrypto } from './mentoria-crypto.js';

const NOME_MENTORADO = 'Já existe um mentorado com este nome';
const NOME_FICHA = 'Já existe uma ficha com este nome';

/** Tipos de registro aceitos na rota genérica de exclusão (URL → função SQL). */
export const KINDS = {
  mentorado: 'MENTORADO',
  ficha: 'FICHA',
  conquista: 'CONQUISTA',
  'rdv-pessoa': 'RDV_PESSOA',
  'rdv-evento': 'RDV_EVENTO',
  'rdv-duvida': 'RDV_DUVIDA',
  'rdv-quadro': 'RDV_QUADRO_ITEM',
} as const;
export type KindUrl = keyof typeof KINDS;

/** Texto opcional: `undefined` = não mexe; `null` ou vazio = apaga. */
const opcional = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

function dataDe(v: string | null | undefined) {
  if (v === undefined) return {};
  const p = parseData(v ?? '');
  return { texto: p.texto || null, data: p.data };
}

@Injectable()
export class EscritaService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly audit: AuditService,
  ) {}

  criarMentorado(u: AuthUser, input: CriarMentorado) {
    const data = dataDe(input.dataEntrada);
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .insert(mentoriaMentorados)
        .values({
          nome: input.nome,
          nomeNorm: nomeNormalizado(input.nome),
          tipoCadastro: opcional(input.tipoCadastro),
          tipoMentoria: opcional(input.tipoMentoria),
          dataEntradaTexto: data.texto ?? null,
          dataEntrada: data.data ?? null,
          status: input.status,
          createdBy: u.id,
          updatedBy: u.id,
        })
        .returning({ id: mentoriaMentorados.id, version: mentoriaMentorados.version });
      return row!;
    }).catch((e) => erroDoBanco(e, NOME_MENTORADO));
  }

  atualizarMentorado(u: AuthUser, id: string, input: AtualizarMentorado) {
    const data = dataDe(input.dataEntrada);
    return withUser(this.db, u.id, async (tx) => {
      const [row] = await tx
        .update(mentoriaMentorados)
        .set({
          ...(input.nome !== undefined && {
            nome: input.nome,
            nomeNorm: nomeNormalizado(input.nome),
          }),
          tipoCadastro: opcional(input.tipoCadastro),
          tipoMentoria: opcional(input.tipoMentoria),
          ...(input.dataEntrada !== undefined && {
            dataEntradaTexto: data.texto ?? null,
            dataEntrada: data.data ?? null,
          }),
          status: input.status,
          version: sql`${mentoriaMentorados.version} + 1`,
          updatedBy: u.id,
          updatedAt: new Date(),
        })
        .where(and(eq(mentoriaMentorados.id, id), eq(mentoriaMentorados.version, input.version)))
        .returning({ id: mentoriaMentorados.id, version: mentoriaMentorados.version });
      if (row) return row;
      const [existe] = await tx
        .select({ id: mentoriaMentorados.id })
        .from(mentoriaMentorados)
        .where(eq(mentoriaMentorados.id, id));
      throw existe ? conflitoDeVersao() : new NotFoundException();
    }).catch((e) => erroDoBanco(e, NOME_MENTORADO));
  }

  /**
   * Edita a ficha (nome, notas, tempo e as 9 caixas fixas) com a version da ficha (D5). O
   * limite de 256 KB soma o registro inteiro depois da edição: o que já está gravado e o novo.
   */
  atualizarFicha(u: AuthUser, id: string, input: AtualizarFicha) {
    return withUser(this.db, u.id, async (tx) => {
      const [f] = await tx
        .select()
        .from(mentoriaFichas)
        .where(eq(mentoriaFichas.id, id))
        .for('update');
      if (!f) throw new NotFoundException();
      if (f.version !== input.version) throw conflitoDeVersao();

      await this.checarLimiteFicha(tx, f, input);

      const cif = (col: string, v: string | null | undefined) =>
        v === undefined
          ? undefined
          : this.crypto.cifrarOpcional(v || null, aad('mentoria_fichas', col, id));
      const data = dataDe(input.dataInicio);
      const [row] = await tx
        .update(mentoriaFichas)
        .set({
          ...(input.nome !== undefined && {
            nome: input.nome,
            nomeNorm: nomeNormalizado(input.nome),
          }),
          ...(input.dataInicio !== undefined && {
            dataInicioTexto: data.texto ?? null,
            dataInicio: data.data ?? null,
          }),
          notasMomentoInicial: cif('notas_momento_inicial', input.notasMomentoInicial),
          notasMomentoAtual: cif('notas_momento_atual', input.notasMomentoAtual),
          tempoMentoriaTexto: cif('tempo_mentoria_texto', input.tempoMentoria),
          version: f.version + 1,
          updatedBy: u.id,
          updatedAt: new Date(),
        })
        .where(eq(mentoriaFichas.id, id))
        .returning({ id: mentoriaFichas.id, version: mentoriaFichas.version });

      for (const [chave, valor] of Object.entries(input.campos ?? {}) as [
        FichaCampoChave,
        { antes?: string | null; depois?: string | null },
      ][]) {
        const cifra = (col: 'antes' | 'depois') =>
          valor[col] === undefined
            ? undefined
            : this.crypto.cifrarOpcional(
                valor[col] || null,
                aad('mentoria_ficha_campos', col, id, chave),
              );
        const antes = cifra('antes');
        const depois = cifra('depois');
        await tx
          .insert(mentoriaFichaCampos)
          .values({
            fichaId: id,
            secao: secaoDoCampo(chave),
            chave,
            antes,
            depois,
            updatedBy: u.id,
          })
          .onConflictDoUpdate({
            target: [mentoriaFichaCampos.fichaId, mentoriaFichaCampos.chave],
            set: { antes, depois, updatedBy: u.id, updatedAt: new Date() },
          });
      }
      return row!;
    }).catch((e) => erroDoBanco(e, NOME_FICHA));
  }

  private async checarLimiteFicha(
    tx: Tx,
    f: typeof mentoriaFichas.$inferSelect,
    input: AtualizarFicha,
  ) {
    const dec = (col: string, v: string | null) =>
      this.crypto.decifrarOpcional(v, aad('mentoria_fichas', col, f.id));
    const campos = await tx
      .select()
      .from(mentoriaFichaCampos)
      .where(eq(mentoriaFichaCampos.fichaId, f.id));
    const conquistas = await tx
      .select({
        id: mentoriaConquistas.id,
        descricao: mentoriaConquistas.descricao,
        dataTexto: mentoriaConquistas.dataTexto,
      })
      .from(mentoriaConquistas)
      .where(eq(mentoriaConquistas.fichaId, f.id));
    const pick = <T>(novo: T | undefined, atual: T) => (novo === undefined ? atual : novo);
    const caixas = campos.map((c) => {
      const novo = input.campos?.[c.chave as FichaCampoChave];
      return [
        pick(
          novo?.antes,
          this.crypto.decifrarOpcional(
            c.antes,
            aad('mentoria_ficha_campos', 'antes', f.id, c.chave),
          ),
        ),
        pick(
          novo?.depois,
          this.crypto.decifrarOpcional(
            c.depois,
            aad('mentoria_ficha_campos', 'depois', f.id, c.chave),
          ),
        ),
      ];
    });
    const novasCaixas = Object.entries(input.campos ?? {})
      .filter(([k]) => !campos.some((c) => c.chave === k))
      .map(([, v]) => v);
    const total = bytesDeTexto([
      pick(input.nome, f.nome),
      pick(input.dataInicio, f.dataInicioTexto),
      pick(input.notasMomentoInicial, dec('notas_momento_inicial', f.notasMomentoInicial)),
      pick(input.notasMomentoAtual, dec('notas_momento_atual', f.notasMomentoAtual)),
      pick(input.tempoMentoria, dec('tempo_mentoria_texto', f.tempoMentoriaTexto)),
      caixas,
      novasCaixas,
      conquistas.map((c) => [
        c.dataTexto,
        this.crypto.decifrarOpcional(c.descricao, aad('mentoria_conquistas', 'descricao', c.id)),
      ]),
    ]);
    if (total > LIMITE_REGISTRO_BYTES)
      throw new BadRequestException('Registro acima do limite de 256 KB');
  }

  /** Exclusão (regra 6): só pela função SQL, que enfileira a mídia. Sem rota de restauração. */
  excluir(u: AuthUser, kind: KindUrl, id: string, version: number) {
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select mentoria_excluir_registro(${KINDS[kind]}, ${id}, ${version})`);
      await this.audit.record(
        {
          actorId: u.id,
          action: 'mentoria.delete',
          entityType: KINDS[kind].toLowerCase(),
          entityId: id,
          data: { kind: KINDS[kind] },
        },
        tx,
      );
    }).catch((e) => erroDoBanco(e));
  }
}
