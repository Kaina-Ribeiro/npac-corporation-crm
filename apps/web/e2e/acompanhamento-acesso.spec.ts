import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`update "user" set role = 'DIRETOR' where email = 'diretor@npac.com.br'`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

/** Login sem código; o MFA é ligado depois no banco (como nos testes da API). */
async function login(page: Page, email: string, mfa = true) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  if (mfa) await owner`update "user" set two_factor_enabled = true where email = ${email}`;
}

const sidebarLinks = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link').allInnerTexts();

test('Carla (MFA ativo) entra e vê o mesmo menu que a Diretoria (sem variação por cargo)', async ({
  page,
  browser,
}) => {
  await login(page, 'carla@npac.com.br');
  const carla = (await sidebarLinks(page)).map((t) => t.trim());
  const outra = await browser.newPage();
  await login(outra, 'diretor@npac.com.br');
  const diretor = (await sidebarLinks(outra)).map((t) => t.trim());
  expect(carla).toContain('Acompanhamento');
  // Mesmo menu; a Diretoria só tem a mais o Admin (liderança).
  expect(diretor.filter((t) => !t.startsWith('Admin'))).toEqual(carla);
  await outra.close();
});

test('telas comerciais respondem 404 para a Carla, com aviso e link para o módulo', async ({
  page,
}) => {
  await login(page, 'carla@npac.com.br');
  const res = await page.goto('/leads');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('Esta tela não faz parte do seu acesso.')).toBeVisible();
  await page.getByRole('link', { name: 'Ir para o Acompanhamento' }).click();
  await page.waitForURL(/\/acompanhamento\/dashboard/);
});

test('SDR e HEAD não veem o item Acompanhamento na sidebar, na barra e no Ctrl+K', async ({
  browser,
}) => {
  for (const email of ['ale@npac.com.br', 'ronaldo@npac.com.br']) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, email, false);
    expect(await sidebarLinks(page)).not.toContain('Acompanhamento');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Buscar leads ou ir para…' }).fill('Acompanhamento');
    await expect(page.getByRole('option', { name: /Acompanhamento/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/mais');
    await expect(page.getByRole('link', { name: /Acompanhamento/ })).toHaveCount(0);
    await ctx.close();
  }
});

test('rotas do módulo respondem 404 para SDR', async ({ page }) => {
  await login(page, 'ale@npac.com.br', false);
  for (const rota of ['/acompanhamento', '/acompanhamento/dashboard', '/acompanhamento/backup']) {
    const res = await page.goto(rota);
    expect(res?.status(), rota).toBe(404);
  }
});

test('Diretoria sem MFA vê o aviso para ativar o autenticador', async ({ page }) => {
  await login(page, 'diretor@npac.com.br', false);
  await page.goto('/acompanhamento/backup');
  await expect(page.getByText('Ative a verificação em duas etapas')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ativar o autenticador' })).toHaveAttribute(
    'href',
    '/conta/mfa',
  );
});

test('390 px: sem overflow horizontal em /acompanhamento/backup', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/backup');
  await expect(
    page.getByRole('heading', { name: 'Importação, exportação e backup' }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('gaveta de importação mostra "X entram · Y já existem" e exige escolha para linha pendente', async ({
  page,
}) => {
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Fictício 01', 'mentorado ficticio 01', 'ENGAJADO')`;
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/backup');
  await page.getByRole('button', { name: 'Importar no Dashboard' }).click();
  const gaveta = page.getByRole('dialog', { name: 'Importar no Dashboard' });
  await gaveta
    .getByLabel('Linhas da planilha')
    .fill(
      [
        'Mentorado Fictício 01\tIndividual\tMentoria A\t\tEngajado',
        'Mentorado Fictício 02\tIndividual\tMentoria A\t\tEngajado',
        'Mentorado Fictício 03\tIndividual\t\t\tEm risco',
      ].join('\n'),
    );
  await gaveta.getByRole('button', { name: 'Pré-visualizar' }).click();
  await expect(gaveta.getByText('2 entram · 1 já existem')).toBeVisible();
  const confirmar = gaveta.getByRole('button', { name: 'Confirmar importação' });
  await expect(confirmar).toBeDisabled();
  await gaveta.getByLabel('Tipo de mentoria da linha 3').fill('Mentoria B');
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(gaveta.getByText('2 gravados · 1 ignorados')).toBeVisible();
  const [n] = await owner<{ n: number }[]>`select count(*)::int as n from mentoria_mentorados`;
  expect(n?.n).toBe(3);
});

test('Exportar .json baixa arquivo com nome só de módulo e data', async ({ page }) => {
  await login(page, 'carla@npac.com.br');
  await page.goto('/acompanhamento/backup');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar .json do Dashboard' }).click();
  expect((await download).suggestedFilename()).toMatch(
    /^acompanhamento-dashboard-\d{4}-\d{2}-\d{2}\.json$/,
  );
});
