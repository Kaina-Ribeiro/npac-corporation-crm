// Módulo Acompanhamento v2 (mentorados). Base à parte do comercial, sem FK para leads ou vendas.
// Acesso por RLS com mentoria_perfil()/mentoria_admin()/mentoria_ve()/mentoria_edita(), sobre o cargo
// cru (DIRETOR ou ACOMPANHAMENTO), nunca app_role(). Sem GRANT DELETE: exclusão só por função.
// Texto sensível é gravado cifrado pela API (MentoriaCrypto, com AAD), em base64.
import { LINK_PERMITIDO_SQL } from '@npac/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Proteção por coluna contra texto gigante; o valor já vem cifrado. */
const cifradoCabe = (col: AnyPgColumn) => sql`octet_length(${col}) <= 400000`;

const autoria = {
  criadoPor: text('criado_por').references(() => user.id),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
};

/** Perfil dentro do módulo (D3, D13). Diretoria é Admin automático e não precisa de linha. */
export const mentoriaPerfis = pgTable(
  'mentoria_perfis',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id),
    perfil: text('perfil').notNull(),
    admin: boolean('admin').notNull().default(false),
    definidoPor: text('definido_por').references(() => user.id),
    definidoEm: timestamp('definido_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'mentoria_perfis_perfil',
      sql`${t.perfil} in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR')`,
    ),
  ],
);

/** Inscrição: uma por mentorado (individual ou casal), base do calendário da jornada. */
export const mentoriaInscricoes = pgTable(
  'mentoria_inscricoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tipo: text('tipo').notNull(),
    mentoria: text('mentoria').notNull(),
    mentoriaVariante: text('mentoria_variante'),
    dataCompra: date('data_compra'),
    dataCompraAproximada: boolean('data_compra_aproximada').notNull().default(false),
    dataIdr: date('data_idr'),
    inicioJornada: date('inicio_jornada'),
    terminoPrevisto: date('termino_previsto'),
    valorCentavos: bigint('valor_centavos', { mode: 'number' }),
    formaPagamento: text('forma_pagamento'),
    statusFinanceiro: text('status_financeiro'),
    status: text('status').notNull().default('ONBOARDING'),
    responsavelId: text('responsavel_id').references(() => user.id),
    origem: text('origem'),
    linkPasta: text('link_pasta'),
    linkGrupo: text('link_grupo'),
    pme1EnviadoEm: timestamp('pme1_enviado_em', { withTimezone: true }),
    errosPme1ConcluidosEm: timestamp('erros_pme1_concluidos_em', { withTimezone: true }),
    fotoFamiliaMidiaId: uuid('foto_familia_midia_id'),
    importada: boolean('importada').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    check('mentoria_inscricoes_tipo', sql`${t.tipo} in ('INDIVIDUAL', 'CASAL')`),
    check('mentoria_inscricoes_mentoria', sql`${t.mentoria} in ('RDV', '2M', '6M')`),
    check('mentoria_inscricoes_variante', sql`char_length(${t.mentoriaVariante}) <= 80`),
    check('mentoria_inscricoes_forma', sql`char_length(${t.formaPagamento}) <= 120`),
    check('mentoria_inscricoes_valor', sql`${t.valorCentavos} >= 0`),
    check(
      'mentoria_inscricoes_financeiro',
      sql`${t.statusFinanceiro} in ('EM_DIA', 'EM_ATRASO', 'QUITADO')`,
    ),
    check(
      'mentoria_inscricoes_status',
      sql`${t.status} in ('ONBOARDING', 'ATIVO', 'PAUSADO', 'CANCELADO', 'CONCLUIDO', 'RENOVADO')`,
    ),
    check(
      'mentoria_inscricoes_origem',
      sql`${t.origem} in ('NACAO_MILIONARIA', 'CLUBE_DA_RIQUEZA', 'INSTAGRAM', 'INDICACAO')`,
    ),
    check('mentoria_inscricoes_pasta', sql`${t.linkPasta} ~ ${sql.raw(`'${LINK_PERMITIDO_SQL}'`)}`),
    check('mentoria_inscricoes_grupo', sql`${t.linkGrupo} ~ '^https://chat[.]whatsapp[.]com/'`),
    index('mentoria_inscricoes_responsavel').on(t.responsavelId),
    index('mentoria_inscricoes_status_idx').on(t.status),
  ],
);

/** Pessoas da inscrição: ordem 1, e 2 só em CASAL. WhatsApp e e-mail cifrados + índice cego. */
export const mentoriaPessoas = pgTable(
  'mentoria_pessoas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    ordem: smallint('ordem').notNull(),
    nome: text('nome').notNull(),
    nomeNorm: text('nome_norm').notNull(),
    apelido: text('apelido'),
    fotoMidiaId: uuid('foto_midia_id'),
    nascimento: date('nascimento'),
    cidade: text('cidade'),
    uf: text('uf'),
    whatsapp: text('whatsapp'),
    whatsappIdx: text('whatsapp_idx'),
    email: text('email'),
    emailIdx: text('email_idx'),
    instagram: text('instagram'),
    profissao: text('profissao'),
    ocupacao: text('ocupacao'),
    filhosQuantidade: smallint('filhos_quantidade'),
    filhosIdades: text('filhos_idades'),
    tecnologia: text('tecnologia'),
    melhorHorario: text('melhor_horario'),
    canalPreferido: text('canal_preferido'),
    pulseira: text('pulseira'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    unique('mentoria_pessoas_ordem_unica').on(t.inscricaoId, t.ordem),
    check('mentoria_pessoas_ordem', sql`${t.ordem} in (1, 2)`),
    check('mentoria_pessoas_nome', sql`char_length(${t.nome}) between 1 and 200`),
    check('mentoria_pessoas_uf', sql`char_length(${t.uf}) = 2`),
    check(
      'mentoria_pessoas_ocupacao',
      sql`${t.ocupacao} in ('EMPREGADO', 'AUTONOMO', 'EMPRESARIO')`,
    ),
    check('mentoria_pessoas_tecnologia', sql`${t.tecnologia} in ('BAIXA', 'MEDIA', 'ALTA')`),
    check('mentoria_pessoas_filhos', sql`${t.filhosQuantidade} between 0 and 30`),
    check('mentoria_pessoas_whatsapp', cifradoCabe(t.whatsapp)),
    check('mentoria_pessoas_email', cifradoCabe(t.email)),
    index('mentoria_pessoas_inscricao').on(t.inscricaoId),
    index('mentoria_pessoas_nome_norm').on(t.nomeNorm),
    index('mentoria_pessoas_whatsapp_idx').on(t.whatsappIdx),
    index('mentoria_pessoas_email_idx').on(t.emailIdx),
  ],
);

/** Endereço de entrega (Caixa), cifrado. Um por inscrição. */
export const mentoriaEnderecos = pgTable(
  'mentoria_enderecos',
  {
    inscricaoId: uuid('inscricao_id')
      .primaryKey()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    endereco: text('endereco'),
    cep: text('cep'),
    origem: text('origem').notNull().default('MANUAL'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    check('mentoria_enderecos_origem', sql`${t.origem} in ('FORMULARIO_CAIXA', 'MANUAL')`),
    check('mentoria_enderecos_endereco', cifradoCabe(t.endereco)),
    check('mentoria_enderecos_cep', sql`${t.cep} ~ '^[0-9]{8}$'`),
  ],
);

/** Momento inicial ("o antes"): congela ao concluir; só Admin destrava. */
export const mentoriaMomentoInicial = pgTable(
  'mentoria_momento_inicial',
  {
    inscricaoId: uuid('inscricao_id')
      .primaryKey()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    data: date('data'),
    recebeCentavos: bigint('recebe_centavos', { mode: 'number' }),
    custoCentavos: bigint('custo_centavos', { mode: 'number' }),
    temDividas: boolean('tem_dividas'),
    dividasCentavos: bigint('dividas_centavos', { mode: 'number' }),
    guardadoCentavos: bigint('guardado_centavos', { mode: 'number' }),
    dor: text('dor'),
    sonho: text('sonho'),
    meta: text('meta'),
    travadoEm: timestamp('travado_em', { withTimezone: true }),
    travadoPor: text('travado_por').references(() => user.id),
    visivelAoMentorado: boolean('visivel_ao_mentorado').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    check('mentoria_momento_recebe', sql`${t.recebeCentavos} >= 0`),
    check('mentoria_momento_custo', sql`${t.custoCentavos} >= 0`),
    check('mentoria_momento_dividas', sql`${t.dividasCentavos} >= 0`),
    check('mentoria_momento_guardado', sql`${t.guardadoCentavos} >= 0`),
    check('mentoria_momento_dor', cifradoCabe(t.dor)),
    check('mentoria_momento_sonho', cifradoCabe(t.sonho)),
    check('mentoria_momento_meta', cifradoCabe(t.meta)),
  ],
);

/** Prova das 10 Habilidades e 4 pilares: uma por pessoa, também no casal (D14). */
export const mentoriaAvaliacoes = pgTable(
  'mentoria_avaliacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => mentoriaPessoas.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    momento: text('momento').notNull().default('INICIAL'),
    data: date('data'),
    notaFe: smallint('nota_fe'),
    notaSaude: smallint('nota_saude'),
    notaDinheiro: smallint('nota_dinheiro'),
    notaRelacionamentos: smallint('nota_relacionamentos'),
    resultadoProva: text('resultado_prova'),
    visivelAoMentorado: boolean('visivel_ao_mentorado').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    unique('mentoria_avaliacoes_unica').on(t.pessoaId, t.tipo, t.momento),
    check('mentoria_avaliacoes_tipo', sql`${t.tipo} in ('PROVA_10_HABILIDADES', 'PILARES')`),
    check(
      'mentoria_avaliacoes_momento',
      sql`${t.momento} in ('INICIAL', 'MES_4', 'MES_8', 'FINAL')`,
    ),
    check('mentoria_avaliacoes_fe', sql`${t.notaFe} between 0 and 10`),
    check('mentoria_avaliacoes_saude', sql`${t.notaSaude} between 0 and 10`),
    check('mentoria_avaliacoes_dinheiro', sql`${t.notaDinheiro} between 0 and 10`),
    check('mentoria_avaliacoes_relacionamentos', sql`${t.notaRelacionamentos} between 0 and 10`),
    check('mentoria_avaliacoes_prova', sql`char_length(${t.resultadoProva}) <= 200`),
  ],
);

/** Anotações livres da equipe, cifradas. Append-only. */
export const mentoriaAnotacoes = pgTable(
  'mentoria_anotacoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    autorId: text('autor_id')
      .notNull()
      .references(() => user.id),
    texto: text('texto').notNull(),
    visivelAoMentorado: boolean('visivel_ao_mentorado').notNull().default(false),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mentoria_anotacoes_texto', cifradoCabe(t.texto)),
    index('mentoria_anotacoes_inscricao').on(t.inscricaoId),
  ],
);

/** Histórico de alterações: quem, quando, tipo e os nomes dos campos. Nunca valores. */
export const mentoriaHistorico = pgTable(
  'mentoria_historico',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    atorId: text('ator_id')
      .notNull()
      .references(() => user.id),
    quando: timestamp('quando', { withTimezone: true }).notNull().defaultNow(),
    tipo: text('tipo').notNull(),
    campos: text('campos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [index('mentoria_historico_inscricao').on(t.inscricaoId, t.quando)],
);

/** Dados do gerenciador antigo sem tela até as fases 2–4, em JSON cifrado. Só Admin lê. */
export const mentoriaLegado = pgTable(
  'mentoria_legado',
  {
    inscricaoId: uuid('inscricao_id')
      .primaryKey()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    dados: text('dados').notNull(),
    importadoEm: timestamp('importado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('mentoria_legado_dados', sql`octet_length(${t.dados}) <= 2000000`)],
);

/**
 * Mídia: o registro guarda só o endereço; o arquivo fica fora do banco (MEDIA_DIR).
 * `dono_id` é polimórfico, sem FK: a exclusão do dono enfileira a mídia pela função.
 */
export const mentoriaMidia = pgTable(
  'mentoria_midia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donoTipo: text('dono_tipo').notNull(),
    donoId: uuid('dono_id').notNull(),
    tipo: text('tipo').notNull(),
    chaveObjeto: text('chave_objeto'),
    urlVideo: text('url_video'),
    mime: text('mime'),
    tamanhoBytes: bigint('tamanho_bytes', { mode: 'number' }),
    criadoPor: text('criado_por').references(() => user.id),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'mentoria_midia_dono',
      sql`${t.donoTipo} in ('PESSOA_FOTO', 'FOTO_FAMILIA', 'ACAO_EVIDENCIA')`,
    ),
    check('mentoria_midia_tipo', sql`${t.tipo} in ('FOTO', 'VIDEO', 'PDF', 'LINK_VIDEO')`),
    check('mentoria_midia_link', sql`(${t.tipo} = 'LINK_VIDEO') = (${t.urlVideo} is not null)`),
    check('mentoria_midia_chave', sql`(${t.tipo} = 'LINK_VIDEO') = (${t.chaveObjeto} is null)`),
    check('mentoria_midia_url', sql`${t.urlVideo} ~ ${sql.raw(`'${LINK_PERMITIDO_SQL}'`)}`),
    check('mentoria_midia_tamanho', sql`${t.tamanhoBytes} between 0 and 20971520`),
  ],
);

/** Fila de arquivos a apagar do volume. Sem RLS de usuário: só as funções do worker leem. */
export const mentoriaMidiaExclusao = pgTable('mentoria_midia_exclusao', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chaveObjeto: text('chave_objeto').notNull(),
  enfileiradoEm: timestamp('enfileirado_em', { withTimezone: true }).notNull().defaultNow(),
  removidoEm: timestamp('removido_em', { withTimezone: true }),
});
