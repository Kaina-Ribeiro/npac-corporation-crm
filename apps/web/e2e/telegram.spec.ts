import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { API_PORT, E2E_DB, E2E_PASSWORD, E2E_TELEGRAM, TELEGRAM_FALSO } from './env.js';

// NPAC-74: conectar o Telegram pelo Meu perfil. O teste faz o papel do Telegram: pega o código do
// link do bot e chama o webhook como o Telegram chamaria; o que o bot manda vai para o Telegram falso
// da caixa (scripts/caixa-falsa.mts). Com CAPTURAS=<pasta>, fotografa a seção em cada estado.
const owner = ownerSql(E2E_DB);
const PASTA = process.env.CAPTURAS;
const LARGURAS = [375, 768, 1024, 1440];
const CHAT = 424242;
type Chamada = { method: string; body: { chat_id?: string; text?: string } };
const enviadas = async (): Promise<Chamada[]> =>
  ((await (await fetch(`${TELEGRAM_FALSO}/telegram`)).json()) as Chamada[]).filter(
    (c) => c.method === 'sendMessage',
  );

async function entrar(page: Page, usuario: string) {
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(usuario);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** O que o Telegram faria quando a pessoa toca em "Começar". */
async function tocarEmComecar(link: string) {
  const code = new URL(link).searchParams.get('start');
  const res = await fetch(`http://localhost:${API_PORT}/api/webhooks/telegram`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': E2E_TELEGRAM.TELEGRAM_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      update_id: 1,
      message: { message_id: 1, chat: { id: CHAT, type: 'private' }, text: `/start ${code}` },
    }),
  });
  expect(res.status).toBe(200);
}

async function fotos(page: Page, nome: string, tema: string) {
  if (!PASTA) return;
  const secao = page.getByRole('region', { name: 'Avisos pelo Telegram' });
  for (const w of LARGURAS) {
    await page.setViewportSize({ width: w, height: w < 768 ? 812 : 900 });
    await page.waitForTimeout(250);
    await secao.scrollIntoViewIfNeeded();
    await secao.screenshot({ path: `${PASTA}/telegram-${nome}-${tema}-${w}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test.beforeEach(async ({ page }) => {
  await owner`truncate rate_limit, telegram_vinculos, telegram_codigos`;
  await fetch(`${TELEGRAM_FALSO}/telegram`, { method: 'DELETE' });
  // O link abre o bot em t.me: nada sai da máquina.
  await page.context().route('https://t.me/**', (r) => r.fulfill({ body: 'Telegram' }));
});
test.afterAll(async () => {
  await owner`truncate telegram_vinculos, telegram_codigos`;
  await closeTestConnections();
});

for (const tema of PASTA ? (['light', 'dark'] as const) : (['light'] as const)) {
  test(`conecta, manda o teste e desconecta (${tema})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
    await page.addInitScript((t) => localStorage.setItem('theme', t), tema);
    await entrar(page, 'igor');
    await page.goto('/conta/perfil');
    const secao = page.getByRole('region', { name: 'Avisos pelo Telegram' });
    await expect(
      secao.getByText('Os mesmos avisos do CRM, na hora, no seu Telegram.'),
    ).toBeVisible();
    await expect(secao.getByText('Não conectado.')).toBeVisible();
    await fotos(page, 'desconectado', tema);

    // Conectar abre o bot (o navegador pode barrar a janela; o botão "Abrir o Telegram" fica).
    const janela = page
      .context()
      .waitForEvent('page', { timeout: 5_000 })
      .catch(() => null);
    await secao.getByRole('button', { name: 'Conectar Telegram' }).click();
    await expect(secao.getByText(/Abra o Telegram e toque em/)).toBeVisible();
    await (await janela)?.close();
    const link = await secao.getByRole('link', { name: 'Abrir o Telegram' }).getAttribute('href');
    expect(link).toMatch(/^https:\/\/t\.me\/npac_e2e_bot\?start=[\w-]{43}$/);
    await fotos(page, 'esperando', tema);

    await tocarEmComecar(link!);
    // A tela confere sozinha (a cada 4 s ou ao voltar para a aba).
    await expect(secao.getByText('Conectado')).toBeVisible({ timeout: 10_000 });
    const hoje = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    await expect(secao.getByText(`desde ${hoje}.`)).toBeVisible();
    expect((await enviadas()).map((c) => c.body)).toEqual([
      {
        chat_id: String(CHAT),
        text: 'Pronto, Igor! Os avisos do NPAC CRM vão chegar aqui.',
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      },
    ]);
    await fotos(page, 'conectado', tema);

    await secao.getByRole('button', { name: 'Enviar aviso de teste' }).click();
    await expect(secao.getByText('Enviado. Confira o Telegram.')).toBeVisible();
    expect((await enviadas()).at(-1)?.body.text).toBe(
      '<b>Aviso de teste do NPAC CRM</b>\nSe chegou, está tudo certo.',
    );

    if (PASTA) {
      await page.route('**/api/me/telegram/test', (r) =>
        r.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Não deu para falar com o Telegram. Tente de novo.' }),
        }),
      );
      await secao.getByRole('button', { name: 'Enviar aviso de teste' }).click();
      await expect(
        secao.getByText('Não deu para falar com o Telegram. Tente de novo.'),
      ).toBeVisible();
      await fotos(page, 'erro', tema);
      await page.unroute('**/api/me/telegram/test');
    }

    await secao.getByRole('button', { name: 'Desconectar' }).click();
    await expect(secao.getByText('Não conectado.')).toBeVisible();
    expect(await owner`select 1 from telegram_vinculos`).toHaveLength(0);
  });
}

test('o cargo Acompanhamento também conecta', async ({ page }) => {
  await entrar(page, 'duda');
  await page.goto('/conta/perfil');
  const secao = page.getByRole('region', { name: 'Avisos pelo Telegram' });
  await secao.getByRole('button', { name: 'Conectar Telegram' }).click();
  const link = await secao.getByRole('link', { name: 'Abrir o Telegram' }).getAttribute('href');
  await tocarEmComecar(link!);
  await expect(secao.getByText('Conectado')).toBeVisible({ timeout: 10_000 });
});
