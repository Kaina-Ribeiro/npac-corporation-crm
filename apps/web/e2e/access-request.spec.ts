import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

async function cleanup() {
  await owner`truncate access_requests`;
  await owner`delete from session where user_id in (select id from "user" where email like '%@novo.test')`;
  await owner`delete from account where user_id in (select id from "user" where email like '%@novo.test')`;
  await owner`delete from "user" where email like '%@novo.test'`;
}

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await cleanup();
});
test.afterAll(async () => {
  await cleanup();
  await owner`update "user" set role = 'HEAD' where email = 'ana@npac.com.br'`;
  await closeTestConnections();
});

async function loginAs(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(username);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

async function requestAccess(page: Page) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Solicitar acesso' }).click();
  await page.waitForURL(/\/login\/solicitar/);
  await page.getByLabel('Nome', { exact: true }).fill('Nova Pessoa');
  await page.getByLabel('Usuário', { exact: true }).fill('nova.pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill('nova@novo.test');
  await page.getByLabel('Senha', { exact: true }).fill('minha-senha');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('minha-senha');
  await page.getByRole('button', { name: 'Pedir acesso' }).click();
  await expect(page.getByText('Pedido enviado.')).toBeVisible();
}

test('pede acesso e só entra depois de aprovado', async ({ page }) => {
  await requestAccess(page);
  await page.screenshot({ path: 'test-results/access-request.png' });
  await loginAs(page, 'nova.pessoa', 'minha-senha');
  await expect(
    page.getByRole('alert').and(page.getByText('Usuário ou senha inválidos')),
  ).toBeVisible();
});

test('senhas diferentes não enviam o pedido', async ({ page }) => {
  await page.goto('/login/solicitar');
  await page.getByLabel('Nome', { exact: true }).fill('Nova Pessoa');
  await page.getByLabel('Usuário', { exact: true }).fill('nova.pessoa');
  await page.getByLabel('E-mail', { exact: true }).fill('nova@novo.test');
  await page.getByLabel('Senha', { exact: true }).fill('minha-senha');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('outra-senha');
  await page.getByRole('button', { name: 'Pedir acesso' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'As senhas não conferem' })).toBeVisible();
  expect(await owner`select id from access_requests`).toHaveLength(0);
});

test('Diretoria aprova o pedido no Admin e a pessoa entra', async ({ page }) => {
  await owner`update "user" set role = 'DIRETOR' where email = 'ana@npac.com.br'`;
  await requestAccess(page);
  await loginAs(page, 'ana', E2E_PASSWORD);
  await page.waitForURL(/\/dashboard/);
  const admin = page.getByRole('link', { name: /Admin/ }).filter({ visible: true }).first();
  await expect(admin).toContainText('1');
  await admin.click();
  await page.waitForURL(/\/admin/);
  const requests = page.getByRole('region', { name: 'Pedidos de acesso' });
  await expect(requests).toContainText('Nova Pessoa');
  await expect(requests).toContainText('nova.pessoa');
  await page.screenshot({ path: 'test-results/access-request-admin.png' });
  await requests.getByLabel('Cargo de Nova Pessoa').selectOption('SDR');
  await requests.getByRole('button', { name: 'Aprovar' }).click();
  await expect(requests).toHaveCount(0);
  await expect(page.getByText('nova.pessoa')).toBeVisible();
  await expect(admin).not.toContainText('1');

  await page.getByRole('button', { name: 'Sair' }).filter({ visible: true }).click();
  await page.waitForURL(/\/login/);
  await loginAs(page, 'nova.pessoa', 'minha-senha');
  await page.waitForURL(/\/dashboard/);
});

test('recusar pede confirmação e apaga o pedido', async ({ page }) => {
  await requestAccess(page);
  await loginAs(page, 'ronaldo', E2E_PASSWORD);
  await page.waitForURL(/\/dashboard/);
  await page.goto('/admin');
  const requests = page.getByRole('region', { name: 'Pedidos de acesso' });
  await expect(requests).toContainText('Nova Pessoa');
  // Head só oferece SDR e Closer.
  await expect(requests.getByLabel('Cargo de Nova Pessoa').locator('option')).toHaveText([
    'SDR',
    'Closer',
  ]);
  page.once('dialog', (d) => void d.accept());
  await requests.getByRole('button', { name: 'Recusar' }).click();
  await expect(requests).toHaveCount(0);
  expect(await owner`select id from access_requests`).toHaveLength(0);
});
