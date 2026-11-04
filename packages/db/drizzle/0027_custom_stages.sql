ALTER TABLE "pipeline_stages" ALTER COLUMN "key" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD COLUMN "system" boolean GENERATED ALWAYS AS (key in ('SONDAGEM','AGENDADO_DIRETO','EM_FOLLOW','AGENDADO_FOLLOW','AGENDOU_PAGAMENTO','NO_SHOW','VENDA','PERDIDO')) STORED NOT NULL;--> statement-breakpoint
DROP TYPE "public"."stage_key";--> statement-breakpoint
-- Pedido do cliente (04/11/2026): a liderança exclui colunas que criou; as de sistema ficam.
GRANT DELETE ON pipeline_stages TO npac_app;
--> statement-breakpoint
CREATE POLICY pipeline_stages_delete ON pipeline_stages FOR DELETE
  USING ((SELECT app_role()) = 'HEAD' AND NOT system);
