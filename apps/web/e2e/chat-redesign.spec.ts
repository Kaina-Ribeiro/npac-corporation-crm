import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';
import { naConversa } from './chat-helpers.js';

// Redesign do Chat (A1, Gabriel 24/11/2026, "1A, 2A, 3A, 4A"): antigas ao rolar, prévia da última
// mensagem e "Buscar pessoa" em Nova conversa. A sidebar do tablet fica em sidebar.spec.ts.
const owner = ownerSql(E2E_DB);

test.beforeEach(async () => {
  await owner`truncate rate_limit, chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/** `n` mensagens do Murilo no Geral, um minuto entre elas, todas já lidas pela Ale. */
async function conversaLonga(n: number) {
  await owner`
    insert into chat_messages (channel_id, author_id, body, created_at)
    select (select id from chat_channels where kind = 'GENERAL'),
      (select id from "user" where username = 'murilo'), 'Mensagem ' || i,
      now() - (${n} - i) * interval '1 minute'
    from generate_series(1, ${n}) i`;
  await owner`
    insert into chat_reads (channel_id, user_id, last_read_id)
    select channel_id, (select id from "user" where username = 'ale'), max(id)
    from chat_messages group by channel_id`;
}

test('mensagens antigas chegam sozinhas ao rolar até o topo, sem a tela pular', async ({
  page,
}) => {
  await conversaLonga(70);
  await login(page, 'ale');
  await page.goto('/chat');
  await expect(naConversa(page, 'Mensagem 70')).toBeVisible();
  // A primeira página traz as 50 mais novas.
  await expect(naConversa(page, 'Mensagem 21', { exact: true })).toHaveCount(1);
  await expect(naConversa(page, 'Mensagem 20', { exact: true })).toHaveCount(0);

  const pedidos: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/messages?before=')) pedidos.push(r.url());
  });
  const rola = page.locator('.ch-rola');
  await rola.evaluate((el) => (el.scrollTop = 0));
  await expect(naConversa(page, 'Mensagem 1', { exact: true })).toBeAttached();
  expect(pedidos).toHaveLength(1);
  // A mensagem que estava no topo continua à vista: a rolagem não pulou para o começo.
  await expect(naConversa(page, 'Mensagem 21', { exact: true })).toBeInViewport();
  // Sem mais nada para trás, o botão do topo some.
  await expect(page.getByRole('button', { name: 'Ver mensagens anteriores' })).toHaveCount(0);
});

test('lista mostra a prévia da última mensagem e "Buscar pessoa" filtra a Nova conversa', async ({
  page,
}) => {
  await conversaLonga(3);
  await login(page, 'ale');
  await page.goto('/chat');
  const conversas = page.getByRole('navigation', { name: 'Conversas' });
  await expect(conversas.getByRole('button', { name: /^Geral/ })).toContainText(
    'Murilo: Mensagem 3',
  );

  await page.getByRole('button', { name: 'Nova conversa' }).click();
  const folha = page.getByRole('dialog', { name: 'Nova conversa' });
  await folha.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('sonia');
  await expect(folha.locator('.ch-pessoa')).toHaveCount(1);
  await expect(folha.locator('.ch-pessoa')).toContainText('Sônia');
  await folha.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('ninguém assim');
  await expect(folha.getByText('Nenhuma pessoa encontrada')).toBeVisible();
  await folha.getByRole('searchbox', { name: 'Buscar pessoa' }).fill('mur');
  await folha.locator('.ch-pessoa').click();
  await expect(folha).toBeHidden();
  await expect(page.getByRole('region', { name: 'Conversa Murilo' })).toBeVisible();

  // A sua mensagem aparece na prévia com "Você:".
  await page.getByLabel('Mensagem').fill('Oi, Murilo');
  await page.keyboard.press('Enter');
  await expect(naConversa(page, 'Oi, Murilo')).toBeVisible();
  await expect(conversas.getByRole('button', { name: /^Murilo/ })).toContainText(
    'Você: Oi, Murilo',
  );
});
