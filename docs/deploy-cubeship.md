# Deploy no Cubeship (VPS própria)

Alternativa ao `docs/deploy.md` (Oracle + compose). O Cubeship roda na VPS e faz build
do GitHub, proxy/TLS e Postgres gerenciado; Caddy e o container de Postgres não entram.

Projeto `npac`, ambiente `production`:

| App         | Dockerfile                          | Variáveis próprias           | Público        |
| ----------- | ----------------------------------- | ---------------------------- | -------------- |
| `api`       | `deploy/cubeship/api.Dockerfile`    | —                            | não (interno)  |
| `retention` | `deploy/cubeship/api.Dockerfile`    | `NPAC_PROCESS=retention`     | não            |
| `web`       | `deploy/cubeship/web.Dockerfile`    | —                            | sim, porta 3000 |

- A API migra o banco ao subir (`deploy/cubeship/start-api.sh`); não há passo de release.
- O web resolve `/api/*` no build para `http://cubeship-npac-production-api:4000`
  (endereço interno do app `api`). Se o projeto/ambiente/app tiver outro nome, ajuste o
  `ARG API_INTERNAL_URL` do `web.Dockerfile`.

## 1. Banco

1. Crie um Postgres 16 no Cubeship (não exposto à internet).
2. Com o usuário admin dele, rode uma vez `deploy/cubeship/bootstrap.sql` (cria
   `npac_owner`, `npac_app` e o banco `npac`). Senhas novas, guardadas no cofre.
3. Não use a URL do admin nos apps: eles usam só as duas roles acima.

## 2. Variáveis (nível do ambiente `production`)

```
NODE_ENV=production
DATABASE_URL=postgresql://npac_owner:<owner_pw>@<host-do-banco>:5432/npac
APP_DATABASE_URL=postgresql://npac_app:<app_pw>@<host-do-banco>:5432/npac
BETTER_AUTH_SECRET=<openssl rand -base64 32>
FIELD_ENCRYPTION_KEY=<openssl rand -base64 32>
BLIND_INDEX_KEY=<openssl rand -base64 32>
WEB_ORIGIN=https://<domínio do web>
TRUST_PROXY=true
LOG_LEVEL=info
```

Chaves novas (nunca as de dev) e guardadas no cofre: sem `FIELD_ENCRYPTION_KEY` e
`BLIND_INDEX_KEY` os telefones dos backups são irrecuperáveis.

## 3. Apps

1. GitHub conectado em **Git providers**; fonte "Dockerfile from Git", repo
   `npac-corporation-crm`, ref `main`, Dockerfile conforme a tabela.
2. Deploy na ordem `api` → `retention` → `web`; domínio só no `web` (porta 3000).
   Sem domínio próprio: `crm.<ip-com-hífens>.sslip.io`.
3. Seed inicial (uma vez, pelo shell do app `api`):
   `SEED_INITIAL_PASSWORD=... node node_modules/@npac/db/dist/seed-cli.js`
4. Confira `https://<domínio>/api/health` e o login.

## 4. Backup

Se o Postgres do Cubeship não tiver backup agendado com cópia externa, configure
`pg_dump -Fc` diário (ver `infra/backup/backup.sh`) para fora da VPS. Teste a restauração
antes do go-live. Importação do Firebase e checklist: seções 4, 6 e 7 de `docs/deploy.md`.
