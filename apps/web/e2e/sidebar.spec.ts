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
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

const sideWidth = (page: Page) =>
  page.locator('#app-sidebar').evaluate((el) => Math.round(el.getBoundingClientRect().width));

test('sidebar recolhe em trilho, mostra tooltip e lembra a escolha após recarregar', async ({
  page,
}) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/leads');
  const toggle = page.getByRole('button', { name: 'Recolher barra lateral' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(await sideWidth(page)).toBe(236);

  await toggle.click();
  const expand = page.getByRole('button', { name: 'Expandir barra lateral' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => sideWidth(page)).toBe(56);
  // Os itens continuam com nome acessível; o nome aparece num tooltip ao passar o mouse.
  const leads = page.getByRole('navigation', { name: 'Navegação lateral' }).getByRole('link', {
    name: 'Leads',
  });
  await leads.hover();
  await expect(page.locator('.side-tip')).toHaveText('Leads');

  // O servidor já renderiza recolhida (cookie), sem piscar aberta antes da hidratação.
  const html = await (await page.request.get('/leads')).text();
  expect(html).toContain('data-side="collapsed"');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
  expect(await sideWidth(page)).toBe(56);

  // Ctrl+B volta (o atalho só existe depois da hidratação).
  await expect(async () => {
    await page.keyboard.press('Control+b');
    await expect(page.getByRole('button', { name: 'Recolher barra lateral' })).toBeVisible({
      timeout: 500,
    });
  }).toPass();
  await expect.poll(() => sideWidth(page)).toBe(236);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recolher barra lateral' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('telas largas: o conteúdo ocupa a largura útil, sem rolagem horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1200 });
  await login(page, 'ale@npac.com.br');
  for (const path of ['/hoje', '/leads', '/playbook', '/avisos', '/equipe']) {
    await page.goto(path);
    const m = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const pad = parseFloat(getComputedStyle(main).paddingLeft) * 2;
      const inner = main.firstElementChild!.getBoundingClientRect().width;
      return {
        fill: inner / (main.getBoundingClientRect().width - pad),
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    // ≤ 0: a barra de rolagem vertical pode ocupar parte de innerWidth.
    expect(m.overflow, path).toBeLessThanOrEqual(0);
    expect(m.fill, path).toBeGreaterThan(0.98);
  }
});
