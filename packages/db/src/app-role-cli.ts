// CI do e2e: cria a role npac_app e o banco npac_test, como `infra/postgres/init/01-app-role.sh`,
// mas sem psql. O container do Playwright não traz psql, e instalar por apt dependia dos espelhos
// do Ubuntu, que às vezes não resolviam (exit 100). Mantenha o SQL igual ao do .sh.
// Uso: `node packages/db/dist/app-role-cli.js` com DATABASE_URL (owner) e APP_DB_PASSWORD.
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
const password = process.env.APP_DB_PASSWORD;
if (!password) throw new Error('defina APP_DB_PASSWORD');

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  // CREATE ROLE não aceita parâmetro na senha: literal com aspas escapadas, como o :'app_pw' do psql.
  // Um comando por vez: CREATE DATABASE não roda dentro de transação.
  await sql.unsafe(
    `CREATE ROLE npac_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password.replaceAll("'", "''")}'`,
  );
  await sql.unsafe('GRANT CONNECT ON DATABASE npac TO npac_app');
  await sql.unsafe('CREATE DATABASE npac_test OWNER npac_owner');
  await sql.unsafe('GRANT CONNECT ON DATABASE npac_test TO npac_app');
  console.log('Role npac_app e banco npac_test criados.');
} finally {
  await sql.end();
}
