import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

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
  await page.waitForURL(/\/acompanhamento\/fila/);
}
const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });

test('Duda exclui uma inscrição pela ficha, com confirmação', async ({ page }) => {
  await entrar(page, 'duda');
  const r = await page.request.post('/api/mentoria/inscricoes', {
    data: { tipo: 'INDIVIDUAL', mentoria: 'RDV', pessoas: [{ nome: 'Mentorado Fictício 81' }] },
  });
  expect(r.status()).toBe(201);
  const { id } = (await r.json()) as { id: string };
  await page.goto(`/acompanhamento/ficha/${id}`);
  await page.getByRole('button', { name: 'Mais ações' }).click();
  await page.getByRole('menuitem', { name: 'Excluir inscrição' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Excluir inscrição' });
  await expect(dialogo).toContainText('não pode ser desfeita');
  await dialogo.getByRole('button', { name: 'Excluir inscrição' }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect
    .poll(async () => (await owner`select 1 from mentoria_inscricoes where id = ${id}`).length)
    .toBe(0);
});

test('Duda exporta a Fila em CSV; a Operação não vê o botão', async ({ page, browser }) => {
  await entrar(page, 'duda');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  expect((await download).suggestedFilename()).toBe('acompanhamento-fila.csv');
  await lateral(page).getByRole('link', { name: 'Mentorados', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const csv = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar' }).click();
  expect((await csv).suggestedFilename()).toBe('acompanhamento-mentorados.csv');

  const outra = await browser.newPage();
  await entrar(outra, 'operacao');
  await expect(outra.getByRole('heading', { name: 'Fila do dia', level: 1 })).toBeVisible();
  await expect(outra.getByRole('button', { name: 'Exportar' })).toHaveCount(0);
  await outra.close();
});
