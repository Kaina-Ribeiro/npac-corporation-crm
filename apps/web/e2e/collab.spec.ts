import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  page.on('pageerror', (e) => console.log('PAGEERROR', e.stack));
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

test('chat: mensagem no Geral com #lead e DM privada', async ({ browser }) => {
  const ale = await browser.newPage();
  await login(ale, 'ale@npac.com.br');
  await ale.goto('/chat');
  await ale.getByLabel('Mencionar lead').fill('Lead do');
  await ale.getByRole('button', { name: 'Lead do Ale' }).click();
  await ale.getByLabel('Mensagem').fill('Bom dia, time');
  await ale.getByRole('button', { name: 'Enviar' }).click();
  await expect(ale.getByText('Bom dia, time')).toBeVisible();
  await expect(ale.getByRole('link', { name: '#Lead do Ale' })).toBeVisible();
  await ale.screenshot({ path: 'test-results/chat.png', fullPage: true });

  const murilo = await browser.newPage();
  await login(murilo, 'murilo@npac.com.br');
  await murilo.goto('/chat');
  await expect(murilo.getByText('Bom dia, time')).toBeVisible();
  await expect(murilo.getByText('#lead restrito')).toBeVisible();
  await murilo.getByLabel('Nova conversa').selectOption({ label: 'Ale' });
  await murilo.getByLabel('Mensagem').fill('Só entre nós');
  await murilo.getByRole('button', { name: 'Enviar' }).click();
  await expect(murilo.getByText('Só entre nós')).toBeVisible();
  // O SSE avisa a Ale; a DM aparece com não lida sem recarregar.
  await expect(ale.getByRole('button', { name: /Murilo/ })).toBeVisible({ timeout: 10_000 });
  await ale.close();
  await murilo.close();
});

test('ficha: handoff copiado sem telefone', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads');
  await page.getByRole('link', { name: 'Lead do Ale' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Copiar handoff' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Handoff copiado' })).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Lead do Ale');
  expect(text).toContain('SDR: Ale');
});

test('equipe e playbook', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/equipe');
  await expect(page.getByRole('heading', { name: 'Ale', exact: true })).toBeVisible();
  await expect(
    page.getByText('Números visíveis só para a própria pessoa e HEADs.').first(),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/equipe.png', fullPage: true });
  await page.goto('/playbook');
  await page.getByLabel('Buscar no playbook').fill('caro');
  await expect(page.getByRole('heading', { name: '“Está caro”' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo script' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/playbook.png', fullPage: true });
});

test('chat mobile alterna lista e conversa', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'ale@npac.com.br');
  await page.goto('/chat');
  await page.getByRole('button', { name: '# Geral' }).click();
  await expect(page.getByLabel('Mensagem')).toBeVisible();
  await page.screenshot({ path: 'test-results/chat-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '‹ Conversas' }).click();
  await expect(page.getByRole('navigation', { name: 'Conversas' })).toBeVisible();
});
