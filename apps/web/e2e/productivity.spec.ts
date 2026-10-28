import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

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
  await page.waitForURL(/\/dashboard/);
}

test('Ctrl+K busca lead e navega sem mouse', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.keyboard.press('Control+k');
  const box = page.getByRole('combobox', { name: 'Buscar leads ou ir para…' });
  await expect(box).toBeFocused();
  await box.fill('Lead do');
  await expect(page.getByRole('option', { name: /Lead do Ale/ })).toBeVisible();
  // Escopo vale também na busca rápida.
  await expect(page.getByRole('option', { name: /Lead do Murilo/ })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lead do Ale' })).toBeVisible();

  await page.keyboard.press('Control+k');
  await box.fill('pipe');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/pipeline$/);

  await page.keyboard.press('Control+k');
  await expect(box).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);
});

test('avisos: SDR vê o lead que o Head passou para ele e marca como lido', async ({ page }) => {
  await owner`update "user" set two_factor_enabled=true where email='ronaldo@npac.com.br'`;
  const [ale] = await owner<{ id: string }[]>`select id from "user" where email='ale@npac.com.br'`;
  const [head] = await owner<
    { id: string }[]
  >`select id from "user" where email='ronaldo@npac.com.br'`;
  // Simula o Head cadastrando para o Ale (o gatilho do banco gera o aviso).
  const [lead] = await owner<{ id: string }[]>`
    insert into leads (name, instagram, income_band, source, tier, stage_id, sdr_id, created_by)
    select 'Lead do aviso', 'lead.do.aviso', 'R5_8K', 'INSTAGRAM', 'P1', s.id, ${ale!.id}, ${head!.id}
    from pipeline_stages s where s.key = 'SONDAGEM' returning id`;
  await owner`insert into lead_timeline (lead_id, actor_id, kind) values (${lead!.id}, ${head!.id}, 'lead.created')`;

  await login(page, 'ale@npac.com.br');
  const link = page.getByRole('link', { name: /^Avisos, \d+ novos?$/ });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/avisos$/);
  await expect(page.getByText('cadastrou', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Lead do aviso/ })).toBeVisible();
  await page.getByRole('button', { name: 'Marcar tudo como lido' }).click();
  await expect(page.getByText('Tudo em dia', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Avisos', exact: true })).toBeVisible();
});
