import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Acesso por área, Fase 4 (NPAC-54): pessoa em duas áreas. A Diretoria põe a Sônia (Closer) no
// Acompanhamento como Especialista pelo Admin; com um login só ela vê o menu do comercial e o do
// módulo, e cada tela de entrada a leva ao lugar dela. O Head de cada área vê a conta com "também
// no …" e sem senha nem desativar. Sempre pelo caminho real (login → menu). Com CAPTURAS=<pasta>,
// fotografa as telas em 375 / 768 / 1024 / 1440.
const owner = ownerSql(E2E_DB);
const PASTA = process.env.CAPTURAS;
const LARGURAS = [375, 768, 1024, 1440];
const DUAS = 'Conta em mais de uma área: só a Diretoria redefine a senha ou desativa';

async function soComercial() {
  await owner`update "user" set role = 'CLOSER', can_prospect = false, can_close = true where username = 'sonia'`;
  await owner`delete from area_membros where area = 'ACOMPANHAMENTO'
    and user_id = (select id from "user" where username = 'sonia')`;
}

/** Sônia também Especialista, gravado como a Diretoria (o caminho da tela é o primeiro teste). */
async function duasAreas() {
  await owner.begin(async (t) => {
    await t`select set_config('app.user_id', (select id from "user" where username = 'diretor'), true)`;
    await t`select area_definir_membro((select id from "user" where username = 'sonia'),
      'ACOMPANHAMENTO', 'ESPECIALISTA', false)`;
  });
}

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await soComercial();
});
test.afterAll(async () => {
  await soComercial();
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string, tela = '/login') {
  await page.goto(tela);
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

/** Login → Admin pelo menu; devolve a linha da Sônia na Equipe. */
async function linhaNoAdmin(page: Page, usuario: string) {
  await entrar(page, usuario);
  await lateral(page).getByRole('link', { name: 'Admin', exact: true }).click();
  await page.waitForURL(/\/admin/);
  return page.locator('li').filter({ hasText: 'sonia@npac.com.br' });
}

async function novaPagina(browser: Browser) {
  const ctx = await browser.newContext();
  return { ctx, page: await ctx.newPage() };
}

async function foto(page: Page, nome: string) {
  if (!PASTA) return;
  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: 900 });
    const larga = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(larga, `${nome} em ${largura}: rolagem lateral`).toBeLessThanOrEqual(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/${nome}-${largura}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('a Diretoria põe a Sônia no Acompanhamento; ela vê os dois menus com um login e sai dele', async ({
  page,
  browser,
}) => {
  page.on('dialog', (d) => void d.accept());
  const linha = await linhaNoAdmin(page, 'diretor');
  await linha.getByLabel('Adicionar Sônia a outra área').selectOption('ESPECIALISTA');
  await expect(
    page.getByRole('status').filter({ hasText: 'Sônia agora também é Especialista' }),
  ).toBeVisible();
  // A linha passa a mostrar o cargo de cada área, um campo Cargo por área e "Tirar de uma área".
  await expect(linha.getByLabel('Cargo de Sônia no Comercial')).toHaveValue('CLOSER');
  await expect(linha.getByLabel('Cargo de Sônia no Acompanhamento')).toHaveValue('ESPECIALISTA');
  await expect(linha.getByLabel('Adicionar Sônia a outra área')).toHaveCount(0);
  await foto(page, 'admin-diretoria-duas-areas');

  // Entra por /login: cai no comercial e vê também a entrada do Acompanhamento.
  const s1 = await novaPagina(browser);
  await entrar(s1.page, 'sonia');
  await s1.page.waitForURL(/\/dashboard/);
  await expect(lateral(s1.page).getByRole('link', { name: 'Leads', exact: true })).toBeVisible();
  await lateral(s1.page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
  await s1.page.waitForURL(/\/acompanhamento\/fila/);
  await expect(
    lateral(s1.page).getByRole('link', { name: 'Mentorados', exact: true }),
  ).toBeVisible();
  await expect(lateral(s1.page).getByRole('link', { name: 'Pipeline', exact: true })).toBeVisible();
  await foto(s1.page, 'sonia-fila');

  // Entra pela tela do Acompanhamento: cai no módulo.
  const s2 = await novaPagina(browser);
  await entrar(s2.page, 'sonia', '/login/acompanhamento');
  await s2.page.waitForURL(/\/acompanhamento\/fila/);
  await s2.ctx.close();

  // A Diretoria tira do Acompanhamento: a Sônia perde o módulo e fica no comercial.
  await linha.getByLabel('Tirar Sônia de uma área').selectOption('ACOMPANHAMENTO');
  await expect(
    page.getByRole('status').filter({ hasText: 'Sônia saiu do Acompanhamento' }),
  ).toBeVisible();
  await expect(linha.getByLabel('Adicionar Sônia a outra área')).toBeVisible();
  await s1.page.goto('/dashboard');
  await expect(lateral(s1.page).getByRole('link', { name: 'Leads', exact: true })).toBeVisible();
  await expect(
    lateral(s1.page).getByRole('link', { name: 'Acompanhamento', exact: true }),
  ).toHaveCount(0);
  await s1.ctx.close();
});

test('o Head de cada área vê a Sônia com "também no …" e sem senha nem desativar', async ({
  page,
  browser,
}) => {
  await duasAreas();
  const linha = await linhaNoAdmin(page, 'ana');
  await expect(linha.getByText('também no Acompanhamento')).toBeVisible();
  await expect(linha.getByText(DUAS)).toBeVisible();
  await expect(linha.getByRole('button', { name: 'Desativar' })).toHaveCount(0);
  await expect(linha.getByRole('button', { name: 'Nova senha' })).toHaveCount(0);
  await foto(page, 'admin-head-comercial');

  const d = await novaPagina(browser);
  await entrar(d.page, 'duda');
  await d.page.waitForURL(/\/acompanhamento\/fila/);
  await lateral(d.page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await d.page.waitForURL(/\/acompanhamento\/configuracoes/);
  await d.page.locator('.tabs').getByRole('link', { name: 'Perfis', exact: true }).click();
  const equipe = d.page.getByRole('region', { name: 'Equipe do Acompanhamento' });
  const sonia = equipe.locator('.pf').filter({ hasText: 'Sônia' });
  await expect(sonia.getByText('também no Comercial')).toBeVisible();
  await expect(sonia.getByText(DUAS)).toBeVisible();
  await expect(sonia.getByRole('button', { name: /Nova senha/ })).toHaveCount(0);
  await expect(sonia.getByRole('button', { name: /Desativar/ })).toHaveCount(0);
  await expect(sonia.getByLabel('Perfil de Sônia')).toHaveValue('ESPECIALISTA');
  await foto(d.page, 'perfis-admin-acompanhamento');
  await d.ctx.close();
});
