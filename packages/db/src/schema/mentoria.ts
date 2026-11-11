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
  uniqueIndex,
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
    /** Nome normalizado de quando foi importada: reimportar não duplica, mesmo se a equipe renomear. */
    importacaoChave: text('importacao_chave'),
    /** Todas as formas do nome nas fontes, para reimportar sem a decisão de juntar não duplicar. */
    importacaoApelidos: text('importacao_apelidos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Campos do momento inicial que vieram ilegíveis da importação; só nomes, nunca valores. */
    completarCampos: text('completar_campos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    uniqueIndex('mentoria_inscricoes_importacao_chave')
      .on(t.importacaoChave)
      .where(sql`${t.importacaoChave} is not null`),
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
 * Etapas do onboarding, seis por inscrição. CAIXA e IDR são derivadas: a CAIXA segue o envio
 * físico (gatilho) e a IDR, a reunião; a única escrita manual nelas é DISPENSADA.
 */
export const mentoriaOnboardingEtapas = pgTable(
  'mentoria_onboarding_etapas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    etapa: text('etapa').notNull(),
    status: text('status').notNull().default('PENDENTE'),
    enviadaEm: timestamp('enviada_em', { withTimezone: true }),
    concluidaEm: timestamp('concluida_em', { withTimezone: true }),
    grupoCriadoEm: date('grupo_criado_em'),
    formularioPreenchido: boolean('formulario_preenchido'),
    /** Quando o formulário foi marcado como preenchido (gatilho): base do "Enviar a Caixa". */
    formularioPreenchidoEm: timestamp('formulario_preenchido_em', { withTimezone: true }),
    grupoAvisos: boolean('grupo_avisos'),
    grupoClube: boolean('grupo_clube'),
    grupoNacao: boolean('grupo_nacao'),
    aulasConcluidas: boolean('aulas_concluidas'),
    aulasConcluidasEm: date('aulas_concluidas_em'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    unique('mentoria_onboarding_etapa_unica').on(t.inscricaoId, t.etapa),
    check(
      'mentoria_onboarding_etapa',
      sql`${t.etapa} in ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA', 'IDR')`,
    ),
    check(
      'mentoria_onboarding_status',
      sql`${t.status} in ('PENDENTE', 'ENVIADA', 'CONCLUIDA', 'DISPENSADA', 'ANTERIOR_AO_SISTEMA')`,
    ),
  ],
);

/** Envios físicos. A Fase 1 usa só a CAIXA, uma por inscrição. */
export const mentoriaEnviosFisicos = pgTable(
  'mentoria_envios_fisicos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    status: text('status').notNull().default('PREPARANDO'),
    enviadoEm: date('enviado_em'),
    rastreio: text('rastreio'),
    entregueEm: date('entregue_em'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    uniqueIndex('mentoria_envios_caixa_unica')
      .on(t.inscricaoId)
      .where(sql`${t.tipo} = 'CAIXA'`),
    index('mentoria_envios_inscricao').on(t.inscricaoId),
    check(
      'mentoria_envios_tipo',
      sql`${t.tipo} in ('CAIXA', 'PRESENTE_FAMILIA', 'KIT', 'CERTIFICADO')`,
    ),
    check('mentoria_envios_status', sql`${t.status} in ('PREPARANDO', 'ENVIADO', 'ENTREGUE')`),
    check('mentoria_envios_rastreio', sql`char_length(${t.rastreio}) <= 120`),
    check('mentoria_envios_enviado', sql`${t.status} = 'PREPARANDO' or ${t.enviadoEm} is not null`),
    check(
      'mentoria_envios_entregue',
      sql`${t.status} <> 'ENTREGUE' or ${t.entregueEm} is not null`,
    ),
    check('mentoria_envios_ordem', sql`${t.entregueEm} >= ${t.enviadoEm}`),
  ],
);

/** Plano-modelo por mentoria. Editar vale para as próximas gerações; as ações já criadas não mudam. */
export const mentoriaPlanoModelo = pgTable(
  'mentoria_plano_modelo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mentoria: text('mentoria').notNull(),
    mes: smallint('mes').notNull(),
    reuniaoTipo: text('reuniao_tipo'),
    foco: text('foco').notNull(),
    acao: text('acao').notNull(),
    itens: text('itens')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    responsavelPerfil: text('responsavel_perfil').notNull(),
    gatilho: text('gatilho').notNull().default('INICIO_MES'),
    diasParaExecutar: smallint('dias_para_executar').notNull().default(0),
    segueCalendario: boolean('segue_calendario').notNull().default(true),
    ativo: boolean('ativo').notNull().default(true),
    version: integer('version').notNull().default(1),
    // Sem FK para user: as linhas vêm da migration e não podem cair num `truncate "user" cascade`.
    criadoPor: text('criado_por'),
    criadoEm: autoria.criadoEm,
    atualizadoEm: autoria.atualizadoEm,
  },
  (t) => [
    index('mentoria_plano_modelo_mentoria').on(t.mentoria, t.mes),
    check('mentoria_plano_mentoria', sql`${t.mentoria} in ('RDV', '2M', '6M')`),
    check('mentoria_plano_mes', sql`${t.mes} between 1 and 120`),
    check(
      'mentoria_plano_reuniao',
      sql`${t.reuniaoTipo} in ('IDR', 'ACOMP_2PME', 'POSICIONAMENTO', 'MENTORADO_EXPERIENTE', 'CARTOES_MILHAS', 'MENSAL_6M', 'TRIMESTRAL_2M', 'ACOMP_EMERGENCIA', 'RENOVACAO')`,
    ),
    check('mentoria_plano_foco', sql`char_length(${t.foco}) between 1 and 120`),
    check('mentoria_plano_acao', sql`char_length(${t.acao}) between 1 and 500`),
    check(
      'mentoria_plano_responsavel',
      sql`${t.responsavelPerfil} in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA')`,
    ),
    check('mentoria_plano_gatilho', sql`${t.gatilho} in ('INICIO_MES', 'FIM_PME', 'FLEXIVEL')`),
    check('mentoria_plano_dias', sql`${t.diasParaExecutar} between 0 and 60`),
  ],
);

/**
 * Ações do plano de cada inscrição. Foco, ação, passos e prazo são copiados do modelo ao nascer,
 * para que editar o modelo não reescreva o que já existe. `data_limite` é o dia a partir do qual
 * a ação atrasa: a própria data, ou o fim do mês no gatilho FLEXIVEL.
 */
export const mentoriaAcoes = pgTable(
  'mentoria_acoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    planoModeloId: uuid('plano_modelo_id')
      .notNull()
      .references(() => mentoriaPlanoModelo.id),
    mes: smallint('mes').notNull(),
    reuniaoTipo: text('reuniao_tipo'),
    foco: text('foco').notNull(),
    acao: text('acao').notNull(),
    itens: text('itens')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    gatilho: text('gatilho').notNull(),
    diasParaExecutar: smallint('dias_para_executar').notNull(),
    dataPrevista: date('data_prevista').notNull(),
    dataLimite: date('data_limite').notNull(),
    responsavelPerfil: text('responsavel_perfil').notNull(),
    responsavelId: text('responsavel_id').references(() => user.id),
    status: text('status').notNull().default('PENDENTE'),
    itensFeitos: text('itens_feitos')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    anteriorAoSistema: boolean('anterior_ao_sistema').notNull().default(false),
    feitaEm: timestamp('feita_em', { withTimezone: true }),
    feitaPor: text('feita_por').references(() => user.id),
    evidenciaLink: text('evidencia_link'),
    evidenciaMidiaId: uuid('evidencia_midia_id'),
    observacao: text('observacao'),
    visivelAoMentorado: boolean('visivel_ao_mentorado').notNull().default(false),
    version: integer('version').notNull().default(1),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('mentoria_acoes_modelo_unica').on(t.inscricaoId, t.planoModeloId),
    index('mentoria_acoes_inscricao').on(t.inscricaoId, t.mes),
    index('mentoria_acoes_data').on(t.dataPrevista),
    check('mentoria_acoes_status', sql`${t.status} in ('PENDENTE', 'FEITA')`),
    check('mentoria_acoes_gatilho', sql`${t.gatilho} in ('INICIO_MES', 'FIM_PME', 'FLEXIVEL')`),
    check(
      'mentoria_acoes_responsavel',
      sql`${t.responsavelPerfil} in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA')`,
    ),
    check('mentoria_acoes_evidencia', sql`${t.evidenciaLink} ~ '^https://'`),
    check('mentoria_acoes_observacao', cifradoCabe(t.observacao)),
  ],
);

/** Pausas da inscrição. Uma aberta por vez; retomar repõe o prazo pelos dias parados (D15). */
export const mentoriaPausas = pgTable(
  'mentoria_pausas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    inicio: date('inicio').notNull(),
    fim: date('fim'),
    statusAnterior: text('status_anterior').notNull(),
    motivo: text('motivo'),
    pausadaPor: text('pausada_por').references(() => user.id),
    retomadaPor: text('retomada_por').references(() => user.id),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mentoria_pausas_aberta')
      .on(t.inscricaoId)
      .where(sql`${t.fim} is null`),
    index('mentoria_pausas_inscricao').on(t.inscricaoId, t.inicio),
    check('mentoria_pausas_anterior', sql`${t.statusAnterior} in ('ONBOARDING', 'ATIVO')`),
    check('mentoria_pausas_ordem', sql`${t.fim} >= ${t.inicio}`),
    check('mentoria_pausas_motivo', cifradoCabe(t.motivo)),
  ],
);

const REUNIAO_TIPOS_SQL = sql.raw(
  `('IDR', 'ACOMP_2PME', 'POSICIONAMENTO', 'MENTORADO_EXPERIENTE', 'CARTOES_MILHAS', 'MENSAL_6M', 'TRIMESTRAL_2M', 'ACOMP_EMERGENCIA', 'RENOVACAO')`,
);

/**
 * Reuniões (§4, §6). Status e remarcação seguem regras do banco; o registro (resumo, metas,
 * combinado, cobrar, trava, anotação interna) chega cifrado. Visibilidade ao mentorado é por campo,
 * fixa pela tabela do PDF (Fase 3), sem coluna.
 */
export const mentoriaReunioes = pgTable(
  'mentoria_reunioes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    tipo: text('tipo').notNull(),
    conduzidaPor: text('conduzida_por').references(() => user.id),
    /** O mentorado experiente que conduz a conversa do 6º mês (sem login). */
    condutorInscricaoId: uuid('condutor_inscricao_id').references(
      (): AnyPgColumn => mentoriaInscricoes.id,
      { onDelete: 'set null' },
    ),
    inicio: timestamp('inicio', { withTimezone: true }).notNull(),
    duracaoMin: smallint('duracao_min').notNull().default(60),
    plataforma: text('plataforma'),
    link: text('link'),
    status: text('status').notNull().default('AGENDADA'),
    remarcadaParaId: uuid('remarcada_para_id').references((): AnyPgColumn => mentoriaReunioes.id),
    resumo: text('resumo'),
    metas: text('metas'),
    combinado: text('combinado'),
    cobrar: text('cobrar'),
    trava: text('trava'),
    anotacaoInterna: text('anotacao_interna'),
    humor: smallint('humor'),
    interesseRenovar: boolean('interesse_renovar'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    index('mentoria_reunioes_inscricao').on(t.inscricaoId, t.inicio),
    index('mentoria_reunioes_inicio').on(t.inicio),
    index('mentoria_reunioes_condutor').on(t.conduzidaPor, t.inicio),
    check('mentoria_reunioes_tipo', sql`${t.tipo} in ${REUNIAO_TIPOS_SQL}`),
    check(
      'mentoria_reunioes_status',
      sql`${t.status} in ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO', 'REALIZADA', 'FALTOU', 'REMARCADA')`,
    ),
    check('mentoria_reunioes_plataforma', sql`${t.plataforma} in ('ZOOM', 'MEET')`),
    check(
      'mentoria_reunioes_link',
      sql`${t.link} ~ '^https://' and char_length(${t.link}) <= 2000`,
    ),
    check('mentoria_reunioes_duracao', sql`${t.duracaoMin} between 5 and 480`),
    check('mentoria_reunioes_humor', sql`${t.humor} between 1 and 5`),
    check(
      'mentoria_reunioes_condutor',
      sql`${t.tipo} = 'MENTORADO_EXPERIENTE' or (${t.conduzidaPor} is not null and ${t.condutorInscricaoId} is null)`,
    ),
    check(
      'mentoria_reunioes_renovar',
      sql`${t.interesseRenovar} is null or ${t.tipo} = 'RENOVACAO'`,
    ),
    check(
      'mentoria_reunioes_remarcada',
      sql`${t.remarcadaParaId} is null or ${t.status} = 'REMARCADA'`,
    ),
    check('mentoria_reunioes_resumo', cifradoCabe(t.resumo)),
    check('mentoria_reunioes_metas', cifradoCabe(t.metas)),
    check('mentoria_reunioes_combinado', cifradoCabe(t.combinado)),
    check('mentoria_reunioes_cobrar', cifradoCabe(t.cobrar)),
    check('mentoria_reunioes_trava', cifradoCabe(t.trava)),
    check('mentoria_reunioes_anotacao', cifradoCabe(t.anotacaoInterna)),
  ],
);

/** Contatos com o mentorado (§4). Só acréscimo: quem fez é quem está logado. */
export const mentoriaContatos = pgTable(
  'mentoria_contatos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inscricaoId: uuid('inscricao_id')
      .notNull()
      .references(() => mentoriaInscricoes.id, { onDelete: 'cascade' }),
    feitoPor: text('feito_por')
      .notNull()
      .references(() => user.id),
    quando: timestamp('quando', { withTimezone: true }).notNull(),
    canal: text('canal').notNull(),
    motivo: text('motivo'),
    respondeu: boolean('respondeu'),
    tempoRespostaMin: integer('tempo_resposta_min'),
    observacao: text('observacao'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('mentoria_contatos_inscricao').on(t.inscricaoId, t.quando),
    check(
      'mentoria_contatos_canal',
      sql`${t.canal} in ('WHATSAPP', 'LIGACAO', 'EMAIL', 'REUNIAO', 'OUTRO')`,
    ),
    check('mentoria_contatos_motivo', sql`char_length(${t.motivo}) <= 200`),
    check('mentoria_contatos_tempo', sql`${t.tempoRespostaMin} between 0 and 100000`),
    check('mentoria_contatos_observacao', cifradoCabe(t.observacao)),
  ],
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

/**
 * Itens da Fila do dia sem estado próprio (lembrete da IDR, arte da agenda, reuniões 6M do mês):
 * a chave é tipo + alvo + data, sem dado pessoal. Só acréscimo, em nome de quem está logado.
 */
export const mentoriaFilaFeitos = pgTable(
  'mentoria_fila_feitos',
  {
    chave: text('chave').primaryKey(),
    feitoPor: text('feito_por')
      .notNull()
      .references(() => user.id),
    feitoEm: timestamp('feito_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('mentoria_fila_feitos_chave', sql`${t.chave} ~ '^[a-z0-9-]+:[0-9a-f:-]{7,80}$'`)],
);
