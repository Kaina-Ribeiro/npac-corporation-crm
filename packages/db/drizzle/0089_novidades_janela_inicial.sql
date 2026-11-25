-- NPAC-77 (Gabriel, 25/11/2026, ITODEV): quem já existia na subida vê a janela uma vez, só com a
-- própria novidade (`npac-77-versao`), e nada mais antigo. Vai para a entrada logo abaixo dela. A
-- condição `= 'npac-77-versao'` só pega no ITODEV, onde a 0088 subiu antes; em prod as duas rodam no
-- mesmo deploy e nenhuma linha tem esse valor. Conta criada depois continua vazia: o /api/me grava a
-- mais nova e nada abre (S2).
UPDATE "user" SET novidades_vista = 'npac-75-dashboard'
WHERE novidades_vista IS NULL OR novidades_vista = 'npac-77-versao';
