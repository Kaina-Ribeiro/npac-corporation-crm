// Ambiente do e2e: banco próprio (npac_e2e) e portas separadas do dev.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// E2E_DB / E2E_API_PORT / E2E_WEB_PORT: rodar o e2e de duas worktrees ao mesmo tempo.
export const E2E_DB = process.env.E2E_DB ?? 'npac_e2e';
export const E2E_PASSWORD = 'senha-do-e2e-123';
/** Token do webhook do Forms só para o e2e. */
export const E2E_FORMS_TOKEN = 'token-do-forms-usado-somente-no-e2e';
export const API_PORT = Number(process.env.E2E_API_PORT ?? 4100);
// E2E_WEB_PORT: quando outro projeto local já ocupa a 3100.
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
/** Caixa de e-mail falsa (`scripts/caixa-falsa.mts`): SMTP para a API, HTTP para o teste ler. */
export const CAIXA_SMTP_PORT = API_PORT + 25;
export const CAIXA_HTTP_PORT = API_PORT + 26;
export const CAIXA_URL = `http://localhost:${CAIXA_HTTP_PORT}/mensagens`;
/** Telegram falso (NPAC-74): a mesma caixa responde como a Bot API e guarda o que o bot mandaria. */
export const TELEGRAM_FALSO = `http://localhost:${CAIXA_HTTP_PORT}`;
export const E2E_TELEGRAM = {
  TELEGRAM_BOT_TOKEN: '123456:BotDeMentiraDoE2eBotDeMentiraDoE2e',
  TELEGRAM_BOT_USERNAME: 'npac_e2e_bot',
  TELEGRAM_WEBHOOK_SECRET: 'segredo-do-webhook-telegram-so-no-e2e',
};

export function e2eDbUrl(user?: string, password?: string): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL não definida');
  const u = new URL(raw);
  u.pathname = `/${E2E_DB}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

export const appDbUrl = () => e2eDbUrl('npac_app', process.env.APP_DB_PASSWORD);
