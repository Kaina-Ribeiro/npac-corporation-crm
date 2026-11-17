// Mede no banco, como npac_app sob a RLS de um usuário: `count(*)` de leads e a consulta do canal
// ao vivo (events.controller.ts). Uso: node scripts/perf/medir-sql.mjs <usuario> [...]
// Imprime a mediana de 5 (depois de 1 aquecimento), em ms.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const { appSql, ownerSql, closeTestConnections } = await import(
  new URL('../../packages/db/dist/testing.js', import.meta.url).href
);

const DB = 'npac_e2e_perf';
const owner = ownerSql(DB);
const app = appSql(DB);

const CONSULTAS = {
  'count(*) leads': 'select count(*) from leads',
  'canal ao vivo': `select md5(
    coalesce((select string_agg(id::text || ':' || version::text, ',' order by id) from leads where deleted_at is null), '') || '/' ||
    coalesce((select string_agg(id::text || ':' || version::text, ',' order by id) from lead_tasks), '') || '/' ||
    coalesce((select count(*)::text || ':' || max(at)::text from lead_timeline), '') || '/' ||
    coalesce((select max(id)::text from chat_messages), '') || '/' ||
    coalesce((select count(*)::text from chat_channels), '') || '/' ||
    coalesce((select string_agg(channel_id::text || ':' || last_read_id::text, ',' order by channel_id) from chat_reads), '') || '/' ||
    coalesce((select count(*)::text || ':' || count(read_at)::text from notifications), '')
  ) as revision`,
};

for (const usuario of process.argv.slice(2)) {
  const [u] = await owner`select id from "user" where username = ${usuario}`;
  if (!u) throw new Error(`usuário ${usuario} não existe no ${DB}`);
  for (const [nome, consulta] of Object.entries(CONSULTAS)) {
    const tempos = [];
    for (let i = 0; i < 6; i++) {
      const t = await app.begin(async (s) => {
        await s`select set_config('app.user_id', ${u.id}, true)`;
        const t0 = performance.now();
        await s.unsafe(consulta);
        return Math.round(performance.now() - t0);
      });
      if (i > 0) tempos.push(t);
    }
    const mediana = [...tempos].sort((a, b) => a - b)[2];
    console.log(`${usuario} ${nome}: ${mediana} ms (${tempos.join(' ')})`);
  }
}
await closeTestConnections();
