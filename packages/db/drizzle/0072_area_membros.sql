-- NPAC-54, Fase 1 (plano docs/plans/acesso-por-area.md, spec docs/superpowers/specs/2026-11-19-acesso-por-area-design.md,
-- seção "Modelo"): `area_membros` (pessoa, área, cargo, é Head?) + `user.mestre` (Diretoria) viram a fonte do
-- cargo. As funções que leem o cargo (app_role, mentoria_perfil, mentoria_admin, mentoria_perfil_de, destinatários
-- do push e aviso de formulário) passam a ler dela com o mesmo resultado; nenhuma política é reescrita.
-- "user".role vira resumo calculado. Compatibilidade até a fase 5: visão `mentoria_perfis`,
-- `mentoria_definir_perfil` por cima de `area_definir_membro` e escrita em "user".role traduzida por gatilho.
CREATE TABLE "area_membros" (
	"user_id" text NOT NULL,
	"area" text NOT NULL,
	"cargo" text,
	"head" boolean DEFAULT false NOT NULL,
	"definido_por" text,
	"definido_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_membros_pk" PRIMARY KEY("user_id","area"),
	CONSTRAINT "area_membros_area" CHECK ("area_membros"."area" in ('COMERCIAL', 'ACOMPANHAMENTO')),
	CONSTRAINT "area_membros_comercial" CHECK ("area_membros"."area" <> 'COMERCIAL' or ("area_membros"."cargo" is not null
        and "area_membros"."cargo" in ('SDR', 'CLOSER', 'HEAD') and "area_membros"."head" = ("area_membros"."cargo" = 'HEAD'))),
	CONSTRAINT "area_membros_acompanhamento" CHECK ("area_membros"."area" <> 'ACOMPANHAMENTO' or ("area_membros"."cargo" is null and not "area_membros"."head")
        or ("area_membros"."cargo" is not null
          and "area_membros"."cargo" in ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR')))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "mestre" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "area_membros" ADD CONSTRAINT "area_membros_definido_por_user_id_fk" FOREIGN KEY ("definido_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Carga inicial (spec, "Carga inicial"): antes dos gatilhos, para nada ser traduzido duas vezes.
-- Contas desativadas também ganham vínculo (a ficha ainda mostra quem saiu). Perfil esquecido numa
-- conta que não é do Acompanhamento (as funções de hoje já o ignoravam) não vira vínculo.
UPDATE "user" SET mestre = true WHERE role::text = 'DIRETOR';
--> statement-breakpoint
INSERT INTO area_membros (user_id, area, cargo, head)
  SELECT u.id, 'COMERCIAL', u.role::text, u.role::text = 'HEAD'
  FROM "user" u WHERE u.role::text IN ('SDR', 'CLOSER', 'HEAD');
--> statement-breakpoint
INSERT INTO area_membros (user_id, area, cargo, head, definido_por, definido_em)
  SELECT u.id, 'ACOMPANHAMENTO', p.perfil, coalesce(p.admin, false), p.definido_por,
    coalesce(p.definido_em, now())
  FROM "user" u LEFT JOIN mentoria_perfis p ON p.user_id = u.id
  WHERE u.role::text = 'ACOMPANHAMENTO';
--> statement-breakpoint
DROP TABLE "mentoria_perfis";
--> statement-breakpoint

-- ------------------------------------------------------------------ quem está logado

-- A conta logada (ativa) é a Mestre (Diretoria).
CREATE FUNCTION area_mestre() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = app_user_id() AND u.mestre)
$$;
--> statement-breakpoint
-- Áreas em que a conta logada é Head (a Mestre, todas). Para a RLS de leitura: uma vez por consulta.
CREATE FUNCTION area_head_areas() RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN u.mestre THEN ARRAY['ACOMPANHAMENTO', 'COMERCIAL']
    ELSE coalesce((SELECT array_agg(m.area ORDER BY m.area) FROM area_membros m
      WHERE m.user_id = u.id AND m.head), '{}') END
  FROM "user" u WHERE u.id = app_user_id()
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ funções que trocam de fonte
-- Mesma assinatura e mesmo resultado (db/test/areas-equivalencia.test.ts). app_user_id() já exige
-- conta ativa.

CREATE OR REPLACE FUNCTION app_role() RETURNS role
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN u.mestre THEN 'HEAD'::role
    ELSE coalesce(
      (SELECT m.cargo::role FROM area_membros m WHERE m.user_id = u.id AND m.area = 'COMERCIAL'),
      (SELECT m.area::role FROM area_membros m
        WHERE m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'))
    END
  FROM "user" u WHERE u.id = app_user_id() AND u.active
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_perfil() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT m.cargo FROM area_membros m JOIN "user" u ON u.id = m.user_id
  WHERE u.id = app_user_id() AND u.active AND m.area = 'ACOMPANHAMENTO'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_perfil_de(uid text) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT m.cargo FROM area_membros m JOIN "user" u ON u.id = m.user_id
  WHERE u.id = uid AND u.active AND m.area = 'ACOMPANHAMENTO'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_admin() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.id = app_user_id() AND u.active
      AND (u.mestre OR EXISTS (SELECT 1 FROM area_membros m
        WHERE m.user_id = u.id AND m.area = 'ACOMPANHAMENTO' AND m.head))
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mentoria_destinatarios(alvo_perfil text, alvo text) RETURNS text[]
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN alvo IS NOT NULL AND mentoria_perfil_de(alvo) = alvo_perfil THEN ARRAY[alvo]
    ELSE coalesce((SELECT array_agg(u.id ORDER BY u.id) FROM "user" u
      JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'
      WHERE u.active AND m.cargo = alvo_perfil), '{}')
  END
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ resumo em "user".role (M7)

-- Mestre → DIRETOR; senão o cargo do Comercial; senão ACOMPANHAMENTO. Nulo = sem vínculo. Em
-- plpgsql e com os cargos lidos como texto: valor novo de enum não vale na transação que o criou, e
-- num banco novo todas as migrations rodam numa transação só.
CREATE FUNCTION area_resumo(uid text) RETURNS role
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  r text;
BEGIN
  SELECT CASE WHEN u.mestre THEN 'DIRETOR'
    ELSE coalesce(
      (SELECT m.cargo FROM area_membros m WHERE m.user_id = u.id AND m.area = 'COMERCIAL'),
      (SELECT m.area FROM area_membros m WHERE m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'))
    END INTO r
  FROM "user" u WHERE u.id = uid;
  RETURN r::role;
END $$;
--> statement-breakpoint
-- Grava o resumo e as caixas que o cargo fixa (SDR t/f, Closer f/t, só Acompanhamento f/f; Head e
-- Diretoria como estão), para o CHECK user_cargo_caixas (0049). `npac.area_sync` avisa o gatilho de
-- compatibilidade de "user" que esta escrita vem da fonte e não deve ser traduzida de volta.
CREATE FUNCTION area_sincronizar(uid text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  r role := area_resumo(uid);
  antes text := current_setting('npac.area_sync', true);
BEGIN
  IF r IS NULL THEN RETURN; END IF;
  PERFORM set_config('npac.area_sync', 'on', true);
  UPDATE "user" u SET role = r,
    can_prospect = CASE r::text WHEN 'SDR' THEN true WHEN 'CLOSER' THEN false
      WHEN 'ACOMPANHAMENTO' THEN false ELSE u.can_prospect END,
    can_close = CASE r::text WHEN 'SDR' THEN false WHEN 'CLOSER' THEN true
      WHEN 'ACOMPANHAMENTO' THEN false ELSE u.can_close END
  WHERE u.id = uid AND (u.role IS DISTINCT FROM r
    OR (r::text = 'SDR' AND NOT (u.can_prospect AND NOT u.can_close))
    OR (r::text = 'CLOSER' AND NOT (u.can_close AND NOT u.can_prospect))
    OR (r::text = 'ACOMPANHAMENTO' AND (u.can_prospect OR u.can_close)));
  PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
END $$;
--> statement-breakpoint
CREATE FUNCTION area_membros_resumo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('npac.area_sync', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN PERFORM area_sincronizar(OLD.user_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM area_sincronizar(NEW.user_id);
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER area_membros_resumo AFTER INSERT OR UPDATE OR DELETE ON area_membros
  FOR EACH ROW EXECUTE FUNCTION area_membros_resumo();
--> statement-breakpoint

-- ------------------------------------------------------------------ funções que escrevem o cargo
-- Fase 1: ainda com a regra de hoje (Diretoria faz tudo; Admin do módulo troca perfil de quem é do
-- Acompanhamento; Head do Comercial troca SDR/Closer de quem não é Head nem do Acompanhamento, como
-- o guardLeadership da API). A regra única é da fase 2.

-- Cria ou troca o vínculo de `alvo` em `nova_area`. Comercial: head = (cargo = HEAD).
-- Acompanhamento: cargo nulo = "falta perfil" (sem selo).
CREATE FUNCTION area_definir_membro(alvo text, nova_area text, novo_cargo text, novo_head boolean)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  alvo_mestre boolean;
  h boolean;
BEGIN
  IF nova_area IS NULL OR nova_area NOT IN ('COMERCIAL', 'ACOMPANHAMENTO') THEN
    RAISE EXCEPTION 'Área inválida' USING ERRCODE = '22023';
  END IF;
  SELECT u.mestre INTO alvo_mestre FROM "user" u WHERE u.id = alvo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF NOT (
    area_mestre()
    OR (nova_area = 'ACOMPANHAMENTO' AND mentoria_admin()
      AND EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area = 'ACOMPANHAMENTO'))
    OR (nova_area = 'COMERCIAL' AND app_role() = 'HEAD' AND novo_cargo IN ('SDR', 'CLOSER')
      AND NOT alvo_mestre
      AND NOT EXISTS (SELECT 1 FROM area_membros m
        WHERE m.user_id = alvo AND (m.head OR m.area = 'ACOMPANHAMENTO')))
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF alvo_mestre THEN
    RAISE EXCEPTION 'A Diretoria não tem cargo por área' USING ERRCODE = '22023';
  END IF;
  IF nova_area = 'COMERCIAL' THEN
    IF novo_cargo IS NULL OR novo_cargo NOT IN ('SDR', 'CLOSER', 'HEAD') THEN
      RAISE EXCEPTION 'Cargo inválido para a área' USING ERRCODE = '22023';
    END IF;
    h := novo_cargo = 'HEAD';
  ELSE
    IF novo_cargo IS NOT NULL
      AND novo_cargo NOT IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR') THEN
      RAISE EXCEPTION 'Cargo inválido para a área' USING ERRCODE = '22023';
    END IF;
    h := novo_cargo IS NOT NULL AND coalesce(novo_head, false);
  END IF;
  INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
    VALUES (alvo, nova_area, novo_cargo, h, app_user_id())
    ON CONFLICT (user_id, area) DO UPDATE
    SET cargo = excluded.cargo, head = excluded.head,
        definido_por = excluded.definido_por, definido_em = now();
END $$;
--> statement-breakpoint
-- Tira `alvo` de uma área (só a Diretoria); recusa tirar a última.
CREATE FUNCTION area_remover_membro(alvo text, area_alvo text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT area_mestre() THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area = area_alvo) THEN
    RAISE EXCEPTION 'Vínculo não encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area <> area_alvo) THEN
    RAISE EXCEPTION 'A conta precisa de ao menos uma área' USING ERRCODE = '22023';
  END IF;
  DELETE FROM area_membros m WHERE m.user_id = alvo AND m.area = area_alvo;
END $$;
--> statement-breakpoint
-- Dá ou tira a Diretoria (só a Diretoria, nunca a própria). Ao virar Diretoria os vínculos saem; ao
-- deixar de ser, `nova_area` e `novo_cargo` dizem para onde vai. A última Diretoria ativa nunca sai
-- (gatilho user_ao_menos_um_mestre).
CREATE FUNCTION area_definir_mestre(alvo text, valor boolean, nova_area text DEFAULT NULL,
  novo_cargo text DEFAULT NULL, novo_head boolean DEFAULT false) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  atual boolean;
  h boolean;
  antes text := current_setting('npac.area_sync', true);
BEGIN
  IF NOT area_mestre() THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF alvo = app_user_id() THEN
    RAISE EXCEPTION 'Ninguém muda o próprio cargo' USING ERRCODE = '42501';
  END IF;
  SELECT u.mestre INTO atual FROM "user" u WHERE u.id = alvo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE = 'P0002'; END IF;
  IF valor IS NULL OR valor = atual THEN RETURN; END IF;
  IF valor THEN
    PERFORM set_config('npac.area_sync', 'on', true);
    DELETE FROM area_membros m WHERE m.user_id = alvo;
    UPDATE "user" u SET mestre = true WHERE u.id = alvo;
    PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
    PERFORM area_sincronizar(alvo);
    RETURN;
  END IF;
  IF nova_area = 'COMERCIAL' AND novo_cargo IN ('SDR', 'CLOSER', 'HEAD') THEN
    h := novo_cargo = 'HEAD';
  ELSIF nova_area = 'ACOMPANHAMENTO'
    AND (novo_cargo IS NULL OR novo_cargo IN ('ACOMPANHAMENTO', 'OPERACAO', 'ESPECIALISTA', 'MENTOR')) THEN
    h := novo_cargo IS NOT NULL AND coalesce(novo_head, false);
  ELSE
    RAISE EXCEPTION 'Diga a área e o cargo de destino' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('npac.area_sync', 'on', true);
  UPDATE "user" u SET mestre = false WHERE u.id = alvo;
  INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
    VALUES (alvo, nova_area, novo_cargo, h, app_user_id());
  PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
  PERFORM area_sincronizar(alvo);
END $$;
--> statement-breakpoint
-- Quem está logado pode mexer na conta inteira de `alvo`? Regra de hoje (guardLeadership): a
-- Diretoria, sempre; o Head do Comercial, só em SDR e Closer.
CREATE FUNCTION area_gerencia(alvo text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN area_mestre() THEN EXISTS (SELECT 1 FROM "user" u WHERE u.id = alvo)
    WHEN app_role() = 'HEAD' THEN
      EXISTS (SELECT 1 FROM "user" u WHERE u.id = alvo AND NOT u.mestre)
      AND EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo)
      AND NOT EXISTS (SELECT 1 FROM area_membros m
        WHERE m.user_id = alvo AND (m.head OR m.area = 'ACOMPANHAMENTO'))
    ELSE false END
$$;
--> statement-breakpoint

-- ------------------------------------------------------------------ compatibilidade (sai na fase 5)
-- A versão anterior do app (e os seeds e testes) ainda grava o cargo em "user".role. O gatilho
-- traduz para o vínculo certo, com a semântica de antes (um cargo por pessoa): Diretoria = mestre sem
-- vínculo; SDR/Closer/Head = só o Comercial; Acompanhamento = só o Acompanhamento, mantendo o perfil
-- se já tinha. As caixas não são mexidas aqui: o CHECK user_cargo_caixas continua recusando cargo
-- trocado sem as caixas certas, como antes.

CREATE FUNCTION user_cargo_compat_antes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('npac.area_sync', true) = 'on' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.mestre AND NEW.role::text <> 'DIRETOR' THEN
      RAISE EXCEPTION 'A conta Mestre é a Diretoria' USING ERRCODE = '22023';
    END IF;
    NEW.mestre := NEW.role::text = 'DIRETOR';
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    NEW.mestre := NEW.role::text = 'DIRETOR';
  ELSIF NEW.mestre IS DISTINCT FROM OLD.mestre THEN
    RAISE EXCEPTION 'A Diretoria só muda por area_definir_mestre' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER user_cargo_compat_antes BEFORE INSERT OR UPDATE OF role, mestre ON "user"
  FOR EACH ROW EXECUTE FUNCTION user_cargo_compat_antes();
--> statement-breakpoint
CREATE FUNCTION user_cargo_compat_depois() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  antes text := current_setting('npac.area_sync', true);
  quem text := app_user_id();
BEGIN
  IF antes = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NULL; END IF;
  PERFORM set_config('npac.area_sync', 'on', true);
  IF NEW.role::text = 'DIRETOR' THEN
    DELETE FROM area_membros m WHERE m.user_id = NEW.id;
  ELSIF NEW.role::text = 'ACOMPANHAMENTO' THEN
    DELETE FROM area_membros m WHERE m.user_id = NEW.id AND m.area <> 'ACOMPANHAMENTO';
    INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
      VALUES (NEW.id, 'ACOMPANHAMENTO', NULL, false, quem)
      ON CONFLICT (user_id, area) DO NOTHING;
  ELSE
    DELETE FROM area_membros m WHERE m.user_id = NEW.id AND m.area <> 'COMERCIAL';
    INSERT INTO area_membros (user_id, area, cargo, head, definido_por)
      VALUES (NEW.id, 'COMERCIAL', NEW.role::text, NEW.role::text = 'HEAD', quem)
      ON CONFLICT (user_id, area) DO UPDATE
      SET cargo = excluded.cargo, head = excluded.head,
          definido_por = excluded.definido_por, definido_em = now();
  END IF;
  PERFORM set_config('npac.area_sync', coalesce(antes, ''), true);
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER user_cargo_compat_depois AFTER INSERT OR UPDATE OF role ON "user"
  FOR EACH ROW EXECUTE FUNCTION user_cargo_compat_depois();
--> statement-breakpoint

-- `mentoria_perfis` vira visão com as mesmas colunas, lida pela RLS de area_membros (a própria
-- linha, a Mestre ou o Admin do módulo: o mesmo que a política antiga). npac_app só lê. Para o dono
-- do banco (seeds e testes antigos), escrever nela grava o vínculo do Acompanhamento.
CREATE VIEW mentoria_perfis WITH (security_invoker = true) AS
  SELECT m.user_id, m.cargo AS perfil, m.head AS admin, m.definido_por, m.definido_em
  FROM area_membros m WHERE m.area = 'ACOMPANHAMENTO' AND m.cargo IS NOT NULL;
--> statement-breakpoint
ALTER VIEW mentoria_perfis ALTER COLUMN admin SET DEFAULT false;
--> statement-breakpoint
ALTER VIEW mentoria_perfis ALTER COLUMN definido_em SET DEFAULT now();
--> statement-breakpoint
CREATE FUNCTION mentoria_perfis_escrita() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE area_membros m SET cargo = NULL, head = false, definido_em = now()
      WHERE m.user_id = OLD.user_id AND m.area = 'ACOMPANHAMENTO';
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'mentoria_perfis não troca user_id' USING ERRCODE = '0A000';
  END IF;
  IF NEW.perfil IS NULL THEN
    RAISE EXCEPTION 'null value in column "perfil" of relation "mentoria_perfis"'
      USING ERRCODE = '23502';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Perfil para quem não é do Acompanhamento nunca valeu (as funções olhavam o cargo): não vira
    -- vínculo, como na carga inicial.
    IF NOT EXISTS (SELECT 1 FROM area_membros m
      WHERE m.user_id = NEW.user_id AND m.area = 'ACOMPANHAMENTO') THEN
      RETURN NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM area_membros m
      WHERE m.user_id = NEW.user_id AND m.area = 'ACOMPANHAMENTO' AND m.cargo IS NOT NULL) THEN
      RAISE EXCEPTION 'duplicate key value violates unique constraint "mentoria_perfis_pkey"'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE area_membros m SET cargo = NEW.perfil, head = coalesce(NEW.admin, false),
    definido_por = NEW.definido_por, definido_em = coalesce(NEW.definido_em, now())
    WHERE m.user_id = NEW.user_id AND m.area = 'ACOMPANHAMENTO';
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER mentoria_perfis_escrita INSTEAD OF INSERT OR UPDATE OR DELETE ON mentoria_perfis
  FOR EACH ROW EXECUTE FUNCTION mentoria_perfis_escrita();
--> statement-breakpoint
-- Por cima da função nova; mesmas mensagens e códigos de antes.
CREATE OR REPLACE FUNCTION mentoria_definir_perfil(alvo text, novo_perfil text, novo_admin boolean)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT mentoria_admin() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF novo_perfil IS NULL THEN
    IF EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = alvo AND m.area = 'ACOMPANHAMENTO') THEN
      PERFORM area_definir_membro(alvo, 'ACOMPANHAMENTO', NULL, false);
    END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "user" u JOIN area_membros m ON m.user_id = u.id AND m.area = 'ACOMPANHAMENTO'
    WHERE u.id = alvo AND u.active
  ) THEN
    RAISE EXCEPTION 'Só quem tem o cargo Acompanhamento recebe perfil' USING ERRCODE = '22023';
  END IF;
  PERFORM area_definir_membro(alvo, 'ACOMPANHAMENTO', novo_perfil, novo_admin);
END $$;
--> statement-breakpoint

-- ------------------------------------------------------------------ invariantes (no commit)

-- Conta ativa que não é Mestre tem ao menos um vínculo.
CREATE FUNCTION area_conferir_vinculo() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  uid text;
BEGIN
  IF TG_TABLE_NAME = 'user' THEN uid := NEW.id; ELSE uid := OLD.user_id; END IF;
  IF EXISTS (SELECT 1 FROM "user" u WHERE u.id = uid AND u.active AND NOT u.mestre
    AND NOT EXISTS (SELECT 1 FROM area_membros m WHERE m.user_id = u.id)) THEN
    RAISE EXCEPTION 'Conta ativa sem área' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_tem_area AFTER INSERT OR UPDATE ON "user"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.active AND NOT NEW.mestre)
  EXECUTE FUNCTION area_conferir_vinculo();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER area_membros_ultima AFTER UPDATE OR DELETE ON area_membros
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION area_conferir_vinculo();
--> statement-breakpoint
-- Ao menos uma Diretoria ativa (M8): ninguém tira nem desativa a última.
CREATE FUNCTION area_conferir_mestre() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.mestre AND u.active) THEN
    RAISE EXCEPTION 'Precisa haver ao menos uma Diretoria ativa' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER user_ao_menos_um_mestre AFTER UPDATE ON "user"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (OLD.mestre AND OLD.active AND NOT (NEW.mestre AND NEW.active))
  EXECUTE FUNCTION area_conferir_mestre();
--> statement-breakpoint

-- ------------------------------------------------------------------ RLS e grants
-- Sem INSERT/UPDATE/DELETE para npac_app: escrita só pelas funções acima. Leitura no formato "uma
-- vez por consulta" (0060–0061).
ALTER TABLE area_membros ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE area_membros FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY area_membros_leitura ON area_membros FOR SELECT USING (
  user_id = (SELECT app_user_id()) OR area = ANY ((SELECT area_head_areas())::text[])
);
--> statement-breakpoint
GRANT SELECT ON area_membros, mentoria_perfis TO npac_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION area_mestre(), area_head_areas(), area_resumo(text), area_sincronizar(text),
  area_definir_membro(text, text, text, boolean), area_remover_membro(text, text),
  area_definir_mestre(text, boolean, text, text, boolean), area_gerencia(text),
  area_membros_resumo(), user_cargo_compat_antes(), user_cargo_compat_depois(),
  mentoria_perfis_escrita(), area_conferir_vinculo(), area_conferir_mestre() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION area_mestre(), area_head_areas(),
  area_definir_membro(text, text, text, boolean), area_remover_membro(text, text),
  area_definir_mestre(text, boolean, text, text, boolean), area_gerencia(text) TO npac_app;
--> statement-breakpoint

-- ------------------------------------------------------------------ leitores do cargo restantes
-- Push da Fila (0070) e aviso de formulário (0047): a mesma conta, lida da fonte nova.
CREATE OR REPLACE FUNCTION public.mentoria_avisos_candidatos(agora timestamp with time zone)
 RETURNS TABLE(chave text, quando timestamp with time zone, ate timestamp with time zone, user_ids text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET jit TO 'off'
AS $function$
  WITH d AS (SELECT mentoria_dia(agora) AS hoje),
  ins AS (
    SELECT x.id, x.mentoria, x.responsavel_id,
      (SELECT max(p.fim) FROM mentoria_pausas p
        WHERE p.inscricao_id = x.id AND p.fim IS NOT NULL) AS retomada
    FROM mentoria_inscricoes x WHERE x.status IN ('ONBOARDING', 'ATIVO')
  ),
  et AS (
    SELECT e.*, ins.retomada, mentoria_dia(mentoria_onboarding_base(e.id)) AS base_envio
    FROM mentoria_onboarding_etapas e JOIN ins ON ins.id = e.inscricao_id
  ),
  op AS (SELECT mentoria_destinatarios('OPERACAO', NULL) AS ids),
  -- Quem opera o módulo como Acompanhamento e como Especialista (os critérios de
  -- mentoria_destinatarios/mentoria_perfil_de), lidos uma vez para os itens da Parte 4.
  pf AS (
    SELECT coalesce(array_agg(u.id ORDER BY u.id) FILTER (WHERE mp.cargo = 'ACOMPANHAMENTO'),
        '{}') AS acomp,
      coalesce(array_agg(u.id ORDER BY u.id) FILTER (WHERE mp.cargo = 'ESPECIALISTA'), '{}') AS esp
    FROM "user" u JOIN area_membros mp ON mp.user_id = u.id AND mp.area = 'ACOMPANHAMENTO'
    WHERE u.active
  ),
  -- = mentoria_destinatarios('ACOMPANHAMENTO', responsável), por inscrição.
  resp AS (
    SELECT ins.id, CASE WHEN ins.responsavel_id = ANY (pf.acomp) THEN ARRAY[ins.responsavel_id]
      ELSE pf.acomp END AS ids
    FROM ins CROSS JOIN pf
  ),
  av AS (
    -- Equipe devendo o próximo passo: no 4º dia, às 8h.
    SELECT 'passo-devido:' || e.id AS k, mentoria_hora(b.dia + 4, 8) AS q,
      NULL::timestamptz AS fim, op.ids AS u
    FROM et e CROSS JOIN op
    JOIN (VALUES ('GRUPOS', 'BOAS_VINDAS'), ('AQUECIMENTO', 'GRUPOS'),
      ('PME_AQUECIMENTO', 'AQUECIMENTO')) o(etapa, anterior) ON o.etapa = e.etapa
    JOIN et a ON a.inscricao_id = e.inscricao_id AND a.etapa = o.anterior
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(a.concluida_em, a.atualizado_em)),
      e.retomada) AS dia) b
    WHERE e.status = 'PENDENTE' AND a.status IN ('CONCLUIDA', 'DISPENSADA')

    UNION ALL
    -- Passo curto parado: no 4º dia, às 8h.
    SELECT 'parado:' || e.id, mentoria_hora(e.base_envio + 4, 8), NULL, op.ids
    FROM et e CROSS JOIN op
    WHERE e.etapa IN ('BOAS_VINDAS', 'GRUPOS', 'AQUECIMENTO') AND e.status = 'ENVIADA'
      AND e.base_envio IS NOT NULL

    UNION ALL
    -- Caixa sem envio vira alerta no 4º dia.
    SELECT 'enviar-caixa:' || c.inscricao_id, mentoria_hora(b.dia + 4, 8), NULL, op.ids
    FROM et c CROSS JOIN op
    JOIN et bv ON bv.inscricao_id = c.inscricao_id AND bv.etapa = 'BOAS_VINDAS'
    CROSS JOIN LATERAL (SELECT greatest(mentoria_dia(coalesce(bv.formulario_preenchido_em,
      bv.atualizado_em)), c.retomada) AS dia) b
    WHERE c.etapa = 'CAIXA' AND c.status = 'PENDENTE'
      AND (bv.formulario_preenchido IS TRUE OR bv.status = 'DISPENSADA')

    UNION ALL
    -- Caixa em trânsito: no 21º dia, às 8h.
    SELECT 'caixa-atrasada:' || c.inscricao_id, mentoria_hora(c.base_envio + 21, 8), NULL, op.ids
    FROM et c CROSS JOIN op
    WHERE c.etapa = 'CAIXA' AND c.status = 'ENVIADA' AND c.base_envio IS NOT NULL

    UNION ALL
    -- Dia da IDR: às 8h o lembrete, até a reunião; e o link 30 minutos antes, para a Operação e
    -- para quem conduz, se for do Acompanhamento.
    SELECT 'lembrete-idr:' || r.id, mentoria_hora(mentoria_dia(r.inicio), 8), r.inicio, op.ids
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN op
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA', 'LINK_ENVIADO')
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f WHERE f.chave = 'lembrete-idr:' || r.id)

    UNION ALL
    SELECT 'link-idr:' || r.id, r.inicio - interval '30 minutes', r.inicio,
      op.ids || CASE WHEN mentoria_perfil_de(r.conduzida_por) = 'ACOMPANHAMENTO'
        THEN ARRAY[r.conduzida_por] ELSE '{}'::text[] END
    FROM mentoria_reunioes r JOIN ins ON ins.id = r.inscricao_id CROSS JOIN op
    WHERE r.tipo = 'IDR' AND r.status IN ('AGENDADA', 'CONFIRMADA')

    UNION ALL
    -- Ação do plano: às 8h do dia em que entra na Fila, para o responsável (ou o perfil). As que
    -- vieram antes do sistema não avisam (§7); FIM_PME esperando o ciclo também não.
    SELECT 'acao:' || a.id, mentoria_hora(e.dia, 8), mentoria_hora(e.dia + 1, 0),
      mentoria_destinatarios(a.responsavel_perfil, a.responsavel_id)
    FROM mentoria_acoes a JOIN ins ON ins.id = a.inscricao_id CROSS JOIN d
    LEFT JOIN mentoria_ciclos c ON a.gatilho = 'FIM_PME' AND c.inscricao_id = a.inscricao_id
      AND c.numero = a.mes
    CROSS JOIN LATERAL (SELECT mentoria_acao_data(a.gatilho, a.mes, a.data_prevista,
      c.id IS NOT NULL, c.concluido_em, c.nao_concluido_em,
      coalesce(c.segunda_chance_ate, c.prazo), d.hoje) AS dia) e
    WHERE a.status = 'PENDENTE' AND NOT a.anterior_ao_sistema AND e.dia IS NOT NULL

    UNION ALL
    -- Todo dia 1º, às 8h: a arte da agenda e as reuniões do 6M, num aviso só. Este mês e o
    -- próximo, para o despertador saber a próxima.
    SELECT 'dia-1:' || to_char(m.dia, 'YYYY-MM'), mentoria_hora(m.dia, 8),
      mentoria_hora(m.dia + 1, 0), op.ids
    FROM d CROSS JOIN op
    CROSS JOIN LATERAL (VALUES (date_trunc('month', d.hoje)::date),
      ((date_trunc('month', d.hoje) + interval '1 month')::date)) m(dia)
    WHERE NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f
      WHERE f.chave = 'agenda-mes:' || to_char(m.dia, 'YYYY-MM'))

    UNION ALL
    -- Cobrança (E17): às 8h do dia do prazo, só nele; a mesma pessoa da Fila.
    SELECT 'cobranca:' || t.id, mentoria_hora(t.data_cobranca, 8),
      mentoria_hora(t.data_cobranca + 1, 0),
      CASE WHEN r.conduzida_por = ANY (pf.esp) THEN ARRAY[r.conduzida_por] ELSE resp.ids END
    FROM mentoria_tarefas t JOIN resp ON resp.id = t.inscricao_id CROSS JOIN d CROSS JOIN pf
    LEFT JOIN mentoria_reunioes r ON r.id = t.reuniao_id
    WHERE t.status = 'PENDENTE' AND t.data_cobranca >= d.hoje

    UNION ALL
    -- Semáforo vermelho (E18): uma vez por semana por mentorado; "visto nesta semana" não avisa.
    SELECT 'semaforo-vermelho:' || s.inscricao_id || ':' || w.semana,
      mentoria_hora(d.hoje, 8), mentoria_hora(d.hoje + 1, 0), resp.ids
    FROM d CROSS JOIN LATERAL mentoria_semaforo_lote_calc(d.hoje) s
    JOIN resp ON resp.id = s.inscricao_id
    CROSS JOIN LATERAL (SELECT to_char(date_trunc('week', d.hoje::timestamp), 'YYYY-MM-DD')
      AS semana) w
    WHERE s.cor = 'VERMELHO'
      AND NOT EXISTS (SELECT 1 FROM mentoria_fila_feitos f
        WHERE f.chave = 'semaforo:' || s.inscricao_id || ':' || w.semana)

    UNION ALL
    -- Escada de atraso do PME (E20): cada degrau às 8h do dia, até o seguinte; o de 15 dias vale
    -- enquanto o ciclo estiver aberto. Contato registrado para o degrau não avisa.
    SELECT 'pme-atrasado:' || c.id || ':' || to_char(p.pa, 'YYYY-MM-DD') || ':' || g.degrau,
      mentoria_hora(p.pa + g.degrau, 8),
      CASE WHEN g.prox IS NOT NULL THEN mentoria_hora(p.pa + g.prox, 0) END, resp.ids
    FROM mentoria_ciclos c JOIN resp ON resp.id = c.inscricao_id
    CROSS JOIN LATERAL (SELECT coalesce(c.segunda_chance_ate, c.prazo) AS pa) p
    CROSS JOIN (VALUES (3, 7), (7, 10), (10, 15), (15, NULL::int)) g(degrau, prox)
    WHERE c.concluido_em IS NULL AND c.nao_concluido_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM mentoria_contatos ct WHERE ct.ciclo_id = c.id
        AND ct.degrau = g.degrau AND ct.degrau_prazo = p.pa)
  )
  SELECT av.k, av.q, av.fim, av.u FROM av
  WHERE cardinality(av.u) > 0
    AND NOT EXISTS (SELECT 1 FROM mentoria_avisos_enviados s WHERE s.chave = av.k)
$function$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.notify_from_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.kind = 'form.received' THEN
    INSERT INTO notifications (user_id, timeline_id)
    SELECT DISTINCT r.uid, NEW.id FROM (
      SELECT l.sdr_id AS uid FROM leads l WHERE l.id = NEW.lead_id
      UNION SELECT x.id FROM "user" x WHERE x.mestre
      UNION SELECT m.user_id FROM area_membros m WHERE m.area = 'COMERCIAL' AND m.head
    ) r JOIN "user" u ON u.id = r.uid AND u.active;
    RETURN NEW;
  END IF;
  IF NEW.kind NOT IN ('lead.created','lead.reassigned','note.created','meeting.scheduled',
    'meeting.rescheduled','meeting.canceled','meeting.outcome','sale.registered','sale.pending',
    'sale.reversed','payment.pending','payment.received') THEN
    RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, timeline_id)
  SELECT DISTINCT r.uid, NEW.id FROM (
    SELECT l.sdr_id AS uid FROM leads l WHERE l.id = NEW.lead_id
    UNION SELECT l.closer_id FROM leads l WHERE l.id = NEW.lead_id
    UNION SELECT m.closer_id FROM meetings m WHERE m.id = NEW.entity_id
    UNION SELECT d.closer_id FROM deals d WHERE d.id = NEW.entity_id
  ) r JOIN "user" u ON u.id = r.uid AND u.active
  WHERE r.uid IS NOT NULL AND r.uid <> NEW.actor_id;
  RETURN NEW;
END $function$;
