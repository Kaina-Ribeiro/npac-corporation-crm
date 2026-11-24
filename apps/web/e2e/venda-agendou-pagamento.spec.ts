import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * NPAC-68 (Igor, 23/11/2026): o cliente pagou e o lead está em Agendou Pagamento. O SDR marca a venda
 * na ficha, ao lado do "Mover para", sem depender do closer: o lead vira venda a registrar com o
 * closer e o produto do pagamento, e o closer vê o pedido no Hoje dele. Sem reunião realizada, a
 * ficha leva a lançar a reunião que já aconteceu (NPAC-62). NPAC-65: Agendou Pagamento sempre teve
 * reunião; sem a realizada, ao mover ou no cadastro, a que já aconteceu entra ali mesmo.
 */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 1440] as const;

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
// Os leads daqui saem no fim de cada teste: outros arquivos contam as vendas a registrar da Sônia.
const created: string[] = [];
test.afterEach(async () => {
  if (created.length)
    await owner`update leads set deleted_at = now() where id = any(${created}::uuid[])`;
  created.length = 0;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

async function shots(page: Page, file: string) {
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${file} ${w}px sem rolagem lateral`,
    ).toBe(true);
    await page.screenshot({ path: `test-results/${file}-${w}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * Lead da Ale em Agendou Pagamento com a Sônia (Nação Padrão, entrada já paga), como o do print do
 * Igor. Com `reuniao`, a reunião realizada foi com o Ronaldo (outro closer que o do pagamento).
 */
async function paidLead(page: Page, name: string, reuniao: boolean) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      instagram: `@pagou.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  if (reuniao)
    await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, created_by)
      select ${id}, c.id, now() - interval '3 hours', 'DIRETO', 'DONE', now() - interval '2 hours', s.id
      from "user" c, "user" s where c.email = 'ronaldo@npac.com.br' and s.email = 'ale@npac.com.br'`;
  await owner`update leads set stage_id = (select id from pipeline_stages where key = 'AGENDOU_PAGAMENTO'),
      payment_product_id = (select id from products where code = 'NACAO_PADRAO'),
      closer_id = (select id from "user" where email = 'sonia@npac.com.br'),
      payment_entry_paid = true, version = version + 1
    where id = ${id}`;
  return id;
}

const saleOption = (page: Page) =>
  page.getByLabel('Mover para', { exact: true }).locator('option[value="VENDA"]');

test('SDR marca a venda do lead que pagou e a closer do pagamento vê no Hoje', async ({
  page,
  browser,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead pagou ${Date.now().toString(36)}`;
  const id = await paidLead(page, name, true);
  const [padrao] = await owner<
    { id: string }[]
  >`select id from products where code = 'NACAO_PADRAO'`;

  // Caminho real: menu → Pipeline → card do lead → ficha.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: 'Pipeline', exact: true }).filter({ visible: true }).click();
  await page.waitForURL(/\/pipeline/);
  const search = page.getByLabel('Buscar no Pipeline', { exact: true });
  await search.fill(name);
  await search.press('Enter');
  await page.getByRole('link', { name, exact: true }).filter({ visible: true }).click();
  await page.waitForURL(new RegExp(`/leads/${id}$`));

  // A dica da Venda aponta para o "Marcar venda", que fica ao lado do "Mover para".
  await expect(saleOption(page)).toHaveText('Venda Fechada 🏆 (use “Marcar venda”)');
  await expect(saleOption(page)).toBeDisabled();
  const markButton = page.getByRole('button', { name: 'Marcar venda', exact: true });
  await expect(markButton).toHaveCount(1);
  await shots(page, 'venda-pagou-ficha');
  await markButton.click();
  const form = page.getByRole('form', { name: 'Marcar venda' });
  const product = form.getByLabel('Produto vendido', { exact: true });
  // Já vem com o produto do pagamento; só os da closer do pagamento, sem preço.
  await expect(product).toHaveValue(padrao!.id);
  const labels = (await product.locator('option').allTextContents()).map((t) => t.trim());
  expect(labels).toContain('Nação Padrão');
  expect(labels).not.toContain('Mentoria RDV');
  expect(labels.join(' ')).not.toContain('R$');
  await expect(form.getByText('Sônia recebe o aviso para registrar o valor.')).toBeVisible();
  await shots(page, 'venda-pagou-marcar');
  await form.getByRole('button', { name: 'Marcar venda', exact: true }).click();

  await expect(page.getByText('Venda a registrar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Produto: Nação Padrão')).toBeVisible();
  await expect(page.getByText('Sônia registra a venda.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar venda' })).toHaveCount(0);
  await shots(page, 'venda-pagou-marcada');
  const marks = await owner<{ bonus: number }[]>`
    select bonus_cents as bonus from sdr_sale_marks where lead_id = ${id} and canceled_at is null`;
  expect(marks).toEqual([{ bonus: expect.any(Number) }]);

  // A closer do pagamento não teve reunião com o lead e mesmo assim o vê para registrar.
  const ctx = await browser.newContext();
  const closer = await ctx.newPage();
  await login(closer, 'sonia@npac.com.br');
  await closer.getByRole('link', { name: 'Hoje', exact: true }).filter({ visible: true }).click();
  await closer.waitForURL(/\/hoje/);
  const pendentes = closer.locator('#hoje-vendas-a-registrar');
  await expect(pendentes.getByRole('heading', { name: 'Vendas a registrar' })).toBeVisible();
  await expect(pendentes.getByText(name, { exact: true })).toBeVisible();
  await expect(pendentes.getByText('Produto: Nação Padrão')).toBeVisible();
  await pendentes.scrollIntoViewIfNeeded();
  await shots(closer, 'venda-pagou-closer-hoje');
  await pendentes.getByRole('link', { name: `Abrir ficha de ${name}` }).click();
  await closer.waitForURL(new RegExp(`/leads/${id}#vendas$`));
  await expect(closer.getByRole('link', { name: 'Registrar venda', exact: true })).toBeVisible();
  await ctx.close();
});

test('sem reunião realizada, a ficha leva a lançar a reunião e depois a marcar a venda', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead pagou sem reunião ${Date.now().toString(36)}`;
  const id = await paidLead(page, name, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/leads/${id}`);

  await expect(saleOption(page)).toHaveText('Venda Fechada 🏆 (depois da reunião realizada)');
  await expect(page.getByRole('button', { name: 'Marcar venda', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Para marcar a venda, marque antes a reunião como realizada.'),
  ).toBeVisible();
  await shots(page, 'venda-pagou-sem-reuniao');
  await page.getByRole('link', { name: 'A reunião já aconteceu', exact: true }).click();
  await page.waitForURL(new RegExp(`/leads/${id}#reunioes$`));
  await expect(page.getByLabel('A reunião já aconteceu', { exact: true })).toBeChecked();
  const when = page.getByLabel('Quando aconteceu (Brasília)', { exact: true });
  await expect(when).toBeInViewport();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() - 86_400_000),
  );
  await when.fill(`${day}T15:00`);
  await page.getByRole('button', { name: 'Lançar como realizada', exact: true }).click();

  // Com a reunião realizada, o "Marcar venda" aparece ao lado do "Mover para".
  await expect(page.getByRole('button', { name: 'Marcar venda', exact: true })).toBeVisible();
  await expect(saleOption(page)).toHaveText('Venda Fechada 🏆 (use “Marcar venda”)');
});

test('a closer do pagamento não marca a venda pelo SDR', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const id = await paidLead(page, `Lead pagou closer ${Date.now().toString(36)}`, true);
  // Sai da tela antes de trocar de usuário: a mudança do lead dispara o aviso ao vivo e a recarga
  // do Dashboard abortava o `goto('/login')` seguinte (net::ERR_ABORTED no CI).
  await page.goto('about:blank');
  await page.context().clearCookies();
  await login(page, 'sonia@npac.com.br');
  await page.goto(`/leads/${id}`);
  await expect(page.getByText('Pagamento a completar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marcar venda' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'A reunião já aconteceu' })).toHaveCount(0);
});

/** `datetime-local` de Brasília, ontem às 15:00. */
const yesterday = () =>
  `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() - 86_400_000),
  )}T15:00`;

test('Pipeline: mover para Agendou Pagamento sem reunião pede a que já aconteceu (NPAC-65)', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead reunião passada ${Date.now().toString(36)}`;
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      instagram: `@passada.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
      stageKey: 'EM_FOLLOW',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: 'Pipeline', exact: true }).filter({ visible: true }).click();
  await page.waitForURL(/\/pipeline/);
  const search = page.getByLabel('Buscar no Pipeline', { exact: true });
  await search.fill(name);
  await search.press('Enter');
  await page
    .getByRole('combobox', { name: `Mover ${name} para`, exact: true })
    .selectOption('AGENDOU_PAGAMENTO');
  const dialog = page.getByRole('dialog', { name: `Mover ${name} para Agendou Pagamento 💳` });
  await expect(dialog.getByText('A reunião já aconteceu', { exact: true })).toBeVisible();
  await dialog.getByLabel('Quando aconteceu (Brasília)', { exact: true }).fill(yesterday());
  await dialog.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Sônia' });
  await dialog.getByLabel('Produto', { exact: true }).selectOption({ index: 1 });
  await shots(page, 'reuniao-passada-janelinha');
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const paymentColumn = page.getByRole('region', { name: 'Agendou Pagamento 💳' });
  await expect(paymentColumn.getByText(name, { exact: true })).toBeVisible();
  const [m] = await owner<{ outcome: string; same: boolean }[]>`
    select outcome, outcome_at = scheduled_at as same from meetings where lead_id = ${id}`;
  expect(m).toEqual({ outcome: 'DONE', same: true });
});

test('cadastro direto em Agendou Pagamento com a reunião que já aconteceu (NPAC-65)', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead cadastro pagamento ${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page
    .getByLabel('Instagram', { exact: true })
    .fill(`@cad.pag.${Date.now()}.${Math.floor(Math.random() * 1e6)}`);
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  await page.getByLabel('Etapa', { exact: true }).selectOption('AGENDOU_PAGAMENTO');
  await expect(page.getByText('A reunião já aconteceu', { exact: true })).toBeVisible();
  await page.getByLabel('Quando aconteceu (Brasília)', { exact: true }).fill(yesterday());
  await page.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Sônia' });
  const product = page.getByLabel('Produto', { exact: true });
  const padrao = (await product.locator('option').allTextContents()).find((t) =>
    t.includes('Nação Padrão'),
  )!;
  await product.selectOption({ label: padrao.trim() });
  await page.getByLabel('Já pagou uma entrada').check();
  await shots(page, 'reuniao-passada-cadastro');
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  created.push(id);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Pagamento a completar', { exact: true })).toBeVisible();
  const reunioes = page.locator('section', {
    has: page.getByRole('heading', { name: 'Reuniões' }),
  });
  await expect(reunioes.getByText('Realizada', { exact: true })).toBeVisible();
  // Com a reunião realizada, o SDR já pode marcar a venda quando o cliente pagar (NPAC-68).
  await expect(page.getByRole('button', { name: 'Marcar venda', exact: true })).toBeVisible();
  const [m] = await owner<
    { outcome: string }[]
  >`select outcome from meetings where lead_id = ${id}`;
  expect(m?.outcome).toBe('DONE');
});
