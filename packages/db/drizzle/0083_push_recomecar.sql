-- NPAC-71 (Gabriel, 24/11/2026): "seria bom que todos começassem com os avisos desligados depois dessa
-- mudança e aparecer o aviso de ativar". As inscrições guardadas não diziam qual aparelho ainda recebia
-- (uma pessoa tinha 6, 5 de iPhone), então todas saem. Em cada aparelho, o convite "Ativar avisos"
-- reaparece (a tela agora confere com o servidor se a inscrição dele existe, `POST
-- /api/push/subscriptions/check`) e um toque registra de novo, sem pedir a permissão outra vez.
-- Roda uma vez: quem ativar depois disto fica.
DELETE FROM push_subscriptions;
