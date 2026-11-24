import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Pedidos do Igor (16/11/2026): Chat no lugar de Leads na barra do celular e a equipe saber que dá
// para ativar os avisos. O e2e roda sem chaves VAPID: o convite só aparece com a chave simulada.
const owner = ownerSql(E2E_DB);
const CHAVE = `B${'A'.repeat(86)}`;

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/**
 * O Chromium dos testes começa com a notificação bloqueada ("denied"), e aí o convite fica quieto,
 * de propósito: simula quem ainda não escolheu ("default"). O pedido de permissão responde `resposta`.
 */
async function navegadorComPush(page: Page, resposta: NotificationPermission = 'default') {
  await page.addInitScript((r) => {
    class FakeNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = () => Promise.resolve(r);
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
    if (!('PushManager' in window))
      Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
  }, resposta);
}

/** Servidor com push ligado, sem depender de chaves no e2e. */
async function pushLigado(page: Page, resposta?: NotificationPermission) {
  await navegadorComPush(page, resposta);
  await page.route('**/api/push/key', (r) => r.fulfill({ json: { publicKey: CHAVE } }));
}

const convite = (page: Page) => page.getByRole('region', { name: 'Avisos neste aparelho' });

test('barra do celular: Chat no lugar de Leads, e Leads no Mais', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'ale@npac.com.br');

  const nav = page.getByRole('navigation', { name: 'Navegação inferior' });
  await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'Hoje', 'Pipeline', 'Chat', 'Mais']);
  await nav.getByRole('link', { name: 'Mais' }).click();
  await page.waitForURL(/\/mais/);
  const secoes = page.getByRole('navigation', { name: 'Mais seções' }).getByRole('link');
  await expect(secoes.first()).toContainText('Leads');
  await expect(secoes.filter({ hasText: 'Chat' })).toHaveCount(0);
});

test('convite para ativar os avisos: aparece no Dashboard, no Hoje e no Chat', async ({ page }) => {
  await pushLigado(page);
  await login(page, 'ale@npac.com.br');
  await expect(convite(page)).toBeVisible();
  await expect(convite(page).getByRole('button', { name: 'Ativar avisos' })).toBeVisible();
  for (const tela of ['/hoje', '/chat']) {
    await page.goto(tela);
    await expect(convite(page)).toBeVisible();
  }
});

test('"Agora não" esconde o convite neste aparelho, mesmo depois de recarregar', async ({
  page,
}) => {
  await pushLigado(page);
  await login(page, 'ale@npac.com.br');
  await convite(page).getByRole('button', { name: 'Agora não' }).click();
  await expect(convite(page)).toHaveCount(0);
  const adiado = (await page.context().cookies()).find((c) => c.name === 'npac_push_convite_2');
  expect(adiado?.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86_400);
  await page.reload();
  await page.goto('/hoje');
  await page.waitForLoadState('load');
  await expect(convite(page)).toHaveCount(0);
});

test('aviso bloqueado no navegador: o convite explica como liberar', async ({ page }) => {
  await pushLigado(page, 'denied');
  await login(page, 'ale@npac.com.br');
  await convite(page).getByRole('button', { name: 'Ativar avisos' }).click();
  await expect(convite(page)).toContainText('bloqueados');
  await convite(page).getByRole('button', { name: 'Entendi' }).click();
  await expect(convite(page)).toHaveCount(0);
});

test('sem push no servidor, não há convite', async ({ page }) => {
  await navegadorComPush(page);
  await login(page, 'ale@npac.com.br');
  const chave = page.waitForResponse('**/api/push/key');
  await page.goto('/hoje');
  await chave;
  await expect(convite(page)).toHaveCount(0);
});

// NPAC-71 (Gabriel, 24/11/2026): os avisos de todos foram zerados no servidor (0083). O navegador ainda
// guarda a inscrição antiga; antes a tela se dava por "ligada" só por isso, sem convite e sem receber nada.
test('aparelho inscrito que o servidor não conhece: o convite aparece e "Ativar avisos" registra de novo', async ({
  page,
}) => {
  const ENDERECO = 'https://push.test/aparelho-antigo';
  await page.addInitScript((endpoint) => {
    class FakeNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = () => Promise.resolve('granted' as NotificationPermission);
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
    if (!('PushManager' in window))
      Object.defineProperty(window, 'PushManager', { value: class {}, configurable: true });
    // A inscrição que o navegador já tinha, de antes da limpeza.
    const inscricao = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'chave-do-aparelho', auth: 'segredo' } }),
      unsubscribe: () => Promise.resolve(true),
    };
    const registro = { pushManager: { getSubscription: () => Promise.resolve(inscricao) } };
    const sw = navigator.serviceWorker;
    Object.defineProperty(sw, 'getRegistration', { value: () => Promise.resolve(registro) });
    Object.defineProperty(sw, 'register', { value: () => Promise.resolve(registro) });
    Object.defineProperty(sw, 'ready', { value: Promise.resolve(registro) });
  }, ENDERECO);
  await page.route('**/api/push/key', (r) => r.fulfill({ json: { publicKey: CHAVE } }));
  await owner`delete from push_subscriptions where endpoint = ${ENDERECO}`;
  try {
    await login(page, 'ale@npac.com.br');
    await expect(convite(page)).toBeVisible();
    await convite(page).getByRole('button', { name: 'Ativar avisos' }).click();
    await expect(convite(page)).toHaveCount(0);
    const [linha] = await owner<{ username: string }[]>`
      select u.username from push_subscriptions s join "user" u on u.id = s.user_id
      where s.endpoint = ${ENDERECO}`;
    expect(linha?.username).toBe('ale');
    // Registrado: ao voltar, a tela confere com o servidor e não convida de novo.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    await expect(convite(page)).toHaveCount(0);
  } finally {
    await owner`delete from push_subscriptions where endpoint = ${ENDERECO}`;
  }
});
