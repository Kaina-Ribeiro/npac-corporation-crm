CREATE TABLE "mentoria_conquistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ficha_id" uuid NOT NULL,
	"data_texto" text,
	"data" date,
	"descricao" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_conquistas_descricao" CHECK (octet_length("mentoria_conquistas"."descricao") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_ficha_campos" (
	"ficha_id" uuid NOT NULL,
	"secao" text NOT NULL,
	"chave" text NOT NULL,
	"antes" text,
	"depois" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_ficha_campos_ficha_id_chave_pk" PRIMARY KEY("ficha_id","chave"),
	CONSTRAINT "mentoria_ficha_campos_chave" CHECK (("mentoria_ficha_campos"."secao" = 'PILAR' and "mentoria_ficha_campos"."chave" in ('FE', 'SAUDE', 'DINHEIRO', 'RELACIONAMENTOS'))
        or ("mentoria_ficha_campos"."secao" = 'EVOLUCAO' and "mentoria_ficha_campos"."chave" in ('RESERVA_FINANCEIRA', 'EVOLUCAO_RENDA', 'EVOLUCAO_SAUDE', 'INVESTIMENTOS_MENTORIA', 'AREA_ATUACAO'))),
	CONSTRAINT "mentoria_ficha_campos_antes" CHECK (octet_length("mentoria_ficha_campos"."antes") <= 400000),
	CONSTRAINT "mentoria_ficha_campos_depois" CHECK (octet_length("mentoria_ficha_campos"."depois") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_fichas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"nome_norm" text NOT NULL,
	"data_inicio_texto" text,
	"data_inicio" date,
	"notas_momento_inicial" text,
	"notas_momento_atual" text,
	"tempo_mentoria_texto" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_fichas_nome_norm_unique" UNIQUE("nome_norm"),
	CONSTRAINT "mentoria_fichas_nome" CHECK (char_length("mentoria_fichas"."nome") between 1 and 200),
	CONSTRAINT "mentoria_fichas_notas_ini" CHECK (octet_length("mentoria_fichas"."notas_momento_inicial") <= 400000),
	CONSTRAINT "mentoria_fichas_notas_atual" CHECK (octet_length("mentoria_fichas"."notas_momento_atual") <= 400000),
	CONSTRAINT "mentoria_fichas_tempo" CHECK (octet_length("mentoria_fichas"."tempo_mentoria_texto") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_midia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dono_tipo" text NOT NULL,
	"dono_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave_objeto" text,
	"url_video" text,
	"mime" text,
	"tamanho_bytes" bigint,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_midia_dono" CHECK ("mentoria_midia"."dono_tipo" in ('FICHA_ANTES', 'FICHA_DEPOIS', 'CONQUISTA', 'RDV_PESSOA', 'RDV_EVENTO', 'RDV_QUADRO_ITEM')),
	CONSTRAINT "mentoria_midia_tipo" CHECK ("mentoria_midia"."tipo" in ('FOTO', 'VIDEO', 'PDF', 'LINK_VIDEO')),
	CONSTRAINT "mentoria_midia_link" CHECK (("mentoria_midia"."tipo" = 'LINK_VIDEO') = ("mentoria_midia"."url_video" is not null)),
	CONSTRAINT "mentoria_midia_chave" CHECK (("mentoria_midia"."tipo" = 'LINK_VIDEO') = ("mentoria_midia"."chave_objeto" is null)),
	CONSTRAINT "mentoria_midia_url" CHECK ("mentoria_midia"."url_video" ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|drive\.google\.com)(/|$)'),
	CONSTRAINT "mentoria_midia_tamanho" CHECK ("mentoria_midia"."tamanho_bytes" between 0 and 20971520)
);
--> statement-breakpoint
CREATE TABLE "mentoria_midia_exclusao" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"chave_objeto" text NOT NULL,
	"enfileirado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"removido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mentoria_rdv_diagnostico" (
	"pessoa_id" uuid PRIMARY KEY NOT NULL,
	"idade" text,
	"situacao_conjugal" text,
	"filhos" text,
	"trabalho" text,
	"renda_atual" text,
	"dinheiro_guardado" text,
	"patrimonio" text,
	"dividas" text,
	"sonhos_objetivos" text,
	"colado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"colado_por" text,
	CONSTRAINT "mentoria_rdv_diagnostico_cabe" CHECK (coalesce(octet_length("mentoria_rdv_diagnostico"."idade"), 0) + coalesce(octet_length("mentoria_rdv_diagnostico"."situacao_conjugal"), 0)
        + coalesce(octet_length("mentoria_rdv_diagnostico"."filhos"), 0) + coalesce(octet_length("mentoria_rdv_diagnostico"."trabalho"), 0)
        + coalesce(octet_length("mentoria_rdv_diagnostico"."renda_atual"), 0) + coalesce(octet_length("mentoria_rdv_diagnostico"."dinheiro_guardado"), 0)
        + coalesce(octet_length("mentoria_rdv_diagnostico"."patrimonio"), 0) + coalesce(octet_length("mentoria_rdv_diagnostico"."dividas"), 0)
        + coalesce(octet_length("mentoria_rdv_diagnostico"."sonhos_objetivos"), 0) <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_rdv_duvidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"texto" text,
	"status" text DEFAULT 'ABERTA' NOT NULL,
	"resolvida_em" timestamp with time zone,
	"resolvida_por" text,
	"evento_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_rdv_duvidas_status" CHECK ("mentoria_rdv_duvidas"."status" in ('ABERTA', 'CONFIRMADA', 'DESCARTADA')),
	CONSTRAINT "mentoria_rdv_duvidas_resolvida" CHECK (("mentoria_rdv_duvidas"."status" = 'ABERTA') = ("mentoria_rdv_duvidas"."resolvida_em" is null)),
	CONSTRAINT "mentoria_rdv_duvidas_texto" CHECK (octet_length("mentoria_rdv_duvidas"."texto") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_rdv_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"data_texto" text NOT NULL,
	"data" date NOT NULL,
	"descricao" text,
	"origem" text NOT NULL,
	"checklist_item" smallint,
	"duvida_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_rdv_eventos_origem" CHECK ("mentoria_rdv_eventos"."origem" in ('MANUAL', 'COLADO', 'DUVIDA_CONFIRMADA')),
	CONSTRAINT "mentoria_rdv_eventos_checklist" CHECK ("mentoria_rdv_eventos"."checklist_item" between 1 and 9),
	CONSTRAINT "mentoria_rdv_eventos_descricao" CHECK (octet_length("mentoria_rdv_eventos"."descricao") <= 400000)
);
--> statement-breakpoint
CREATE TABLE "mentoria_rdv_pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"nome_norm" text NOT NULL,
	"pasta_url" text,
	"pasta_colada_em" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_rdv_pessoas_nome_norm_unique" UNIQUE("nome_norm"),
	CONSTRAINT "mentoria_rdv_pessoas_nome" CHECK (char_length("mentoria_rdv_pessoas"."nome") between 1 and 200),
	CONSTRAINT "mentoria_rdv_pessoas_pasta" CHECK ("mentoria_rdv_pessoas"."pasta_url" ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|drive\.google\.com)(/|$)')
);
--> statement-breakpoint
CREATE TABLE "mentoria_rdv_quadros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"quadro" text NOT NULL,
	"descricao" text,
	"data_texto" text,
	"data" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_rdv_quadros_quadro" CHECK ("mentoria_rdv_quadros"."quadro" in ('EVENTOS_PRESENCIAIS', 'INVESTIMENTO_ATIVOS', 'IMOVEL_LEILAO', 'MERCADO_IMOBILIARIO')),
	CONSTRAINT "mentoria_rdv_quadros_descricao" CHECK (octet_length("mentoria_rdv_quadros"."descricao") <= 400000)
);
--> statement-breakpoint
ALTER TABLE "mentoria_conquistas" ADD CONSTRAINT "mentoria_conquistas_ficha_id_mentoria_fichas_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."mentoria_fichas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_conquistas" ADD CONSTRAINT "mentoria_conquistas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_conquistas" ADD CONSTRAINT "mentoria_conquistas_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_ficha_campos" ADD CONSTRAINT "mentoria_ficha_campos_ficha_id_mentoria_fichas_id_fk" FOREIGN KEY ("ficha_id") REFERENCES "public"."mentoria_fichas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_ficha_campos" ADD CONSTRAINT "mentoria_ficha_campos_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_fichas" ADD CONSTRAINT "mentoria_fichas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_fichas" ADD CONSTRAINT "mentoria_fichas_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_midia" ADD CONSTRAINT "mentoria_midia_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_diagnostico" ADD CONSTRAINT "mentoria_rdv_diagnostico_pessoa_id_mentoria_rdv_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_rdv_pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_diagnostico" ADD CONSTRAINT "mentoria_rdv_diagnostico_colado_por_user_id_fk" FOREIGN KEY ("colado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_duvidas" ADD CONSTRAINT "mentoria_rdv_duvidas_pessoa_id_mentoria_rdv_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_rdv_pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_duvidas" ADD CONSTRAINT "mentoria_rdv_duvidas_resolvida_por_user_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_duvidas" ADD CONSTRAINT "mentoria_rdv_duvidas_evento_id_mentoria_rdv_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."mentoria_rdv_eventos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_duvidas" ADD CONSTRAINT "mentoria_rdv_duvidas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_duvidas" ADD CONSTRAINT "mentoria_rdv_duvidas_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_eventos" ADD CONSTRAINT "mentoria_rdv_eventos_pessoa_id_mentoria_rdv_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_rdv_pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_eventos" ADD CONSTRAINT "mentoria_rdv_eventos_duvida_id_mentoria_rdv_duvidas_id_fk" FOREIGN KEY ("duvida_id") REFERENCES "public"."mentoria_rdv_duvidas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_eventos" ADD CONSTRAINT "mentoria_rdv_eventos_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_eventos" ADD CONSTRAINT "mentoria_rdv_eventos_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_pessoas" ADD CONSTRAINT "mentoria_rdv_pessoas_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_pessoas" ADD CONSTRAINT "mentoria_rdv_pessoas_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_quadros" ADD CONSTRAINT "mentoria_rdv_quadros_pessoa_id_mentoria_rdv_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."mentoria_rdv_pessoas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_quadros" ADD CONSTRAINT "mentoria_rdv_quadros_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_quadros" ADD CONSTRAINT "mentoria_rdv_quadros_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- RLS do módulo: todas as tabelas de pessoa usam mentoria_pode() (papel cru), nunca app_role().
-- Sem DELETE para npac_app: exclusão só pelas funções SECURITY DEFINER (0032). Campos de
-- fonte (regra 5) sem UPDATE: pasta_url, data de item de quadro e o diagnóstico inteiro.
-- Status da dúvida muda só pelas funções de confirmar e descartar.
ALTER TABLE mentoria_fichas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_fichas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_fichas_acesso ON mentoria_fichas FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_fichas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (nome, nome_norm, data_inicio_texto, data_inicio, notas_momento_inicial, notas_momento_atual, tempo_mentoria_texto, version, updated_by, updated_at) ON mentoria_fichas TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_ficha_campos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_ficha_campos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_ficha_campos_acesso ON mentoria_ficha_campos FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_ficha_campos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (antes, depois, updated_by, updated_at) ON mentoria_ficha_campos TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_conquistas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_conquistas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_conquistas_acesso ON mentoria_conquistas FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_conquistas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (data_texto, data, descricao, updated_by, updated_at) ON mentoria_conquistas TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_pessoas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_pessoas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_rdv_pessoas_acesso ON mentoria_rdv_pessoas FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_rdv_pessoas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (nome, nome_norm, version, updated_by, updated_at) ON mentoria_rdv_pessoas TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_diagnostico ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_diagnostico FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_rdv_diagnostico_acesso ON mentoria_rdv_diagnostico FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT ON mentoria_rdv_diagnostico TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_quadros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_quadros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_rdv_quadros_acesso ON mentoria_rdv_quadros FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_rdv_quadros TO npac_app;
--> statement-breakpoint
GRANT UPDATE (descricao, updated_by, updated_at) ON mentoria_rdv_quadros TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_eventos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_eventos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_rdv_eventos_acesso ON mentoria_rdv_eventos FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_rdv_eventos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (data_texto, data, descricao, checklist_item, updated_by, updated_at) ON mentoria_rdv_eventos TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_duvidas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_rdv_duvidas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_rdv_duvidas_acesso ON mentoria_rdv_duvidas FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_rdv_duvidas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (texto, updated_by, updated_at) ON mentoria_rdv_duvidas TO npac_app;
--> statement-breakpoint
ALTER TABLE mentoria_midia ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_midia FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_midia_acesso ON mentoria_midia FOR ALL USING (mentoria_pode()) WITH CHECK (mentoria_pode());
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_midia TO npac_app;
--> statement-breakpoint
-- Fila de exclusão de mídia: sem policy nem GRANT; só as funções do worker (0032) acessam.
ALTER TABLE mentoria_midia_exclusao ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_midia_exclusao FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Ordem cronológica é calculada na leitura (data, id): índices para as listas por pessoa e ficha.
CREATE INDEX mentoria_conquistas_ordem ON mentoria_conquistas (ficha_id, data, id);
--> statement-breakpoint
CREATE INDEX mentoria_rdv_eventos_ordem ON mentoria_rdv_eventos (pessoa_id, data, id);
--> statement-breakpoint
CREATE INDEX mentoria_rdv_quadros_ordem ON mentoria_rdv_quadros (pessoa_id, quadro, data, id);
--> statement-breakpoint
CREATE INDEX mentoria_rdv_duvidas_pessoa ON mentoria_rdv_duvidas (pessoa_id, status);
--> statement-breakpoint
CREATE INDEX mentoria_midia_dono ON mentoria_midia (dono_tipo, dono_id);
