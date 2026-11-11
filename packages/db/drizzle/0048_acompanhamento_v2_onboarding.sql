CREATE TABLE "mentoria_envios_fisicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"status" text DEFAULT 'PREPARANDO' NOT NULL,
	"enviado_em" date,
	"rastreio" text,
	"entregue_em" date,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_envios_tipo" CHECK ("mentoria_envios_fisicos"."tipo" in ('CAIXA', 'PRESENTE_FAMILIA', 'KIT', 'CERTIFICADO')),
	CONSTRAINT "mentoria_envios_status" CHECK ("mentoria_envios_fisicos"."status" in ('PREPARANDO', 'ENVIADO', 'ENTREGUE')),
	CONSTRAINT "mentoria_envios_rastreio" CHECK (char_length("mentoria_envios_fisicos"."rastreio") <= 120),
	CONSTRAINT "mentoria_envios_enviado" CHECK ("mentoria_envios_fisicos"."status" = 'PREPARANDO' or "mentoria_envios_fisicos"."enviado_em" is not null),
	CONSTRAINT "mentoria_envios_entregue" CHECK ("mentoria_envios_fisicos"."status" <> 'ENTREGUE' or "mentoria_envios_fisicos"."entregue_em" is not null),
	CONSTRAINT "mentoria_envios_ordem" CHECK ("mentoria_envios_fisicos"."entregue_em" >= "mentoria_envios_fisicos"."enviado_em")
);
--> statement-breakpoint
CREATE TABLE "mentoria_onboarding_etapas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inscricao_id" uuid NOT NULL,
	"etapa" text NOT NULL,
	"status" text DEFAULT 'PENDENTE' NOT NULL,
	"enviada_em" timestamp with time zone,
	"concluida_em" timestamp with time zone,
	"grupo_criado_em" date,
	"formulario_preenchido" boolean,
	"grupo_avisos" boolean,
	"grupo_clube" boolean,
	"grupo_nacao" boolean,
	"aulas_concluidas" boolean,
	"aulas_concluidas_em" date,
	"version" integer DEFAULT 1 NOT NULL,
	"criado_por" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentoria_onboarding_etapa_unica" UNIQUE("inscricao_id","etapa"),
	CONSTRAINT "mentoria_onboarding_etapa" CHECK ("mentoria_onboarding_etapas"."etapa" in ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA', 'IDR')),
	CONSTRAINT "mentoria_onboarding_status" CHECK ("mentoria_onboarding_etapas"."status" in ('PENDENTE', 'ENVIADA', 'CONCLUIDA', 'DISPENSADA', 'ANTERIOR_AO_SISTEMA'))
);
--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD COLUMN "importacao_chave" text;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD COLUMN "importacao_apelidos" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD COLUMN "completar_campos" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "mentoria_envios_fisicos" ADD CONSTRAINT "mentoria_envios_fisicos_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_envios_fisicos" ADD CONSTRAINT "mentoria_envios_fisicos_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_onboarding_etapas" ADD CONSTRAINT "mentoria_onboarding_etapas_inscricao_id_mentoria_inscricoes_id_fk" FOREIGN KEY ("inscricao_id") REFERENCES "public"."mentoria_inscricoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentoria_onboarding_etapas" ADD CONSTRAINT "mentoria_onboarding_etapas_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_envios_caixa_unica" ON "mentoria_envios_fisicos" USING btree ("inscricao_id") WHERE "mentoria_envios_fisicos"."tipo" = 'CAIXA';--> statement-breakpoint
CREATE INDEX "mentoria_envios_inscricao" ON "mentoria_envios_fisicos" USING btree ("inscricao_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mentoria_inscricoes_importacao_chave" ON "mentoria_inscricoes" USING btree ("importacao_chave") WHERE "mentoria_inscricoes"."importacao_chave" is not null;
--> statement-breakpoint

-- Quem já estava na base: em onboarding manual nasce do zero; o resto não passa pelas etapas.
INSERT INTO mentoria_onboarding_etapas (inscricao_id, etapa, status)
SELECT i.id, e.etapa,
  CASE WHEN i.status = 'ONBOARDING' AND NOT i.importada THEN 'PENDENTE'
       ELSE 'ANTERIOR_AO_SISTEMA' END
FROM mentoria_inscricoes i
CROSS JOIN unnest(ARRAY['BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO', 'PME_AQUECIMENTO', 'CAIXA', 'IDR']) AS e(etapa);
--> statement-breakpoint

-- CAIXA e IDR são derivadas: npac_app só as dispensa. RDV não dispensa: a IDR inicia os 12 meses.
CREATE FUNCTION mentoria_etapa_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF NEW.etapa IN ('CAIXA', 'IDR') THEN
    IF TG_OP = 'INSERT' AND NEW.status NOT IN ('PENDENTE', 'ANTERIOR_AO_SISTEMA') THEN
      RAISE EXCEPTION 'Esta etapa segue o envio e a reunião' USING ERRCODE = '22023';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'DISPENSADA')
      OR NEW.enviada_em IS DISTINCT FROM OLD.enviada_em
      OR NEW.concluida_em IS DISTINCT FROM OLD.concluida_em
    ) THEN
      RAISE EXCEPTION 'Esta etapa segue o envio e a reunião' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.status = 'DISPENSADA' AND (TG_OP = 'INSERT' OR OLD.status <> 'DISPENSADA') AND EXISTS (
    SELECT 1 FROM mentoria_inscricoes i WHERE i.id = NEW.inscricao_id AND i.mentoria = 'RDV'
  ) THEN
    RAISE EXCEPTION 'No RDV as etapas não podem ser dispensadas' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_etapa_guarda BEFORE INSERT OR UPDATE ON mentoria_onboarding_etapas
  FOR EACH ROW EXECUTE FUNCTION mentoria_etapa_guarda();
--> statement-breakpoint

-- A etapa CAIXA acompanha o envio físico. Dispensada e anterior ao sistema ficam como estão.
CREATE FUNCTION mentoria_caixa_segue_envio() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tipo <> 'CAIXA' THEN RETURN NEW; END IF;
  UPDATE mentoria_onboarding_etapas SET
    status = CASE NEW.status WHEN 'ENVIADO' THEN 'ENVIADA' WHEN 'ENTREGUE' THEN 'CONCLUIDA'
             ELSE 'PENDENTE' END,
    enviada_em = CASE WHEN NEW.status = 'PREPARANDO' THEN NULL
                 ELSE NEW.enviado_em::timestamp AT TIME ZONE 'America/Sao_Paulo' END,
    concluida_em = CASE WHEN NEW.status = 'ENTREGUE'
                   THEN NEW.entregue_em::timestamp AT TIME ZONE 'America/Sao_Paulo' END,
    version = version + 1,
    atualizado_em = now()
  WHERE inscricao_id = NEW.inscricao_id AND etapa = 'CAIXA'
    AND status NOT IN ('DISPENSADA', 'ANTERIOR_AO_SISTEMA');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_caixa_segue_envio AFTER INSERT OR UPDATE ON mentoria_envios_fisicos
  FOR EACH ROW EXECUTE FUNCTION mentoria_caixa_segue_envio();
--> statement-breakpoint

-- De quando contam os dias parado: enviada_em. A Tarefa 3.2 soma a última retomada.
CREATE FUNCTION mentoria_onboarding_base(etapa_id uuid) RETURNS timestamptz
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
AS $$
  SELECT e.enviada_em FROM mentoria_onboarding_etapas e WHERE e.id = etapa_id
$$;
--> statement-breakpoint

ALTER FUNCTION mentoria_etapa_guarda() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_caixa_segue_envio() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_onboarding_base(uuid) OWNER TO npac_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_onboarding_base(uuid) TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_onboarding_etapas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_onboarding_etapas FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_etapas_leitura ON mentoria_onboarding_etapas FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_etapas_criar ON mentoria_onboarding_etapas FOR INSERT
  WITH CHECK (mentoria_edita('ONBOARDING', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_etapas_editar ON mentoria_onboarding_etapas FOR UPDATE
  USING (mentoria_edita('ONBOARDING', inscricao_id))
  WITH CHECK (mentoria_edita('ONBOARDING', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_onboarding_etapas TO npac_app;
--> statement-breakpoint
GRANT UPDATE (status, enviada_em, concluida_em, grupo_criado_em, formulario_preenchido, grupo_avisos,
  grupo_clube, grupo_nacao, aulas_concluidas, aulas_concluidas_em, version, atualizado_em)
  ON mentoria_onboarding_etapas TO npac_app;
--> statement-breakpoint

ALTER TABLE mentoria_envios_fisicos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE mentoria_envios_fisicos FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY mentoria_envios_leitura ON mentoria_envios_fisicos FOR SELECT
  USING (mentoria_ve(inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_envios_criar ON mentoria_envios_fisicos FOR INSERT
  WITH CHECK (mentoria_edita('ONBOARDING', inscricao_id));
--> statement-breakpoint
CREATE POLICY mentoria_envios_editar ON mentoria_envios_fisicos FOR UPDATE
  USING (mentoria_edita('ONBOARDING', inscricao_id))
  WITH CHECK (mentoria_edita('ONBOARDING', inscricao_id));
--> statement-breakpoint
GRANT SELECT, INSERT ON mentoria_envios_fisicos TO npac_app;
--> statement-breakpoint
GRANT UPDATE (status, enviado_em, rastreio, entregue_em, version, atualizado_em)
  ON mentoria_envios_fisicos TO npac_app;
--> statement-breakpoint

-- completar_campos é limpo pela API ao preencher o campo; as chaves nascem no INSERT e não mudam.
GRANT UPDATE (completar_campos) ON mentoria_inscricoes TO npac_app;
