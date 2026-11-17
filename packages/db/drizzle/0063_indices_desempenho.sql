-- Desempenho, Fase 3 (docs/plans/desempenho.md, T3.3): só os índices que entram em algum plano no
-- npac_e2e_perf (20 mil leads, 206 mil eventos). lead_timeline (at desc, id): feed do Dashboard,
-- 78 -> 14 ms. leads (stage_id) dos não excluídos: colunas do Pipeline. leads (created_at) ficou de
-- fora: não apareceu em nenhum plano (relatório, Leads, Pipeline).
CREATE INDEX "leads_stage_id_idx" ON "leads" USING btree ("stage_id") WHERE "leads"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "lead_timeline_at_idx" ON "lead_timeline" USING btree ("at" DESC NULLS FIRST,"id");