ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "idade" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "parceiro_nome" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "filho_1" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "filho_2" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "trabalho" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "bem_1" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "bem_2" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "investimento_1" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "investimento_2" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_1" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_2" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_3" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_1_centavos" bigint;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_2_centavos" bigint;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "divida_3_centavos" bigint;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "buscou_ajuda" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD COLUMN "anotacoes" text;--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_idade" CHECK (octet_length("mentoria_momento_inicial"."idade") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_parceiro" CHECK (octet_length("mentoria_momento_inicial"."parceiro_nome") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_filho_1" CHECK (octet_length("mentoria_momento_inicial"."filho_1") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_filho_2" CHECK (octet_length("mentoria_momento_inicial"."filho_2") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_trabalho" CHECK (octet_length("mentoria_momento_inicial"."trabalho") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_bem_1" CHECK (octet_length("mentoria_momento_inicial"."bem_1") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_bem_2" CHECK (octet_length("mentoria_momento_inicial"."bem_2") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_investimento_1" CHECK (octet_length("mentoria_momento_inicial"."investimento_1") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_investimento_2" CHECK (octet_length("mentoria_momento_inicial"."investimento_2") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_1" CHECK (octet_length("mentoria_momento_inicial"."divida_1") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_2" CHECK (octet_length("mentoria_momento_inicial"."divida_2") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_3" CHECK (octet_length("mentoria_momento_inicial"."divida_3") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_1_valor" CHECK ("mentoria_momento_inicial"."divida_1_centavos" >= 0);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_2_valor" CHECK ("mentoria_momento_inicial"."divida_2_centavos" >= 0);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_divida_3_valor" CHECK ("mentoria_momento_inicial"."divida_3_centavos" >= 0);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_buscou_ajuda" CHECK (octet_length("mentoria_momento_inicial"."buscou_ajuda") <= 400000);--> statement-breakpoint
ALTER TABLE "mentoria_momento_inicial" ADD CONSTRAINT "mentoria_momento_anotacoes" CHECK (octet_length("mentoria_momento_inicial"."anotacoes") <= 400000);--> statement-breakpoint

-- NPAC-76: o total antigo das dívidas vira a Dívida 1, para a soma continuar igual ao que a Evolução já
-- mostrava. Só onde há total > 0 e nenhuma dívida detalhada. Roda antes do gatilho abaixo e como dono
-- (o gatilho da trava deixa passar): nada além dessa coluna muda, nem a versão.
UPDATE mentoria_momento_inicial
  SET divida_1_centavos = dividas_centavos
  WHERE dividas_centavos > 0
    AND divida_1_centavos IS NULL AND divida_2_centavos IS NULL AND divida_3_centavos IS NULL;
--> statement-breakpoint

-- Total das dívidas = soma das dívidas preenchidas, sempre que o valor de alguma muda. As três vazias de
-- novo (a pessoa apagou): total e "tem dívidas" nulos. Total gravado sem nenhuma dívida detalhada
-- (importação, que só tem o total, ou PUT antigo com `dividasCentavos`) vira a Dívida 1: assim, lançar
-- depois a Dívida 2 soma com ele, em vez de trocar o total e perder o valor importado.
CREATE FUNCTION mentoria_momento_dividas_total() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
AS $$
DECLARE
  vazias boolean := NEW.divida_1_centavos IS NULL AND NEW.divida_2_centavos IS NULL
    AND NEW.divida_3_centavos IS NULL;
  mexeu boolean := TG_OP = 'UPDATE' AND (
    NEW.divida_1_centavos IS DISTINCT FROM OLD.divida_1_centavos
    OR NEW.divida_2_centavos IS DISTINCT FROM OLD.divida_2_centavos
    OR NEW.divida_3_centavos IS DISTINCT FROM OLD.divida_3_centavos);
BEGIN
  IF vazias THEN
    IF mexeu THEN
      NEW.dividas_centavos := NULL;
      NEW.tem_dividas := NULL;
    ELSIF NEW.dividas_centavos > 0 THEN
      NEW.divida_1_centavos := NEW.dividas_centavos;
    END IF;
    RETURN NEW;
  END IF;
  -- Com alguma dívida detalhada, o total é sempre a soma (nem um PUT antigo com o total o muda).
  NEW.dividas_centavos := coalesce(NEW.divida_1_centavos, 0) + coalesce(NEW.divida_2_centavos, 0)
    + coalesce(NEW.divida_3_centavos, 0);
  NEW.tem_dividas := NEW.dividas_centavos > 0;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER FUNCTION mentoria_momento_dividas_total() OWNER TO npac_owner;
--> statement-breakpoint
CREATE TRIGGER mentoria_momento_dividas_total BEFORE INSERT OR UPDATE ON mentoria_momento_inicial
  FOR EACH ROW EXECUTE FUNCTION mentoria_momento_dividas_total();
--> statement-breakpoint
GRANT UPDATE (idade, parceiro_nome, filho_1, filho_2, trabalho, bem_1, bem_2, investimento_1,
  investimento_2, divida_1, divida_2, divida_3, divida_1_centavos, divida_2_centavos, divida_3_centavos,
  buscou_ajuda, anotacoes) ON mentoria_momento_inicial TO npac_app;
