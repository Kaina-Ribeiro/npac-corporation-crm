import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * NPAC-65 (Igor, 23/11/2026, "4.1A, 4.3A, 2.1A"): venda direta do SDR, sem reunião, à vista, no cartão
 * ou no boleto. Na ficha (botão "Venda direta" ao lado do "Mover para") e no cadastro em Venda Fechada
 * ("Teve reunião ou foi venda direta?"), o SDR escolhe o closer e o produto; o closer põe o valor.
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

async function plainLead(page: Page, name: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      instagram: `@direta.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
      stageKey: 'EM_FOLLOW',
    },
  });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  return id;
}

test('ficha: o SDR marca a venda direta e a closer escolhida vê no Hoje', async ({
  page,
  browser,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead venda direta ${Date.now().toString(36)}`;
  const id = await plainLead(page, name);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/leads/${id}`);
  await expect(
    page.getByLabel('Mover para', { exact: true }).locator('option[value="VENDA"]'),
  ).toHaveText('Venda Fechada 🏆 (use “Venda direta”)');
  await page.getByRole('button', { name: 'Venda direta', exact: true }).click();
  const form = page.getByRole('form', { name: 'Venda direta' });
  await form.getByLabel('Closer', { exact: true }).selectOption({ label: 'Sônia' });
  const product = form.getByLabel('Produto vendido', { exact: true });
  // Só os produtos da closer escolhida, sem preço.
  const labels = (await product.locator('option').allTextContents()).map((t) => t.trim());
  expect(labels).toContain('Nação Padrão');
  expect(labels).not.toContain('Mentoria RDV');
  expect(labels.join(' ')).not.toContain('R$');
  await product.selectOption({ label: 'Nação Padrão' });
  await expect(
    form.getByText(
      'Venda sem reunião, à vista, no cartão ou no boleto. O lead vai para Venda e Sônia recebe o aviso para registrar o valor.',
    ),
  ).toBeVisible();
  await shots(page, 'venda-direta-ficha');
  await form.getByRole('button', { name: 'Marcar venda', exact: true }).click();

  await expect(page.getByText('Venda a registrar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Sônia registra a venda.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Venda direta' })).toHaveCount(0);
  const marks = await owner<{ meeting: string | null }[]>`
    select meeting_id as meeting from sdr_sale_marks where lead_id = ${id} and canceled_at is null`;
  expect(marks).toEqual([{ meeting: null }]);
  expect(await owner`select 1 from meetings where lead_id = ${id}`).toHaveLength(0);

  const ctx = await browser.newContext();
  const closer = await ctx.newPage();
  await login(closer, 'sonia@npac.com.br');
  await closer.getByRole('link', { name: 'Hoje', exact: true }).filter({ visible: true }).click();
  await closer.waitForURL(/\/hoje/);
  const pendentes = closer.locator('#hoje-vendas-a-registrar');
  await expect(pendentes.getByText(name, { exact: true })).toBeVisible();
  await pendentes.getByRole('link', { name: `Abrir ficha de ${name}` }).click();
  await closer.waitForURL(new RegExp(`/leads/${id}#vendas$`));
  await expect(closer.getByRole('link', { name: 'Registrar venda', exact: true })).toBeVisible();
  await ctx.close();
});

test('cadastro em Venda Fechada como venda direta (4.3A)', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const name = `Lead cadastro direta ${Date.now().toString(36)}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page
    .getByLabel('Instagram', { exact: true })
    .fill(`@cad.dir.${Date.now()}.${Math.floor(Math.random() * 1e6)}`);
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  await page.getByLabel('Etapa', { exact: true }).selectOption('VENDA');
  await expect(page.getByText('Teve reunião ou foi venda direta?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Teve reunião', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Venda direta', exact: true }).click();
  await expect(page.getByLabel('Data e hora da reunião (Brasília)', { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel('Closer', { exact: true }).selectOption({ label: 'Sônia' });
  await page.getByLabel('Produto vendido', { exact: true }).selectOption({ label: 'Nação Padrão' });
  await shots(page, 'venda-direta-cadastro');
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  created.push(id);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('Venda a registrar', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Produto: Nação Padrão')).toBeVisible();
  expect(await owner`select 1 from meetings where lead_id = ${id}`).toHaveLength(0);
});

test('com reunião realizada não aparece "Venda direta": a venda é pela reunião', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const id = await plainLead(page, `Lead com reunião ${Date.now().toString(36)}`);
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at, created_by)
    select ${id}, c.id, now() - interval '2 hours', 'DIRETO', 'DONE', now() - interval '1 hour', s.id
    from "user" c, "user" s where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;
  await page.goto(`/leads/${id}`);
  await expect(page.getByRole('button', { name: 'Marcar venda', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Venda direta' })).toHaveCount(0);
});
