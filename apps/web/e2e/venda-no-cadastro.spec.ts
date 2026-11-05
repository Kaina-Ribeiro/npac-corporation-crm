import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * Venda Fechada no cadastro (NPAC-39): o SDR informa a reunião realizada e o lead fica "Venda a
 * registrar"; quem registra venda pode registrá-la no fim do formulário. Também o dropdown com o
 * visual do CRM (select nativo personalizável, só CSS) aberto nos temas claro e escuro.
 */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;
const DAY = 86_400_000;
/** `datetime-local`/`date` em Brasília. */
const spInput = (d: Date) =>
  d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16);

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

async function fillLead(page: Page, name: string, instagram: string) {
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByLabel('Instagram', { exact: true }).fill(instagram);
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
}

async function shots(page: Page, file: string, fullPage = true) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${file}-${w}.png`,
      fullPage,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('SDR cadastra em Venda Fechada sem a venda: ficha e Pipeline mostram "Venda a registrar"', async ({
  page,
  browser,
}) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads/new');
  const name = 'Lead vendido pelo SDR';
  await fillLead(page, name, '@vendido.sdr');
  await page.getByLabel('Etapa', { exact: true }).selectOption('VENDA');
  await expect(page.getByLabel('Data e hora da reunião (Brasília)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Closer da reunião', { exact: true })).toBeVisible();
  // O SDR não vê a venda nem valores.
  await expect(page.getByText('Registrar a venda agora')).toHaveCount(0);
  await expect(
    page.getByText('O closer da reunião recebe o aviso para registrar a venda.'),
  ).toBeVisible();
  await page
    .getByLabel('Data e hora da reunião (Brasília)', { exact: true })
    .fill(spInput(new Date(Date.now() - 2 * DAY)));
  await page.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Sônia' });
  await shots(page, 'venda-cadastro-sdr');

  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Venda a registrar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('O closer da reunião registra a venda.')).toBeVisible();
  const [m] = await owner<
    { outcome: string }[]
  >`select outcome from meetings where lead_id = ${id}`;
  expect(m?.outcome).toBe('DONE');

  // A closer da reunião vê o selo, o botão e registra pela ficha.
  const ctx = await browser.newContext();
  const closer = await ctx.newPage();
  await login(closer, 'sonia@npac.com.br');
  await closer.setViewportSize({ width: 1440, height: 900 });
  await closer.goto('/pipeline');
  const card = closer.getByRole('region', { name: 'Venda Fechada 🏆' });
  await expect(card.getByText(name, { exact: true })).toBeVisible();
  await expect(card.getByText('Venda a registrar', { exact: true })).toBeVisible();
  await closer.screenshot({ path: 'test-results/venda-pipeline-1440.png', animations: 'disabled' });
  await card.getByRole('link', { name: 'Registrar venda', exact: true }).click();
  await closer.waitForURL(new RegExp(`/leads/${id}#vendas$`));
  await expect(closer.getByRole('form', { name: 'Registrar venda' })).toBeVisible();
  await closer.goto(`/leads/${id}`);
  await expect(closer.getByRole('link', { name: 'Registrar venda', exact: true })).toBeVisible();
  await shots(closer, 'venda-ficha-a-registrar', false);
  await ctx.close();
});

test('liderança cadastra em Venda Fechada registrando a venda no fim do formulário', async ({
  page,
}) => {
  await login(page, 'ronaldo@npac.com.br');
  await page.goto('/leads/new');
  const name = 'Lead vendido no cadastro';
  await fillLead(page, name, '@vendido.cadastro');
  await page.getByLabel('Etapa', { exact: true }).selectOption('VENDA');
  await page.getByLabel('SDR responsável', { exact: true }).selectOption({ label: 'Ale' });
  await page
    .getByLabel('Data e hora da reunião (Brasília)', { exact: true })
    .fill(spInput(new Date(Date.now() - 3 * DAY)));
  await page.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Ronaldo' });
  await page.getByLabel('Registrar a venda agora').check();
  const day = spInput(new Date(Date.now() - 2 * DAY)).slice(0, 10);
  await page.getByLabel('Data da venda', { exact: true }).fill(day);
  // Só os produtos do closer da reunião; o valor começa com o preço.
  await page
    .getByLabel('Produto', { exact: true })
    .selectOption({ label: 'Mentoria RDV — R$ 18.000,00' });
  await expect(page.getByLabel('Valor total (R$)', { exact: true })).toHaveValue('18000,00');
  await page.getByLabel('Forma de pagamento', { exact: true }).selectOption('PARTIAL');
  await page.getByLabel('Já pago (R$)', { exact: true }).fill('6000');
  await page.getByLabel('Parcela 1 (R$)', { exact: true }).fill('12000');
  await page
    .getByLabel('Vencimento 1 (Brasília)', { exact: true })
    .fill(spInput(new Date(Date.now() + 20 * DAY)));
  await expect(page.getByText('· fecha o total')).toBeVisible();
  await shots(page, 'venda-cadastro-closer');

  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Venda a registrar', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Venda registrada', { exact: true }).first()).toBeVisible();
  const [d] = await owner<{ closed: string; total: number }[]>`
    select to_char(closed_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as closed,
      total_cents as total from deals where lead_id = ${id}`;
  expect(d).toEqual({ closed: day, total: 1_800_000 });
  await shots(page, 'venda-ficha-registrada', false);
});

for (const theme of ['light', 'dark'] as const) {
  test(`dropdown de Etapa aberto com o visual do CRM (${theme})`, async ({ page }) => {
    // Tema da pessoa (next-themes guarda em localStorage; o padrão é o claro).
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await login(page, 'ale@npac.com.br');
    await page.goto('/leads/new');
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/);
    else await expect(page.locator('html')).not.toHaveClass(/dark/);
    const stage = page.getByLabel('Etapa', { exact: true });
    expect(await stage.evaluate((el) => getComputedStyle(el).appearance)).toBe('base-select');
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await stage.scrollIntoViewIfNeeded();
      await stage.click();
      await expect(page.getByRole('option', { name: 'Venda Fechada 🏆' })).toBeVisible();
      // A lista entra com um fade curto (140 ms): o print espera ele terminar.
      await page.waitForTimeout(400);
      await page.screenshot({
        path: `test-results/dropdown-${theme}-${w}.png`,
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('option', { name: 'Venda Fechada 🏆' })).toBeHidden();
    }
    // Teclado continua o do select nativo.
    await stage.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(stage).toHaveValue('AGENDADO_DIRETO');
  });
}
