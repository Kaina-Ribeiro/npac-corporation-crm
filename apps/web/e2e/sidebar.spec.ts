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
  await page.waitForURL(/\/(dashboard|acompanhamento)/);
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

const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
const MODULOS = [
  ['Mentorados', /\/acompanhamento\/mentorados$/],
  ['Reuniões', /\/acompanhamento\/em-breve\/reunioes$/],
  ['Renovações e gestão', /\/acompanhamento\/em-breve\/renovacoes$/],
  ['Configurações', /\/acompanhamento\/configuracoes$/],
] as const;
const LONGO = 'Linha do tempo e conquistas';

test('Duda navega pelos itens da sidebar', async ({ page }) => {
  await login(page, 'duda@npac.com.br');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(lateral(page).getByRole('heading', { name: 'Em breve' })).toBeVisible();
  await expect(lateral(page).getByRole('heading', { name: 'Admin' })).toBeVisible();
  for (const [nome, url] of [...MODULOS].reverse()) {
    const link = lateral(page).getByRole('link', { name: nome, exact: true });
    await link.click();
    await page.waitForURL(url);
    await expect(link).toHaveAttribute('aria-current', 'page');
  }
});

test('Diretoria: grupo abre dentro do módulo e fecha fora', async ({ page }) => {
  await login(page, 'diretor@npac.com.br');
  await page.goto('/leads');
  const item = lateral(page).locator('a', { hasText: LONGO });
  await expect(item).toBeHidden();
  const sub = page.locator('.side-sub');
  await expect.poll(() => sub.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');
  // Fechado não recebe foco por Tab: do Acompanhamento, o Tab pula para o próximo item.
  await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(item).not.toBeFocused();

  await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await expect(item).toBeVisible();
  await expect.poll(() => sub.evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
  await item.click();
  await page.waitForURL(/\/acompanhamento\/em-breve\/linha-do-tempo$/);
  await expect(item).toHaveAttribute('aria-current', 'page');
  await expect(lateral(page).getByRole('heading', { name: 'Em breve' })).toBeVisible();

  // Volta ao comercial pelo menu: o grupo fecha.
  await lateral(page).getByRole('link', { name: 'Leads', exact: true }).click();
  await page.waitForURL(/\/leads/);
  await expect(item).toBeHidden();
});

test('tablet 768: sub-itens não estouram a sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, 'diretor@npac.com.br');
  await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const item = lateral(page).locator('a', { hasText: LONGO });
  await expect(item).toBeVisible();
  const m = await page.locator('.side-nav').evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
  // O rótulo inteiro cabe (sem reticências escondidas pelo overflow).
  const label = await item
    .locator('.side-label')
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(label).toBe(true);
});

test('trilho recolhido: Duda vê os ícones com tooltip', async ({ page }) => {
  await login(page, 'duda@npac.com.br');
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  await page.getByRole('button', { name: 'Recolher barra lateral' }).click();
  await expect.poll(() => sideWidth(page)).toBe(56);
  for (const [nome] of MODULOS)
    await expect(lateral(page).getByRole('link', { name: nome, exact: true })).toBeVisible();
  await lateral(page).getByRole('link', { name: LONGO, exact: true }).hover();
  await expect(page.locator('.side-tip')).toHaveText(LONGO);
  // Os títulos de grupo continuam no DOM, mas somem no trilho.
  for (const titulo of ['Em breve', 'Admin']) {
    const h = lateral(page).getByRole('heading', { name: titulo, includeHidden: true });
    await expect(h).toHaveCount(1);
    await expect(h).toBeHidden();
  }
});

test('trilho recolhido: Diretoria dentro do módulo vê só o ícone do Acompanhamento', async ({
  page,
}) => {
  await login(page, 'diretor@npac.com.br');
  await lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/mentorados/);
  const item = lateral(page).locator('a', { hasText: LONGO });
  await expect(item).toBeVisible();
  await page.getByRole('button', { name: 'Recolher barra lateral' }).click();
  await expect.poll(() => sideWidth(page)).toBe(56);
  await expect(item).toBeHidden();
  await expect(
    lateral(page).getByRole('link', { name: 'Acompanhamento', exact: true }),
  ).toBeVisible();
});
