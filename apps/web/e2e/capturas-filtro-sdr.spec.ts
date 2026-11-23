import { test, type Page } from '@playwright/test';
import { E2E_PASSWORD } from './env.js';

// Capturas do filtro de SDR fixo no próprio SDR (NPAC-66), em 375 e 1440 px.
// Só roda com CAPTURAS=<pasta>: pnpm --filter @npac/web e2e e2e/capturas-filtro-sdr.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const LARGURAS = [375, 1440];

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Abre a lista do campo (o seletor do CRM mostra as opções na própria página) e fotografa. */
async function campo(page: Page, label: string, nome: string, largura: number) {
  const select = page.getByLabel(label, { exact: true }).filter({ visible: true });
  await select.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${PASTA}/${nome}-${largura}.png` });
  await select.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${PASTA}/${nome}-${largura}-aberto.png` });
  await page.keyboard.press('Escape');
}

for (const largura of LARGURAS) {
  test(`SDR (igor) em ${largura} px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: largura < 768 ? 812 : 900 });
    await entrar(page, 'igor');
    await page.goto('/relatorios');
    await campo(page, 'SDR do relatório', 'relatorios-igor', largura);
    for (const tela of ['leads', 'pipeline'] as const) {
      await page.goto(`/${tela}`);
      await page.getByText('Filtrar e ordenar', { exact: true }).filter({ visible: true }).click();
      await campo(page, 'Responsável SDR', `${tela}-igor`, largura);
    }
  });
}

test('liderança (ana) em 1440 px, para comparar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page, 'ana');
  await page.goto('/relatorios');
  await campo(page, 'SDR do relatório', 'relatorios-ana', 1440);
});
