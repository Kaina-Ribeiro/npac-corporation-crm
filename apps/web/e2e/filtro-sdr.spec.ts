import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { userCookieName } from '../lib/user-cookie';
import { E2E_DB, E2E_PASSWORD, WEB_ORIGIN } from './env.js';

// NPAC-66 (Igor, 23/11/2026): o SDR vê só o próprio nome no filtro de SDR de Relatórios, Pipeline
// e Leads, sem "Todos"; a liderança continua escolhendo qualquer SDR.
const owner = ownerSql(E2E_DB);

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

const userId = async (email: string) =>
  (await owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;

const menu = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

/** Abre a tela pelo menu lateral, como a pessoa faz. */
async function abrir(page: Page, item: 'Relatórios' | 'Pipeline' | 'Leads', url: RegExp) {
  await menu(page).getByRole('link', { name: item, exact: true }).click();
  await page.waitForURL(url);
}

const opcoes = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true }).locator('option');

test('SDR vê só o próprio nome no filtro de SDR de Relatórios, Pipeline e Leads', async ({
  page,
}) => {
  await login(page, 'igor@npac.com.br');

  await abrir(page, 'Relatórios', /\/relatorios/);
  await expect(opcoes(page, 'SDR do relatório')).toHaveText(['Igor']);
  await expect(opcoes(page, 'Closer do relatório').first()).toHaveText('Todos no meu escopo');

  await abrir(page, 'Pipeline', /\/pipeline/);
  await page.getByText('Filtrar e ordenar', { exact: true }).click();
  await expect(opcoes(page, 'Responsável SDR')).toHaveText(['Igor']);

  await abrir(page, 'Leads', /\/leads/);
  await page.getByText('Filtrar e ordenar', { exact: true }).filter({ visible: true }).click();
  await expect(opcoes(page, 'Responsável SDR')).toHaveText(['Igor']);
});

test('SDR com cookie antigo de outro SDR abre no próprio nome, com os próprios leads', async ({
  page,
  context,
}) => {
  const [igorId, aleId] = [await userId('igor@npac.com.br'), await userId('ale@npac.com.br')];
  await login(page, 'igor@npac.com.br');
  const nome = `Filtro SDR do Igor ${Date.now()}`;
  const criado = await page.request.post('/api/leads', {
    data: {
      name: nome,
      instagram: `@filtro.igor.${Date.now()}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(criado.ok()).toBe(true);
  // Filtro lembrado de antes da correção: o SDR tinha escolhido a Ale.
  await context.addCookies(
    (
      [
        ['npac_f_leads', '/leads'],
        ['npac_f_pipe', '/pipeline'],
        ['npac_f_rel', '/relatorios'],
      ] as const
    ).map(([prefix, path]) => ({
      name: userCookieName(prefix, igorId),
      value: `sdrId=${aleId}`,
      url: `${WEB_ORIGIN}${path}`,
    })),
  );

  await abrir(page, 'Leads', /\/leads/);
  await expect(page.getByText(nome).filter({ visible: true })).toBeVisible();
  await page.getByText('Filtrar e ordenar', { exact: true }).filter({ visible: true }).click();
  await expect(opcoes(page, 'Responsável SDR')).toHaveText(['Igor']);

  await abrir(page, 'Pipeline', /\/pipeline/);
  await expect(page.getByText(nome).filter({ visible: true })).toBeVisible();

  await abrir(page, 'Relatórios', /\/relatorios/);
  await expect(opcoes(page, 'SDR do relatório')).toHaveText(['Igor']);
  await expect(page.getByText('Não foi possível carregar.')).toHaveCount(0);
});

test('liderança continua escolhendo qualquer SDR', async ({ page }) => {
  await login(page, 'ana@npac.com.br');
  await abrir(page, 'Relatórios', /\/relatorios/);
  const rel = await opcoes(page, 'SDR do relatório').allTextContents();
  expect(rel[0]).toBe('Todos no meu escopo');
  expect(rel).toEqual(expect.arrayContaining(['Ale', 'Murilo', 'Igor']));

  await abrir(page, 'Leads', /\/leads/);
  await page.getByText('Filtrar e ordenar', { exact: true }).filter({ visible: true }).click();
  const leads = await opcoes(page, 'Responsável SDR').allTextContents();
  expect(leads[0]).toBe('Todos');
  expect(leads).toEqual(expect.arrayContaining(['Ale', 'Murilo', 'Igor']));
});
