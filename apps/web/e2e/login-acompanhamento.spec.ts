// NPAC-52: segunda tela de login, `/login/acompanhamento` ("ouro líquido de dia").
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

const CRM = '/login';
const ACOMP = '/login/acompanhamento';
const FRASE_CRM = 'O pipeline, a agenda dos closers e cada venda do time em um só lugar.';
const FRASE_ACOMP = 'A jornada de cada mentorado, a Fila do dia e as reuniões em um só lugar.';

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate access_requests`;
});
test.afterAll(async () => {
  await owner`truncate access_requests`;
  await closeTestConnections();
});

async function entrar(page: Page, tela: string, usuario: string) {
  await page.goto(tela);
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
}

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).filter({ visible: true }).first().click();
}

async function pedirAcesso(page: Page, tela: string, usuario: string) {
  await page.goto(tela);
  await page.getByRole('link', { name: 'Solicitar acesso' }).click();
  await page.waitForURL(new RegExp(`${tela}/solicitar$`));
  await page.getByLabel('Nome', { exact: true }).fill('Nova Pessoa');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('E-mail', { exact: true }).fill(`${usuario}@novo.test`);
  await page.getByLabel('Senha', { exact: true }).fill('minha-senha');
  await page.getByLabel('Confirme a senha', { exact: true }).fill('minha-senha');
  await page.getByRole('button', { name: 'Pedir acesso' }).click();
  await expect(page.getByText('Pedido enviado.')).toBeVisible();
  // "Voltar ao login" volta à tela de onde veio.
  await page.getByRole('link', { name: 'Voltar ao login' }).click();
  await page.waitForURL(new RegExp(`${tela}$`));
}

test('cada tela tem a sua marca e frase e leva à outra pelo link embaixo do cartão', async ({
  page,
}) => {
  await page.goto(CRM);
  await expect(page.getByText('Área comercial')).toBeVisible();
  await expect(page.getByText(FRASE_CRM)).toBeVisible();
  await expect(page.getByText(FRASE_ACOMP)).toHaveCount(0);
  await page.getByRole('link', { name: /É do Acompanhamento\? Entrar por aqui/ }).click();
  await page.waitForURL(/\/login\/acompanhamento$/);

  await expect(page.getByText('Acompanhamento', { exact: true })).toBeVisible();
  await expect(page.getByText(FRASE_ACOMP)).toBeVisible();
  await expect(page.getByRole('heading', { name: /Não paro\s+até conseguir\./ })).toBeVisible();
  await expect(page.getByText('Uso restrito à equipe da NPAC')).toBeVisible();
  await expect(page.locator('main[data-area="ACOMPANHAMENTO"] canvas')).toBeAttached();
  // "Esqueci minha senha" e "Solicitar acesso" ficam dentro da tela do Acompanhamento.
  await expect(page.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute(
    'href',
    '/login/acompanhamento/esqueci',
  );
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.waitForURL(/\/login\/acompanhamento\/esqueci$/);
  await expect(page.locator('main[data-area="ACOMPANHAMENTO"]')).toBeVisible();
  await page.getByRole('link', { name: '‹ Voltar' }).click();
  await page.waitForURL(/\/login\/acompanhamento$/);

  await page.getByRole('link', { name: /É do comercial\? Entrar no CRM/ }).click();
  await page.waitForURL(/\/login$/);
  await expect(page.getByText('Área comercial')).toBeVisible();
});

// Cada tela leva à sua área; quem tem uma área só cai nela de qualquer jeito, sem erro.
for (const [tela, usuario, destino] of [
  [ACOMP, 'diretor', /\/acompanhamento\/fila$/],
  [CRM, 'diretor', /\/dashboard$/],
  [ACOMP, 'duda', /\/acompanhamento\/fila$/],
  [CRM, 'duda', /\/acompanhamento\/fila$/],
  [ACOMP, 'igor', /\/dashboard$/],
  [ACOMP, 'sonia', /\/dashboard$/],
] as const) {
  test(`${usuario} pela tela ${tela} cai em ${destino.source}`, async ({ page }) => {
    await entrar(page, tela, usuario);
    await page.waitForURL(destino);
    await expect(page.getByText('Não foi possível carregar.')).toHaveCount(0);
    // Com sessão, a tela de login manda direto para a área dela.
    await page.goto(tela);
    await page.waitForURL(destino);
  });
}

test('pedido de acesso pelas duas telas guarda a área e o Admin mostra', async ({ page }) => {
  await pedirAcesso(page, ACOMP, 'da.mentoria');
  await pedirAcesso(page, CRM, 'do.comercial');
  expect(
    await owner<{ username: string; area: string }[]>`
      select username, area from access_requests order by username`,
  ).toEqual([
    { username: 'da.mentoria', area: 'ACOMPANHAMENTO' },
    { username: 'do.comercial', area: 'COMERCIAL' },
  ]);

  await entrar(page, CRM, 'diretor');
  await page.waitForURL(/\/dashboard/);
  await page.goto('/admin');
  const pedidos = page.getByRole('region', { name: 'Pedidos de acesso' });
  const area = (usuario: string) =>
    pedidos.getByRole('listitem').filter({ hasText: usuario }).getByTitle('Área do pedido');
  await expect(area('da.mentoria')).toHaveText('Área Acompanhamento');
  await expect(area('do.comercial')).toHaveText('Área Comercial');
  await page.screenshot({ path: 'test-results/login-acompanhamento-admin.png' });
});

test('o último usuário vale nas duas telas', async ({ page }) => {
  await entrar(page, CRM, 'igor');
  await page.waitForURL(/\/dashboard/);
  await sair(page);
  await page.waitForURL(/\/login$/);
  await page.goto(ACOMP);
  await page.getByLabel('Usuário', { exact: true }).click();
  await expect(page.getByRole('option', { name: 'igor' })).toBeVisible();
});

test('sem sessão no módulo e ao sair dele, volta à tela do Acompanhamento', async ({ page }) => {
  await page.goto('/acompanhamento/fila');
  await page.waitForURL(/\/login\/acompanhamento$/);
  await entrar(page, ACOMP, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila$/);
  await sair(page);
  await page.waitForURL(/\/login\/acompanhamento$/);
  // No comercial, continua a do CRM.
  await page.goto('/leads');
  await page.waitForURL(/\/login$/);
});

for (const tela of [CRM, ACOMP]) {
  test(`${tela}: no celular o formulário cabe sem rolar; em nenhuma largura o cartão sai da tela`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(tela);
    // Celular: título menor e sem a frase de baixo.
    await expect(page.getByText(tela === CRM ? FRASE_CRM : FRASE_ACOMP)).toBeHidden();
    const pedir = (await page.getByRole('link', { name: 'Solicitar acesso' }).boundingBox())!;
    expect(pedir.y + pedir.height).toBeLessThanOrEqual(844);
    const titulo = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
    expect(titulo.height).toBeLessThan(100);

    for (const [w, h] of [
      [375, 812],
      [768, 1024],
      [1024, 768],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      const cartao = (await page.locator('.auth-card').boundingBox())!;
      expect(cartao.x).toBeGreaterThanOrEqual(0);
      expect(cartao.x + cartao.width).toBeLessThanOrEqual(w);
      // O título não passa por baixo do cartão (no computador fica ao lado; até 1023, em cima).
      const ouro = (await page.getByText('conseguir.', { exact: true }).boundingBox())!;
      if (w >= 1024) expect(ouro.x + ouro.width).toBeLessThanOrEqual(cartao.x);
      else expect(ouro.y + ouro.height).toBeLessThanOrEqual(cartao.y);
      expect(ouro.x + ouro.width).toBeLessThanOrEqual(w);
      // Duas linhas no máximo ("Não paro / até conseguir."), nunca "até" sozinho.
      const linhas = await page
        .getByRole('heading', { level: 1 })
        .evaluate((h) => Math.round(h.clientHeight / parseFloat(getComputedStyle(h).lineHeight)));
      expect(linhas).toBeLessThanOrEqual(2);
    }
  });
}
