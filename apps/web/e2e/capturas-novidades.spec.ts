import { test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { NOVIDADES } from '@npac/shared/novidades';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Capturas da janela "O que mudou no CRM" (NPAC-77) nas mesmas situações do protótipo
// (`docs/prototipos/novidades/1-…9-*.png`), para comparar lado a lado.
// Só roda com CAPTURAS=<pasta>: pnpm --filter @npac/web e2e e2e/capturas-novidades.spec.ts
const PASTA = process.env.CAPTURAS;
test.skip(!PASTA, 'só com CAPTURAS=<pasta>');
const owner = ownerSql(E2E_DB);
const LARGURAS = [375, 768, 1024, 1440];

/** Pessoa e a última novidade que ela viu (o que fica "não visto" é o que o protótipo mostra). */
const CASOS = [
  // Protótipo 1, 2, 6, 7: Eduarda, só a atualização de hoje.
  { usuario: 'duda', nome: 'eduarda-hoje', vista: 'npac-74-telegram' },
  // Protótipo 3: Igor desde a noite de 23/11 (duas atualizações, "Faça isso" no topo).
  { usuario: 'igor', nome: 'igor-desde-23-11', vista: 'npac-73-tablet' },
  // Protótipo 4: Sônia desde 23/11.
  { usuario: 'sonia', nome: 'sonia-desde-23-11', vista: 'npac-66-filtro-sdr' },
  // Protótipo 5: Diretoria, tudo.
  { usuario: 'diretor', nome: 'diretoria-tudo', vista: NOVIDADES[NOVIDADES.length - 1]!.id },
];

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await owner`update "user" set novidades_vista = null where username = any(${CASOS.map((c) => c.usuario)})`;
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function foto(page: Page, nome: string) {
  for (const w of LARGURAS) {
    await page.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${PASTA}/${nome}-${w}.png` });
  }
}

for (const t of ['light', 'dark'] as const) {
  for (const c of CASOS) {
    test(`${c.nome} (${t})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: t, reducedMotion: 'reduce' });
      await page.addInitScript((v) => localStorage.setItem('theme', v), t);
      await owner`update "user" set novidades_vista = ${c.vista} where username = ${c.usuario}`;
      await page.setViewportSize({ width: 1440, height: 900 });
      await entrar(page, c.usuario);
      await page.getByRole('dialog', { name: 'O que mudou no CRM' }).waitFor();
      await foto(page, `${c.nome}-${t}`);
    });
  }

  test(`histórico e rodapé (${t})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: t, reducedMotion: 'reduce' });
    await page.addInitScript((v) => localStorage.setItem('theme', v), t);
    await owner`update "user" set novidades_vista = ${NOVIDADES[0]!.id} where username = 'igor'`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrar(page, 'igor');
    const linha = page.locator('#app-sidebar').getByRole('button', { name: /^Versão dev\./ });
    await page.screenshot({ path: `${PASTA}/rodape-${t}-1440.png` });
    const historico = page.getByRole('dialog', { name: 'Todas as atualizações' });
    for (let i = 0; i < 20 && !(await historico.isVisible()); i++) {
      await linha.click();
      await page.waitForTimeout(300);
    }
    await historico.waitFor();
    await foto(page, `historico-igor-${t}`);
  });
}
