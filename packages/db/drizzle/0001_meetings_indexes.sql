CREATE INDEX "meetings_lead_id_idx" ON "meetings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "meetings_closer_id_idx" ON "meetings" USING btree ("closer_id");