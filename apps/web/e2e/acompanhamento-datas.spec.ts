import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/**
 * Datas digitadas no Chrome (NPAC-43, print da Eduarda, 18/11/2026). Sem `min`/`max`, o campo de
 * data aceita ano de 2 dígitos ("25" vira 0025) ou de 5 ("20255"): a API recusa com "Data
 * inválida" e o aviso ficava na tela mesmo depois de corrigir a data. O ano é o último pedaço do
 * campo em pt-BR (dd/mm/aaaa) e em inglês (mm/dd/yyyy): o teste digita só nele.
 */

const owner = ownerSql(E2E_DB);
/** `seedInscricaoId(5)`: "Mentorada Fictícia 06". */
const FICHA_06 = '00000000-0000-4000-8000-000000000005';

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Dia e mês de 21/07, depois o ano digitado como a pessoa, no último pedaço do campo. */
async function digitarAno(page: Page, rotulo: string, ano: string) {
  const campo = page.getByLabel(rotulo, { exact: true });
  // Foco novo começa no primeiro pedaço; dois Tabs levam ao ano.
  await campo.blur();
  await campo.fill('2024-07-21');
  await campo.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type(ano);
  return campo;
}

const valido = (campo: ReturnType<Page['getByLabel']>) =>
  campo.evaluate((e) => (e as HTMLInputElement).validity.valid);

async function abrirNova(page: Page) {
  await entrar(page, 'duda');
  await page.goto('/acompanhamento/mentorados/nova');
  await page.getByLabel('Nome completo').fill('Mentorada Fictícia 70');
}

test('cadastro: ano de 2 dígitos fica no campo, sem ir à API', async ({ page }) => {
  await abrirNova(page);
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/mentoria/inscricoes')) posts.push(r.url());
  });
  const campo = await digitarAno(page, 'Data de compra', '25');
  await expect(campo).toHaveValue('0025-07-21');
  expect(await valido(campo)).toBe(false);
  await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
  await expect(page).toHaveURL(/\/acompanhamento\/mentorados\/nova/);
  expect(posts).toEqual([]);
});

test('cadastro: o ano não passa de 4 dígitos e 21/07/2025 cadastra', async ({ page }) => {
  await abrirNova(page);
  const campo = await digitarAno(page, 'Data de compra', '20255');
  await expect(campo).toHaveValue(/^\d{4}-07-21$/);
  await digitarAno(page, 'Data de compra', '2025');
  await expect(campo).toHaveValue('2025-07-21');
  await page.getByLabel('Status financeiro').selectOption({ label: 'Quitado' });
  await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\/[0-9a-f-]{36}/);
  await expect(page.getByLabel('Data da compra', { exact: true })).toHaveValue('2025-07-21');
});

test('cadastro: o aviso de erro sai quando a pessoa corrige um campo', async ({ page }) => {
  await abrirNova(page);
  await page.getByLabel('WhatsApp com DDD').fill('123');
  await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
  const aviso = page.getByText('WhatsApp inválido. Use o número com DDD.');
  await expect(aviso).toBeVisible();
  await page.getByLabel('WhatsApp com DDD').fill('11 90000-0070');
  await expect(aviso).toBeHidden();
});

test('ficha: data da compra com ano errado avisa sem enviar', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto(`/acompanhamento/ficha/${FICHA_06}?aba=inscricao`);
  const patches: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && r.url().includes('/api/mentoria/inscricoes/'))
      patches.push(r.url());
  });
  const campo = await digitarAno(page, 'Data da compra', '25');
  await campo.blur();
  await expect(page.getByText(/Data inválida\. Confira o ano/)).toBeVisible();
  expect(patches).toEqual([]);
});
