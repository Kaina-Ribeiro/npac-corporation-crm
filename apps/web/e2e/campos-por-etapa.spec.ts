import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/** Campos por etapa (NPAC-38): cadastro, ficha ("Mover para"), Pipeline e lista. */
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

async function newLead(page: Page, name: string, instagram: string) {
  const res = await page.request.post('/api/leads', {
    data: { name, instagram, incomeBand: 'R5_8K', source: 'BIO' },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

test('cadastro em Agendado Direto pede a reunião e a cria junto com o lead', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads/new');
  const stage = page.getByLabel('Etapa', { exact: true });
  // Etapa comum: próximo contato.
  await expect(page.getByLabel('Próximo contato (Brasília)', { exact: true })).toBeVisible();
  await stage.selectOption('AGENDADO_DIRETO');
  await expect(page.getByLabel('Próximo contato (Brasília)', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Data e hora da reunião (Brasília)', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Closer da reunião', { exact: true })).toBeVisible();
  // No-Show: só muda o rótulo.
  await stage.selectOption('NO_SHOW');
  await expect(page.getByLabel('Tentar remarcar em (Brasília)', { exact: true })).toBeVisible();
  // Agendou Pagamento: data + produto + valor, que começa com o preço do produto.
  await stage.selectOption('AGENDOU_PAGAMENTO');
  const product = page.getByLabel('Produto', { exact: true });
  await product.selectOption({ index: 1 });
  const products = (await (await page.request.get('/api/finance/products')).json()) as {
    id: string;
    priceCents: number;
  }[];
  const productId = await product.inputValue();
  const chosen = products.find((p) => p.id === productId);
  await expect(page.getByLabel('Valor combinado (R$)', { exact: true })).toHaveValue(
    (chosen!.priceCents / 100).toFixed(2).replace('.', ','),
  );
  await expect(
    page.getByLabel('Data combinada do pagamento (Brasília)', { exact: true }),
  ).toBeVisible();
  // Sem Perfil: motivo, com a caixa de texto só no Outro.
  await stage.selectOption('PERDIDO');
  await expect(page.getByLabel('Motivo', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Qual motivo?', { exact: true })).toHaveCount(0);
  await page.getByLabel('Motivo', { exact: true }).selectOption('OUTRO');
  await expect(page.getByLabel('Qual motivo?', { exact: true })).toBeVisible();

  await stage.selectOption('AGENDADO_DIRETO');
  await page.getByLabel('Nome', { exact: true }).fill('Lead agendado no cadastro');
  await page.getByLabel('Instagram', { exact: true }).fill('@agendado.cadastro');
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  await page
    .getByLabel('Data e hora da reunião (Brasília)', { exact: true })
    .fill('2030-03-12T15:00');
  await page.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Sônia' });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/etapa-cadastro-${w}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Lead agendado no cadastro' }),
  ).toBeVisible();
  // A reunião foi criada na mesma transação, com a origem da etapa.
  await expect(page.getByText('12/03/2030, 15:00 · Sônia')).toBeVisible();
  await expect(page.getByText('Agendado Direto · P1 · SDR Ale')).toBeVisible();
  const id = page.url().split('/').pop()!;
  const [m] = await owner<{ origin: string }[]>`select origin from meetings where lead_id = ${id}`;
  expect(m?.origin).toBe('DIRETO');
});

test('ficha: Sem Perfil + Outro exige o texto; Agendou Pagamento pede data, produto e valor', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const id = await newLead(page, 'Lead sem perfil ficha', '@sem.perfil.ficha');
  await page.goto(`/leads/${id}`);
  const move = page.getByLabel('Mover para', { exact: true });
  await move.selectOption('AGENDOU_PAGAMENTO');
  await expect(page.getByLabel('Produto', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Valor combinado (R$)', { exact: true })).toBeVisible();
  await page.getByLabel('Produto', { exact: true }).selectOption({ index: 1 });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/etapa-ficha-${w}.png`, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  // Cancelar não muda nada.
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(move).toHaveValue('SONDAGEM');
  await expect(page.getByLabel('Produto', { exact: true })).toHaveCount(0);

  await move.selectOption('PERDIDO');
  await page.getByLabel('Motivo', { exact: true }).selectOption('OUTRO');
  const other = page.getByLabel('Qual motivo?', { exact: true });
  await expect(other).toHaveAttribute('maxlength', '80');
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  // Sem o texto, o navegador barra o envio e a etapa não muda.
  expect(await other.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await expect(page.getByText('Criando Relacionamento · P2 · SDR Ale')).toBeVisible();
  await other.fill('Mora fora do Brasil');
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(page.getByText('Sem Perfil · P2 · SDR Ale')).toBeVisible();
  await expect(page.getByText('Motivo: Mora fora do Brasil')).toBeVisible();
  await expect(page.getByText('Etapa alterada · motivo do Sem Perfil')).toBeVisible();
});

test('pipeline e lista: mudar para etapa com dados abre a janelinha; cancelar devolve', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  const name = 'Lead janelinha pipeline';
  await newLead(page, name, '@janelinha.pipeline');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pipeline');
  const select = page.getByRole('combobox', { name: `Mover ${name} para`, exact: true });
  await select.selectOption('AGENDOU_PAGAMENTO');
  const dialog = page.getByRole('dialog', { name: `Mover ${name} para Agendou Pagamento 💳` });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Produto', { exact: true }).selectOption({ index: 1 });
  await expect(dialog.getByLabel('Valor combinado (R$)', { exact: true })).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // O card continua na etapa antiga.
  await expect(select).toHaveValue('SONDAGEM');
  await expect(
    page.getByRole('region', { name: 'Criando Relacionamento' }).getByText(name, { exact: true }),
  ).toBeVisible();

  // Agendado: reunião + closer na janelinha (print em cada largura).
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    if (w < 768) await page.getByRole('button', { name: /^Criando Relacionamento/ }).click();
    await select.selectOption('AGENDADO_FOLLOW');
    const meeting = page.getByRole('dialog', { name: `Mover ${name} para Agendado do Follow` });
    await expect(
      meeting.getByLabel('Data e hora da reunião (Brasília)', { exact: true }),
    ).toBeVisible();
    await expect(meeting.getByLabel('Closer da reunião', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `test-results/etapa-janelinha-${w}.png`,
      animations: 'disabled',
    });
    await meeting.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(select).toHaveValue('SONDAGEM');
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await select.selectOption('AGENDOU_PAGAMENTO');
  await dialog
    .getByLabel('Data combinada do pagamento (Brasília)', { exact: true })
    .fill('2030-04-01T10:00');
  await dialog.getByLabel('Produto', { exact: true }).selectOption({ index: 1 });
  await dialog.getByLabel('Valor combinado (R$)', { exact: true }).fill('1234,50');
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Agendou Pagamento 💳' }).getByText(name, { exact: true }),
  ).toBeVisible();
  const [row] = await owner<{ cents: number }[]>`
    select payment_amount_cents as cents from leads where name = ${name}`;
  expect(row?.cents).toBe(123450);

  // Lista: a célula também abre a janelinha; a ação em massa não oferece Agendados nem Pagamento.
  await page.goto('/leads');
  await page
    .getByRole('combobox', { name: `Etapa de ${name}`, exact: true })
    .selectOption('PERDIDO');
  const reason = page.getByRole('dialog', { name: `Mover ${name} para Sem Perfil` });
  await expect(reason.getByLabel('Motivo', { exact: true })).toBeVisible();
  await reason.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('combobox', { name: `Etapa de ${name}`, exact: true })).toHaveValue(
    'AGENDOU_PAGAMENTO',
  );
  await page
    .getByRole('checkbox', { name: `Selecionar ${name}` })
    .filter({ visible: true })
    .check();
  const bulk = page.getByRole('combobox', { name: 'Mover para etapa', exact: true });
  const options = await bulk.locator('option').allTextContents();
  expect(options).not.toContain('Agendado Direto');
  expect(options).not.toContain('Agendado do Follow');
  expect(options).not.toContain('Agendou Pagamento 💳');
  expect(options).toContain('Sem Perfil');
  await bulk.selectOption('PERDIDO');
  const all = page.getByRole('dialog', { name: 'Mover 1 lead para Sem Perfil' });
  await all.getByLabel('Motivo', { exact: true }).selectOption('SEM_INTERESSE');
  await page.screenshot({ path: 'test-results/etapa-massa-1440.png', animations: 'disabled' });
  await all.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(page.getByText('1 lead atualizado')).toBeVisible();
  const [lost] = await owner<{ reason: string; cents: number | null }[]>`
    select lost_reason as reason, payment_amount_cents as cents from leads where name = ${name}`;
  expect(lost).toEqual({ reason: 'SEM_INTERESSE', cents: null });
});

/** `datetime-local` em Brasília. */
const spInput = (d: Date) =>
  d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T').slice(0, 16);

test('Agendou Pagamento parcial (NPAC-41): entrada e data do restante até o registro da venda', async ({
  page,
  browser,
}) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads/new');
  await page.getByLabel('Nome', { exact: true }).fill('Lead com entrada');
  await page.getByLabel('Instagram', { exact: true }).fill('@lead.entrada');
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R8_15K');
  await page.getByLabel('Origem', { exact: true }).selectOption('BIO');
  await page.getByLabel('Etapa', { exact: true }).selectOption('AGENDOU_PAGAMENTO');
  await expect(page.getByLabel('Entrada já paga (R$)', { exact: true })).toHaveCount(0);
  await page.getByLabel('Já pagou uma entrada').check();
  const due = spInput(new Date(Date.now() + 10 * 86_400_000));
  await page.getByLabel('Data combinada para o restante (Brasília)', { exact: true }).fill(due);
  const product = page.getByLabel('Produto', { exact: true });
  const nacao = (await product.locator('option').allTextContents()).find((t) =>
    t.includes('Nação Padrão'),
  )!;
  await product.selectOption({ label: nacao.trim() });
  await page.getByLabel('Valor combinado (R$)', { exact: true }).fill('3000');
  // Entrada igual ao valor: o formulário avisa antes da API.
  await page.getByLabel('Entrada já paga (R$)', { exact: true }).fill('3000');
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await expect(page.getByText('A entrada precisa ser maior que zero e menor')).toBeVisible();
  await page.getByLabel('Entrada já paga (R$)', { exact: true }).fill('1000');
  await expect(page.getByText('Restante: R$ 2.000,00')).toBeVisible();
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/pagamento-parcial-cadastro-${w}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Cadastrar lead', exact: true }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  await expect(page.getByText(/Restante combinado para:/)).toBeVisible();
  await expect(
    page.getByText(/entrada de R\$\s1\.000,00 paga, faltam R\$\s2\.000,00/),
  ).toBeVisible();
  const [row] = await owner<{ entry: number }[]>`
    select payment_entry_cents as entry from leads where id = ${id}`;
  expect(row?.entry).toBe(100_000);

  // Botão do Instagram (NPAC-41, "3B"): abre o perfil, como o do WhatsApp abre a conversa.
  const insta = page.getByRole('link', { name: 'Instagram', exact: true });
  await expect(insta).toHaveAttribute('href', 'https://www.instagram.com/lead.entrada/');
  await expect(insta).toHaveAttribute('target', '_blank');
  await expect(page.getByText('@lead.entrada', { exact: true })).toBeVisible();
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/pagamento-parcial-ficha-${w}.png`,
      animations: 'disabled',
    });
  }

  // Quem registra a venda já recebe Parcial com a entrada e o restante na data combinada.
  const ctx = await browser.newContext();
  const head = await ctx.newPage();
  await login(head, 'ronaldo@npac.com.br');
  await head.goto(`/leads/${id}`);
  await head.getByRole('button', { name: 'Registrar venda', exact: true }).click();
  const form = head.getByRole('form', { name: 'Registrar venda' });
  await form.getByRole('button', { name: 'Continuar venda', exact: true }).click();
  await expect(form.getByLabel('Forma de pagamento', { exact: true })).toHaveValue('PARTIAL');
  await expect(form.getByLabel('Entrada recebida (R$)', { exact: true })).toHaveValue('1000.00');
  await expect(form.getByLabel('Parcela 1 (R$)', { exact: true })).toHaveValue('2000.00');
  await expect(form.getByLabel('Vencimento 1 (Brasília)', { exact: true })).toHaveValue(due);
  await head.screenshot({
    path: 'test-results/pagamento-parcial-venda-1280.png',
    fullPage: true,
    animations: 'disabled',
  });
  await ctx.close();
});
