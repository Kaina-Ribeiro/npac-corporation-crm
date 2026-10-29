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

/** Ordem na tela: durante o gesto vale `style.order`; depois de soltar, a ordem do DOM. */
const order = (page: Page) =>
  page.locator('.dash-board [data-card]').evaluateAll((els) =>
    els
      .map((el, i) => ({
        id: (el as HTMLElement).dataset.card!,
        at: Number((el as HTMLElement).style.order || i),
      }))
      .sort((a, b) => a.at - b.at)
      .map((c) => c.id),
  );

/** Entrada da página terminada (as capturas saem com os cards já visíveis). */
const revealed = (page: Page) =>
  page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== 'running' || !(a instanceof CSSAnimation) || a.animationName !== 'reveal',
      ),
  );

/** Molas assentadas: nenhum card deslocado nem pousando. */
const settled = (page: Page) =>
  expect
    .poll(() =>
      page
        .locator('.dash-item')
        .evaluateAll((els) =>
          els.every(
            (el) => !(el as HTMLElement).style.transform && !el.hasAttribute('data-settling'),
          ),
        ),
    )
    .toBe(true);

// SDR: sem o feed da equipe, que é só da liderança.
const DEFAULT = [
  'kpi-leads',
  'kpi-meetings',
  'kpi-sold',
  'kpi-received',
  'revenue',
  'funnel',
  'daily-leads',
  'tiers',
  'closers',
  'sdrs',
  'products',
];
const without = (id: string) => DEFAULT.filter((c) => c !== id);

test('dashboard: arrasta e reordena cards, a ordem persiste e volta ao padrão', async ({
  page,
  context,
}) => {
  await login(page, 'ale@npac.com.br');
  await expect.poll(() => order(page)).toEqual(DEFAULT);
  const restore = page.getByRole('button', { name: 'Ordem padrão' });
  await expect(restore).toHaveCount(0);

  // Mouse: pega o Funil pelo puxador e solta sobre o primeiro card.
  const grip = page.getByRole('button', { name: 'Mover card Funil', exact: true });
  const g = (await grip.boundingBox())!;
  const t = (await page.locator('[data-card="kpi-leads"]').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-card="funnel"]')).toHaveAttribute('data-lifted', '');
  await page.mouse.move(t.x + 24, t.y + t.height / 2, { steps: 30 });
  // Os outros abrem espaço antes de soltar.
  await expect.poll(() => order(page)).toEqual(['funnel', ...without('funnel')]);
  await expect
    .poll(() =>
      page
        .locator('.dash-item:not([data-lifted])')
        .evaluateAll((els) => els.every((el) => !(el as HTMLElement).style.transform)),
    )
    .toBe(true);
  await page.screenshot({ path: 'test-results/dashboard-drag.png' });
  await page.mouse.up();
  await settled(page);
  await expect(page.locator('[data-card="funnel"]')).not.toHaveAttribute('data-lifted', '');
  await expect(restore).toBeVisible();

  // Só IDs de cards no cookie, restrito ao /dashboard.
  const saved = (await context.cookies()).find((c) => c.name.startsWith('npac_dash_'));
  expect(saved?.path).toBe('/dashboard');
  expect(saved?.value).toMatch(/^[a-z.-]+$/);

  await page.reload();
  await expect.poll(() => order(page)).toEqual(['funnel', ...without('funnel')]);
  await revealed(page);
  await page.screenshot({ path: 'test-results/dashboard-reordered.png' });

  // Teclado: espaço levanta, setas movem, espaço solta; o foco fica no puxador.
  await grip.focus();
  await page.keyboard.press('Space');
  await expect(grip).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  const moved = ['kpi-leads', 'kpi-meetings', 'funnel', ...without('funnel').slice(2)];
  await expect.poll(() => order(page)).toEqual(moved);
  await expect(grip).toBeFocused();
  await expect(grip).toHaveAttribute('aria-pressed', 'false');

  // Esc cancela e devolve o card para onde estava.
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  await expect.poll(() => order(page)).toEqual(['funnel', ...without('funnel')]);
  await page.keyboard.press('Escape');
  await expect.poll(() => order(page)).toEqual(moved);
  await settled(page);

  await page.reload();
  await expect.poll(() => order(page)).toEqual(moved);

  // Restaurar volta à ordem padrão e apaga a preferência.
  await restore.click();
  await expect.poll(() => order(page)).toEqual(DEFAULT);
  await expect(restore).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name.startsWith('npac_dash_'))).toBe(false);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(DEFAULT);
  await revealed(page);
  await page.screenshot({ path: 'test-results/dashboard-reorder.png', fullPage: true });
});
