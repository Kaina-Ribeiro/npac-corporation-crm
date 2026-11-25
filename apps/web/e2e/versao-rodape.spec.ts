import { expect, test, type Browser } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { NOVIDADES } from '@npac/shared/novidades';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-77, Fase 1: versão no rodapé da sidebar (some recolhida) e no cartão da conta do Mais,
// com o ponto dourado enquanto há novidade que a pessoa não viu. Sem tag no e2e: "dev".

const owner = ownerSql(E2E_DB);
const ANTIGA = NOVIDADES[NOVIDADES.length - 1]!.id;
const USUARIOS = ['ale', 'duda'];

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await owner`update "user" set novidades_vista = null where username = any(${USUARIOS})`;
  await closeTestConnections();
});

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

const versao = (scope: import('@playwright/test').Locator) =>
  scope.getByRole('button', { name: /^Versão dev\. Ver o que mudou/ });

test('conta nova: rodapé com "Versão dev", sem ponto; some com a barra recolhida', async ({
  browser,
}) => {
  await owner`update "user" set novidades_vista = null where username = 'ale'`;
  const { ctx, page } = await entrar(browser, 'ale', { width: 1440, height: 900 });
  const side = page.locator('#app-sidebar');
  const linha = versao(side);
  await expect(linha).toBeVisible();
  await expect(linha).toHaveText(/Versão dev\s*O que mudou/);
  await expect(linha).toHaveAccessibleName('Versão dev. Ver o que mudou');
  await expect(linha).not.toHaveAttribute('data-novo');
  // Coluna vazia vira a mais nova na primeira leitura (ninguém recebe o histórico de uma vez).
  const [u] = await owner<
    { v: string }[]
  >`select novidades_vista as v from "user" where username = 'ale'`;
  expect(u!.v).toBe(NOVIDADES[0]!.id);

  await page.getByRole('button', { name: 'Recolher barra lateral' }).click();
  await expect(linha).toBeHidden();
  await page.getByRole('button', { name: 'Expandir barra lateral' }).click();
  await expect(linha).toBeVisible();
  await ctx.close();
});

test('com novidade não vista: ponto dourado na sidebar e no Mais dos dois módulos', async ({
  browser,
}) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = any(${USUARIOS})`;
  const { ctx, page } = await entrar(browser, 'ale', { width: 1440, height: 900 });
  const linha = versao(page.locator('#app-sidebar'));
  await expect(linha).toHaveAttribute('data-novo', '');
  await expect(linha).toHaveAccessibleName('Versão dev. Ver o que mudou (tem novidade)');
  await ctx.close();

  for (const [usuario, mais] of [
    ['ale', '/mais'],
    ['duda', '/acompanhamento/mais'],
  ] as const) {
    const cel = await entrar(browser, usuario, { width: 375, height: 812 });
    await cel.page.goto(mais);
    const cartao = cel.page.getByRole('region', { name: 'Sua conta' });
    const l = versao(cartao);
    await expect(l).toBeVisible();
    await expect(l).toHaveAttribute('data-novo', '');
    await expect(l).toHaveText(/Versão dev\s*O que mudou ›/);
    const caixa = await l.boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(44);
    await cel.ctx.close();
  }
});
