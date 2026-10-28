# Deploy no Cubeship (VPS própria)

Alternativa ao `docs/deploy.md` (Oracle + compose). O Cubeship roda na VPS e faz build
do GitHub, proxy/TLS e Postgres gerenciado; Caddy e o container de Postgres não entram.

Projeto `npac`, ambiente `production`:

| App         | Dockerfile                          | Variáveis próprias                                 | Público         |
| ----------- | ----------------------------------- | -------------------------------------------------- | --------------- |
| `api`       | `deploy/cubeship/api.Dockerfile`    | as duas URLs do banco + as três chaves (seção 2)   | não (interno)   |
| `retention` | `deploy/cubeship/api.Dockerfile`    | `NPAC_PROCESS=retention`, `DATABASE_URL` (owner)   | não             |
| `web`       | `deploy/cubeship/web.Dockerfile`    | nenhuma (não recebe credencial)                    | sim, porta 3000 |

- A API migra o banco ao subir (`deploy/cubeship/start-api.sh`); não há passo de release.
- O web resolve `/api/*` no build para `http://cubeship-npac-production-api:4000`. O
  Cubeship nomeia o endereço interno `cubeship-<projeto>-<ambiente>-<app>`; se algum
  nome mudar, ajuste o `ARG API_INTERNAL_URL` do `web.Dockerfile`.

## 1. Banco

1. Crie um Postgres 16 (`npac-db`; não exposto). O host interno fica
   `cubeship-db-npac-db:5432`.
2. Rode uma vez `deploy/cubeship/bootstrap.sql` com o admin do datastore (cria
   `npac_owner`, `npac_app` e o banco `npac`). O Cubeship não mostra a senha do admin nem
   dá shell no banco; o caminho é um app temporário:
   - app `db-bootstrap`, fonte "external", imagem `docker.io/library/postgres:16-alpine`;
   - variáveis do app `OWNER_PW` e `APP_PW` (senhas novas, guardadas no cofre);
   - anexe o datastore ao app (injeta `DATABASE_URL` do admin);
   - pre-deploy command (o deploy falha se ele falhar; o container principal em si
     não sobe, e não precisa):
     ```sh
     sh -c 'set -e; until pg_isready -q -d "$DATABASE_URL"; do sleep 2; done;
       echo "CREATE ROLE npac_owner LOGIN NOSUPERUSER BYPASSRLS CREATEROLE PASSWORD :'"'"'owner_pw'"'"';
             CREATE ROLE npac_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'"'"'app_pw'"'"';
             CREATE DATABASE npac OWNER npac_owner;
             GRANT CONNECT ON DATABASE npac TO npac_app;" |
       psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v owner_pw="$OWNER_PW" -v app_pw="$APP_PW"'
     ```
   - faça o deploy; depois **desanexe o datastore e apague o app** (ele carrega a URL
     do admin). O admin `cubeship` é superuser, então o `BYPASSRLS` passa.
3. Não use a URL do admin nos apps: eles usam só as duas roles acima.

## 2. Variáveis

No ambiente `production` (todas as apps herdam; nada secreto):

```
NODE_ENV=production
WEB_ORIGIN=https://<domínio do web>
TRUST_PROXY=true
LOG_LEVEL=info
```

Só no app `api`:

```
DATABASE_URL=postgresql://npac_owner:<owner_pw>@cubeship-db-npac-db:5432/npac
APP_DATABASE_URL=postgresql://npac_app:<app_pw>@cubeship-db-npac-db:5432/npac
BETTER_AUTH_SECRET=<openssl rand -base64 32>
FIELD_ENCRYPTION_KEY=<openssl rand -base64 32>
BLIND_INDEX_KEY=<openssl rand -base64 32>
```

No `retention`, só `NPAC_PROCESS=retention` e o mesmo `DATABASE_URL` (owner). O `web`
não recebe nenhuma credencial. Senhas em hex (`openssl rand -hex 24`) para não precisar
escapar na URL.

Chaves novas (nunca as de dev) e guardadas no cofre: sem `FIELD_ENCRYPTION_KEY` e
`BLIND_INDEX_KEY` os telefones dos backups são irrecuperáveis.

## 3. Apps

1. Repositório público: fonte "Dockerfile from Git", repo
   `https://github.com/Kaina-Ribeiro/npac-corporation-crm`, ref `main`, Dockerfile
   conforme a tabela.
2. Deploy na ordem `api` → `retention` → `web`; domínio só no `web` (porta 3000).
   Sem domínio próprio: `crm.<ip-com-hífens>.sslip.io` (o TLS sai no primeiro acesso).
3. Seed inicial (uma vez, pelo shell do app `api`):
   `SEED_INITIAL_PASSWORD=... node node_modules/@npac/db/dist/seed-cli.js`
4. Confira `https://<domínio>/api/health` e o login.

## 4. Backup

O backup do datastore no Cubeship é ligado ao banco configurado nele (`npac_db`, vazio),
não ao `npac` criado pelo bootstrap: não conte com ele sem antes testar uma restauração. Configure `pg_dump -Fc` diário do banco
`npac` (ver `infra/backup/backup.sh`) para fora da VPS e teste a restauração antes do
go-live. Importação do Firebase e checklist: seções 4, 6 e 7 de `docs/deploy.md`.
