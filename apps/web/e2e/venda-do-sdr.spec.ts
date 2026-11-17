import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * NPAC-48 (Igor, 17/11/2026): depois da reunião realizada, o SDR marca a venda só com o produto;
 * o closer da reunião põe o valor na área dele; a renda extra do SDR por produto aparece no
 * Dashboard dele e sai com o estorno. O SDR nunca vê R$ da venda.
 */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;

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

async function shots(page: Page, file: string, fullPage = false) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${file} ${w}px sem rolagem lateral`,
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${file}-${w}.png`,
      fullPage,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

/** Lead da Ale com reunião da Sônia já realizada (o SDR marcou "Realizada"). */
async function leadWithDoneMeeting(page: Page, name: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      instagram: `@venda.sdr.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, created_by)
    select ${id}, c.id, now() - interval '2 hours', 'DIRETO', 'DONE', now() - interval '1 hour', s.id
    from "user" c, "user" s where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;
  return id;
}

const bonusCard = (page: Page) =>
  page.getByRole('region', { name: 'Renda extra por produto vendido' });

test('SDR marca a venda só com o produto, closer põe o valor, renda no Dashboard e estorno tira', async ({
  page,
  browser,
}) => {
  // Renda extra do catálogo: começa do valor do Igor (outro teste pode ter mudado).
  await owner`update products set sdr_bonus_cents = 1000 where code = 'NACAO_PADRAO'`;
  await owner`delete from sdr_sale_marks where sdr_id = (select id from "user" where email = 'ale@npac.com.br')`;
  await login(page, 'ale@npac.com.br');
  const name = 'Lead da venda do SDR';
  const id = await leadWithDoneMeeting(page, name);

  await page.goto(`/leads/${id}`);
  const reunioes = page.locator('section', {
    has: page.getByRole('heading', { name: 'Reuniões' }),
  });
  await expect(reunioes.getByText('Realizada', { exact: true })).toBeVisible();
  await reunioes.getByRole('button', { name: 'Marcar venda', exact: true }).click();
  const form = page.getByRole('form', { name: 'Marcar venda' });
  const product = form.getByLabel('Produto vendido', { exact: true });
  // Só os produtos da closer da reunião, sem preço.
  const labels = (await product.locator('option').allTextContents()).map((t) => t.trim());
  expect(labels).toContain('Nação Padrão');
  expect(labels).not.toContain('Mentoria RDV');
  expect(labels.join(' ')).not.toContain('R$');
  await expect(form.getByText('Sônia recebe o aviso para registrar o valor.')).toBeVisible();
  await product.selectOption({ label: 'Nação Padrão' });
  await form.scrollIntoViewIfNeeded();
  await shots(page, 'venda-sdr-marcar');
  await form.getByRole('button', { name: 'Marcar venda', exact: true }).click();

  await expect(page.getByText('Venda a registrar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Produto: Nação Padrão')).toBeVisible();
  await expect(page.getByText('O closer da reunião registra a venda.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar venda' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('R$ 3.000');
  await shots(page, 'venda-sdr-marcada');

  // Dashboard do SDR: renda extra separada do valor das reuniões.
  await page.goto('/dashboard');
  const card = bonusCard(page);
  await expect(card.getByText('R$ 10,00').first()).toBeVisible();
  await expect(card.getByText('1 venda marcada no período')).toBeVisible();
  await expect(card.getByText('Nação Padrão')).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shots(page, 'venda-sdr-dashboard');

  // A closer da reunião recebe o aviso e põe o valor na ficha (área dela).
  const ctx = await browser.newContext();
  const closer = await ctx.newPage();
  await login(closer, 'sonia@npac.com.br');
  await closer.goto(`/leads/${id}`);
  await expect(closer.getByText('Produto: Nação Padrão')).toBeVisible();
  await closer.getByRole('link', { name: 'Registrar venda', exact: true }).click();
  const sale = closer.getByRole('form', { name: 'Registrar venda' });
  await sale.getByRole('button', { name: 'Continuar venda' }).click();
  await sale.getByLabel('Valor total (R$)', { exact: true }).fill('3000,00');
  await sale.getByLabel('Forma de pagamento', { exact: true }).selectOption('PIX');
  await sale.getByRole('button', { name: 'Continuar venda' }).click();
  await sale.getByRole('button', { name: 'Confirmar venda' }).click();
  await expect(closer.getByText('Venda a registrar', { exact: true })).toHaveCount(0);
  const [deal] = await owner<{ id: string; total: number }[]>`
    select id, total_cents as total from deals where lead_id = ${id}`;
  expect(deal?.total).toBe(300_000);
  // O closer não tem o card da renda do SDR.
  await closer.goto('/dashboard');
  await expect(closer.locator('[data-card="sale-bonus"]')).toHaveCount(0);
  await ctx.close();

  // Registrada a venda, a renda continua; o SDR segue sem ver o valor.
  await page.goto('/dashboard');
  await expect(bonusCard(page).getByText('R$ 10,00').first()).toBeVisible();
  await page.goto(`/leads/${id}`);
  await expect(page.locator('body')).not.toContainText('R$ 3.000');

  // Estorno pela liderança: a renda sai do painel do SDR e do da liderança.
  const ctx2 = await browser.newContext();
  const head = await ctx2.newPage();
  await login(head, 'ronaldo@npac.com.br');
  // A liderança vê a renda extra de todos os SDRs, uma linha por SDR (Gabriel, 17/11/2026).
  const team = head.getByRole('region', { name: 'Renda extra dos SDRs' });
  await expect(team.getByRole('listitem').filter({ hasText: 'Ale' })).toContainText('R$ 10,00');
  await team.scrollIntoViewIfNeeded();
  await shots(head, 'venda-sdr-dashboard-head');
  const reversed = await head.request.post(`/api/finance/deals/${deal!.id}/reverse`, {
    data: { version: 1 },
  });
  expect(reversed.ok(), await reversed.text()).toBe(true);
  await ctx2.close();
  await page.goto('/dashboard');
  await expect(bonusCard(page).getByText('R$ 0,00').first()).toBeVisible();
  await expect(
    bonusCard(page).getByText('Nenhuma venda marcada no período.', { exact: false }),
  ).toBeVisible();
});

test('liderança edita a renda extra do produto no Admin > Catálogo', async ({ page }) => {
  await login(page, 'ronaldo@npac.com.br');
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Produtos', exact: true }).first().click();
  const row = page.getByRole('form', { name: 'Produto Nação Promocional' });
  await expect(row.getByLabel('Renda extra do SDR (R$)', { exact: true })).toHaveValue('5,00');
  await row.getByLabel('Renda extra do SDR (R$)', { exact: true }).fill('6,50');
  await row.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(row.getByText('renda extra do SDR R$ 6,50')).toBeVisible();
  const [p] = await owner<{ cents: number }[]>`
    select sdr_bonus_cents as cents from products where code = 'NACAO_PROMO'`;
  expect(p?.cents).toBe(650);
  await row.scrollIntoViewIfNeeded();
  await shots(page, 'venda-sdr-catalogo');
  await owner`update products set sdr_bonus_cents = 500 where code = 'NACAO_PROMO'`;
});
