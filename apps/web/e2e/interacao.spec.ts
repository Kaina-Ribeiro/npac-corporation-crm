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

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('duração ~0', async ({ page }) => {
    await abrirDashboard(page);
    const dur = await estilo(colarPlanilha(page), 'transitionDuration');
    expect(parseFloat(dur)).toBeLessThan(0.01);
  });
});
