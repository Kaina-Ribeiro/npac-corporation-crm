# NPAC Corporation — instruções para agentes

## Estado e escopo

- Monorepo pnpm/Turborepo. Planos 01–06 implementados (Fundação, CRM base, Vendas,
  Colaboração, Admin/LGPD, Migração/deploy). Planejamento em `docs/superpowers/plans/`.
- Leia `docs/spec.md`, o roadmap e o plano da tarefa antes de alterar comportamento.
- Fora da v1 (spec §8): API WhatsApp/Instagram, IA no playbook, metas/comissões.
  Go-live real (VM Oracle, Cloudflare, export do Firebase) segue `docs/deploy.md`.
- O usuário prefere execução direta, comunicação em português, respostas curtas,
  testes focados e commits frequentes. Não abra subagentes sem solicitação.
- Um novo plano deve ser apresentado antes de iniciar sua implementação.

## Arquitetura

- `apps/web`: Next.js 16 App Router, React, Tailwind 4. Proxy `/api/*` para Nest;
  cookies first-party. Código de acesso server-side em `lib/api.ts`/`lib/session.ts`.
- `apps/api`: NestJS/Fastify, Better Auth com TOTP, Drizzle/Postgres.
- `packages/shared`: enums, schemas Zod, permissões, DTOs, datas e dinheiro.
- `packages/db`: schema, migrations, seed e `withUser`. PostgreSQL 16.
- Next 16 tem mudanças incompatíveis: consulte os guias em
  `apps/web/node_modules/next/dist/docs/` antes de usar APIs/convenções de versões antigas.
- O fundo e os tokens visuais seguem o protótipo aprovado: iOS claro, glass médio,
  dourado financeiro; SF/Geist e Anton no monograma, fontes hospedadas pelo build.

## Segurança e privacidade

- API é a única porta para o banco. Runtime usa `APP_DATABASE_URL`/`npac_app`,
  sem superuser nem BYPASSRLS. Owner serve somente a migrations, seed e fixtures.
- Toda consulta de domínio deve usar `withUser`; a autorização de linha é SQL/RLS,
  nunca um filtro de visibilidade em JavaScript.
- HEAD vê tudo; SDR vê próprios leads; CLOSER vê agenda não cancelada. Transferência
  e cancelamento revogam acesso à ficha/atividades. Invisível e inexistente = 404.
- Guard de papel e RLS se complementam. Papéis/flags são dados; autorização não
  pode depender do nome de Ana, Ronaldo, Ale, Murilo, Igor ou Sônia.
- MFA obrigatório para HEAD, sem signup aberto. Usuário inativo perde sessão e SSE.
- Nenhum contato, termo de busca ou conteúdo pessoal em URL, logs, analytics ou
  localStorage. Buscas/relatórios usam POST. Cookies de sessão devem ser HttpOnly.
- Respostas pessoais usam `no-store`; logs não serializam corpo/query/cookies nem
  parâmetros SQL. Nunca imprima `.env`, senhas, chaves ou dados reais nas ferramentas.
- Telefone: normalização BR/E.164, AES-256-GCM e índice HMAC. Renda somente em faixas
  ≥ R$ 5 mil; nunca guardar renda exata.
- Chat: DM privada por RLS (`chat_can_read`), inclusive para HEAD; mensagens append-only;
  menção guarda só o ID do lead e o nome é resolvido pela RLS do leitor.
- `audit_log` tem RLS: INSERT livre, SELECT só HEAD. Admin de usuários não tem RLS
  (Better Auth lê `user`): a guarda é `admin:manage` + auditoria.
- LGPD: eliminação via `lgpd_anonymize_lead` (SECURITY DEFINER, só HEAD); retenção via
  `lgpd_retention` como owner. Não crie outro caminho que apague fatos financeiros.
- CSV com contato somente HEAD, auditado e com neutralização de fórmulas. Resumo
  WhatsApp não inclui telefone. Links externos WhatsApp exigem gesto do usuário.

## Escritas, finanças e concorrência

- PATCH exige versão. Nunca avance a versão de um rascunho silenciosamente após SSE;
  preserve o rascunho e apresente conflito. Use listas explícitas de campos permitidos.
- Deduplicação de contatos usa advisory locks em ordem determinística, também na
  edição. A função de duplicidade não revela responsável nem dados do registro.
- Timeline é append-only: tipos de evento, IDs e nomes de campos, nunca valores.
  Registre mudança e auditoria na mesma transação da escrita.
- Dinheiro é inteiro em centavos. Use `@npac/shared/money`; não use `parseFloat * 100`.
  Valores unitários limitados a 2 bilhões de centavos; totais agregados passam por
  validação de inteiro seguro antes de virar Number.
- Produtos/preços/closers vêm do banco. Constantes do seed são dados iniciais,
  não regras de autorização. Não altere preços antigos de uma venda ao editar catálogo.
- Uma venda ativa por lead. Registro usa `requestKey` estável e hash do payload;
  mesma chave com outro corpo é 409. Reutilize a chave após timeout, não gere outra.
- Entrada + parcelas = total; parcelas positivas e futuras. Banco confere soma no
  COMMIT por constraint triggers. Não crie lançamentos fora da transação financeira.
- Baixas usam versão e chave idempotente; parcelas/valores e registros pagos são
  imutáveis. Recebimento e estorno usam o mesmo advisory lock por venda.
- Só HEAD estorna. Preserve pagamentos/histórico e exclua estornadas dos totais.
  Lead com venda ativa não pode ser excluído antes do estorno.
- Ao adquirir locks adicionais, preserve a ordem existente e teste concorrência;
  `SELECT FOR UPDATE` também é limitado pelas políticas UPDATE do RLS.
- Cancelamento de reunião usa comando SQL restrito porque pode revogar a própria
  política SELECT do closer. Não generalize essa função para executar UPDATE livre.

## Métricas, datas e tempo real

- Fuso de negócio: `America/Sao_Paulo`; banco em `timestamptz`, intervalos [início,fim).
  Inputs datetime-local do CRM representam Brasília, não o fuso do servidor.
- Métricas calculadas em SQL, com subconsultas/CTEs que não multipliquem venda por
  número de reuniões/parcelas. Relatórios usam snapshot repeatable-read.
- Datas dos fatos: lead.createdAt, reunião.createdAt/outcomeAt, venda.closedAt,
  parcela.paidAt. Pipeline VENDA não substitui lançamento financeiro.
- Recebido considera pagamentos no período de vendas não estornadas; a receber é
  saldo pendente das vendas fechadas no período. Mantenha os rótulos explícitos.
- Relatórios/Leads/Pipeline têm paginação no servidor. CSV recusa mais de 10 mil
  linhas em vez de truncar silenciosamente. Nunca envie todo o banco ao navegador.
- SQL cru com Drizzle: envie datas como ISO ou use encoder de coluna; Date sem
  encoder em `sql` pode falhar no driver postgres-js.
- SSE emite somente `{ type }`, revalida sessão e calcula revisão por RLS a cada
  2 s. Consumidores refazem consultas autorizadas. Não inclua PII no stream.

## Comandos e validação

Ambiente validado: Node 24, pnpm 12.14 e Docker Desktop (engine Linux).

```sh
pnpm install --frozen-lockfile
docker compose up -d
pnpm build
pnpm --filter @npac/db migrate
pnpm --filter @npac/db seed
pnpm dev
pnpm turbo run lint typecheck test build
pnpm --filter @npac/web exec playwright install chromium
pnpm --filter @npac/web e2e
pnpm audit --audit-level high
pnpm exec prettier --check .
```

- Faça teste de regra que falha → implementação → teste focado. Ao mudar contratos,
  valide os consumidores. Rode a suíte completa ao fechar a entrega, não a cada edição.
- Suites recriam apenas bancos `npac_test*` / `npac_e2e*`. Não aponte teste para produção.
  Fixtures owner não provam RLS: exercite as políticas como `npac_app`.
- Seeds são idempotentes e não redefinem senhas. Não apague volumes para migrar.
- Playwright sobe API 4100/web 3100 e usa banco `npac_e2e`; dev usa 4000/3000.
  Specs compartilham o banco: cada teste que depende de MFA/estado de usuário o redefine.
- Testes que fazem `truncate leads` incluem as tabelas com FK para leads
  (`lgpd_requests`, `chat_*`, `payments`, `deals`, atividades, `meetings`).
- Em efeitos React, não retorne o valor de `scrollIntoView` (Chromium devolve Promise).
  Não rode dois builds web ou duas suites da mesma base de teste em paralelo.
- Migrations aplicadas devem receber sucessoras, não ser reescritas. Inclua SQL,
  snapshots e journal. Revise RLS/grants/triggers manuais além do schema Drizzle.
- Telas têm screenshots nos e2e. Confira desktop/mobile e orçamento de JS de
  `/leads` (<150 KB gzip). Não use `networkidle` com um stream SSE permanente.
- Não commite `.env`, dumps, artefatos de teste, logs locais ou node_modules.
- No fechamento, atualize este arquivo, README, status do plano e evidências em docs.
