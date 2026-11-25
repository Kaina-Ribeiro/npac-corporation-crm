import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-75 no celular (projeto 'iphone'): o Dashboard não rola de lado, o funil é grade de 3 colunas (nunca desliza),
// tocar num grupo mostra os nomes dele, "Ver todos" abre o resto, e os toques têm 44 px.
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const ids: string[] = [];

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.beforeAll(async () => {
  for (let n = 1; n <= 7; n++) {
    const [i] = await owner.unsafe<{ id: string }[]>(
      `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, engajamento)
       values ('INDIVIDUAL', 'RDV', 'ATIVO', ${HOJE} - 40, ${HOJE} + 325, 'EM_ATENCAO') returning id`,
    );
    const nome = `Mentorado Fictício Cel ${n}`;
    await owner`insert into mentoria_pessoas (inscricao_id, ordem, nome, nome_norm)
      values (${i!.id}, 1, ${nome}, ${nome.toLowerCase()})`;
    ids.push(i!.id);
  }
});
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  for (const id of ids) await owner`delete from mentoria_inscricoes where id = ${id}`;
  await closeTestConnections();
});

test('Dashboard no iPhone: sem rolagem lateral, funil em 3 colunas, grupo tocado mostra os nomes', async ({
  page,
}) => {
  await entrar(page, 'duda');
  await page.goto('/acompanhamento/onboarding');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();

  // Barra de baixo: todos os atalhos de antes mais o Dashboard, marcado nesta tela, tudo dentro da tela.
  const barra = page.getByRole('navigation', { name: 'Abas do acompanhamento' });
  const nomes = await barra
    .getByRole('link')
    .evaluateAll((ls) => ls.map((l) => l.getAttribute('aria-label') ?? l.textContent?.trim()));
  expect(nomes).toEqual(['Dashboard', 'Mentorados', 'Nova inscrição', 'Reuniões', 'Fila', 'Mais']);
  await expect(barra.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const link of await barra.getByRole('link').all()) {
    const b = (await link.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }

  const largura = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(largura[0]).toBeLessThanOrEqual(largura[1]!);

  // Funil: 3 colunas, nada escondido à direita.
  const colunas = await page
    .locator('.fun')
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(colunas).toBe(3);
  const fun = await page.locator('.fun').evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(fun[0]).toBeLessThanOrEqual(fun[1]!);

  // Celular: as quatro listas do computador ficam fora; a lista é a do grupo tocado.
  await expect(page.locator('.eg-listas')).toBeHidden();
  const cel = page.locator('.eg-cel');
  await page.getByRole('button', { name: /^Em atenção/ }).click();
  await expect(cel.getByRole('heading', { name: /^Em atenção \(\d+\)$/ })).toBeVisible();
  const antes = await cel.getByRole('link').count();
  expect(antes).toBe(5);
  const verTodos = cel.getByRole('button', { name: /^Ver todos os \d+$/ });
  const caixa = await verTodos.boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(44);
  await verTodos.click();
  expect(await cel.getByRole('link').count()).toBeGreaterThanOrEqual(7);
  for (const link of await cel.getByRole('link').all()) {
    const b = await link.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
  for (const k of await page.locator('button.eg-k').all()) {
    const b = await k.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
  }
});
