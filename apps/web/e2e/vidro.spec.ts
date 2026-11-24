import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Desfoque do "vidro" no build de produção (NPAC-69, auditoria de 23/11/2026). O Lightning CSS do
// Tailwind descartava `backdrop-filter` quando vinha antes de `-webkit-backdrop-filter`, e o Chromium
// (Chrome, Edge, Android) não aplica a versão com prefixo: a barra de baixo do celular ficava sem
// desfoque, com o texto da lista nítido por trás dos botões. Este teste roda no `next build`.

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

const desfoque = (page: Page, seletor: string) =>
  page
    .locator(seletor)
    .first()
    .evaluate((el) => getComputedStyle(el).backdropFilter);

test('barra de baixo do celular e cards de vidro têm desfoque no Chromium', async ({ browser }) => {
  // Comercial: barra de baixo (`.barra-celular.glass`) em 375 px e cards `.glass-card` no Dashboard.
  const sdr = await entrar(browser, 'ale', { width: 375, height: 812 });
  await expect(sdr.page.locator('.barra-celular.glass')).toBeVisible();
  const card = await desfoque(sdr.page, '.glass-card');
  // Captura para o PR (CAPTURAS=<pasta>): os cards do Dashboard passando por trás da barra.
  if (process.env.CAPTURAS) {
    await sdr.page.mouse.wheel(0, 500);
    await sdr.page.waitForTimeout(800);
    await sdr.page.screenshot({ path: `${process.env.CAPTURAS}/barra-celular-375.png` });
  }
  expect(await desfoque(sdr.page, '.barra-celular.glass')).toContain('blur');
  expect(card).toContain('blur');
  await sdr.ctx.close();

  // Acompanhamento: a barra de baixo do módulo e o `.card` sob `.ac` (modulo.css).
  const duda = await entrar(browser, 'duda', { width: 375, height: 812 });
  await expect(duda.page.locator('.barra-celular.glass')).toBeVisible();
  expect(await desfoque(duda.page, '.barra-celular.glass')).toContain('blur');
  expect(await desfoque(duda.page, '.ac .card')).toContain('blur');
  await duda.ctx.close();
});
