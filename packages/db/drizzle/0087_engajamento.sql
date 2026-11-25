ALTER TABLE "mentoria_inscricoes" ADD COLUMN "engajamento" text;--> statement-breakpoint
ALTER TABLE "mentoria_inscricoes" ADD CONSTRAINT "mentoria_inscricoes_engajamento" CHECK ("mentoria_inscricoes"."engajamento" in ('ENGAJADO', 'EM_ATENCAO', 'EM_RISCO'));--> statement-breakpoint

-- NPAC-75 (Duda, 24/11/2026, "1A, 2B, 3C, 4B" + opção A): engajamento marcado à mão na ficha; o Dashboard soma.
-- Todos começam nulos ("Sem marcação"): o status do gerenciador antigo (mentoria_legado) não é usado (2B).
-- Marcam Admin e Acompanhamento (com o recorte "só a carteira"); Operação só vê; a Especialista não vê (S2).
-- Leitura: a coluna mora na inscrição, então a RLS dela já recorta as linhas (nenhuma política nova). A coluna em si
-- só sai para quem `mentoria_ve_engajamento()` (uma vez por consulta, como o semáforo).

CREATE FUNCTION mentoria_ve_engajamento() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(mentoria_perfil() IN ('ACOMPANHAMENTO', 'OPERACAO'), false)
$$;
--> statement-breakpoint
-- Área nova ENGAJAMENTO no perfil Acompanhamento (o resto igual à 0076).
CREATE OR REPLACE FUNCTION mentoria_edita(area text, inscricao uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT mentoria_admin() OR coalesce(
    CASE mentoria_perfil()
      WHEN 'ACOMPANHAMENTO' THEN area IN ('INSCRICAO', 'MOMENTO', 'ONBOARDING', 'PLANO', 'REUNIAO',
        'CONTATO', 'ANOTACAO', 'PME', 'TAREFA', 'META', 'CHECKIN', 'SEGUNDA_CHANCE', 'EVOLUCAO', 'ENGAJAMENTO')
        AND mentoria_carteira_ok(inscricao)
      WHEN 'OPERACAO' THEN area IN ('INSCRICAO', 'ONBOARDING', 'REUNIAO', 'CONTATO', 'ANOTACAO', 'PME')
      WHEN 'ESPECIALISTA' THEN area IN ('ANOTACAO', 'REUNIAO') AND mentoria_ve(inscricao)
      ELSE false
    END, false)
$$;
--> statement-breakpoint
-- A Operação edita a inscrição (área INSCRICAO), mas não o engajamento: o gatilho barra. Inscrição nova sempre
-- começa sem marcação, menos pelo dono do banco (seed, fixtures).
CREATE FUNCTION mentoria_inscricoes_engajamento_guarda() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'npac_owner' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.engajamento := NULL;
    RETURN NEW;
  END IF;
  IF NEW.engajamento IS DISTINCT FROM OLD.engajamento AND NOT mentoria_edita('ENGAJAMENTO', NEW.id) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_inscricoes_engajamento_guarda BEFORE INSERT OR UPDATE OF engajamento
  ON mentoria_inscricoes FOR EACH ROW EXECUTE FUNCTION mentoria_inscricoes_engajamento_guarda();
--> statement-breakpoint
ALTER FUNCTION mentoria_ve_engajamento() OWNER TO npac_owner;
--> statement-breakpoint
ALTER FUNCTION mentoria_inscricoes_engajamento_guarda() OWNER TO npac_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mentoria_ve_engajamento() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mentoria_ve_engajamento() TO npac_app;
--> statement-breakpoint
GRANT UPDATE (engajamento) ON mentoria_inscricoes TO npac_app;
