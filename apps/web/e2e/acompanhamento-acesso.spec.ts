import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { MFA_LIGADO } from '@npac/shared/enums';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`update "user" set role = 'DIRETOR' where email = 'diretor@npac.com.br'`;
});
test.afterAll(async () => {
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

/** Login sem código; o MFA é ligado depois no banco (como nos testes da API). */
async function login(page: Page, email: string, mfa = true) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/(dashboard|acompanhamento)/);
  if (mfa) await owner`update "user" set two_factor_enabled = true where email = ${email}`;
}

/** As 11 abas do módulo e Configurações, para quem é Admin. */
const MODULOS = [
  'Fila do dia',
  'Mentorados',
  'Ficha do mentorado',
  'Onboarding',
  'Plano dos 12 meses',
  'Reuniões',
  'PMEs e ciclos',
  'Linha do tempo e conquistas',
  'Envios físicos',
  'Eventos e agenda',
  'Renovações e gestão',
  'Configurações',
];
/** Na barra lateral, "Ficha do mentorado" ganha uma 2ª linha: para onde o item leva. */
const NA_LATERAL = MODULOS.map((m) => (m === 'Ficha do mentorado' ? /^Ficha do mentorado/ : m));
const ENTRADA = /\/acompanhamento\/fila/;
const titulo = (page: Page) => page.getByRole('heading', { name: 'Fila do dia', exact: true });
const tituloMentorados = (page: Page) =>
  page.getByRole('heading', { name: 'Mentorados', exact: true });

const sidebarLinks = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link').allInnerTexts();

test('Duda vê só o Acompanhamento na sidebar, na tela Mais e no Ctrl+K', async ({ page }) => {
  await login(page, 'duda@npac.com.br');
  await page.waitForURL(ENTRADA);
  await expect(
    page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link'),
  ).toHaveText(NA_LATERAL);
  await page.keyboard.press('Control+k');
  const opcoes = page.getByRole('option');
  await expect(opcoes.filter({ hasText: 'Acompanhamento · Plano dos 12 meses' })).toHaveCount(1);
  for (const nome of MODULOS)
    await expect(opcoes.filter({ hasText: `Acompanhamento · ${nome}` })).not.toHaveCount(0);
  for (const nome of ['Leads', 'Pipeline', 'Chat', 'Equipe'])
    await expect(opcoes.filter({ hasText: nome })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.goto('/mais');
  const secoes = page.getByRole('navigation', { name: 'Mais seções' }).getByRole('link');
  expect((await secoes.allInnerTexts()).map((t) => t.split('\n')[0]!.trim())).toEqual([
    'Acompanhamento',
  ]);
  // O push da Fila do dia vale para o cargo (D12): o link aparece, e a tela abre.
  await page.getByRole('link', { name: 'Avisos neste aparelho' }).click();
  await page.waitForURL(/\/conta\/avisos/);
  await page.goto('/mais');
  await expect(page.getByRole('main').getByRole('button', { name: 'Sair' })).toBeVisible();
  // Celular: nada da barra comercial; as abas do módulo levam de volta.
  await expect(page.locator('nav[aria-label="Navegação inferior"]')).toHaveCount(0);
  await expect(page.locator('nav[aria-label="Abas do acompanhamento"]')).toHaveCount(1);
});

test('Duda troca a senha no primeiro acesso e cai no Acompanhamento', async ({ page }) => {
  await owner`update "user" set must_change_password = true where email = 'duda@npac.com.br'`;
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual').fill(E2E_PASSWORD);
  await page.getByLabel('Nova senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Confirme a nova senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await page.waitForURL(ENTRADA);
});

test('Diretoria convida e muda alguém para o cargo Acompanhamento pela tela', async ({ page }) => {
  await login(page, 'diretor@npac.com.br');
  await page.goto('/admin');
  // Cargo em um passo: o grupo Acompanhamento já traz os perfis do módulo.
  await expect(
    page.getByLabel('Cargo', { exact: true }).locator('optgroup[label="Acompanhamento"] option'),
  ).toHaveText(['Acompanhamento', 'Operação', 'Especialista', 'Mentor']);
  await expect(
    page.getByLabel('Cargo de Ale', { exact: false }).first().locator('option', {
      hasText: 'Acompanhamento',
    }),
  ).toHaveCount(1);
});

test('Duda navega no módulo e nunca chega numa tela comercial (Link, URL ou 404)', async ({
  page,
}) => {
  await login(page, 'duda@npac.com.br');
  // Cada ida ao comercial é trocada por uma carga completa do módulo: a navegação pedida é
  // abortada no meio, e `waitForURL` (que espera o `load` dela) falhava às vezes com ERR_ABORTED
  // (1 em 25 aqui, e no CI). `toHaveURL` só confere o endereço, repetindo até chegar.
  await expect(page).toHaveURL(ENTRADA);
  // Módulo → comercial por navegação do navegador (como um Link do Next): volta ao módulo.
  // Cada ida parte de Reuniões (navegação do navegador dentro do módulo), para a volta ser provada
  // toda vez, e só depois que a carga anterior terminou.
  for (const alvo of ['/leads', '/equipe', '/dashboard']) {
    await page.waitForLoadState('load');
    await page.getByRole('link', { name: 'Reuniões', exact: true }).first().click();
    await expect(page).toHaveURL(/\/acompanhamento\/reunioes/);
    // A navegação que o push dispara pode destruir o contexto antes do evaluate responder.
    await page
      .evaluate((href) => {
        (window as unknown as { next: { router: { push: (h: string) => void } } }).next.router.push(
          href,
        );
      }, alvo)
      .catch(() => {});
    await expect(page).toHaveURL(ENTRADA);
    await expect(titulo(page)).toBeVisible();
  }
  await page.waitForLoadState('load');
  // Por URL também.
  // A tela troca de endereço logo ao abrir: o goto pode ser interrompido; vale o destino.
  await page.goto('/pipeline').catch(() => {});
  await expect(page).toHaveURL(ENTRADA);
  await expect(titulo(page)).toBeVisible();
  // Endereço solto fora do módulo também leva a ele (cai em [secao] do comercial).
  // A tela troca de endereço logo ao abrir: o goto pode ser interrompido; vale o destino.
  await page.goto('/nao-existe').catch(() => {});
  await expect(page).toHaveURL(ENTRADA);
  // Do 404 (endereço inexistente no módulo), o botão leva ao módulo.
  await page.goto('/acompanhamento/nao-existe');
  await expect(page.getByText('Esta tela não faz parte do seu acesso.')).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link'),
  ).toHaveText(NA_LATERAL);
  await page.getByRole('link', { name: 'Ir para o Acompanhamento' }).click();
  await expect(page).toHaveURL(ENTRADA);
  await expect(titulo(page)).toBeVisible();
  // Da tela Mais (fora do módulo) para o módulo, pelo card.
  await page.goto('/mais');
  await page
    .getByRole('navigation', { name: 'Mais seções' })
    .getByRole('link', { name: /Acompanhamento/ })
    .click();
  await expect(page).toHaveURL(ENTRADA);
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
  for (const rota of [
    '/acompanhamento',
    '/acompanhamento/mentorados',
    '/acompanhamento/configuracoes',
  ]) {
    const res = await page.goto(rota);
    expect(res?.status(), rota).toBe(404);
  }
});

test('MFA desligado: Diretoria e Duda usam o módulo sem autenticador, sem aviso nem link', async ({
  page,
  browser,
}) => {
  test.skip(MFA_LIGADO, 'só com o MFA desligado');
  await login(page, 'diretor@npac.com.br', false);
  await page.goto('/acompanhamento/mentorados');
  await expect(page.getByText('Ative a verificação em duas etapas')).toHaveCount(0);
  await expect(tituloMentorados(page)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Autenticador' })).toHaveCount(0);
  await page.goto('/mais');
  await expect(page.getByRole('link', { name: 'Autenticador' })).toHaveCount(0);
  // A tela do autenticador some: quem abrir o endereço volta para o início.
  await page.goto('/conta/mfa');
  await page.waitForURL(/\/dashboard/);
  const outra = await browser.newPage();
  await login(outra, 'duda@npac.com.br', false);
  await outra.waitForURL(ENTRADA);
  await expect(titulo(outra)).toBeVisible();
  await outra.close();
});

test('Diretoria sem MFA vê o aviso para ativar o autenticador', async ({ page }) => {
  test.skip(!MFA_LIGADO, 'só com o MFA ligado');
  await login(page, 'diretor@npac.com.br', false);
  await page.goto('/acompanhamento/mentorados');
  await expect(page.getByText('Ative a verificação em duas etapas')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ativar o autenticador' })).toHaveAttribute(
    'href',
    '/conta/mfa',
  );
});

test('390 px: sem overflow horizontal em Mentorados', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'duda@npac.com.br');
  await page.waitForURL(ENTRADA);
  await expect(titulo(page)).toBeVisible();
  await page.goto('/acompanhamento/mentorados');
  await expect(tituloMentorados(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('390 px: do módulo, o avatar leva ao Mais, que tem Sair', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'duda@npac.com.br');
  await page.waitForURL(ENTRADA);
  await page.getByRole('link', { name: 'Menu e conta' }).click();
  await page.waitForURL(/\/acompanhamento\/mais$/);
  await page.goto('/mais');
  // No Mais do CRM nenhuma aba fica marcada; as abas levam de volta ao módulo.
  const abas = page.getByRole('navigation', { name: 'Abas do acompanhamento' });
  await expect(abas.locator('[aria-current="page"]')).toHaveCount(0);
  await abas.getByRole('link', { name: 'Mentorados' }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.goto('/acompanhamento/mais');
  await page.getByRole('main').getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
});
