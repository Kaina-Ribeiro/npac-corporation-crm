import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB } from './env.js';

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
