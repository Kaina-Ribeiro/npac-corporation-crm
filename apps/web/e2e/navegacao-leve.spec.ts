import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Desempenho (T2.5): o menu não pré-carrega telas inteiras. Antes, abrir uma tela renderizava em
// segundo plano Dashboard, Relatórios e Equipe (gravando auditoria) e disparava 67 requisições RSC.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`update "user" set two_factor_enabled = false`;
});
test.afterAll(async () => {
  await closeTestConnections();
});

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/');
}

test('abrir Avisos não renderiza outras telas em segundo plano', async ({ page }) => {
  await entrar(page, 'diretor');
  await page.goto('/avisos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // O que a tela de entrada ainda busca no navegador fica fora da conta.
  await page.waitForTimeout(2000);
  const [antes] = await owner<{ ultimo: string }[]>`
    select coalesce(max(id), 0)::text as ultimo from audit_log`;
  const ultimo = antes!.ultimo;
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(3000);
  const gravadas = await owner<{ action: string }[]>`
    select action from audit_log
    where id > ${ultimo}::bigint and action in ('report.view', 'today.view', 'lead.list')`;
  expect(gravadas.map((g) => g.action)).toEqual([]);
});

test('abrir o Plano não recarrega a própria tela e faz poucas requisições RSC', async ({
  page,
}) => {
  await entrar(page, 'duda');
  await page.waitForURL(/\/acompanhamento\/fila/);
  await expect(page.getByRole('heading', { name: 'Fila do dia', level: 1 })).toBeVisible();
  // Aba nova com a sessão do login: só conta o que o Plano dispara (não as pré-cargas da Fila).
  const plano = await page.context().newPage();
  const rsc: { path: string; prefetch: boolean }[] = [];
  plano.on('request', (req) => {
    const url = new URL(req.url());
    if (!url.searchParams.has('_rsc')) return;
    rsc.push({ path: url.pathname, prefetch: req.headers()['next-router-prefetch'] !== undefined });
  });
  await plano.goto('/acompanhamento/plano');
  await expect(plano.getByRole('heading', { name: 'Plano dos 12 meses', level: 1 })).toBeVisible();
  await plano.waitForTimeout(3000);
  // A carga é um documento; uma RSC sem cabeçalho de prefetch para a própria rota seria o antigo
  // `router.refresh()` ao montar. Cada pré-carga do Next 16 são duas RSC (árvore da rota e o trecho
  // até o `loading.tsx`), nenhuma renderiza a página.
  expect(rsc.filter((r) => r.path === '/acompanhamento/plano' && !r.prefetch)).toEqual([]);
  expect(rsc.length, JSON.stringify(rsc)).toBeLessThanOrEqual(20);
});

test('abrir a ficha não carrega a tela duas vezes (canal ao vivo em dia responde ready)', async ({
  page,
}) => {
  // Fase 3 (T3.1): o `ready` ao conectar virava `crm:invalidate` e a ficha fazia `router.refresh()`.
  await entrar(page, 'ale');
  const [lead] = await owner<{ id: string }[]>`select id from leads where name = 'Lead do Ale'`;
  const rota = `/leads/${lead!.id}`;
  const ficha = await page.context().newPage();
  const recargas: string[] = [];
  ficha.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname !== rota || req.resourceType() === 'document') return;
    if (req.headers()['next-router-prefetch'] !== undefined) return;
    recargas.push(req.url());
  });
  // A aba conecta com a revisão que o render entregou.
  const canal = ficha.waitForRequest((r) => /\/api\/events\?rev=\d+$/.test(r.url()));
  await ficha.goto(rota);
  await expect(ficha.getByRole('heading', { name: 'Lead do Ale', level: 1 })).toBeVisible();
  await canal;
  await ficha.waitForTimeout(3000);
  expect(recargas).toEqual([]);
});
