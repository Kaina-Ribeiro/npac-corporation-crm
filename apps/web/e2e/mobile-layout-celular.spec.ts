import { expect, test, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Fase 1 de 18/11/2026 (celular): um teste por quebra achada na varredura por cargo
// (`scripts/varredura-celular.mjs`). Roda no projeto 'iphone' (WebKit, tela de toque).
const owner = ownerSql(E2E_DB);
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function leadDoAle() {
  const [lead] = await owner<{ id: string }[]>`select id from leads where name = 'Lead do Ale'`;
  return lead!.id;
}

/**
 * Alvo de toque de 44 px (Apple): um toque a 21 px do centro, para cima, para baixo e para os
 * lados, ainda acerta o controle. Caixa dentro de `<label>`: o alvo é o label inteiro (tocar no
 * texto também marca). Devolve o que falhou.
 */
async function alvoCurto(alvo: Locator): Promise<string | null> {
  await alvo.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  return alvo.evaluate((controle) => {
    const el = controle.closest('label') ?? controle;
    const r = el.getBoundingClientRect();
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
    const acerta = (x: number, y: number) => {
      const h = document.elementFromPoint(x, y);
      return !!h && (h === el || el.contains(h));
    };
    const lados = [
      [0, -21],
      [0, 21],
      [-21, 0],
      [21, 0],
    ].filter(([dx, dy]) => !acerta(cx + dx!, cy + dy!));
    if (!lados.length) return null;
    const nome = controle.getAttribute('aria-label') || controle.textContent?.trim().slice(0, 30);
    return `${nome} ${Math.round(r.width)}×${Math.round(r.height)}`;
  });
}

/** Campos visíveis com letra < 16 px: no iPhone o Safari dá zoom na tela ao tocar neles. */
function camposComZoom(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input, select, textarea')]
      .filter((el) => {
        if (el.matches('[type=checkbox], [type=radio], [type=range], [type=file], [type=hidden]'))
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && parseFloat(getComputedStyle(el).fontSize) < 16;
      })
      .map(
        (el) =>
          `${el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.tagName} ${getComputedStyle(el).fontSize}`,
      ),
  );
}

test('o menu Exportar de Leads cabe na tela e não deixa a lista aparecer por trás', async ({
  page,
}) => {
  await entrar(page, 'diretor');
  await page.goto('/leads');
  const exportar = page.locator('summary', { hasText: 'Exportar' });
  // Clique pelo elemento: no WebKit do Linux (CI) o vidro dos cards da lista é pintado sem placa
  // de vídeo e a tela para de redesenhar, então o `click()` do Playwright, que espera a tela ficar
  // estável, nunca dispara. O que se mede aqui (posição e fundo) não depende da pintura.
  await exportar.evaluate((el) => (el as HTMLElement).click());
  const menu = page.locator('details[open] > div').first();
  await expect(menu).toBeVisible();
  const r = await menu.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const fundo = getComputedStyle(el).backgroundColor;
    const alfa = fundo.startsWith('rgba') ? Number(fundo.split(',')[3]!.replace(')', '')) : 1;
    return {
      esquerda: Math.round(b.left),
      direita: Math.round(b.right),
      tela: document.documentElement.clientWidth,
      alfa,
    };
  });
  expect(r.esquerda).toBeGreaterThanOrEqual(0);
  expect(r.direita).toBeLessThanOrEqual(r.tela);
  expect(r.alfa).toBe(1);
});

test('a ação do Plano não rola de lado no iPad (campo de arquivo escondido)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await entrar(page, 'duda');
  const [acao] = await owner<{ id: string }[]>`select id from mentoria_acoes order by mes limit 1`;
  await page.goto(`/acompanhamento/plano/acao/${acao!.id}`);
  await expect(page.getByRole('button', { name: /Anexar|Trocar/ }).first()).toBeVisible();
  const largura = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(largura[0]).toBeLessThanOrEqual(largura[1]! + 1);
});

test('nenhum campo do comercial tem letra < 16 px no celular (o iPhone dá zoom)', async ({
  page,
}) => {
  await entrar(page, 'diretor');
  const achados: Record<string, string[]> = {};
  for (const path of ['/pipeline', '/leads', '/dashboard', '/admin', '/hoje']) {
    await page.goto(path);
    await page.locator('main h1').first().waitFor();
    const r = await camposComZoom(page);
    if (r.length) achados[path] = r;
  }
  expect(achados).toEqual({});
});

test('nenhum campo do Acompanhamento tem letra < 16 px no iPad', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await entrar(page, 'duda');
  const achados: Record<string, string[]> = {};
  for (const path of ['/acompanhamento/mentorados', '/acompanhamento/reunioes/nova']) {
    await page.goto(path);
    await page.locator('h1').first().waitFor();
    const r = await camposComZoom(page);
    if (r.length) achados[path] = r;
  }
  expect(achados).toEqual({});
});

test('a página usa a tela inteira do iPhone e tem ícone para a Tela de Início', async ({
  page,
  request,
}) => {
  await page.goto('/login');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  const icone = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute('href');
  expect(icone).toBeTruthy();
  const res = await request.get(icone!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
});

test('com o teclado aberto, a barra de ações dos formulários não cobre o campo', async ({
  page,
}) => {
  await entrar(page, 'duda');
  const cobertos: Record<string, string[]> = {};
  for (const path of ['/acompanhamento/mentorados/nova', '/acompanhamento/reunioes/nova']) {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto(path);
    await page.locator('.nf-barra').waitFor();
    // Teclado aberto: a tela útil perde ~300 px; o navegador rola o campo até a borda de baixo.
    await page.setViewportSize({ width: 390, height: 364 });
    const r = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          'main input:not([type=hidden], [type=checkbox], [type=radio], [type=file]), main textarea',
        ),
      ]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          window.scrollTo(0, 0);
          el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
          const c = el.getBoundingClientRect();
          const h = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
          return !(h && (h === el || el.contains(h)));
        })
        .map((el) => el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.id),
    );
    if (r.length) cobertos[path] = r;
  }
  expect(cobertos).toEqual({});
});

test('a barra de baixo sai da frente enquanto se digita', async ({ page }) => {
  await entrar(page, 'ale');
  await page.goto(`/leads/${await leadDoAle()}`);
  const barra = page.getByRole('navigation', { name: 'Navegação inferior' });
  await expect(barra).toBeVisible();
  await page.getByLabel('Nova tarefa').focus();
  await expect(barra).toBeHidden();
  await page.getByLabel('Nova tarefa').blur();
  await expect(barra).toBeVisible();

  await page.context().clearCookies();
  await entrar(page, 'duda');
  await page.goto('/acompanhamento/mentorados');
  const abas = page.getByRole('navigation', { name: 'Abas do acompanhamento' });
  await expect(abas).toBeVisible();
  await page.getByLabel('Buscar mentorados').first().focus();
  await expect(abas).toBeHidden();
});

test('os controles pequenos do comercial aceitam um toque de 44 px', async ({ page }) => {
  const id = await leadDoAle();
  const [ale] = await owner<{ id: string }[]>`select id from "user" where username = 'ale'`;
  await owner`delete from lead_tasks where title = 'Tarefa do toque'`;
  await owner`
    insert into lead_tasks (lead_id, title, assignee_id, due_at, created_by)
    values (${id}, 'Tarefa do toque', ${ale!.id}, now() - interval '1 hour', ${ale!.id})`;
  try {
    await entrar(page, 'ale');
    const curtos: string[] = [];
    const conferir = async (alvo: Locator) => {
      const r = await alvoCurto(alvo);
      if (r) curtos.push(r);
    };
    await page.goto('/leads');
    // Qualquer lead da 1ª página (na suíte inteira o Ale tem dezenas e o dele sai da página).
    await conferir(
      page
        .getByRole('checkbox', { name: /^Selecionar (?!todos)/ })
        .filter({ visible: true })
        .first(),
    );
    await page.goto('/hoje');
    await conferir(page.getByRole('button', { name: 'Concluir Tarefa do toque' }));
    await conferir(page.locator('main').getByRole('link', { name: 'Novo lead', exact: true }));
    await page.goto('/pipeline');
    await conferir(page.locator('summary', { hasText: 'Filtrar e ordenar' }));
    const colunas = page.locator('summary', { hasText: 'Colunas visíveis' });
    await conferir(colunas);
    await colunas.click();
    await conferir(page.locator('details[open] label input[type=checkbox]').first());
    await page.goto(`/leads/${id}`);
    await conferir(page.getByRole('link', { name: '‹ Leads' }));
    await conferir(page.locator('summary', { hasText: 'Editar dados do lead' }));
    await conferir(page.getByRole('button', { name: 'Adicionar nota' }));
    expect(curtos).toEqual([]);
  } finally {
    await owner`delete from lead_tasks where title = 'Tarefa do toque'`;
  }
});

test('os controles pequenos do Admin e do Acompanhamento aceitam um toque de 44 px', async ({
  page,
}) => {
  const curtos: string[] = [];
  const conferir = async (alvo: Locator) => {
    const r = await alvoCurto(alvo);
    if (r) curtos.push(r);
  };
  await entrar(page, 'diretor');
  await page.goto('/admin');
  await conferir(page.getByRole('checkbox', { name: /Atua como SDR/ }).first());
  await page.context().clearCookies();
  await entrar(page, 'duda');
  await page.goto('/acompanhamento/plano');
  await conferir(page.locator('.check.sm').first());
  expect(curtos).toEqual([]);
});
