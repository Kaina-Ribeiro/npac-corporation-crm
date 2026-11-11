-- Acompanhamento v2 (NPAC-43): apaga o módulo antigo (D1). Nenhum dado é migrado. A mídia antiga
-- vai para a fila de exclusão, para o worker apagar os arquivos de MEDIA_DIR (T4).
INSERT INTO mentoria_midia_exclusao (chave_objeto)
  SELECT chave_objeto FROM mentoria_midia WHERE chave_objeto IS NOT NULL;
--> statement-breakpoint
DELETE FROM mentoria_midia;
--> statement-breakpoint
DROP TABLE mentoria_rdv_eventos, mentoria_rdv_duvidas, mentoria_rdv_quadros, mentoria_rdv_diagnostico,
  mentoria_rdv_pessoas, mentoria_conquistas, mentoria_ficha_campos, mentoria_fichas, mentoria_mentorados;
--> statement-breakpoint
DROP FUNCTION mentoria_excluir_pessoa(uuid);
--> statement-breakpoint
DROP FUNCTION mentoria_definir_pessoa_ref();
--> statement-breakpoint
DROP FUNCTION mentoria_excluir_registro(text, uuid, int);
--> statement-breakpoint
DROP FUNCTION mentoria_descartar_duvida(uuid, int);
--> statement-breakpoint
DROP FUNCTION mentoria_confirmar_duvida(uuid, int, uuid, text, date, text, int);
--> statement-breakpoint
DROP FUNCTION mentoria_colar_link_pasta(uuid, int, text);
--> statement-breakpoint
DROP FUNCTION mentoria_colar_diagnostico(uuid, int, jsonb);
--> statement-breakpoint
DROP FUNCTION mentoria_travar_ficha(uuid, int);
--> statement-breakpoint
DROP FUNCTION mentoria_travar_pessoa(uuid, int);
