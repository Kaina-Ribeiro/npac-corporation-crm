import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-64 (Igor, 23/11/2026): a busca do Pipeline acha o lead mesmo numa coluna desmarcada em
// "Colunas visíveis". Durante a busca a coluna com resultado aparece, marcada "Oculta"; sem texto,
// volta a escolha da pessoa.

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

const card = (page: Page, name: string) =>
  page.locator('article').getByRole('link', { name, exact: true }).filter({ visible: true });

async function buscar(page: Page, texto: string) {
  const box = page.getByLabel('Buscar no Pipeline');
  await box.fill(texto);
  await box.press('Enter');
}

test('busca acha o lead em coluna oculta e a coluna some ao limpar', async ({ page }) => {
  await login(page, 'ale');
  const name = `Escondido ${rid()}`;
  const res = await page.request.post('/api/leads', {
    data: { name, instagram: `@oculta.${rid()}`, incomeBand: 'R8_15K', source: 'BIO' },
  });
  expect(res.ok()).toBe(true);

  await page.goto('/pipeline');
  const column = page.getByRole('region', { name: 'Criando Relacionamento' });
  await expect(card(page, name)).toBeVisible();
  await page.getByText('Colunas visíveis').click();
  const box = page.getByRole('checkbox', { name: 'Criando Relacionamento' });
  await expect(async () => {
    await box.setChecked(false);
    await expect(column).toHaveCount(0, { timeout: 500 });
  }).toPass();

  await buscar(page, name);
  await expect(card(page, name)).toBeVisible();
  await expect(column.getByText('Oculta', { exact: true })).toBeVisible();
  // A escolha da pessoa não muda.
  await expect(box).not.toBeChecked();

  // Celular: a aba da coluna aparece e abre sozinha, já que a aberta ficou sem resultado.
  await page.setViewportSize({ width: 375, height: 812 });
  const tabs = page.getByRole('navigation', { name: 'Etapas do Pipeline' });
  await expect(tabs.getByRole('button', { name: /^Criando Relacionamento/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(page, name)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });

  await buscar(page, '');
  await expect(column).toHaveCount(0);
  await expect(card(page, name)).toHaveCount(0);

  // Restaura a coluna para os outros testes.
  await box.setChecked(true);
  await expect(column).toBeVisible();
});
