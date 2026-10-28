// Ambiente do e2e: banco próprio (npac_e2e) e portas separadas do dev.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const E2E_DB = 'npac_e2e';
export const E2E_PASSWORD = 'senha-do-e2e-123';
export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

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
