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

async function abrirMentorados(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  // O login cai na Fila do dia (entrada do módulo); as medidas são na lista de Mentorados.
  await page.waitForURL(/\/acompanhamento\/fila/);
  await page.goto('/acompanhamento/mentorados');
  await expect(page.getByRole('heading', { name: 'Mentorados', exact: true })).toBeVisible();
}

const novaInscricao = (page: Page) =>
  page.getByRole('link', { name: 'Nova inscrição', exact: true }).filter({ visible: true });

/** Abre a primeira ficha da lista, onde ficam os botões discretos que não navegam. */
async function abrirFicha(page: Page) {
  await abrirMentorados(page);
  await page.getByRole('link', { name: /Mentorado Fictício 01/ }).click();
  await page.waitForURL(/\/acompanhamento\/ficha\//);
}
const maisAcoes = (page: Page) => page.getByRole('button', { name: 'Mais ações', exact: true });

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
  await abrirMentorados(page);
  const btn = novaInscricao(page);
  const s = await btn.evaluate((el) => {
    const c = getComputedStyle(el);
    return { prop: c.transitionProperty, dur: c.transitionDuration };
  });
  expect(s.prop).toContain('background-color');
  expect(s.prop).toContain('scale');
  expect(s.dur).not.toBe('0s');
});

test('foco por Tab: anel dourado com afastamento animado', async ({ page }) => {
  await abrirMentorados(page);
  const btn = novaInscricao(page);
  await tabAte(page, btn);
  await expect.poll(() => estilo(btn, 'outlineColor')).toBe('rgb(194, 146, 46)');
  await expect.poll(() => estilo(btn, 'outlineOffset')).toBe('2px');
  expect(await estilo(btn, 'outlineStyle')).toBe('solid');
  expect(await estilo(btn, 'transitionProperty')).toContain('outline-offset');
});

test('campo .field focado não ganha anel duplo', async ({ page }) => {
  await abrirMentorados(page);
  const busca = page.getByRole('searchbox', { name: 'Buscar mentorados' });
  await tabAte(page, busca);
  expect(await estilo(busca, 'outlineStyle')).toBe('none');
  expect(await estilo(busca, 'boxShadow')).toContain('rgba(194, 146, 46');
});

test('botão discreto muda de fundo no hover', async ({ page }) => {
  await abrirFicha(page);
  const btn = maisAcoes(page);
  const antes = await estilo(btn, 'backgroundColor');
  await btn.hover();
  await expect.poll(() => estilo(btn, 'backgroundColor')).not.toBe(antes);
});

test('pressionado encolhe para .97 e volta', async ({ page }) => {
  await abrirFicha(page);
  const btn = maisAcoes(page);
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
    await abrirFicha(page);
    // O menu abre sem navegar: o dedo continua "sobre" o botão depois do toque.
    const btn = maisAcoes(page);
    const antes = await estilo(btn, 'backgroundColor');
    await btn.tap();
    await page.waitForTimeout(400); // mais que a transição: o fundo não pode ter mudado
    expect(await estilo(btn, 'backgroundColor')).toBe(antes);
  });
});

/**
 * Quem encolhe ao pressionar precisa animar a escala; botão e link também animam o anel de foco;
 * botão compartilhado (`.btn`) anima ainda o fundo. Um `transition-colors` ou
 * `transition-[transform,…]` no chamador derruba isso (no Tailwind v4 a escala é a propriedade
 * `scale`, não `transform`).
 */
const semAnimacao = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[class*="active:scale"], .btn')]
      .filter((el) => {
        const p = getComputedStyle(el).transitionProperty;
        if (/\ball\b/.test(p)) return false;
        const precisa = ['scale'];
        if (el.matches('button, a')) precisa.push('outline-offset');
        if (el.classList.contains('btn')) precisa.push('background-color');
        return !precisa.every((x) => p.split(', ').includes(x));
      })
      .map((el) => el.outerHTML.slice(0, 160)),
  );

test('quem encolhe ao pressionar anima a escala (Acompanhamento)', async ({ page }) => {
  await abrirMentorados(page);
  await expect(page.getByRole('link', { name: /Mentorado Fictício 01/ })).toBeVisible();
  expect(await semAnimacao(page)).toEqual([]);
});

test('quem encolhe ao pressionar anima a escala (Pipeline e Hoje)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill('diretor');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/pipeline');
  await expect(page.getByRole('button', { name: 'Editar colunas', exact: true })).toBeVisible();
  expect(await semAnimacao(page)).toEqual([]);
  await page.goto('/hoje');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await semAnimacao(page)).toEqual([]);
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });
  test('duração ~0', async ({ page }) => {
    await abrirMentorados(page);
    const dur = await estilo(novaInscricao(page), 'transitionDuration');
    expect(parseFloat(dur)).toBeLessThan(0.01);
  });
});

// Desempenho (T2.2, caso 5 do Foco da revisão): API lenta mostra o esqueleto na hora; API com 500
// mostra a tela de erro, nunca o 500 cru, e "Tentar de novo" busca a tela outra vez. A lentidão e o
// erro vêm do banco (tabela travada / sem permissão), porque quem chama a API é o servidor do Next.
test.describe('carregamento e erro', () => {
  const lateral = (page: Page) => page.getByRole('navigation', { name: 'Navegação lateral' });
  async function entrarNosAvisos(page: Page) {
    await page.goto('/login');
    await page.getByLabel('Usuário', { exact: true }).fill('ale');
    await page.getByLabel('Senha').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await page.goto('/avisos');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  const playbook = (page: Page) =>
    page.getByRole('heading', { name: 'Playbook', level: 1, exact: true });

  test('API lenta mostra o esqueleto', async ({ page }) => {
    await entrarNosAvisos(page);
    let soltar!: () => void;
    const preso = new Promise<void>((r) => (soltar = r));
    let travou!: () => void;
    const travado = new Promise<void>((r) => (travou = r));
    const trava = owner.begin(async (tx) => {
      await tx`lock table playbook_scripts in access exclusive mode`;
      travou();
      await preso;
    });
    await travado;
    try {
      await lateral(page).getByRole('link', { name: 'Playbook', exact: true }).click();
      await expect(page.locator('[data-page-skeleton]').filter({ visible: true })).toBeVisible();
      await expect(playbook(page)).toHaveCount(0);
    } finally {
      soltar();
      await trava;
    }
    await expect(playbook(page)).toBeVisible();
    await expect(page.locator('[data-page-skeleton]').filter({ visible: true })).toHaveCount(0);
  });

  test('API com erro mostra "Não foi possível carregar." e "Tentar de novo" recarrega', async ({
    page,
  }) => {
    await entrarNosAvisos(page);
    await owner`revoke select on playbook_scripts from npac_app`;
    try {
      await lateral(page).getByRole('link', { name: 'Playbook', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Não foi possível carregar.', exact: true }),
      ).toBeVisible();
      // A casca continua: a sidebar segue na tela.
      await expect(lateral(page)).toBeVisible();
    } finally {
      await owner`grant select on playbook_scripts to npac_app`;
    }
    await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click();
    await expect(playbook(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Não foi possível carregar.' })).toHaveCount(0);
  });
});
