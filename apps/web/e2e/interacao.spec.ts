import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Base de interação (NPAC-31): todo controle anima hover, pressionar e foco, só com CSS.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`update "user" set two_factor_enabled = false`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function abrirDashboard(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('carla');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/acompanhamento\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

const colarPlanilha = (page: Page) =>
  page.getByRole('button', { name: 'Colar planilha', exact: true }).filter({ visible: true });

/** Aperta Tab até o foco chegar no elemento (no máximo 40 vezes). */
async function tabAte(page: Page, alvo: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await alvo.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('O Tab não chegou no elemento em 40 tentativas');
}

const estilo = (alvo: Locator, prop: keyof CSSStyleDeclaration) =>
  alvo.evaluate((el, p) => String(getComputedStyle(el)[p as keyof CSSStyleDeclaration]), prop);

test('botão tem transição de cor e de escala', async ({ page }) => {
  await abrirDashboard(page);
  const btn = colarPlanilha(page);
  const s = await btn.evaluate((el) => {
    const c = getComputedStyle(el);
    return { prop: c.transitionProperty, dur: c.transitionDuration };
  });
  expect(s.prop).toContain('background-color');
  expect(s.prop).toContain('scale');
  expect(s.dur).not.toBe('0s');
});

test('foco por Tab: anel dourado com afastamento animado', async ({ page }) => {
  await abrirDashboard(page);
  const btn = colarPlanilha(page);
  await tabAte(page, btn);
  await expect.poll(() => estilo(btn, 'outlineColor')).toBe('rgb(194, 146, 46)');
  await expect.poll(() => estilo(btn, 'outlineOffset')).toBe('2px');
  expect(await estilo(btn, 'outlineStyle')).toBe('solid');
  expect(await estilo(btn, 'transitionProperty')).toContain('outline-offset');
});

test('campo .field focado não ganha anel duplo', async ({ page }) => {
  await abrirDashboard(page);
  const busca = page.getByRole('searchbox', { name: 'Buscar mentorados' });
  await tabAte(page, busca);
  expect(await estilo(busca, 'outlineStyle')).toBe('none');
  expect(await estilo(busca, 'boxShadow')).toContain('rgba(194, 146, 46');
});

test('campo editável da tabela mantém o anel dourado no foco', async ({ page }) => {
  await owner`insert into mentoria_mentorados (nome, nome_norm, status) values ('Mentorado Interação', 'mentorado interacao', 'ENGAJADO')`;
  try {
    await abrirDashboard(page);
    const nome = page.getByLabel('Nome de Mentorado Interação', { exact: true });
    await nome.focus();
    await expect.poll(() => estilo(nome, 'outlineColor')).toBe('rgb(194, 146, 46)');
    expect(await estilo(nome, 'outlineStyle')).toBe('solid');
  } finally {
    await owner`truncate mentoria_mentorados, mentoria_fichas, mentoria_rdv_pessoas, mentoria_midia cascade`;
  }
});

test('secundário muda de fundo no hover', async ({ page }) => {
  await abrirDashboard(page);
  const btn = colarPlanilha(page);
  const antes = await estilo(btn, 'backgroundColor');
  await btn.hover();
  await expect.poll(() => estilo(btn, 'backgroundColor')).not.toBe(antes);
});

test('pressionado encolhe para .97 e volta', async ({ page }) => {
  await abrirDashboard(page);
  // Fixa o botão do cabeçalho: ao soltar, a gaveta abre com outra aba "Colar planilha".
  await colarPlanilha(page).evaluate((el) => el.setAttribute('data-teste', 'pressionar'));
  const btn = page.locator('[data-teste="pressionar"]');
  await btn.hover();
  await page.mouse.down();
  await expect.poll(() => estilo(btn, 'scale')).toBe('0.97');
  await page.mouse.up();
  await expect.poll(() => estilo(btn, 'scale')).toBe('none');
});

test('botão escuro do login também encolhe ao pressionar', async ({ page }) => {
  await page.goto('/login');
  const btn = page.getByRole('button', { name: 'Login', exact: true });
  await btn.hover();
  await page.mouse.down();
  await expect.poll(() => estilo(btn, 'scale')).toBe('0.97');
  await page.mouse.up();
});

test.describe('toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });
  test('sem hover grudado depois do toque', async ({ page }) => {
    await abrirDashboard(page);
    // Exportar não abre gaveta: o dedo continua "sobre" o botão depois do toque.
    const btn = page
      .getByRole('button', { name: 'Exportar .json', exact: true })
      .filter({ visible: true });
    const antes = await estilo(btn, 'backgroundColor');
    await btn.tap();
    await page.waitForTimeout(400); // mais que a transição: o fundo não pode ter mudado
    expect(await estilo(btn, 'backgroundColor')).toBe(antes);
  });
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('duração ~0', async ({ page }) => {
    await abrirDashboard(page);
    const dur = await estilo(colarPlanilha(page), 'transitionDuration');
    expect(parseFloat(dur)).toBeLessThan(0.01);
  });
});
