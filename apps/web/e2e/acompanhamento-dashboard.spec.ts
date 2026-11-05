import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`update "user" set role = 'DIRETOR' where email = 'diretor@npac.com.br'`;
  await owner`insert into mentoria_mentorados (nome, nome_norm, status, tipo_mentoria, tipo_cadastro, data_entrada_texto)
    select 'Mentorado Fictício ' || lpad(g::text, 2, '0'), 'mentorado ficticio ' || lpad(g::text, 2, '0'),
      case when g % 5 = 0 then 'EM_RISCO' when g % 3 = 0 then 'EM_ATENCAO' else 'ENGAJADO' end,
      case when g % 2 = 0 then 'Mentoria Fictícia A' else 'Mentoria Fictícia B' end, 'Individual', '01/03/2026'
    from generate_series(1, 55) g`;
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Ágata Fictícia', 'agata ficticia', 'ENGAJADO')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = ${email}`;
}

/** Nome de cada linha (texto da célula ou valor do campo, quando a célula é editável). */
const nomes = (page: Page) =>
  page
    .getByRole('table', { name: 'Mentorados' })
    .locator('tbody tr td:first-child')
    .evaluateAll((tds) =>
      tds.map(
        (td) =>
          (td.querySelector('input') as HTMLInputElement | null)?.value ??
          td.textContent?.trim() ??
          '',
      ),
    );

test('tabela mostra os importados em ordem A–Z', async ({ page }) => {
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  const primeira = await nomes(page);
  expect(primeira).toHaveLength(50);
  expect(primeira[0]).toBe('Ágata Fictícia');
  expect(primeira[1]).toBe('Mentorado Fictício 01');
  await page.getByRole('button', { name: 'Carregar mais' }).click();
  await expect.poll(() => nomes(page).then((n) => n.length)).toBe(56);
  await expect(page.getByRole('button', { name: 'Carregar mais' })).toHaveCount(0);
});

test('busca por nome sem acento acha o registro e a URL não traz o termo; nenhuma URL de paginação traz nome', async ({
  page,
}) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/dashboard');
  await page.getByRole('button', { name: 'Carregar mais' }).click();
  await page.getByRole('searchbox', { name: 'Buscar mentorados' }).fill('AGATA ficticia');
  await expect.poll(() => nomes(page)).toEqual(['Ágata Fictícia']);
  expect(page.url()).not.toMatch(/agata/i);
  for (const u of urls) {
    expect(decodeURIComponent(u).toLowerCase()).not.toContain('agata');
    expect(decodeURIComponent(u).toLowerCase()).not.toContain('mentorado fict');
  }
});

test('DIRETOR e Carla veem a mesma base', async ({ page, browser }) => {
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/dashboard');
  const carla = await nomes(page);
  expect(carla).toHaveLength(50);
  const ctx = await browser.newContext();
  const outra = await ctx.newPage();
  await login(outra, 'diretor@npac.com.br');
  await outra.goto('/acompanhamento/dashboard');
  expect(await nomes(outra)).toEqual(carla);
  await ctx.close();
});

const abrir = async (page: Page) => {
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/dashboard');
  await expect(page.getByRole('table', { name: 'Mentorados' })).toBeVisible();
};
const card = (page: Page, nome: string) => page.getByRole('region', { name: nome });

test('cards mostram contagem por status e os nomes do grupo', async ({ page }) => {
  await abrir(page);
  // 55 fictícios: múltiplos de 5 em risco (11); múltiplos de 3 que não são de 5 em atenção (15).
  await expect(card(page, 'Em risco').getByRole('button', { name: /Em risco/ })).toContainText(
    '11',
  );
  await expect(card(page, 'Em atenção').getByRole('button', { name: /Em atenção/ })).toContainText(
    '15',
  );
  await expect(card(page, 'Engajados').getByRole('button', { name: /Engajados/ })).toContainText(
    '30',
  );
  await expect(card(page, 'Em risco').getByText('Mentorado Fictício 05')).toBeVisible();
});

test('clicar no card Em risco filtra a tabela', async ({ page }) => {
  await abrir(page);
  await card(page, 'Em risco')
    .getByRole('button', { name: /Em risco/ })
    .click();
  await expect.poll(() => nomes(page).then((n) => n.length)).toBe(11);
  await expect(page.getByRole('heading', { name: /Em risco/ })).toBeVisible();
});

test('etiqueta de mentoria mostra contagem e clicar lista só ela', async ({ page }) => {
  await abrir(page);
  const tag = page.getByRole('button', { name: /Mentoria Fictícia A/ });
  await expect(tag).toContainText('27');
  await tag.click();
  await expect.poll(() => nomes(page).then((n) => n.length)).toBe(27);
});

test('editar o nome na célula e sair do campo grava (recarregar mantém)', async ({ page }) => {
  await abrir(page);
  const campo = page.getByRole('textbox', { name: 'Nome de Mentorado Fictício 01' });
  await campo.fill('Mentorado Fictício 01 Silva');
  await campo.blur();
  await expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { n: number }[]
          >`select count(*)::int as n from mentoria_mentorados where nome = 'Mentorado Fictício 01 Silva'`
        )[0]?.n,
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Nome de Mentorado Fictício 01 Silva' }),
  ).toHaveValue('Mentorado Fictício 01 Silva');
});

test('linha Em risco tem a classe de cor do status e o status só aceita os três valores', async ({
  page,
}) => {
  await abrir(page);
  const linha = page.getByRole('row', { name: /Mentorado Fictício 05/ });
  await expect(linha).toHaveAttribute('data-status', 'EM_RISCO');
  const status = page.getByRole('combobox', { name: 'Status de Mentorado Fictício 05' });
  await expect(status.locator('option')).toHaveText(['Engajado', 'Em atenção', 'Em risco']);
  await status.selectOption('ENGAJADO');
  await expect(linha).toHaveAttribute('data-status', 'ENGAJADO');
  await expect
    .poll(
      async () =>
        (
          await owner<
            { s: string }[]
          >`select status as s from mentoria_mentorados where nome_norm = 'mentorado ficticio 05'`
        )[0]?.s,
    )
    .toBe('ENGAJADO');
});

test('tipo aceita texto livre', async ({ page }) => {
  await abrir(page);
  const tipo = page.getByRole('textbox', { name: 'Tipo de Mentorado Fictício 02' });
  await tipo.fill('Casal com filhos (texto livre)');
  await tipo.blur();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { t: string }[]
          >`select tipo_cadastro as t from mentoria_mentorados where nome_norm = 'mentorado ficticio 02'`
        )[0]?.t,
    )
    .toBe('Casal com filhos (texto livre)');
});

test('mobile: nomes do grupo aparecem sem tocar no card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await expect(card(page, 'Em risco').getByText('Mentorado Fictício 05')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

// NPAC-33: faixa de status compacta, cabeçalho com ação principal e estado vazio.
test('o card inteiro filtra: clicar no número seleciona com a barra dourada', async ({ page }) => {
  await abrir(page);
  const botao = page.getByRole('button', { name: /Em risco/ });
  await botao.getByText('11', { exact: true }).click(); // o número, não o rótulo
  await expect(botao).toHaveAttribute('aria-pressed', 'true');
  await expect(botao).toHaveClass(/card-sel/);
  await expect.poll(() => nomes(page).then((n) => n.length)).toBe(11);
  // A barra dourada cresce de cima para baixo.
  await expect.poll(() => botao.evaluate((el) => getComputedStyle(el, '::after').scale)).toBe('1');
  await botao.click();
  await expect(botao).toHaveAttribute('aria-pressed', 'false');
  await expect(botao).not.toHaveClass(/card-sel/);
});

test('zero não repete "Ninguém neste status"', async ({ page }) => {
  await owner`delete from mentoria_mentorados where status = 'EM_ATENCAO'`;
  await abrir(page);
  await expect(page.getByRole('button', { name: /Em atenção/ })).toContainText('0');
  await expect(page.getByText('Ninguém neste status.')).toHaveCount(0);
  await expect(card(page, 'Em atenção').getByRole('list')).toHaveCount(0);
});
