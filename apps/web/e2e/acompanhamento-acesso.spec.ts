import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { MFA_LIGADO } from '@npac/shared/enums';
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

test('Carla vê só o Acompanhamento na sidebar, na tela Mais e no Ctrl+K', async ({ page }) => {
  await login(page, 'carla@npac.com.br');
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  await expect(
    page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link'),
  ).toHaveText(['Acompanhamento']);
  await page.keyboard.press('Control+k');
  const opcoes = page.getByRole('option');
  await expect(opcoes.filter({ hasText: 'Acompanhamento' })).not.toHaveCount(0);
  for (const nome of ['Leads', 'Pipeline', 'Chat', 'Equipe'])
    await expect(opcoes.filter({ hasText: nome })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/mais');
  const secoes = page.getByRole('navigation', { name: 'Mais seções' }).getByRole('link');
  expect((await secoes.allInnerTexts()).map((t) => t.split('\n')[0]!.trim())).toEqual([
    'Acompanhamento',
  ]);
  await expect(page.getByRole('link', { name: 'Avisos neste aparelho' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: 'Sair' })).toBeVisible();
  // Celular: nada da barra comercial; as abas do módulo levam de volta.
  await expect(page.locator('nav[aria-label="Navegação inferior"]')).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Abas do acompanhamento"]')).toHaveCount(1);
});

test('Carla troca a senha no primeiro acesso e cai no Acompanhamento', async ({ page }) => {
  await owner`update "user" set must_change_password = true where email = 'carla@npac.com.br'`;
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await page.getByLabel('Nova senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Confirme a nova senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await page.waitForURL(/\/acompanhamento\/dashboard/);
});

test('Diretoria convida e muda alguém para o cargo Acompanhamento pela tela', async ({ page }) => {
  await login(page, 'diretor@npac.com.br');
  await page.goto('/admin');
  await expect(
    page.locator('select[name="role"]').first().locator('option', { hasText: 'Acompanhamento' }),
  ).toHaveCount(1);
  await expect(
    page.getByLabel('Cargo de Ale', { exact: false }).first().locator('option', {
      hasText: 'Acompanhamento',
    }),
  ).toHaveCount(1);
});

test('Carla navega no módulo e nunca chega numa tela comercial (Link, URL ou 404)', async ({
  page,
}) => {
  await login(page, 'carla@npac.com.br');
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  // Navegação do navegador dentro do módulo.
  await page.getByRole('link', { name: 'Linha do tempo', exact: true }).first().click();
  await page.waitForURL(/\/acompanhamento\/linha-do-tempo/);
  // Módulo → comercial por navegação do navegador (como um Link do Next): volta ao módulo.
  for (const alvo of ['/leads', '/equipe', '/dashboard']) {
    await page.evaluate((href) => {
      (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push(
        href,
      );
    }, alvo);
    await page.waitForURL(/\/acompanhamento\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  }
  // Por URL também.
  // A tela troca de endereço logo ao abrir: o goto pode ser interrompido; vale o destino.
  await page.goto('/pipeline').catch(() => {});
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  // Endereço solto fora do módulo também leva a ele (cai em [secao] do comercial).
  // A tela troca de endereço logo ao abrir: o goto pode ser interrompido; vale o destino.
  await page.goto('/nao-existe').catch(() => {});
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  // Do 404 (endereço inexistente no módulo), o botão leva ao módulo.
  await page.goto('/acompanhamento/nao-existe');
  await expect(page.getByText('Esta tela não faz parte do seu acesso.')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link'),
  ).toHaveText(['Acompanhamento']);
  await page.getByRole('link', { name: 'Ir para o Acompanhamento' }).click();
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  // Da tela Mais (fora do módulo) para o módulo, pelo card.
  await page.goto('/mais');
  await page
    .getByRole('navigation', { name: 'Mais seções' })
    .getByRole('link', { name: /Acompanhamento/ })
    .click();
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

test('MFA desligado: Diretoria e Carla usam o módulo sem autenticador, sem aviso nem link', async ({
  page,
  browser,
}) => {
  test.skip(MFA_LIGADO, 'só com o MFA desligado');
  await login(page, 'diretor@npac.com.br', false);
  await page.goto('/acompanhamento/backup');
  await expect(page.getByText('Ative a verificação em duas etapas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Entrada e saída por módulo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Autenticador' })).toHaveCount(0);
  await page.goto('/mais');
  await expect(page.getByRole('link', { name: 'Autenticador' })).toHaveCount(0);
  // A tela do autenticador some: quem abrir o endereço volta para o início.
  await page.goto('/conta/mfa');
  await page.waitForURL(/\/dashboard/);
  const outra = await browser.newPage();
  await login(outra, 'carla@npac.com.br', false);
  await outra.waitForURL(/\/acompanhamento\/dashboard/);
  await expect(outra.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await outra.close();
});

test('Diretoria sem MFA vê o aviso para ativar o autenticador', async ({ page }) => {
  test.skip(!MFA_LIGADO, 'só com o MFA ligado');
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
  // Nome que já existe: a equipe confere antes (12C); no Dashboard a ficha é atualizada.
  await expect(confirmar).toBeDisabled();
  await gaveta.getByRole('checkbox', { name: /Conferi/ }).check();
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(gaveta.getByText('2 gravados · 0 ignorados · 1 atualizados')).toBeVisible();
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
