// `pnpm perf:seed`: recria o banco de medição `npac_e2e_perf` (nunca o dev `npac`) com o seed,
// os mentorados fictícios, o mock do protótipo e o volume de `volume.sql` (~20 mil leads, ~360
// inscrições). Senha de todos: `senha-do-e2e-123`, sem troca obrigatória. Plano: docs/plans/desempenho.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);

export const PERF_DB = 'npac_e2e_perf';
const PASSWORD = 'senha-do-e2e-123';

const { createDb, seed, seedMentoria } = await import(
  new URL('../../packages/db/dist/index.js', import.meta.url).href
);
const { resetTestDb, ownerSql, closeTestConnections } = await import(
  new URL('../../packages/db/dist/testing.js', import.meta.url).href
);
const { hash } = createRequire(`${root}packages/db/package.json`)('@node-rs/argon2');

const t0 = Date.now();
const url = await resetTestDb(PERF_DB);
const client = createDb(url, { max: 1 });
try {
  await seed(client.db, { hashPassword: (p) => hash(p), initialPassword: PASSWORD });
  await seedMentoria(client.db);
} finally {
  await client.close();
}
const owner = ownerSql(PERF_DB);
await owner`update "user" set must_change_password = false`;
console.log(`seed ok (${Date.now() - t0} ms)`);

const mock = spawnSync(process.execPath, [`${root}apps/api/dist/dev/mock-prototype.js`], {
  env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'development' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (mock.status !== 0) throw new Error('mock-prototype falhou');
console.log(`mock ok (${Date.now() - t0} ms)`);

await owner
  .unsafe(readFileSync(fileURLToPath(new URL('volume.sql', import.meta.url)), 'utf8'))
  .simple();
const [n] = await owner`
  select (select count(*) from leads)::int as leads, (select count(*) from meetings)::int as reunioes,
    (select count(*) from lead_timeline)::int as timeline,
    (select count(*) from mentoria_inscricoes)::int as inscricoes,
    (select count(*) from mentoria_acoes)::int as acoes,
    (select count(distinct l.id) from leads l join "user" u on u.id = l.closer_id
      where u.username = 'sonia')::int as sonia_closer_id,
    (select count(distinct m.lead_id) from meetings m join "user" u on u.id = m.closer_id
      where u.username = 'sonia' and m.canceled_at is null)::int as sonia_reunioes`;
console.log(`volume ok (${Date.now() - t0} ms)`, n);
await closeTestConnections();
