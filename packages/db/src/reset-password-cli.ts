// `node node_modules/@npac/db/dist/reset-password-cli.js <usuário> [--mfa]`, no shell do app `api`.
// Gera uma senha temporária e a mostra só neste terminal; o usuário troca no primeiro login.
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { createDb } from './client.js';
import { resetPassword } from './reset-password.js';

const url = process.env.DATABASE_URL;
const [username, ...flags] = process.argv.slice(2);
if (!url) throw new Error('DATABASE_URL não definida');
if (!username) throw new Error('Uso: reset-password-cli.js <usuário> [--mfa]');

const password = randomBytes(12).toString('base64url');
const client = createDb(url, { max: 1 });
try {
  await resetPassword(client.db, username, {
    hashPassword: (p) => hash(p),
    password,
    resetMfa: flags.includes('--mfa'),
  });
  console.log(`Senha temporária de ${username.trim().toLowerCase()}: ${password}`);
  console.log('No próximo login o sistema pede uma senha nova.');
} finally {
  await client.close();
}
