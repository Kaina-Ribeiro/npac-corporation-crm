# Deploy e go-live — Oracle Cloud São Paulo

Topologia: uma VM (Ampere A1, Ubuntu 24.04, `sa-saopaulo-1`) com Docker Compose.
Cloudflare (DNS com proxy) → Caddy (TLS) → web (Next) → API (Nest) → Postgres 16.
Só o Caddy expõe portas. Worker de retenção LGPD e backup diário rodam no mesmo compose.

## 1. VM e rede

1. Crie a VM (2 OCPU / 12 GB basta) com volume de boot de 100 GB e um Block Volume
   separado montado em `/srv/npac` (dados do Postgres e backups).
2. Security List / NSG: libere 80 e 443 **só para os IPs do Cloudflare**
   (https://www.cloudflare.com/ips/) e 22 só para o IP do administrador.
3. Na VM: `sudo apt install docker.io docker-compose-v2 && sudo usermod -aG docker $USER`.
4. `ufw` espelhando as mesmas regras (o iptables padrão das imagens Oracle bloqueia 80/443:
   ajuste `/etc/iptables/rules.v4`).

## 2. Cloudflare

- Registro `A` do domínio → IP público da VM, **proxied**.
- SSL/TLS: **Full (strict)**. O Caddy obtém certificado Let's Encrypt (HTTP-01 passa pelo proxy).
- Desative cache em `/api/*` (Cache Rule: bypass). As respostas já são `no-store`.
- Desative Rocket Loader / minificação automática (quebram a CSP com nonce).

## 3. Primeiro deploy

```sh
git clone https://github.com/Kaina-Ribeiro/npac-corporation-crm.git /srv/npac/app
cd /srv/npac/app
cp .env.prod.example .env.prod   # preencha; guarde as chaves no cofre
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
# usuários, etapas, produtos e playbook iniciais (idempotente, não redefine senhas):
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
  -e SEED_INITIAL_PASSWORD api node node_modules/@npac/db/dist/seed-cli.js
```

`migrate` roda sozinho antes da API em todo `up`. Verifique: `https://DOMÍNIO/api/health`.

Atualizações: `git pull && docker compose ... build && docker compose ... up -d`
(rode `restore-check.sh` antes de releases com migrations).

## 4. Migração do Firebase

1. No console do Firebase exporte as coleções para JSON (Firestore → exportar, ou script
   `firebase-admin` que grave `{ leads: {...}, reunioes: {...}, vendas: {...} }`).
   O importador aceita objetos `{id: doc}` ou listas com `id`, timestamps do Firestore,
   datas `dd/mm/aaaa`, valores `R$ 2.500,00` e apelidos de campos (ver `apps/api/src/import/legacy.ts`).
2. Copie o arquivo para a VM (nunca para o git) e simule:
   ```sh
   docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm \
     -v /srv/npac/firebase.json:/import.json:ro api node dist/import/cli.js /import.json
   ```
   O relatório lista importados e rejeitados **só com IDs do Firebase e motivo**.
   Ajuste dados ou apelidos até zerar rejeições inesperadas. Use `--default-sdr email`
   para leads sem responsável reconhecível.
3. Grave: repita com `--apply`. É idempotente por `legacy_id` (rodar de novo não duplica).
4. Confira no app: contagem por SDR, vendas do mês e recebidos batem com o Firebase.
5. Apague o JSON da VM (`shred -u /srv/npac/firebase.json`).

## 5. Backups

- `backup` grava `pg_dump -Fc` diário em `BACKUP_DIR` e mantém `BACKUP_KEEP_DAYS` dias.
- Cópia externa: sincronize `BACKUP_DIR` para um bucket OCI Object Storage com
  retenção/versionamento (`rclone sync` em cron do host ou política de replicação).
- **Teste de restauração** (semanal e antes de migrações):
  `docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup /scripts/restore-check.sh`
  — restaura num banco temporário, confere contagens e apaga.
- Os telefones nos dumps estão cifrados: o backup só é útil junto com
  `FIELD_ENCRYPTION_KEY`/`BLIND_INDEX_KEY` guardadas no cofre (separadas do bucket).

## 6. Checklist de go-live

- [ ] `.env.prod` preenchido, chaves no cofre, nenhuma reutilizada de dev.
- [ ] `/api/health` 200 via domínio; HTTP redireciona para HTTPS; HSTS presente.
- [ ] Todos trocam a senha inicial; quem quiser ativa o autenticador (recomendado para a liderança).
- [ ] Importação simulada sem rejeições inesperadas; importação aplicada e conferida.
- [ ] Primeiro backup gerado e `restore-check.sh` ok; cópia externa chegando no bucket.
- [ ] Firewall aceita 80/443 só do Cloudflare; Postgres não exposto (`ss -tlnp`).
- [ ] Uma semana em paralelo: equipe usa o CRM novo; Firebase só leitura.

## 7. Desligar o Firebase

1. Após a semana em paralelo, exporte o Firebase uma última vez e rode a importação de
   novo (pega o que mudou; o resto é ignorado por `legacy_id`).
2. Regras do Firestore para negar escrita (`allow read, write: if false;`) e remova o
   HTML antigo do hosting.
3. Guarde o export final cifrado no cofre pelo prazo de retenção e então exclua o projeto
   Firebase. Registre a data no log de auditoria/ata.
