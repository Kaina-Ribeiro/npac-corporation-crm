// `pnpm perf:api`: sobe a API já compilada (apps/api/dist) em modo produção na porta 4150, como
// npac_app no banco de medição npac_e2e_perf, com MEDIA_DIR temporário. Ctrl+C encerra.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

const raw = process.env.TEST_DATABASE_URL;
const pw = process.env.APP_DB_PASSWORD;
if (!raw || !pw) throw new Error('TEST_DATABASE_URL e APP_DB_PASSWORD precisam estar no .env');
const u = new URL(raw);
u.pathname = '/npac_e2e_perf';
u.username = 'npac_app';
u.password = pw;

const PORT = process.env.PERF_API_PORT ?? '4150';
const api = spawn(process.execPath, [`${root}apps/api/dist/main.js`], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    APP_DATABASE_URL: u.toString(),
    API_PORT: PORT,
    WEB_ORIGIN: 'http://localhost:3150',
    LOG_LEVEL: 'warn',
    MEDIA_DIR: join(tmpdir(), 'npac-perf-media'),
  },
  stdio: 'inherit',
});
console.log(`API de medição em http://localhost:${PORT} (npac_e2e_perf)`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => api.kill(sig));
api.on('exit', (code) => process.exit(code ?? 0));
