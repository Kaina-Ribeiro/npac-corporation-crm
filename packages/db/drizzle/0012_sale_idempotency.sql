ALTER TABLE "deals" ADD COLUMN "request_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "previous_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_previous_stage_id_pipeline_stages_id_fk" FOREIGN KEY ("previous_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deals_one_active_lead" ON "deals" USING btree ("lead_id") WHERE "deals"."reversed_at" is null;