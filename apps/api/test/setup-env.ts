// Os testes da API usam o banco próprio npac_test_api, acessado como npac_app.
const DB = 'npac_test_api';
const raw = process.env.TEST_DATABASE_URL;
const pw = process.env.APP_DB_PASSWORD;
if (!raw || !pw) throw new Error('TEST_DATABASE_URL e APP_DB_PASSWORD são obrigatórias nos testes');
const url = new URL(raw);
url.pathname = `/${DB}`;
url.username = 'npac_app';
url.password = pw;
process.env.APP_DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
