CREATE TABLE "mentoria_mensagens_modelo" (
	"momento" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"texto_individual" text DEFAULT '' NOT NULL,
	"texto_casal" text DEFAULT '' NOT NULL,
	"canal" text DEFAULT 'WHATSAPP' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"atualizado_por" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_mensagens_momento" CHECK ("mentoria_mensagens_modelo"."momento" in ('BOAS_VINDAS', 'PASSO_1', 'PASSO_2', 'PASSO_3', 'LEMBRETE_IDR', 'EVENTO', 'OUTRO')),
	CONSTRAINT "mentoria_mensagens_individual" CHECK (char_length("mentoria_mensagens_modelo"."texto_individual") <= 4000),
	CONSTRAINT "mentoria_mensagens_casal" CHECK (char_length("mentoria_mensagens_modelo"."texto_casal") <= 4000),
	CONSTRAINT "mentoria_mensagens_canal" CHECK ("mentoria_mensagens_modelo"."canal" in ('WHATSAPP'))
);
--> statement-breakpoint

-- Os momentos do PDF, com o nome e sem texto: a Duda escreve em Configurações (§12).
INSERT INTO mentoria_mensagens_modelo (momento, nome) VALUES
  ('BOAS_VINDAS', 'Boas-vindas'),
  ('PASSO_1', 'Passo 1: grupos de WhatsApp'),
  ('PASSO_2', 'Passo 2: Aquecimento da Riqueza'),
  ('PASSO_3', 'Passo 3: PME de aquecimento'),
  ('LEMBRETE_IDR', 'Lembrete da IDR'),
  ('EVENTO', 'Evento'),
  ('OUTRO', 'Outro');
--> statement-breakpoint
ALTER TABLE mentoria_mensagens_modelo ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_mensagens_modelo FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_mensagens_leitura ON mentoria_mensagens_modelo FOR SELECT
  USING (mentoria_admin() OR mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA'));
--> statement-breakpoint
CREATE POLICY mentoria_mensagens_editar ON mentoria_mensagens_modelo FOR UPDATE
  USING (mentoria_admin()) WITH CHECK (mentoria_admin() AND atualizado_por = app_user_id());
--> statement-breakpoint
GRANT SELECT ON mentoria_mensagens_modelo TO npac_app;
--> statement-breakpoint
GRANT UPDATE (texto_individual, texto_casal, version, atualizado_por, atualizado_em)
  ON mentoria_mensagens_modelo TO npac_app;
