# NPAC Corporation

CRM comercial. Monorepo pnpm/Turborepo: Next.js (`apps/web`), NestJS/Fastify
(`apps/api`), Postgres/Drizzle (`packages/db`) e contratos (`packages/shared`).

Planos 01 e 02 implementados: login individual, MFA para HEAD, permissões com RLS,
auditoria, cadastro/ficha de leads, notas, tarefas, reuniões, Pipeline, Hoje e
atualizações entre sessões. Vendas, Dashboard, chat e relatórios continuam **Em breve**.

## Desenvolvimento

Requer Node >= 22, pnpm 12.14, Git e Docker Desktop com engine Linux.

1. Copie `.env.example` para `.env`.
2. Defina senhas distintas para owner e app; repita os valores nas URLs correspondentes.
   Senhas hexadecimais evitam caracteres que exigem escape em URLs.
3. Gere separadamente os três segredos: `openssl rand -base64 32` (uma execução por chave).
4. Defina `SEED_INITIAL_PASSWORD` com pelo menos 12 caracteres.

```sh
pnpm install --frozen-lockfile
docker compose up -d
pnpm build
pnpm --filter @npac/db migrate
pnpm --filter @npac/db seed
pnpm dev
```

Web: http://localhost:3000. API health: http://localhost:4000/api/health.
O seed cria `ana`, `ronaldo`, `ale`, `murilo`, `igor` e `sonia` em `@npac.com.br`.
A senha inicial vem do seu `.env`; todos precisam trocá-la, e Ana/Ronaldo configuram TOTP.
Rodar o seed novamente não redefine senhas nem duplica usuários.

O script de criação da role roda apenas no primeiro boot de um volume Postgres vazio.
Alterar a senha no `.env` não altera automaticamente uma role já existente.
Não apague o volume de desenvolvimento para atualizar migrations: use `migrate`.

## Validação

```sh
pnpm turbo run lint typecheck test build
pnpm --filter @npac/web exec playwright install chromium
pnpm --filter @npac/web e2e
pnpm audit --audit-level high
```

Os testes recriam **somente** bancos com nomes `npac_test*` / `npac_e2e*`.
Unitários/integração usam `npac_test_db` e `npac_test_api`; Playwright usa
`npac_e2e`, API 4100 e web 3100. Nunca aponte URLs de teste para produção.
O Playwright sobe os servidores automaticamente; exige Postgres já disponível.

## Contratos e segurança

- API é a única porta para o banco; runtime usa `npac_app` sem BYPASSRLS.
- HEAD vê todos; SDR vê próprios leads; CLOSER vê leads de reuniões não canceladas da agenda.
- Telefones: AES-256-GCM e HMAC para busca; renda somente em faixas >= R$ 5 mil.
- `GET /api/leads` lista/pagina/filtra por IDs; `POST /api/leads/search` pesquisa
  por nome/telefone/Instagram no corpo. `GET ?search=` é recusado para evitar PII na URL.
- Edições exigem a versão exibida ao usuário. Conflitos respondem 409; rascunhos
  não assumem automaticamente uma nova versão recebida por tempo real.
- O stream `/api/events` emite apenas sinais sem dados pessoais, revalida a sessão
  a cada ciclo e aplica RLS às leituras usadas para detectar mudanças.
- Busca não usa localStorage; respostas pessoais são `no-store`; logs omitem corpo/query/cookies.
- `DATABASE_URL` é exclusiva para migrations/seed; não a use como conexão de runtime.
- `TRUST_PROXY=true` só atrás de proxy confiável com acesso direto à API bloqueado.
- Guarde `.env`, chaves de cifra e backups fora do Git. Chaves perdidas impedem decifrar contatos.

Veja `docs/spec.md`, o roadmap, `docs/revisao-fundacao.md` e `docs/revisao-crm-base.md`
para escopo e evidências. Em uma instalação existente, atualize o banco com
`pnpm --filter @npac/db migrate` antes de iniciar a versão nova da aplicação.
