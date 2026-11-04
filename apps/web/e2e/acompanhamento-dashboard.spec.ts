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
