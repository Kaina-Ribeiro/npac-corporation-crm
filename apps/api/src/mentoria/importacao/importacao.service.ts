import { randomUUID } from 'node:crypto';
import { BadRequestException, HttpException, Inject, Injectable } from '@nestjs/common';
import {
  mentoriaEnderecos,
  mentoriaInscricoes,
  mentoriaLegado,
  mentoriaMomentoInicial,
  mentoriaPessoas,
  withUser,
  type Db,
  type Tx,
} from '@npac/db';
import {
  montarCarteira,
  nomeNormalizado,
  normalizePhoneBR,
  type AuthUser,
  type CarteiraPrevia,
  type FontesImportacao,
  type ImportarCarteira,
  type InscricaoImportada,
  type ItemPrevia,
  type PessoaImportada,
  type PreviaImportacao,
  type ResultadoImportacao,
} from '@npac/shared';
import { sql } from 'drizzle-orm';
import { DB } from '../../common/db/db.module.js';
import { erroDoBanco } from '../erros.js';
import { registrarHistorico } from '../historico.js';
import { aad, MentoriaCrypto } from '../mentoria-crypto.js';
import { criarEtapas } from '../onboarding.service.js';
import { PlanoService } from '../plano.service.js';
import { lerPlanilha } from './ler-planilha.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** CEP com rótulo ou no formato 00000-000, para não confundir com outro número do endereço. */
const CEP = /(?:cep[:\s]*(\d{5})-?(\d{3}))|\b(\d{5})-(\d{3})\b/i;

const cepDe = (endereco: string) => {
  const m = CEP.exec(endereco);
  return m ? `${m[1] ?? m[3]}${m[2] ?? m[4]}` : null;
};

@Injectable()
export class ImportacaoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly crypto: MentoriaCrypto,
    private readonly plano: PlanoService,
  ) {}

  /** A planilha é lida fora da transação: quem espera é a tela, não o banco. */
  private async fontes(b: ImportarCarteira): Promise<FontesImportacao> {
    return {
      gerenciador: b.gerenciador,
      planilha: b.planilhaBase64
        ? await lerPlanilha(Buffer.from(b.planilhaBase64, 'base64'))
        : undefined,
      decisoes: b.decisoes,
    };
  }

  /** Nomes de todas as pessoas e chaves já importadas: quem está aqui não entra de novo. */
  private async jaCadastrados(tx: Tx): Promise<Set<string>> {
    const linhas = await tx.execute<{ chave: string }>(sql`
      select nome_norm as chave from mentoria_pessoas
      union
      select importacao_chave from mentoria_inscricoes where importacao_chave is not null
      union
      select unnest(importacao_apelidos) from mentoria_inscricoes`);
    return new Set([...linhas].map((l) => l.chave));
  }

  private montar(fontes: FontesImportacao, jaCadastrados: Set<string>): CarteiraPrevia {
    try {
      return montarCarteira({ ...fontes, jaCadastrados });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Erro de formato do arquivo: a mensagem cita o número do registro, nunca o conteúdo.
      throw new BadRequestException(`Arquivo do gerenciador inválido. ${(e as Error).message}`);
    }
  }

  async previa(u: AuthUser, b: ImportarCarteira): Promise<PreviaImportacao> {
    const fontes = await this.fontes(b);
    const c = await withUser(this.db, u.id, async (tx) =>
      this.montar(fontes, await this.jaCadastrados(tx)),
    );
    const novos = c.novos.map((n): ItemPrevia => ({
      chave: n.chave,
      nome: n.nome,
      tipo: n.tipo,
      mentoria: n.mentoria,
      rotulo: n.rotulo,
      status: n.status,
      pessoa1: n.pessoas[0]!.nome,
      pessoa2: n.pessoas[1]?.nome ?? null,
      completar: n.completar.length,
    }));
    return {
      totais: {
        novos: novos.length,
        individuais: novos.filter((n) => n.tipo === 'INDIVIDUAL').length,
        casais: novos.filter((n) => n.tipo === 'CASAL').length,
        cancelados: novos.filter((n) => n.status === 'CANCELADO').length,
        completar: novos.filter((n) => n.completar > 0).length,
        ignorados: c.ignorados.length,
      },
      novos,
      naoCasados: c.naoCasados,
      parecidos: c.parecidos,
      rotulosSemMentoria: c.rotulosSemMentoria,
      ignorados: c.ignorados,
    };
  }

  private contato(id: string, ordem: number, p: PessoaImportada, legado: Record<string, unknown>) {
    const fone = p.whatsapp ? normalizePhoneBR(p.whatsapp) : null;
    if (p.whatsapp && !fone) legado[`telefoneOriginal${ordem}`] = p.whatsapp;
    const limpo = p.email?.trim().toLowerCase() ?? null;
    const email = limpo && EMAIL.test(limpo) && limpo.length <= 254 ? limpo : null;
    if (p.email && !email) legado[`emailOriginal${ordem}`] = p.email;
    return {
      whatsapp: this.crypto.cifrarOpcional(fone, aad('mentoria_pessoas', 'whatsapp', id)),
      whatsappIdx: fone ? this.crypto.indiceCego(fone) : null,
      email: this.crypto.cifrarOpcional(email, aad('mentoria_pessoas', 'email', id)),
      emailIdx: email ? this.crypto.indiceCego(email) : null,
    };
  }

  private async gravar(tx: Tx, u: AuthUser, n: InscricaoImportada): Promise<void> {
    const id = randomUUID();
    const legado = { ...n.legado };
    await tx.insert(mentoriaInscricoes).values({
      id,
      tipo: n.tipo,
      mentoria: n.mentoria!,
      mentoriaVariante: n.mentoriaVariante,
      dataCompra: n.dataCompra,
      dataCompraAproximada: n.dataCompraAproximada,
      inicioJornada: n.inicioJornada,
      terminoPrevisto: n.inicioJornada
        ? sql`(${n.inicioJornada}::date + interval '12 months')::date`
        : null,
      status: n.status,
      linkPasta: n.linkPasta,
      importada: true,
      importacaoChave: n.chave,
      importacaoApelidos: n.apelidos,
      completarCampos: n.completar,
      criadoPor: u.id,
    });
    for (const [i, p] of n.pessoas.entries()) {
      const pessoaId = randomUUID();
      await tx.insert(mentoriaPessoas).values({
        id: pessoaId,
        inscricaoId: id,
        ordem: i + 1,
        nome: p.nome,
        nomeNorm: nomeNormalizado(p.nome),
        apelido: p.apelido,
        instagram: p.instagram,
        profissao: p.profissao,
        filhosQuantidade: p.filhosQuantidade,
        pulseira: p.pulseira,
        ...this.contato(pessoaId, i + 1, p, legado),
        criadoPor: u.id,
      });
    }
    await criarEtapas(tx, id, 'ANTERIOR_AO_SISTEMA', u.id);
    if (n.endereco)
      await tx.insert(mentoriaEnderecos).values({
        inscricaoId: id,
        endereco: this.crypto.cifrarOpcional(n.endereco, aad('mentoria_enderecos', 'endereco', id)),
        cep: cepDe(n.endereco),
        origem: 'FORMULARIO_CAIXA',
        criadoPor: u.id,
      });
    // Nasce destravado: custo e meta não existem em nenhuma das fontes, o momento nunca vem inteiro.
    if (n.momento) {
      const { dor, sonho, ...numeros } = n.momento;
      await tx.insert(mentoriaMomentoInicial).values({
        ...numeros,
        inscricaoId: id,
        dor: this.crypto.cifrarOpcional(dor, aad('mentoria_momento_inicial', 'dor', id)),
        sonho: this.crypto.cifrarOpcional(sonho, aad('mentoria_momento_inicial', 'sonho', id)),
        criadoPor: u.id,
      });
    }
    if (Object.keys(legado).length)
      await tx.insert(mentoriaLegado).values({
        inscricaoId: id,
        dados: this.crypto.cifrarTexto(JSON.stringify(legado), aad('mentoria_legado', 'dados', id)),
      });
    // 2M e 6M chegam com o início; RDV espera a data da IDR. Passado nasce sem alertar (§7).
    if (n.inicioJornada) await this.plano.gerar(tx, id);
    await registrarHistorico(tx, id, 'inscricao.importada', []);
  }

  /** Tudo ou nada, numa transação; o lock serializa duas importações ao mesmo tempo. */
  async importar(u: AuthUser, b: ImportarCarteira): Promise<ResultadoImportacao> {
    const fontes = await this.fontes(b);
    return withUser(this.db, u.id, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mentoria_importacao'))`);
      const c = this.montar(fontes, await this.jaCadastrados(tx));
      if (c.rotulosSemMentoria.length)
        throw new BadRequestException(
          `Escolha a mentoria de cada grupo: ${c.rotulosSemMentoria
            .map((r) => r.rotulo)
            .join(', ')}`,
        );
      for (const n of c.novos) await this.gravar(tx, u, n);
      return { importados: c.novos.length, ignorados: c.ignorados.length };
    }).catch((e) => erroDoBanco(e));
  }
}
