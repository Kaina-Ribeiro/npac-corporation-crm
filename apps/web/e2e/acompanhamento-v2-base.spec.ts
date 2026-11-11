import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
/** Ficha individual do seed (`seedInscricaoId(1)`): "Mentorado Fictício 01". */
const FICHA_01 = '00000000-0000-4000-8000-000000000001';
/** Importada, com o momento inicial ainda em aberto. */
const FICHA_ABERTA = '00000000-0000-4000-8000-000000000003';
/** Casal do seed, no mês 10. */
const FICHA_CASAL = '00000000-0000-4000-8000-000000000002';

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

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const salvo = (page: Page) => expect(page.getByRole('status').filter({ hasText: 'Tudo salvo' }));

async function abrirPessoa(browser: Browser, usuario: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, usuario);
  await page.goto(`/acompanhamento/ficha/${FICHA_01}`);
  await page.getByRole('tab', { name: 'Pessoa', exact: true }).click();
  return { ctx, page };
}

test('Duda: menu → Mentorados → cria casal → edita → salvo', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await lateral(page).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await page.getByRole('link', { name: 'Nova inscrição' }).filter({ visible: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados\/nova/);
  await page.getByRole('button', { name: 'Casal', exact: true }).click();
  await page.getByLabel('Nome completo').nth(0).fill('Mentorada Fictícia 50');
  await page.getByLabel('Nome completo').nth(1).fill('Mentorado Fictício 51');
  await page.getByLabel('WhatsApp com DDD').nth(0).fill('11 90000-0050');
  await page.getByRole('button', { name: 'Cadastrar inscrição' }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole('heading', { name: 'Mentorada Fictícia 50 e Mentorado Fictício 51' }),
  ).toBeVisible();
  // Só quem tem WhatsApp ganha o botão; sem link do grupo, o botão Grupo some.
  await expect(page.getByRole('link', { name: 'Mentorada', exact: true })).toHaveAttribute(
    'href',
    'https://wa.me/5511900000050',
  );
  await expect(page.getByRole('link', { name: 'Mentorado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Grupo', exact: true })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
  await page.getByRole('button', { name: 'Mentorado Fictício 51', exact: true }).click();
  await page.getByLabel('Profissão').fill('Profissão Fictícia');
  await page.getByLabel('Profissão').blur();
  await salvo(page).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Pessoas', exact: true }).click();
  await page.getByRole('button', { name: 'Mentorado Fictício 51', exact: true }).click();
  await expect(page.getByLabel('Profissão')).toHaveValue('Profissão Fictícia');
});

test('duas abas editam campos diferentes da mesma pessoa e os dois ficam salvos', async ({
  browser,
}) => {
  const a = await abrirPessoa(browser, 'duda');
  const b = await abrirPessoa(browser, 'operacao');
  await a.page.getByLabel('Cidade').fill('Cidade Fictícia');
  await a.page.getByLabel('Cidade').blur();
  await salvo(a.page).toBeVisible();
  await b.page.getByLabel('Profissão').fill('Ofício Fictício');
  await b.page.getByLabel('Profissão').blur();
  await expect
    .poll(
      async () =>
        (
          await owner<{ cidade: string | null; profissao: string | null }[]>`
          select cidade, profissao from mentoria_pessoas where inscricao_id = ${FICHA_01}`
        )[0],
    )
    .toEqual({ cidade: 'Cidade Fictícia', profissao: 'Ofício Fictício' });
  await salvo(b.page).toBeVisible();
  await expect(b.page.getByText('Outra pessoa mudou')).toHaveCount(0);
  await expect(b.page.getByText('Não foi possível')).toHaveCount(0);
  await a.ctx.close();
  await b.ctx.close();
});

test('campo que o outro mudou: avisa e mantém o valor dele', async ({ browser }) => {
  const a = await abrirPessoa(browser, 'duda');
  const b = await abrirPessoa(browser, 'operacao');
  await a.page.getByLabel('Instagram', { exact: true }).fill('conta.da.duda');
  await a.page.getByLabel('Instagram', { exact: true }).blur();
  await salvo(a.page).toBeVisible();
  await b.page.getByLabel('Instagram', { exact: true }).fill('conta.da.operacao');
  await b.page.getByLabel('Instagram', { exact: true }).blur();
  await expect(b.page.getByText('Outra pessoa mudou este campo')).toBeVisible();
  await expect(b.page.getByLabel('Instagram', { exact: true })).toHaveValue('conta.da.duda');
  await a.ctx.close();
  await b.ctx.close();
});

test('Leo vê "Seu painel chega em breve" e nenhum mentorado', async ({ page }) => {
  await entrar(page, 'leo');
  await expect(page.getByRole('heading', { name: 'Seu painel chega em breve' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toHaveCount(0);
  await expect(page.getByText('Mentorado Fictício 01')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
});

test('cargo sem perfil vê "Peça ao Admin"', async ({ page }) => {
  await entrar(page, 'carla');
  await expect(
    page.getByRole('heading', { name: 'Peça ao Admin para definir seu perfil' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toHaveCount(0);
});

test('Manu não abre ficha de quem não é dela (404)', async ({ page }) => {
  await entrar(page, 'manu');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(page.getByText('Mentorado Fictício 01')).toHaveCount(0);
  const res = await page.goto(`/acompanhamento/ficha/${FICHA_01}`);
  expect(res?.status()).toBe(404);
});

test('as 5 abas futuras mostram "em breve"', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  for (const nome of [
    'PMEs e ciclos',
    'Linha do tempo e conquistas',
    'Envios físicos',
    'Eventos e agenda',
    'Renovações e gestão',
  ]) {
    await lateral(page).getByRole('link', { name: nome, exact: true }).click();
    await page.waitForURL(/\/acompanhamento\/em-breve\//);
    await expect(page.getByRole('heading', { name: 'Esta aba chega em breve' })).toBeVisible();
    await expect(lateral(page).getByRole('link', { name: nome, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('busca no topo acha por nome e o termo não aparece na URL', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  await page.getByRole('searchbox', { name: 'Buscar mentorados' }).fill('Fictícia 06');
  const achado = page.getByRole('option', { name: /Mentorada Fictícia 06/ });
  await expect(achado).toBeVisible();
  expect(urls.some((u) => /Fict/i.test(decodeURIComponent(u)))).toBe(false);
  await achado.click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
  expect(page.url()).not.toMatch(/Fict/i);
});

test('Configurações: só Admin vê e define o perfil', async ({ page, browser }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await page.getByLabel('Perfil de Carla').selectOption('OPERACAO');
  await expect
    .poll(
      async () =>
        (
          await owner<{ n: number }[]>`select count(*)::int as n from mentoria_perfis p
           join "user" u on u.id = p.user_id where u.username = 'carla'`
        )[0]!.n,
    )
    .toBe(1);
  await page.getByLabel('Perfil de Carla').selectOption('');
  await expect
    .poll(
      async () =>
        (
          await owner<{ n: number }[]>`select count(*)::int as n from mentoria_perfis p
           join "user" u on u.id = p.user_id where u.username = 'carla'`
        )[0]!.n,
    )
    .toBe(0);

  const ctx = await browser.newContext();
  const outra = await ctx.newPage();
  await entrar(outra, 'operacao');
  await outra.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(lateral(outra).getByRole('link', { name: 'Configurações' })).toHaveCount(0);
  expect((await outra.goto('/acompanhamento/configuracoes'))?.status()).toBe(404);
  await ctx.close();
});

test('filtros por status e Completar a ficha mudam a lista', async ({ page }) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.getByLabel('Status', { exact: true }).selectOption('PAUSADO');
  await expect(page.getByRole('link', { name: /Mentorado Fictício 07/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mentorado Fictício 01/ })).toHaveCount(0);
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await page
    .getByRole('button', { name: /Completar a ficha/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('link', { name: /Mentorada Fictícia 04/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mentorado Fictício 01/ })).toHaveCount(0);
});

test('375 px: lista e ficha sem rolagem lateral, item aberto é página própria', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const abas = page.getByRole('navigation', { name: 'Abas do acompanhamento' });
  await expect(abas).toBeVisible();
  await page.getByRole('link', { name: /Mentorado Fictício 01/ }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
  await expect(page.getByRole('link', { name: 'Mentorados' }).first()).toBeVisible();
  for (const aba of ['Jornada', 'Inscrição', 'Pessoa', 'Momento inicial', 'Histórico']) {
    await page.getByRole('tab', { name: aba, exact: true }).click();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, aba).toBeLessThanOrEqual(0);
  }
  await abas.getByRole('link', { name: 'Mais' }).click();
  await page.waitForURL(/\/acompanhamento\/mais/);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
});

test('1440x900: cada aba da ficha cabe sem rolar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  for (const [id, pessoas] of [
    [FICHA_01, 'Pessoa'],
    [FICHA_CASAL, 'Pessoas'],
    [FICHA_ABERTA, 'Pessoa'],
  ] as const) {
    await page.goto(`/acompanhamento/ficha/${id}`);
    for (const aba of ['Jornada', pessoas, 'Momento inicial', 'Histórico']) {
      await page.getByRole('tab', { name: aba, exact: true }).click();
      await expect(page.getByRole('tabpanel')).toBeVisible();
      const sobra = await page.evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      );
      expect(sobra, `${id} ${aba}`).toBeLessThanOrEqual(0);
    }
  }
});

test('1440: endereço da aba Inscrição, que vira coluna, mostra a Jornada ao lado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.goto(`/acompanhamento/ficha/${FICHA_01}?aba=inscricao`);
  await expect(page.getByRole('tabpanel', { name: 'Jornada' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('tabpanel', { name: 'Jornada' })).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Inscrição' })).toBeVisible();
});

test('Operação: menu → ficha, edita a inscrição e vê o momento sem editar', async ({ page }) => {
  await entrar(page, 'operacao');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await lateral(page).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await page.getByRole('link', { name: /Mentorado Fictício 01/ }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
  await expect(page.getByLabel('Pagamento')).toBeEditable();
  await expect(page.getByLabel('Status', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Momento inicial', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Concluir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Destravar' })).toHaveCount(0);
});

test('Manu: menu sem Configurações, lista vazia e sem cadastro', async ({ page }) => {
  await entrar(page, 'manu');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(lateral(page).getByRole('link', { name: 'Configurações' })).toHaveCount(0);
  await lateral(page).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum mentorado por aqui' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Nova inscrição' })).toHaveCount(0);
  expect((await page.goto('/acompanhamento/mentorados/nova'))?.status()).toBe(404);
});

test('Diretoria: menu do módulo abre Mentorados, ficha e Configurações', async ({ page }) => {
  await entrar(page, 'diretor');
  await page.waitForURL(/\/dashboard/);
  await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.getByRole('link', { name: /Mentorado Fictício 01/ }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
  await page.getByRole('tab', { name: 'Momento inicial', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Destravar' })).toBeVisible();
  await lateral(page).getByRole('link', { name: 'Configurações', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/configuracoes/);
  await expect(page.getByLabel('Perfil de Duda')).toHaveValue('ACOMPANHAMENTO');
});
