import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/** E-mail do lead (NPAC-42): cadastro, ficha, busca e nada de contato em URL. */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;

/** Nas quatro larguras: sem rolagem lateral, com captura para conferir o desenho. */
async function checkWidths(page: Page, name: string, fullPage: boolean) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/email-${name}-${w}.png`,
      fullPage,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

test('e-mail no cadastro, na ficha e na busca, sem ir para a URL', async ({ page }) => {
  const stamp = Date.now();
  // Longo de propósito: na ficha precisa quebrar a linha, sem estourar o celular.
  const email = `pessoa.com.endereco.bem.comprido.para.quebrar.${stamp}@dominio-longo-de-exemplo.com.br`;
  const edited = `editado.${stamp}@exemplo.com`;
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await login(page, 'ale@npac.com.br');

  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill(`Lead com e-mail ${stamp}`);
  await page.getByLabel('Instagram', { exact: true }).fill(`@email.${stamp}`);
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  // Validação em português, sem depender do balão do navegador.
  await page.getByLabel('E-mail', { exact: true }).fill('sem-dominio@');
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await expect(page.getByText('E-mail inválido', { exact: true })).toBeVisible();

  await page.getByLabel('E-mail', { exact: true }).fill(`  ${email.toUpperCase()} `);
  await checkWidths(page, 'cadastro', true);
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);

  // Ficha: texto puro, sem link `mailto:`.
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await checkWidths(page, 'ficha', false);

  await page.getByText('Editar dados do lead', { exact: true }).click();
  const field = page.getByLabel('E-mail', { exact: true });
  await expect(field).toHaveValue(email);
  await field.fill(edited);
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();
  await expect(page.getByText(/· .*e-mail/).first()).toBeVisible();

  await page.goto('/leads');
  const box = page.getByPlaceholder('Nome, WhatsApp, @instagram ou e-mail');
  await box.fill(edited);
  await box.press('Enter');
  await expect(
    page.getByText(`Lead com e-mail ${stamp}`, { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  await page.goto('/pipeline');
  await expect(page.getByLabel('Buscar no Pipeline')).toHaveAttribute(
    'placeholder',
    'Nome, WhatsApp, @instagram ou e-mail',
  );

  const leaked = urls.filter((u) => /@|%40/.test(u) || u.includes(`.${stamp}`));
  expect(leaked).toEqual([]);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(`${stamp}`);
});

test('e-mail repetido não revela o dono do lead', async ({ page, browser }) => {
  const stamp = Date.now();
  const email = `repetido.${stamp}@exemplo.com`;
  const ctx = await browser.newContext();
  const murilo = await ctx.newPage();
  await login(murilo, 'murilo@npac.com.br');
  const first = await murilo.request.post('/api/leads', {
    data: {
      name: 'Dono do e-mail',
      instagram: `@dono.${stamp}`,
      email,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(first.ok()).toBe(true);
  await ctx.close();

  await login(page, 'ale@npac.com.br');
  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill('Outro lead');
  await page.getByLabel('Instagram', { exact: true }).fill(`@outro.${stamp}`);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await expect(page.getByText('Já existe um lead com este contato.')).toBeVisible();
  await expect(page.getByText('Murilo')).toHaveCount(0);
});
