import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';
import { naConversa } from './chat-helpers.js';

// NPAC-72 (Igor, 24/11/2026: "o Chat está pesado no iPhone"). No celular a lista e a conversa são
// telas separadas: a conversa só carrega e só marca como lida quando está na tela.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Mensagem de outra pessoa no Geral, gravada direto no banco (ninguém com o Chat aberto). */
async function mensagemNoGeral(autor: string, texto: string): Promise<number> {
  const [m] = await owner<{ id: string }[]>`
    insert into chat_messages (channel_id, author_id, body)
    values ((select id from chat_channels where kind = 'GENERAL'),
      (select id from "user" where username = ${autor}), ${texto})
    returning id`;
  return Number(m!.id);
}

/** Até onde a pessoa leu o Geral (0 = nunca abriu). */
async function lidoAte(usuario: string): Promise<number> {
  const [r] = await owner<{ id: string }[]>`
    select last_read_id as id from chat_reads
    where channel_id = (select id from chat_channels where kind = 'GENERAL')
      and user_id = (select id from "user" where username = ${usuario})`;
  return Number(r?.id ?? 0);
}

async function marcarLido(usuario: string, ate: number) {
  await owner`
    insert into chat_reads (channel_id, user_id, last_read_id)
    values ((select id from chat_channels where kind = 'GENERAL'),
      (select id from "user" where username = ${usuario}), ${ate})
    on conflict (channel_id, user_id) do update set last_read_id = excluded.last_read_id`;
}

/** Pedidos do Chat feitos pela página, na ordem. */
function pedidosDoChat(page: Page) {
  const lista: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/chat/')) return;
    lista.push(`${r.method()} ${u.pathname.replace(/[0-9a-f-]{36}/g, ':id')}`);
  });
  return lista;
}

const MENSAGENS = 'GET /api/chat/channels/:id/messages';
const LIDA = 'POST /api/chat/channels/:id/read';
const geral = (page: Page) => page.getByRole('button', { name: /^Geral/ });

test.describe('no celular', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('tocar na conversa que já vem selecionada mostra as mensagens', async ({ page }) => {
    const texto = `Conversa selecionada ${Date.now()}`;
    // Já lida: nada dispara o aviso ao vivo, que antes era o que enchia a conversa vazia.
    await marcarLido('ale', await mensagemNoGeral('murilo', texto));
    await login(page, 'ale');
    await page.goto('/chat');
    await expect(page.getByRole('navigation', { name: 'Conversas' })).toBeVisible();

    await geral(page).click();
    await expect(naConversa(page, texto)).toBeVisible();
  });

  test('a lista não busca nem marca como lida a conversa que está escondida', async ({ page }) => {
    const texto = `Ainda não li ${Date.now()}`;
    const id = await mensagemNoGeral('murilo', texto);
    const antes = await lidoAte('ale');
    expect(antes).toBeLessThan(id);
    const pedidos = pedidosDoChat(page);
    await login(page, 'ale');
    await page.goto('/chat');

    // Só a lista na tela: o selo de não lidas fica e nada é gravado.
    await expect(geral(page).getByLabel(/não lidas/)).toBeVisible();
    await page.waitForTimeout(1500);
    expect(pedidos.filter((p) => p === MENSAGENS || p === LIDA)).toEqual([]);
    expect(await lidoAte('ale')).toBe(antes);
    await expect(geral(page).getByLabel(/não lidas/)).toBeVisible();

    // Abriu a conversa: aparece e passa a contar como lida.
    await geral(page).click();
    await expect(naConversa(page, texto)).toBeVisible();
    await expect.poll(() => lidoAte('ale')).toBe(id);
    await page.getByRole('button', { name: 'Conversas', exact: true }).click();
    await expect(geral(page).getByLabel(/não lidas/)).toHaveCount(0);
  });
});

test('escrita que não é do Chat não rebusca as mensagens; mensagem nova chega sozinha', async ({
  page,
}) => {
  await marcarLido('ale', await mensagemNoGeral('murilo', `Antes ${Date.now()}`));
  await login(page, 'ale');
  await page.goto('/chat');
  await expect(
    page.getByRole('region', { name: 'Conversa Geral' }).getByRole('listitem').first(),
  ).toBeVisible();
  const pedidos = pedidosDoChat(page);

  // Outra pessoa mexe num lead: a lista de conversas confere, as mensagens não são buscadas de novo.
  const canais = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/chat/channels');
  await owner`update leads set updated_at = now() where name = 'Lead do Ale'`;
  await canais;
  await page.waitForTimeout(800);
  expect(pedidos.filter((p) => p === MENSAGENS || p === LIDA)).toEqual([]);

  // Mensagem nova de outra pessoa: aparece sem recarregar e é marcada como lida uma vez só.
  const texto = `Chegou agora ${Date.now()}`;
  const id = await mensagemNoGeral('murilo', texto);
  await expect(naConversa(page, texto)).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => lidoAte('ale')).toBe(id);
  // A própria marcação avisa as abas de novo: essa segunda rodada só confere a lista.
  await page.waitForTimeout(3000);
  expect(pedidos.filter((p) => p === MENSAGENS)).toHaveLength(1);
  expect(pedidos.filter((p) => p === LIDA)).toHaveLength(1);
});
