import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { NOVIDADES } from '@npac/shared/novidades';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// NPAC-77, Fase 2: a janela "O que mudou no CRM". Abre sozinha com novidade não vista, mostra só o
// que é de cada cargo, "Faça isso" no topo; Entendi, X, Esc, clique fora e o link marcam "já vi" na
// conta (outro navegador não abre de novo); sem nada novo não abre; o rodapé abre o histórico.

const owner = ownerSql(E2E_DB);
const ANTIGA = NOVIDADES[NOVIDADES.length - 1]!.id;
const MAIS_NOVA = NOVIDADES[0]!.id;
// SDR = ale: o `login.spec.ts` troca a senha do igor e não restaura.
const USUARIOS = ['duda', 'ale', 'sonia', 'diretor'];
const DESKTOP = { width: 1440, height: 900 };

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => {
  await owner`update "user" set novidades_vista = null where username = any(${USUARIOS})`;
  await closeTestConnections();
});

const vistaDe = async (usuario: string) =>
  (
    await owner<
      { v: string | null }[]
    >`select novidades_vista as v from "user" where username = ${usuario}`
  )[0]!.v;

async function entrar(browser: Browser, usuario: string, tela = DESKTOP) {
  const ctx = await browser.newContext({ viewport: tela });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/(dashboard|acompanhamento|hoje)/);
  return { ctx, page };
}

const janela = (page: Page) => page.getByRole('dialog', { name: 'O que mudou no CRM' });
const historico = (page: Page) => page.getByRole('dialog', { name: 'Todas as atualizações' });
const item = (scope: Locator, titulo: string) =>
  scope.getByRole('heading', { name: titulo, exact: true });

/** O clique só abre depois da hidratação: tenta de novo até o histórico aparecer. */
async function abrirHistorico(page: Page, botao: Locator) {
  await expect(async () => {
    await botao.click({ timeout: 1000 });
    await expect(historico(page)).toBeVisible({ timeout: 1000 });
  }).toPass();
}

/** Outro "aparelho" (contexto novo): a janela não abre de novo, e o rodapé abre o histórico. */
async function naoAbreDeNovo(browser: Browser, usuario: string) {
  const { ctx, page } = await entrar(browser, usuario);
  const linha = page.locator('#app-sidebar').getByRole('button', { name: /^Versão dev\./ });
  // Depois da hidratação (o efeito de abrir sozinha já rodou), só o histórico está aberto.
  await abrirHistorico(page, linha);
  await expect(janela(page)).toHaveCount(0);
  await expect(linha).not.toHaveAttribute('data-novo');
  await ctx.close();
}

test('Acompanhamento (Admin): vê só o do módulo; Entendi marca na conta', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'duda'`;
  const { ctx, page } = await entrar(browser, 'duda');
  const j = janela(page);
  await expect(j).toBeVisible();
  await expect(item(j, 'Onboarding agora é Dashboard, com engajamento')).toBeVisible();
  await expect(item(j, 'Excluir contato e anotação')).toBeVisible();
  await expect(item(j, 'Avisos pelo Telegram')).toBeVisible();
  for (const fora of [
    'Venda direta',
    'Chat de cara nova',
    'Vendas que o SDR marcou chegam para você',
  ])
    await expect(item(j, fora)).toHaveCount(0);
  // Agrupado por data, com "Faça isso" no topo.
  await expect(j.getByText('Precisa de você', { exact: true })).toBeVisible();
  await expect(j.getByText('Atualização de 25/11', { exact: true })).toBeVisible();
  await expect(j.getByText('Atualização de 23/11', { exact: true })).toBeVisible();
  await expect(
    j.getByText(/^\d+ mudanças em 3 atualizações desde a sua última visita\.$/),
  ).toBeVisible();
  await expect(j.getByRole('button', { name: 'Entendi' })).toBeFocused();

  await j.getByRole('button', { name: 'Entendi' }).click();
  await expect(j).toBeHidden();
  await expect(page.locator('#app-sidebar [data-novidades-ponto]')).toBeHidden();
  await expect.poll(() => vistaDe('duda')).toBe(MAIS_NOVA);
  await ctx.close();
  await naoAbreDeNovo(browser, 'duda');
});

test('SDR: "Faça isso" primeiro, só o do SDR; o link fecha e abre a tela', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'ale'`;
  const { ctx, page } = await entrar(browser, 'ale');
  const j = janela(page);
  await expect(j).toBeVisible();
  const primeiro = j.locator('section').first();
  await expect(primeiro).toHaveAccessibleName('Precisa de você');
  await expect(item(primeiro, 'Ative os avisos de novo neste aparelho')).toBeVisible();
  await expect(item(j, 'Venda direta')).toBeVisible();
  await expect(item(j, 'Chat de cara nova')).toBeVisible();
  for (const fora of [
    'Vendas que o SDR marcou chegam para você',
    'Engajamento na ficha',
    'Excluir contato e anotação',
  ])
    await expect(item(j, fora)).toHaveCount(0);

  await j.getByRole('link', { name: 'Meu perfil → Avisos neste aparelho' }).click();
  await page.waitForURL(/\/conta\/perfil/);
  await expect(j).toBeHidden();
  await expect.poll(() => vistaDe('ale')).toBe(MAIS_NOVA);
  await ctx.close();
  await naoAbreDeNovo(browser, 'ale');
});

test('Closer: só o do closer; Esc marca como visto', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'sonia'`;
  const { ctx, page } = await entrar(browser, 'sonia');
  const j = janela(page);
  await expect(j).toBeVisible();
  await expect(item(j, 'Vendas que o SDR marcou chegam para você')).toBeVisible();
  await expect(item(j, 'Busca enquanto você digita')).toBeVisible();
  for (const fora of [
    'Venda direta',
    'Concluir tarefa pede o próximo passo',
    'Onboarding agora é Dashboard, com engajamento',
  ])
    await expect(item(j, fora)).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(j).toBeHidden();
  await expect.poll(() => vistaDe('sonia')).toBe(MAIS_NOVA);
  await ctx.close();
  await naoAbreDeNovo(browser, 'sonia');
});

test('Diretoria vê tudo; clique fora marca; X fecha o histórico', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'diretor'`;
  const { ctx, page } = await entrar(browser, 'diretor');
  const j = janela(page);
  await expect(j).toBeVisible();
  await expect(j.locator('article')).toHaveCount(NOVIDADES.length - 1);

  // "Ver versões anteriores" troca para o histórico (todas, inclusive a mais antiga).
  await j.getByRole('button', { name: 'Ver versões anteriores' }).click();
  const h = historico(page);
  await expect(h).toBeVisible();
  await expect(h.locator('article')).toHaveCount(NOVIDADES.length);
  await expect(h.getByText('Precisa de você', { exact: true })).toHaveCount(0);
  await h.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await expect(h).toBeHidden();
  await expect.poll(() => vistaDe('diretor')).toBe(MAIS_NOVA);

  // Volta o "não visto" e confere o clique no véu (fora da janela).
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'diretor'`;
  await page.reload();
  await expect(j).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(j).toBeHidden();
  await expect.poll(() => vistaDe('diretor')).toBe(MAIS_NOVA);

  // O X do histórico.
  await abrirHistorico(
    page,
    page.locator('#app-sidebar').getByRole('button', { name: /^Versão dev\./ }),
  );
  await h.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await expect(h).toBeHidden();
  await ctx.close();
});

test('sem nada novo, a janela não abre', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${MAIS_NOVA} where username = 'ale'`;
  await naoAbreDeNovo(browser, 'ale');
});

test('celular: folha de baixo e "O que mudou" no Mais abre o histórico', async ({ browser }) => {
  await owner`update "user" set novidades_vista = ${ANTIGA} where username = 'duda'`;
  const tela = { width: 375, height: 812 };
  const { ctx, page } = await entrar(browser, 'duda', tela);
  const j = janela(page);
  await expect(j).toBeVisible();
  // Folha: encosta embaixo e ocupa a largura toda (espera o movimento de entrada).
  await expect
    .poll(async () => {
      const b = await j.boundingBox();
      return b && [Math.round(b.x), Math.round(b.width), Math.round(b.y + b.height)];
    })
    .toEqual([0, 375, 812]);
  const ok = await j.getByRole('button', { name: 'Entendi' }).boundingBox();
  expect(ok!.height).toBeGreaterThanOrEqual(44);
  await j.getByRole('button', { name: 'Entendi' }).click();
  await expect(j).toBeHidden();

  await page.goto('/acompanhamento/mais');
  await abrirHistorico(
    page,
    page.getByRole('region', { name: 'Sua conta' }).getByRole('button', { name: /^Versão dev\./ }),
  );
  await ctx.close();
});
