import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Sair sempre à mão (17/11/2026): no notebook com a janela baixa a sidebar cortava o rodapé sem
// rolagem (o Igor não conseguia sair), e no celular o Sair do Acompanhamento ficava perdido no
// fim do Mais. Agora a lista da sidebar rola e o Mais do CRM e o do Acompanhamento abrem com o
// mesmo cartão da conta (Trocar senha e Sair) no topo.

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function entrar(browser: Browser, usuario: string, tela: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport: tela });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/(dashboard|acompanhamento)/);
  return { ctx, page };
}

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

test('notebook com janela baixa: a lista da sidebar rola e o Sair fica à vista', async ({
  browser,
}) => {
  // SDR (comercial), Duda (só o módulo) e Diretoria dentro do módulo (a lista mais longa).
  for (const usuario of ['ale', 'duda', 'diretor']) {
    const { ctx, page } = await entrar(browser, usuario, { width: 1280, height: 520 });
    if (usuario === 'diretor') {
      await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
      await page.waitForURL(/\/acompanhamento\/fila/);
    }
    const sair = page.locator('#app-sidebar').getByRole('button', { name: 'Sair' });
    // ratio 1: inteiro, sem o corte do overflow (o IntersectionObserver recorta pelos ancestrais).
    await expect(sair, usuario).toBeInViewport({ ratio: 1 });

    // A lista não cabe em 520 px: o último item começa fora e aparece rolando com a roda.
    const ultimo = lateral(page).getByRole('link').last();
    await expect(ultimo, usuario).not.toBeInViewport({ ratio: 1 });
    await lateral(page).hover();
    await page.mouse.wheel(0, 2000);
    await expect(ultimo, usuario).toBeInViewport({ ratio: 1 });
    await expect(sair, usuario).toBeInViewport({ ratio: 1 });

    await sair.click();
    await page.waitForURL(/\/login/);
    await ctx.close();
  }
});

test('janela baixa: abrir direto uma tela do fim do menu mostra o item ativo', async ({
  browser,
}) => {
  const { ctx, page } = await entrar(browser, 'duda', { width: 1280, height: 520 });
  await page.goto('/acompanhamento/configuracoes');
  const item = lateral(page).getByRole('link', { name: 'Configurações', exact: true });
  await expect(item).toHaveAttribute('aria-current', 'page');
  // `block: 'nearest'` encosta o item na borda da lista: o subpixel pode cortar ~0,1 px (99,6 %).
  // Antes da correção ele ficava inteiro fora (0 %).
  await expect(item).toBeInViewport({ ratio: 0.95 });
  await ctx.close();
});

test('celular: o Mais do CRM e o do Acompanhamento abrem com o mesmo cartão da conta', async ({
  browser,
}) => {
  // 375 × 667 (iPhone SE): a tela mais baixa que a equipe usa.
  const casos = [
    { usuario: 'ale', mais: '/mais' },
    { usuario: 'duda', mais: '/acompanhamento/mais' },
    { usuario: 'diretor', mais: '/mais' },
    { usuario: 'diretor', mais: '/acompanhamento/mais' },
  ];
  for (const c of casos) {
    const { ctx, page } = await entrar(browser, c.usuario, { width: 375, height: 667 });
    await page.goto(c.mais);
    const conta = page.getByRole('region', { name: 'Sua conta' });
    const nome = `${c.usuario} ${c.mais}`;
    // Sem rolar: o cartão está no topo, com Trocar senha e Sair.
    await expect(conta.getByRole('button', { name: 'Sair' }), nome).toBeInViewport({ ratio: 1 });
    await expect(conta.getByRole('link', { name: 'Trocar senha' }), nome).toBeInViewport({
      ratio: 1,
    });
    // Um Sair só por tela (o da sidebar fica escondido no celular).
    await expect(page.getByRole('button', { name: 'Sair' }).filter({ visible: true })).toHaveCount(
      1,
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, nome).toBeLessThanOrEqual(0);

    await conta.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login/);
    await ctx.close();
  }
});
