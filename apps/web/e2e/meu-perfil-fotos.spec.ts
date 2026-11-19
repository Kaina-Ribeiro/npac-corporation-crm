import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-53 (3A): a foto da pessoa aparece onde hoje aparece a inicial, e também no Chat e no Admin.
const owner = ownerSql(E2E_DB);
const IGOR = 'igor@npac.com.br';
let igorId = '';
let igorNome = '';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function entrar(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('diretor');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}
const fotoDoIgor = (page: Page) => page.locator(`img[src^="/api/users/${igorId}/photo?v="]`);

test.beforeAll(async () => {
  const [u] = await owner<{ id: string; name: string }[]>`
    select id, name from "user" where email = ${IGOR}`;
  igorId = u!.id;
  igorNome = u!.name;
  await owner`insert into user_photos (user_id, bytes, mime, size)
    values (${igorId}, ${PNG}, 'image/png', ${PNG.length})
    on conflict (user_id) do update set bytes = excluded.bytes`;
  await owner`update "user" set image = 'e2e1' where id = ${igorId}`;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await owner`delete from user_photos where user_id = ${igorId}`;
  await owner`update "user" set image = null where id = ${igorId}`;
  await owner`truncate chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
  await closeTestConnections();
});

test('Equipe mostra a foto de quem tem e a inicial de quem não tem', async ({ page }) => {
  await entrar(page);
  await page.goto('/equipe');
  await expect(fotoDoIgor(page)).toHaveCount(1);
  await expect(page.locator('main img[src*="/photo?v="]')).toHaveCount(1);
});

test('Chat mostra a foto na conversa com a pessoa', async ({ page }) => {
  await entrar(page);
  await page.goto('/chat');
  await page.getByLabel('Nova conversa').selectOption({ label: igorNome });
  const conversas = page.getByRole('navigation', { name: 'Conversas' });
  await expect(conversas.locator(`img[src^="/api/users/${igorId}/photo"]`)).toHaveCount(1);
});

test('Admin mostra a foto na linha do usuário', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin');
  await expect(fotoDoIgor(page)).toHaveCount(1);
});
