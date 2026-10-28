ALTER TABLE "lead_tasks" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
DROP POLICY activity_select ON lead_tasks;
--> statement-breakpoint
DROP POLICY tasks_insert ON lead_tasks;
--> statement-breakpoint
DROP POLICY tasks_update ON lead_tasks;
--> statement-breakpoint
CREATE POLICY tasks_select ON lead_tasks FOR SELECT USING (
  lead_id IN (SELECT id FROM leads)
  OR (lead_id IS NULL AND (assignee_id = (SELECT app_user_id()) OR (SELECT app_role()) = 'HEAD'))
);
--> statement-breakpoint
CREATE POLICY tasks_insert ON lead_tasks FOR INSERT WITH CHECK (
  created_by = (SELECT app_user_id())
  AND (lead_id IN (SELECT id FROM leads) OR (lead_id IS NULL AND assignee_id = (SELECT app_user_id())))
);
--> statement-breakpoint
CREATE POLICY tasks_update ON lead_tasks FOR UPDATE USING (
  lead_id IN (SELECT id FROM leads)
  OR (lead_id IS NULL AND (assignee_id = (SELECT app_user_id()) OR (SELECT app_role()) = 'HEAD'))
) WITH CHECK (
  lead_id IN (SELECT id FROM leads)
  OR (lead_id IS NULL AND (assignee_id = (SELECT app_user_id()) OR (SELECT app_role()) = 'HEAD'))
);
