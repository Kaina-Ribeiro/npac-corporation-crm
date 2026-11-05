import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);
const FICHA = '55555555-5555-4555-8555-555555555555';

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await owner`insert into mentoria_fichas (id, nome, nome_norm, data_inicio_texto) values (${FICHA}, 'Mentorado Fictício 60', 'mentorado ficticio 60', '01/02/2026')`;
});
test.afterAll(async () => {
  await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  await owner`update "user" set two_factor_enabled = false`;
  await closeTestConnections();
});

async function abrir(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await owner`update "user" set two_factor_enabled = true where email = 'carla@npac.com.br'`;
  await page.goto(`/acompanhamento/linha-do-tempo/${FICHA}`);
  await expect(page.getByRole('textbox', { name: 'Nome da ficha' })).toBeVisible();
}

test('alternar visão mantém os dados; lado a lado mostra antes e depois sem campos de edição', async ({
  page,
}) => {
  await abrir(page);
  const notas = page.getByRole('textbox', { name: 'Notas do momento inicial' });
  await notas.fill('Profissão: engenheira fictícia\n<b>sem tag</b>');
  await page.getByRole('textbox', { name: 'Fé antes' }).fill('Pouca prática');
  await page.getByRole('tab', { name: 'Lado a lado' }).click();
  const lado = page.getByRole('tabpanel', { name: 'Lado a lado' });
  await expect(lado.getByText('engenheira fictícia')).toBeVisible();
  await expect(lado.locator('b', { hasText: 'Profissão' })).toBeVisible();
  await expect(lado.getByText('<b>sem tag</b>')).toBeVisible();
  await expect(lado.getByRole('cell', { name: 'Pouca prática' })).toBeVisible();
  await expect(lado.getByRole('textbox')).toHaveCount(0);
  await expect(lado.getByRole('button')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Linha do tempo' }).click();
  await expect(page.getByRole('textbox', { name: 'Fé antes' })).toHaveValue('Pouca prática');
});

test('emulateMedia print esconde navegação e botões; imprimir grava mentoria.print', async ({
  page,
}) => {
  await abrir(page);
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole('button', { name: 'Exportar PDF' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Lado a lado' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await owner<
            { n: number }[]
          >`select count(*)::int as n from audit_log where action = 'mentoria.print'`
        )[0]?.n,
    )
    .toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exportar PDF' })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Lado a lado' })).toBeHidden();
  await expect(page.getByText('Mentorado Fictício 60').first()).toBeVisible();
});

test('impressão da linha do tempo: sem "Adicionar…" e linha em cor', async ({ page }) => {
  await abrir(page);
  const fe = page.getByRole('textbox', { name: 'Fé antes' });
  await fe.fill('Pouca prática');
  await fe.blur();
  await page.emulateMedia({ media: 'print' });
  const painel = page.getByRole('tabpanel', { name: 'Linha do tempo' });
  await expect(painel.locator('.campo-vazio').first()).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Fé hoje' })).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Saúde antes' })).toBeHidden();
  expect(
    await painel.locator('.linha-rail').evaluate((el) => getComputedStyle(el).printColorAdjust),
  ).toBe('exact');
  await expect(page.getByLabel('Fé antes', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Enviar foto de antes')).toBeHidden();
});
