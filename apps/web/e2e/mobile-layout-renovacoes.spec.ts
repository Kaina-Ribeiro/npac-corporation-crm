import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-79 no celular (projeto 'iphone'): a aba Renovações e a janelinha "Registrar renovação" não rolam de lado, os
// toques têm 44 px e os campos 16 px (sem o zoom do iPhone ao tocar).
const owner = ownerSql(E2E_DB);
const HOJE = `(now() at time zone 'America/Sao_Paulo')::date`;
const NOME = 'Mentorado Fictício Renova Cel';
const ids: string[] = [];

async function entrar(page: Page) {
  // Sem a animação de entrada da janelinha: a medida é a do tamanho final.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login/acompanhamento');
  await page.getByLabel('Usuário', { exact: true }).fill('duda');
  await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function semRolagemLateral(page: Page) {
  const [rolagem, tela] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(rolagem).toBeLessThanOrEqual(tela!);
}

async function campos16(page: Page, raiz: string) {
  for (const c of await page
    .locator(`${raiz} :is(select, input:not([type="radio"]))`)
    .filter({ visible: true })
    .all()) {
    const fonte = await c.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fonte).toBeGreaterThanOrEqual(16);
    expect(await c.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  }
}

test.beforeAll(async () => {
  const duda = (await owner<{ id: string }[]>`select id from "user" where username = 'duda'`)[0]!
    .id;
  for (let n = 1; n <= 3; n++) {
    const [i] = await owner.unsafe<{ id: string }[]>(
      `insert into mentoria_inscricoes (tipo, mentoria, status, inicio_jornada, termino_previsto, responsavel_id)
       values ('INDIVIDUAL', 'RDV', 'ATIVO', (${HOJE} + 20 - interval '12 months')::date, ${HOJE} + 20, $1)
       returning id`,
      [duda],
    );
    const nome = `${NOME} ${n}`;
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

test('Renovações no iPhone: sem rolagem lateral, toques de 44 px e campos de 16 px', async ({
  page,
}) => {
  await entrar(page);
  await page.goto('/acompanhamento/renovacoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Renovações e gestão' })).toBeVisible();
  await semRolagemLateral(page);
  await campos16(page, '.rv-filtros');
  for (const linha of await page.locator('.rv-row').all())
    expect((await linha.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await page.goto(`/acompanhamento/ficha/${ids[0]}?aba=jornada`);
  const botao = page.getByRole('button', { name: 'Registrar renovação', exact: true });
  expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await botao.click();
  const dlg = page.getByRole('dialog', { name: 'Registrar renovação' });
  await expect(dlg).toBeVisible();
  await semRolagemLateral(page);
  for (const m of ['RDV', '2M', '6M']) {
    const opcao = dlg.locator('.rv-escolha label').filter({ hasText: m });
    // Altura do desenho (offsetHeight), fora da escala da entrada da janelinha.
    const altura = await opcao.evaluate((el) => (el as HTMLElement).offsetHeight);
    expect(altura).toBeGreaterThanOrEqual(44);
    const b = (await opcao.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  await campos16(page, '.ac-dialogo');
});
