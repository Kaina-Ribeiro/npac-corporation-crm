ALTER TABLE "mentoria_fichas" ADD COLUMN "pessoa_ref" uuid;--> statement-breakpoint
ALTER TABLE "mentoria_mentorados" ADD COLUMN "pessoa_ref" uuid;--> statement-breakpoint
ALTER TABLE "mentoria_rdv_pessoas" ADD COLUMN "pessoa_ref" uuid;--> statement-breakpoint

-- Vínculo entre módulos da mesma pessoa (D37): no INSERT, herda o pessoa_ref de quem já tem o
-- mesmo nome normalizado em outro módulo; senão, um novo. npac_app não altera a coluna.
CREATE FUNCTION mentoria_definir_pessoa_ref() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.pessoa_ref IS NULL THEN
    SELECT r INTO NEW.pessoa_ref FROM (
      SELECT pessoa_ref AS r FROM mentoria_mentorados WHERE nome_norm = NEW.nome_norm
      UNION ALL SELECT pessoa_ref FROM mentoria_fichas WHERE nome_norm = NEW.nome_norm
      UNION ALL SELECT pessoa_ref FROM mentoria_rdv_pessoas WHERE nome_norm = NEW.nome_norm
    ) x WHERE r IS NOT NULL LIMIT 1;
    NEW.pessoa_ref := coalesce(NEW.pessoa_ref, gen_random_uuid());
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_definir_pessoa_ref() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_definir_pessoa_ref() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER mentoria_mentorados_pessoa_ref BEFORE INSERT ON mentoria_mentorados
  FOR EACH ROW EXECUTE FUNCTION mentoria_definir_pessoa_ref();
--> statement-breakpoint
CREATE TRIGGER mentoria_fichas_pessoa_ref BEFORE INSERT ON mentoria_fichas
  FOR EACH ROW EXECUTE FUNCTION mentoria_definir_pessoa_ref();
--> statement-breakpoint
CREATE TRIGGER mentoria_rdv_pessoas_pessoa_ref BEFORE INSERT ON mentoria_rdv_pessoas
  FOR EACH ROW EXECUTE FUNCTION mentoria_definir_pessoa_ref();
--> statement-breakpoint
CREATE INDEX mentoria_mentorados_pessoa_ref ON mentoria_mentorados (pessoa_ref);
--> statement-breakpoint
CREATE INDEX mentoria_fichas_pessoa_ref ON mentoria_fichas (pessoa_ref);
--> statement-breakpoint
CREATE INDEX mentoria_rdv_pessoas_pessoa_ref ON mentoria_rdv_pessoas (pessoa_ref);
--> statement-breakpoint

-- Eliminação da mesma pessoa nos três módulos, com a mídia enfileirada, numa transação. Sem
-- version: a tela confirma antes (regra 6). Devolve as contagens para a auditoria.
CREATE FUNCTION mentoria_excluir_pessoa(ref uuid) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE r record; registros int := 0; midias int := 0;
BEGIN
  PERFORM mentoria_exigir_acesso();
  FOR r IN SELECT id, version FROM mentoria_mentorados WHERE pessoa_ref = ref LOOP
    midias := midias + mentoria_excluir_registro('MENTORADO', r.id, r.version);
    registros := registros + 1;
  END LOOP;
  FOR r IN SELECT id, version FROM mentoria_fichas WHERE pessoa_ref = ref LOOP
    midias := midias + mentoria_excluir_registro('FICHA', r.id, r.version);
    registros := registros + 1;
  END LOOP;
  FOR r IN SELECT id, version FROM mentoria_rdv_pessoas WHERE pessoa_ref = ref LOOP
    midias := midias + mentoria_excluir_registro('RDV_PESSOA', r.id, r.version);
    registros := registros + 1;
  END LOOP;
  IF registros = 0 THEN RAISE EXCEPTION 'Registro não encontrado' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('registros', registros, 'midias', midias);
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_excluir_pessoa(uuid) OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_excluir_pessoa(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_excluir_pessoa(uuid) TO npac_app;
