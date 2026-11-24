import { expect, test, type Page, type Response } from '@playwright/test';
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

// Gabriel, 24/11/2026: "quando enviamos uma mensagem, ela dá um glitch estranho" e "o gesto de
// voltar do iPhone, ao invés de voltar aos chats, vai para o Hoje".
test.describe('no celular, envio e voltar', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('a mensagem enviada não some enquanto a conversa recarrega', async ({ page }) => {
    await login(page, 'ale');
    await page.goto('/chat');
    const mensagens = (metodo: string) => (r: Response) =>
      r.request().method() === metodo &&
      /\/api\/chat\/channels\/[^/]+\/messages$/.test(new URL(r.url()).pathname);
    const abriu = page.waitForResponse(mensagens('GET'));
    await geral(page).click();
    await abriu;
    const campo = page.getByRole('textbox', { name: 'Mensagem' });
    await expect(campo).toBeVisible();

    // A busca que vem depois do envio demora (como na rede de verdade).
    let enviou = false;
    await page.route('**/api/chat/channels/*/messages', async (route) => {
      if (route.request().method() === 'POST') enviou = true;
      else if (enviou) await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    const texto = `Sem piscar ${Date.now()}`;
    await page.evaluate((t) => {
      const w = window as unknown as { viu: boolean; sumiu: boolean };
      w.viu = false;
      w.sumiu = false;
      new MutationObserver(() => {
        const tem = [...document.querySelectorAll('.ch-b')].some((b) => b.textContent?.includes(t));
        if (tem) w.viu = true;
        else if (w.viu) w.sumiu = true;
      }).observe(document.querySelector('.ch-conv')!, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }, texto);

    // A busca de depois do envio (a que demora), não uma de antes.
    const recarregou = page
      .waitForResponse(mensagens('POST'))
      .then(() => page.waitForResponse(mensagens('GET')));
    await campo.fill(texto);
    await campo.press('Enter');
    await recarregou;
    await expect(naConversa(page, texto)).toHaveCount(1);
    const visto = await page.evaluate(() => {
      const w = window as unknown as { viu: boolean; sumiu: boolean };
      return { viu: w.viu, sumiu: w.sumiu };
    });
    expect(visto).toEqual({ viu: true, sumiu: false });
  });

  test('o voltar do aparelho fecha a conversa e só depois sai do Chat', async ({ page }) => {
    await login(page, 'ale');
    // Chega ao Chat pela barra de baixo, vindo de outra tela (como o Igor, vindo do Hoje).
    await page.getByRole('link', { name: 'Hoje' }).filter({ visible: true }).click();
    await page.waitForURL(/\/hoje/);
    await page.getByRole('link', { name: /^Chat/ }).filter({ visible: true }).click();
    await page.waitForURL(/\/chat/);
    const ch = page.locator('.ch');

    await geral(page).click();
    await expect(ch).toHaveAttribute('data-conversa', 'true');
    await page.goBack();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(ch).not.toHaveAttribute('data-conversa');
    await expect(page.getByRole('navigation', { name: 'Conversas' })).toBeVisible();

    // O botão de voltar da tela não deixa passo sobrando: o próximo voltar já sai do Chat.
    await geral(page).click();
    await expect(ch).toHaveAttribute('data-conversa', 'true');
    await page.getByRole('button', { name: 'Conversas' }).click();
    await expect(ch).not.toHaveAttribute('data-conversa');
    await page.goBack();
    await page.waitForURL(/\/hoje/);
  });
});
