-- A autoria financeira acompanha o usuário autenticado, inclusive em SQL direto.
DROP POLICY deals_insert ON deals;
CREATE POLICY deals_insert ON deals FOR INSERT WITH CHECK (
  created_by = (SELECT app_user_id()) AND lead_id IN (SELECT id FROM leads WHERE deleted_at IS NULL)
  AND sdr_id = (SELECT l.sdr_id FROM leads l WHERE l.id = deals.lead_id)
  AND ((SELECT app_role()) <> 'CLOSER' OR closer_id = (SELECT app_user_id()))
  AND EXISTS (SELECT 1 FROM products p JOIN "user" u ON u.id=p.closer_id
    WHERE p.id=deals.product_id AND p.closer_id=deals.closer_id AND p.active AND u.active AND u.can_close)
);
DROP POLICY payments_insert ON payments;
CREATE POLICY payments_insert ON payments FOR INSERT WITH CHECK (
  deal_id IN (SELECT id FROM deals WHERE reversed_at IS NULL)
  AND (paid_by IS NULL OR paid_by = (SELECT app_user_id()))
);
--> statement-breakpoint
-- O saldo é conferido no COMMIT: entrada + parcelas precisam fechar a venda.
CREATE FUNCTION finance_check_balance() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE target uuid; expected bigint; allocated bigint;
BEGIN
 IF current_user <> 'npac_app' THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='deals' THEN target:=NEW.id; ELSE target:=NEW.deal_id; END IF;
 SELECT total_cents INTO expected FROM deals WHERE id=target;
 SELECT coalesce(sum(amount_cents),0) INTO allocated FROM payments WHERE deal_id=target;
 IF expected IS NOT NULL AND expected <> allocated THEN
  RAISE EXCEPTION 'entrada e parcelas precisam fechar o total da venda' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER deals_balance AFTER INSERT OR UPDATE ON deals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_check_balance();
CREATE CONSTRAINT TRIGGER payments_balance AFTER INSERT OR UPDATE ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION finance_check_balance();
