import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-53: Meu perfil (`/conta/perfil`) no lugar do "Trocar senha": foto, nome, e-mail e senha.
const owner = ownerSql(E2E_DB);
const EMAIL = 'ronaldo@npac.com.br';
let nome = '';
let senha = '';

async function login(page: Page, usuario = 'ronaldo', password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/(dashboard|acompanhamento)/);
}
const lateral = (page: Page) => page.locator('#app-sidebar');

test.beforeAll(async () => {
  const [u] = await owner<{ name: string; password: string }[]>`
    select u.name, a.password from "user" u join account a on a.user_id = u.id
    where u.email = ${EMAIL} and a.provider_id = 'credential'`;
  nome = u!.name;
  senha = u!.password;
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterEach(async () => {
  await owner`update "user" set name = ${nome}, image = null where email = ${EMAIL}`;
  await owner`delete from user_photos where user_id = (select id from "user" where email = ${EMAIL})`;
  await owner`update account set password = ${senha}
    where provider_id = 'credential' and user_id = (select id from "user" where email = ${EMAIL})`;
});
test.afterAll(async () => closeTestConnections());

test('rodapé da sidebar leva ao Meu perfil, sem o Trocar senha', async ({ page }) => {
  await login(page);
  await expect(lateral(page).getByRole('link', { name: 'Trocar senha' })).toHaveCount(0);
  await lateral(page)
    .getByRole('link', { name: /Meu perfil/ })
    .click();
  await page.waitForURL(/\/conta\/perfil$/);
  await expect(page.getByRole('heading', { name: 'Meu perfil', level: 1 })).toBeVisible();
  await expect(page.getByText('ronaldo', { exact: true })).toBeVisible();
});

test('troca o nome ao sair do campo e mostra Salvo', async ({ page }) => {
  await login(page);
  await page.goto('/conta/perfil');
  const campo = page.getByLabel('Nome', { exact: true });
  await campo.fill('Ronaldo Prado');
  await campo.blur();
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  await page.reload();
  await expect(lateral(page).getByText('Ronaldo Prado')).toBeVisible();
});

test('nome vazio mostra o erro e não salva', async ({ page }) => {
  await login(page);
  await page.goto('/conta/perfil');
  const campo = page.getByLabel('Nome', { exact: true });
  await campo.fill('  ');
  await campo.blur();
  await expect(page.getByText('Digite o seu nome.')).toBeVisible();
  const [u] = await owner<{ name: string }[]>`select name from "user" where email = ${EMAIL}`;
  expect(u?.name).toBe(nome);
});

test('troca a senha dentro do perfil', async ({ page }) => {
  await login(page);
  await page.goto('/conta/perfil');
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await page.getByLabel('Senha atual', { exact: true }).fill('errada');
  await page.getByLabel('Nova senha', { exact: true }).fill('ronaldo-nova-1');
  await page.getByLabel('Confirme a nova senha').fill('ronaldo-nova-1');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(
    page.getByText('Não foi possível trocar a senha. Confira a senha atual.'),
  ).toBeVisible();
  await page.getByLabel('Senha atual', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Salvo' })).toBeVisible();
  await expect(page.getByLabel('Senha atual', { exact: true })).toHaveCount(0);
  await lateral(page).getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await login(page, 'ronaldo', 'ronaldo-nova-1');
});

test('/conta/senha sem troca obrigatória abre o Meu perfil', async ({ page }) => {
  await login(page);
  await page.goto('/conta/senha');
  await page.waitForURL(/\/conta\/perfil$/);
});

test('Mais do celular tem Meu perfil no cartão da conta', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto('/mais');
  const conta = page.getByRole('region', { name: 'Sua conta' });
  await expect(conta.getByRole('link', { name: 'Trocar senha' })).toHaveCount(0);
  await conta.getByRole('link', { name: 'Meu perfil', exact: true }).click();
  await page.waitForURL(/\/conta\/perfil$/);
  await expect(
    page.locator('main').getByRole('link', { name: 'Mais', exact: true }),
  ).toHaveAttribute('href', '/mais');
  await ctx.close();
});
