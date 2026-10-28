import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';
import { totp } from './totp.js';

const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

async function headWithMfa(page: Page) {
  await owner`update "user" set two_factor_enabled=false where email='ana@npac.com.br'`;
  await owner`delete from two_factor where user_id=(select id from "user" where email='ana@npac.com.br')`;
  await login(page, 'ana@npac.com.br');
  await page.waitForURL(/\/conta\/mfa/);
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const secret = await page.locator('code').innerText();
  await page.getByLabel('Código', { exact: true }).fill(totp(secret));
  await page.getByRole('button', { name: 'Ativar e entrar' }).click();
  await page.waitForURL(/\/dashboard/);
}

test('HEAD convida usuário, vê auditoria e registra pedido LGPD', async ({ page }) => {
  await headWithMfa(page);
  await page
    .getByRole('navigation', { name: 'Navegação lateral' })
    .getByRole('link', { name: 'Admin' })
    .click();
  await page.waitForURL(/\/admin/);
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa Convidada');
  await page.getByLabel('E-mail', { exact: true }).fill('convidada@npac.test');
  await page.getByLabel('Prospecta').check();
  await page.getByRole('button', { name: 'Convidar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Senha temporária' })).toBeVisible();
  await expect(page.getByText('convidada@npac.test · SDR')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin.png', fullPage: true });

  await page.getByRole('tab', { name: 'Auditoria' }).click();
  await expect(page.getByText('admin.user.invite').first()).toBeVisible();

  const [lead] = await owner<{ id: string }[]>`select id from leads where name='Lead do Murilo'`;
  await page.getByRole('tab', { name: 'LGPD' }).click();
  await page.getByLabel('ID do lead (copie da ficha)').fill(lead!.id);
  await page.getByLabel('Descrição (sem telefone ou documentos)').fill('Pediu cópia dos dados');
  await page.getByRole('button', { name: 'Registrar' }).click();
  await expect(page.getByText('Pediu cópia dos dados')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar dados' })).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-lgpd.png', fullPage: true });
});

test('SDR não acessa o Admin', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/dashboard/);
  await expect(
    page
      .getByRole('navigation', { name: 'Navegação lateral' })
      .getByRole('link', { name: 'Admin' }),
  ).toHaveCount(0);
  const res = await page.goto('/admin');
  expect(res?.status()).toBe(404);
});
