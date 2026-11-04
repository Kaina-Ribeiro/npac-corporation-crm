// Módulo Acompanhamento (mentorados). Sem FK para leads, deals, meetings ou lead_timeline: é
// uma base à parte. Acesso por RLS com mentoria_pode() (papel cru DIRETOR ou ACOMPANHAMENTO,
// nunca app_role(), que devolve HEAD para a Diretoria). Sem GRANT DELETE: exclusão só por função.
// Texto sensível (CAMPOS_SENSIVEIS) é gravado cifrado pela API (v2 com AAD), em base64.
// Filhos (campos, conquistas, eventos, quadros, dúvidas, diagnóstico) usam a version do pai (D5).
import { LINK_PERMITIDO_SQL } from '@npac/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth.js';

/** Proteção por coluna; o limite do PDF (256 KB por registro) é checado na API (Task 8). */
const cifradoCabe = (col: AnyPgColumn) => sql`octet_length(${col}) <= 400000`;

const autoria = {
  createdBy: text('created_by').references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by').references(() => user.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const mentoriaMentorados = pgTable(
  'mentoria_mentorados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    nomeNorm: text('nome_norm').notNull().unique(),
    tipoCadastro: text('tipo_cadastro'),
    tipoMentoria: text('tipo_mentoria'),
    /** Data de entrada como foi colada; `data_entrada` é derivada para ordem e filtro (D9). */
    dataEntradaTexto: text('data_entrada_texto'),
    dataEntrada: date('data_entrada'),
    status: text('status').notNull(),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mentoria_mentorados_nome', sql`char_length(${t.nome}) between 1 and 200`),
    check('mentoria_mentorados_status', sql`${t.status} in ('ENGAJADO', 'EM_ATENCAO', 'EM_RISCO')`),
  ],
);

/** Linha do tempo (Módulo 2): ficha de cada mentorado. */
export const mentoriaFichas = pgTable(
  'mentoria_fichas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    nomeNorm: text('nome_norm').notNull().unique(),
    dataInicioTexto: text('data_inicio_texto'),
    dataInicio: date('data_inicio'),
    notasMomentoInicial: text('notas_momento_inicial'),
    notasMomentoAtual: text('notas_momento_atual'),
    tempoMentoriaTexto: text('tempo_mentoria_texto'),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    check('mentoria_fichas_nome', sql`char_length(${t.nome}) between 1 and 200`),
    check('mentoria_fichas_notas_ini', cifradoCabe(t.notasMomentoInicial)),
    check('mentoria_fichas_notas_atual', cifradoCabe(t.notasMomentoAtual)),
    check('mentoria_fichas_tempo', cifradoCabe(t.tempoMentoriaTexto)),
  ],
);

/** Os 4 pilares e os 5 itens de evolução, sempre nas linhas fixas (antes e hoje/depois). */
export const mentoriaFichaCampos = pgTable(
  'mentoria_ficha_campos',
  {
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => mentoriaFichas.id, { onDelete: 'cascade' }),
    secao: text('secao').notNull(),
    chave: text('chave').notNull(),
    antes: text('antes'),
    depois: text('depois'),
    updatedBy: text('updated_by').references(() => user.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.fichaId, t.chave] }),
    check(
      'mentoria_ficha_campos_chave',
      sql`(${t.secao} = 'PILAR' and ${t.chave} in ('FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS'))
        or (${t.secao} = 'EVOLUCAO' and ${t.chave} in ('RESERVA_FINANCEIRA', 'EVOLUCAO_RENDA', 'EVOLUCAO_SAUDE', 'INVESTIMENTOS_MENTORIA', 'AREA_ATUACAO'))`,
    ),
    check('mentoria_ficha_campos_antes', cifradoCabe(t.antes)),
    check('mentoria_ficha_campos_depois', cifradoCabe(t.depois)),
  ],
);

/** Galeria de conquistas: data e descrição; as fotos e vídeos ficam em mentoria_midia. */
export const mentoriaConquistas = pgTable(
  'mentoria_conquistas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fichaId: uuid('ficha_id')
      .notNull()
      .references(() => mentoriaFichas.id, { onDelete: 'cascade' }),
    dataTexto: text('data_texto'),
    data: date('data'),
    descricao: text('descricao'),
    ...autoria,
  },
  (t) => [check('mentoria_conquistas_descricao', cifradoCabe(t.descricao))],
);

/** Linha do tempo RDV (Módulo 3): uma pessoa (ou casal) por registro. */
export const mentoriaRdvPessoas = pgTable(
  'mentoria_rdv_pessoas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nome: text('nome').notNull(),
    nomeNorm: text('nome_norm').notNull().unique(),
    /** Campo de fonte (regra 5): só muda pela função de colar link. Só https de allowlist (D38). */
    pastaUrl: text('pasta_url'),
    pastaColadaEm: timestamp('pasta_colada_em', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...autoria,
  },
  (t) => [
    check('mentoria_rdv_pessoas_nome', sql`char_length(${t.nome}) between 1 and 200`),
    check('mentoria_rdv_pessoas_pasta', sql`${t.pastaUrl} ~ ${sql.raw(`'${LINK_PERMITIDO_SQL}'`)}`),
  ],
);

/** Diagnóstico colado (regra 5): só leitura na tela; muda só por mentoria_colar_diagnostico. */
export const mentoriaRdvDiagnostico = pgTable(
  'mentoria_rdv_diagnostico',
  {
    pessoaId: uuid('pessoa_id')
      .primaryKey()
      .references(() => mentoriaRdvPessoas.id, { onDelete: 'cascade' }),
    idade: text('idade'),
    situacaoConjugal: text('situacao_conjugal'),
    filhos: text('filhos'),
    trabalho: text('trabalho'),
    rendaAtual: text('renda_atual'),
    dinheiroGuardado: text('dinheiro_guardado'),
    patrimonio: text('patrimonio'),
    dividas: text('dividas'),
    sonhosObjetivos: text('sonhos_objetivos'),
    coladoEm: timestamp('colado_em', { withTimezone: true }).notNull().defaultNow(),
    coladoPor: text('colado_por').references(() => user.id),
  },
  (t) => [
    check(
      'mentoria_rdv_diagnostico_cabe',
      sql`coalesce(octet_length(${t.idade}), 0) + coalesce(octet_length(${t.situacaoConjugal}), 0)
        + coalesce(octet_length(${t.filhos}), 0) + coalesce(octet_length(${t.trabalho}), 0)
        + coalesce(octet_length(${t.rendaAtual}), 0) + coalesce(octet_length(${t.dinheiroGuardado}), 0)
        + coalesce(octet_length(${t.patrimonio}), 0) + coalesce(octet_length(${t.dividas}), 0)
        + coalesce(octet_length(${t.sonhosObjetivos}), 0) <= 400000`,
    ),
  ],
);

/** Quadros rápidos do RDV. A data do item é campo de fonte: não muda depois de gravada (D34). */
export const mentoriaRdvQuadros = pgTable(
  'mentoria_rdv_quadros',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => mentoriaRdvPessoas.id, { onDelete: 'cascade' }),
    quadro: text('quadro').notNull(),
    descricao: text('descricao'),
    dataTexto: text('data_texto'),
    /** Dia 1 quando só há mês; nula quando não há data (vai para o fim da ordem). */
    data: date('data'),
    ...autoria,
  },
  (t) => [
    check(
      'mentoria_rdv_quadros_quadro',
      sql`${t.quadro} in ('EVENTOS_PRESENCIAIS', 'INVESTIMENTO_ATIVOS', 'IMOVEL_LEILAO', 'MERCADO_IMOBILIARIO')`,
    ),
    check('mentoria_rdv_quadros_descricao', cifradoCabe(t.descricao)),
  ],
);

/** Dúvidas: fato ambíguo da conversa, que a equipe confirma (vira evento) ou descarta. */
export const mentoriaRdvDuvidas = pgTable(
  'mentoria_rdv_duvidas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => mentoriaRdvPessoas.id, { onDelete: 'cascade' }),
    texto: text('texto'),
    status: text('status').notNull().default('ABERTA'),
    resolvidaEm: timestamp('resolvida_em', { withTimezone: true }),
    resolvidaPor: text('resolvida_por').references(() => user.id),
    eventoId: uuid('evento_id').references((): AnyPgColumn => mentoriaRdvEventos.id, {
      onDelete: 'set null',
    }),
    ...autoria,
  },
  (t) => [
    check(
      'mentoria_rdv_duvidas_status',
      sql`${t.status} in ('ABERTA', 'CONFIRMADA', 'DESCARTADA')`,
    ),
    check(
      'mentoria_rdv_duvidas_resolvida',
      sql`(${t.status} = 'ABERTA') = (${t.resolvidaEm} is null)`,
    ),
    check('mentoria_rdv_duvidas_texto', cifradoCabe(t.texto)),
  ],
);

/** Eventos do RDV em ordem cronológica (data, id), calculada na leitura (regras 3 e 4). */
export const mentoriaRdvEventos = pgTable(
  'mentoria_rdv_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pessoaId: uuid('pessoa_id')
      .notNull()
      .references(() => mentoriaRdvPessoas.id, { onDelete: 'cascade' }),
    dataTexto: text('data_texto').notNull(),
    data: date('data').notNull(),
    descricao: text('descricao'),
    origem: text('origem').notNull(),
    checklistItem: smallint('checklist_item'),
    duvidaId: uuid('duvida_id').references((): AnyPgColumn => mentoriaRdvDuvidas.id, {
      onDelete: 'set null',
    }),
    ...autoria,
  },
  (t) => [
    check(
      'mentoria_rdv_eventos_origem',
      sql`${t.origem} in ('MANUAL', 'COLADO', 'DUVIDA_CONFIRMADA')`,
    ),
    check('mentoria_rdv_eventos_checklist', sql`${t.checklistItem} between 1 and 9`),
    check('mentoria_rdv_eventos_descricao', cifradoCabe(t.descricao)),
  ],
);

/**
 * Mídia (regra 7): o registro guarda só o endereço; o arquivo fica fora do banco (MEDIA_DIR).
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
      sql`${t.donoTipo} in ('FICHA_ANTES', 'FICHA_DEPOIS', 'CONQUISTA', 'RDV_PESSOA', 'RDV_EVENTO', 'RDV_QUADRO_ITEM')`,
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
