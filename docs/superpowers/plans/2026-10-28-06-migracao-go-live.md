# Plano 06 — Migração e go-live

**Status: código e infraestrutura concluídos em 28/10/2026.** A execução do go-live
(VM, DNS, export real e desligamento do Firebase) depende de acessos do usuário e
segue o runbook `docs/deploy.md`.

## Entregas

| # | Entrega | Critério de pronto |
|---|---|---|
| 1 | Importador do Firebase | Dry-run por padrão; transação única; idempotente por `legacy_id`; telefones cifrados; renda → faixa (bloqueia < R$ 5 mil); datas Firestore/BR; dinheiro BR em centavos; relatório só com IDs e motivo |
| 2 | Imagens de produção | `Dockerfile` com alvos `api` (pnpm deploy) e `web` (Next standalone), usuário não-root, healthcheck |
| 3 | Compose de produção | Postgres interno, `migrate` antes da API, Caddy com HTTPS e IP real do Cloudflare, SSE sem buffer, worker de retenção e backup diário |
| 4 | Backups testados | `backup.sh` (pg_dump custom + retenção) e `restore-check.sh` (restaura em banco temporário e confere) |
| 5 | Runbook | VM Oracle São Paulo, firewall só Cloudflare, Full (strict), primeiro deploy, importação, backups, checklist e desligamento do Firebase |

## Evidências

Migration `0017_legacy_ids.sql`; `apps/api/test/import.test.ts` (normalizadores,
dry-run, rejeições, cifra, idempotência). Backup + restore-check executados contra o
Postgres local. Imagens `api` e `web` construídas localmente.

## Decisões

- Não havia export do Firebase no repositório: o importador aceita apelidos de campos e
  formatos comuns e rejeita (com motivo) o que não reconhece, em vez de inventar valores.
  O primeiro dry-run com o export real deve ajustar apelidos se necessário.
- Venda importada vira uma parcela única (paga na data da venda se marcada como paga).
- Redis do compose de dev não é usado em produção (SSE consulta o banco).
