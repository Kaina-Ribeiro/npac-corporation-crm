import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const FICHA = '88888888-8888-4888-8888-888888888888';

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`insert into mentoria_fichas (id, nome, nome_norm) values (${FICHA}, 'Mentorado Fictício 80', 'mentorado ficticio 80')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function abrir(page: Page, rota: string, largura = 390) {
  await page.setViewportSize({ width: largura, height: 844 });
  // Login sem código: o MFA só liga depois (como nos demais testes).
  await owner`update "user" set two_factor_enabled = false where email = 'carla@npac.com.br'`;
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto(rota);
}
const abas = (page: Page) => page.getByRole('navigation', { name: 'Abas do acompanhamento' });
const semOverflow = async (page: Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

test('abas Dashboard · Linha · + · RDV · Backup aparecem e navegam', async ({ page }) => {
  await abrir(page, '/acompanhamento/dashboard');
  await expect(abas(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação inferior' })).toBeHidden();
  await expect(abas(page).getByRole('link')).toHaveText(['Dashboard', 'Linha', 'RDV', 'Backup']);
  await abas(page).getByRole('link', { name: 'Linha' }).click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo$/);
  await abas(page).getByRole('link', { name: 'Backup' }).click();
  await page.waitForURL(/\/acompanhamento\/backup$/);
  await expect(abas(page).getByRole('link', { name: 'Backup' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('"+" abre o cadastro conforme a aba', async ({ page }) => {
  await abrir(page, '/acompanhamento/dashboard');
  await abas(page).getByRole('button', { name: 'Colar planilha' }).click();
  await expect(page.getByRole('dialog', { name: 'Importar no Dashboard' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
  await abas(page).getByRole('link', { name: 'Linha' }).click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo$/);
  await abas(page).getByRole('button', { name: 'Nova ficha' }).click();
  await expect(page.getByRole('dialog', { name: 'Nova ficha' })).toBeVisible();
});

test('"+" dentro da ficha abre Nova ficha; a ficha volta para a lista sem perder a edição salva', async ({
  page,
}) => {
  await abrir(page, `/acompanhamento/linha-do-tempo/${FICHA}`);
  const fe = page.getByRole('textbox', { name: 'Fé antes' });
  await fe.fill('Edição fictícia salva');
  await fe.blur();
  await expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();
  await page.getByRole('link', { name: 'Linha do tempo', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo$/);
  await page.getByRole('link', { name: /Mentorado Fictício 80/ }).click();
  await expect(page.getByRole('textbox', { name: 'Fé antes' })).toHaveValue(
    'Edição fictícia salva',
  );
  await abas(page).getByRole('button', { name: 'Nova ficha' }).click();
  await expect(page.getByRole('dialog', { name: 'Nova ficha' })).toBeVisible();
});

test('390 px e 375 px: sem overflow horizontal nas abas, na ficha e na gaveta', async ({
  page,
}) => {
  for (const largura of [390, 375]) {
    await abrir(page, '/acompanhamento/dashboard', largura);
    await semOverflow(page);
    await abas(page).getByRole('button', { name: 'Colar planilha' }).click();
    await semOverflow(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click();
    await page.goto(`/acompanhamento/linha-do-tempo/${FICHA}`);
    await expect(page.getByRole('textbox', { name: 'Nome da ficha' })).toBeVisible();
    await semOverflow(page);
    await page.context().clearCookies();
  }
});

test('RDV no celular: "+" abre Novo mentorado; ficha e gaveta sem overflow em 375 px', async ({
  page,
}) => {
  const PESSOA = '99999999-9999-4999-8999-999999999999';
  await owner`insert into mentoria_rdv_pessoas (id, nome, nome_norm) values (${PESSOA}, 'Casal Fictício 90', 'casal ficticio 90')`;
  await owner`insert into mentoria_rdv_eventos (pessoa_id, data_texto, data, origem) values (${PESSOA}, '01/08/2026', '2026-08-01', 'MANUAL')`;
  await abrir(page, '/acompanhamento/rdv', 375);
  await abas(page).getByRole('button', { name: 'Novo mentorado' }).click();
  await expect(page.getByRole('dialog', { name: 'Novo mentorado' })).toBeVisible();
  await semOverflow(page);
  await page.goto(`/acompanhamento/rdv/${PESSOA}`);
  await expect(page.getByRole('textbox', { name: 'Nome do mentorado' })).toBeVisible();
  await semOverflow(page);
  // "+" dentro da ficha volta para a lista já com Novo mentorado aberto (como na Linha do tempo).
  await abas(page).getByRole('button', { name: 'Novo mentorado' }).click();
  await expect(page.getByRole('dialog', { name: 'Novo mentorado' })).toBeVisible();
  await page.goto(`/acompanhamento/rdv/${PESSOA}`);
  await expect(page.getByRole('textbox', { name: 'Nome do mentorado' })).toBeVisible();
  await page.getByRole('button', { name: 'Colar vários eventos' }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Eventos colados')
    .fill('14/08/2026 - Linha fictícia com uma descrição bem comprida para testar a quebra');
  await page.getByRole('dialog').getByRole('button', { name: 'Ver prévia' }).click();
  await expect(page.getByRole('combobox', { name: /Tipo da linha/ })).toBeVisible();
  await semOverflow(page);
});

test('desktop: sem abas no rodapé nem no topo; "Tudo salvo" no cabeçalho de cada tela', async ({
  page,
}) => {
  await abrir(page, '/acompanhamento/dashboard', 1280);
  await expect(abas(page)).toBeHidden();
  // Os módulos ficam na sidebar: sem a barra de abas e sem o sobretítulo.
  await expect(page.getByRole('navigation', { name: 'Módulos do acompanhamento' })).toHaveCount(0);
  await expect(page.getByText('Acompanhamento de mentorados', { exact: true })).toHaveCount(0);
  const salvo = page.getByRole('status').filter({ hasText: 'Tudo salvo' });
  await expect(salvo).toHaveCount(1);
  await expect(
    page.locator('header').filter({ has: page.getByRole('heading', { name: 'Dashboard' }) }),
  ).toContainText('Tudo salvo');
  // Ficha da Linha do tempo (sem H1): o indicador numa linha própria no topo.
  await page
    .getByRole('navigation', { name: 'Navegação lateral' })
    .getByRole('link', { name: 'Linha do tempo', exact: true })
    .click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo$/);
  await expect(salvo).toHaveCount(1);
  await page
    .getByRole('link', { name: /Mentorado Fictício 80/ })
    .first()
    .click();
  await page.waitForURL(new RegExp(FICHA));
  await expect(salvo).toHaveCount(1);
  await expect(salvo).toBeVisible();
});
