import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-63 (Igor, 23/11/2026): a busca de Leads e do Pipeline filtra enquanto a pessoa digita, sem
// Enter; apagar o texto traz a lista inteira de volta.

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, user: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(user);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

const rid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function ownLead(page: Page, name: string) {
  const res = await page.request.post('/api/leads', {
    data: { name, instagram: `@busca.${rid()}`, incomeBand: 'R8_15K', source: 'BIO' },
  });
  expect(res.ok()).toBe(true);
}

const visible = (page: Page, text: string) =>
  page.getByText(text, { exact: true }).filter({ visible: true });

test('Leads busca enquanto digita e volta a lista ao apagar', async ({ page }) => {
  await login(page, 'ale');
  const id = rid();
  await ownLead(page, `Digitado ${id}`);
  await ownLead(page, `Outro ${id}`);
  await page.goto('/leads');
  await expect(visible(page, `Outro ${id}`)).toBeVisible();

  const box = page.getByLabel('Buscar por nome, WhatsApp, Instagram ou e-mail');
  // Digita como uma pessoa, letra por letra, e não aperta Enter.
  await expect(async () => {
    await box.fill('');
    await box.pressSequentially(`Digitado ${id}`, { delay: 20 });
    await expect(page.getByText('1 lead', { exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass();
  await expect(visible(page, `Digitado ${id}`)).toBeVisible();
  await expect(visible(page, `Outro ${id}`)).toHaveCount(0);

  await box.fill('');
  await expect(visible(page, `Outro ${id}`)).toBeVisible();
  await expect(page.getByText('1 lead', { exact: true })).toHaveCount(0);
});

test('Pipeline busca enquanto digita e volta os cards ao apagar', async ({ page }) => {
  await login(page, 'ale');
  const id = rid();
  await ownLead(page, `Digitado ${id}`);
  await ownLead(page, `Outro ${id}`);
  await page.goto('/pipeline');
  const card = (name: string) =>
    page.locator('article').getByRole('link', { name, exact: true }).filter({ visible: true });
  await expect(card(`Outro ${id}`)).toBeVisible();

  const box = page.getByLabel('Buscar no Pipeline');
  await expect(async () => {
    await box.fill('');
    await box.pressSequentially(`Digitado ${id}`, { delay: 20 });
    await expect(card(`Outro ${id}`)).toHaveCount(0, { timeout: 2000 });
  }).toPass();
  await expect(card(`Digitado ${id}`)).toBeVisible();

  await box.fill('');
  await expect(card(`Outro ${id}`)).toBeVisible();
  await expect(card(`Digitado ${id}`)).toBeVisible();
});
