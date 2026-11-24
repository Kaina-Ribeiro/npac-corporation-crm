-- NPAC-71 (Igor, 24/11/2026: avisos com muito atraso e que às vezes não aparecem, num iPhone). Medido em
-- produção: o servidor envia na hora, mas uma só pessoa tinha 6 inscrições de push, 5 de iPhone. Cada
-- vez que o iPhone cancela os avisos (ou o app é posto de novo na Tela de Início) nasce uma inscrição
-- nova, e a Apple nem sempre responde 404/410 para a antiga, que ficava para sempre na fila de envio.
-- Regra: ao ativar os avisos num iPhone ou iPad, as outras inscrições de iPhone/iPad da mesma pessoa
-- saem. Computador e Android não mudam: lá o serviço de push avisa quando a inscrição morre, e o
-- navegador não distingue dois computadores iguais (a pessoa perderia o aviso de um deles).
CREATE FUNCTION push_no_iphone(p_endpoint text, p_ua text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  -- `user_agent` é o rótulo curto gravado pela API ("Safari · iOS"); o host é o do push da Apple.
  SELECT split_part(p_endpoint, '/', 3) LIKE '%push.apple.com' AND coalesce(p_ua, '') LIKE '%iOS'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION push_subscribe(p_endpoint text, p_p256dh bytea, p_auth bytea, p_ua text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid text := app_user_id();
BEGIN
  IF uid IS NULL OR app_role() IS NULL THEN RAISE EXCEPTION 'sem usuário'; END IF;
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  IF push_no_iphone(p_endpoint, p_ua) THEN
    DELETE FROM push_subscriptions s
    WHERE s.user_id = uid AND push_no_iphone(s.endpoint, s.user_agent);
  END IF;
  INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (uid, p_endpoint, p_p256dh, p_auth, p_ua);
END $$;
--> statement-breakpoint
-- O que já estava acumulado: de cada pessoa fica só a inscrição de iPhone/iPad mais nova.
DELETE FROM push_subscriptions s USING push_subscriptions n
WHERE n.user_id = s.user_id
  AND push_no_iphone(s.endpoint, s.user_agent) AND push_no_iphone(n.endpoint, n.user_agent)
  AND (n.created_at, n.id) > (s.created_at, s.id);
--> statement-breakpoint
ALTER FUNCTION push_no_iphone(text, text) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION push_no_iphone(text, text) FROM PUBLIC;
