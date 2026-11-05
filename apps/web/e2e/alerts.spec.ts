import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Avisos do chat e lembretes de reunião (NPAC-26).
const owner = ownerSql(E2E_DB);
const MIN = 60_000;

test.beforeEach(async () => {
  await owner`truncate rate_limit`;
  await owner`truncate chat_reads, chat_messages, chat_members`;
  await owner`delete from chat_channels where kind = 'DM'`;
});
test.afterAll(async () => closeTestConnections());

async function login(page: Page, email: string) {
  page.on('pageerror', (e) => console.log('PAGEERROR', page.url(), e.message.slice(0, 60)));
  await page.goto('/login');
  await page.getByLabel('Usuário', { exact: true }).fill(email.split('@')[0]!);
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

const shots = [375, 768, 1440] as const;
async function capture(page: Page, name: string) {
  for (const w of shots) {
    await page.setViewportSize({ width: w, height: w === 375 ? 812 : 1000 });
    await page.screenshot({
      path: `test-results/${name}-${w}.png`,
      fullPage: true,
      animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

test('chat: selo no menu e (N) no título sem recarregar; abrir a conversa zera', async ({
  browser,
}) => {
  const murilo = await browser.newPage();
  await login(murilo, 'murilo@npac.com.br');
  await murilo.goto('/hoje');
  const badge = murilo.getByLabel('1 não lida no chat').filter({ visible: true });
  await expect(badge).toHaveCount(0);
  await expect(murilo).not.toHaveTitle(/^\(\d+\)/);

  const ale = await browser.newPage();
  await login(ale, 'ale@npac.com.br');
  await ale.goto('/chat');
  await ale.getByLabel('Nova conversa').selectOption({ label: 'Murilo' });
  await ale.getByLabel('Mensagem').fill('Reunião confirmada?');
  await ale.getByRole('button', { name: 'Enviar' }).click();
  await expect(ale.getByText('Reunião confirmada?')).toBeVisible();

  // O SSE avisa; o selo e o título mudam com a página aberta.
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(murilo).toHaveTitle(/^\(1\) Hoje/);
  await capture(murilo, 'menu-selo-chat');
  await murilo.setViewportSize({ width: 375, height: 812 });
  await murilo.goto('/mais');
  await expect(murilo.getByLabel('1 não lida no chat').filter({ visible: true })).toBeVisible();
  await murilo.screenshot({
    path: 'test-results/mais-selo-chat-375.png',
    fullPage: true,
    animations: 'disabled',
  });
  await murilo.setViewportSize({ width: 1280, height: 720 });

  await murilo.goto('/chat');
  await murilo.getByRole('button', { name: /Ale/ }).first().click();
  await expect(murilo.getByText('Reunião confirmada?')).toBeVisible();
  await expect(badge).toHaveCount(0, { timeout: 10_000 });
  await expect(murilo).not.toHaveTitle(/^\(\d+\)/);
  await ale.close();
  await murilo.close();
});

test('lembretes: 1 h com confirmação, 15 min, 1 min só aviso, remarcar recomeça', async ({
  page,
}) => {
  const start = Date.now();
  await page.clock.install({ time: start });
  await login(page, 'ale@npac.com.br');
  const name = `Lembrete ${start}`;
  const res = await page.request.post('/api/leads', {
    data: { name, instagram: `@lembrete.${start}`, incomeBand: 'R5_8K', source: 'BIO', tier: 'P1' },
  });
  const { id: leadId } = (await res.json()) as { id: string };
  const at = start + 61 * MIN;
  const [meeting] = await owner<{ id: string }[]>`
    insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    select ${leadId}, c.id, ${new Date(at)}, 'DIRETO', s.id
    from "user" c, "user" s
    where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'
    returning id`;

  await page.goto('/avisos');
  const reminder = page.getByRole('status').filter({ hasText: name });
  const confirm = reminder.getByRole('button', { name: 'Confirmação enviada' });
  await expect(page.getByRole('heading', { name: 'Avisos', exact: true })).toBeVisible();
  await expect(reminder).toHaveCount(0);

  // 60 min antes: etapa de 1 h, com o botão; o título da aba conta o lembrete.
  await page.clock.fastForward('01:00');
  await expect(reminder).toContainText('Mande a confirmação para');
  await expect(reminder).toContainText('1 h antes');
  await expect(confirm).toBeVisible();
  await expect(page).toHaveTitle(/^\(1\) Avisos/);
  await capture(page, 'avisos-lembrete');
  const sameDay =
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(start) ===
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(at);
  if (sameDay) {
    await page.goto('/hoje');
    const card = page
      .locator('section', { has: page.getByRole('heading', { name: /^Reuniões de hoje/ }) })
      .locator('article', { hasText: name });
    await expect(card.getByRole('button', { name: 'Confirmação enviada' })).toBeVisible();
    await capture(page, 'hoje-lembrete');
    await page.goto('/avisos');
  }

  // Confirmar: some e grava na timeline (tipo e campo, sem valores).
  await confirm.click();
  await expect(reminder).toHaveCount(0);
  await expect(page).not.toHaveTitle(/^\(\d+\)/);
  const timeline = await owner<{ fields: string[] }[]>`
    select fields from lead_timeline where lead_id = ${leadId} and kind = 'meeting.confirmed'`;
  expect(timeline).toEqual([{ fields: ['step'] }]);

  // 15 min antes: a próxima etapa, de novo com botão.
  await page.clock.fastForward('45:00');
  await expect(reminder).toContainText('15 min antes');
  await expect(confirm).toBeVisible();

  // 1 min antes: só o aviso, sem botão.
  await page.clock.fastForward('14:00');
  await expect(reminder).toContainText('começa em 1 min');
  await expect(confirm).toHaveCount(0);
  await page.screenshot({ path: 'test-results/avisos-lembrete-1min.png', fullPage: true });

  // Remarcar (relógio do navegador ≈ 1 min antes): novo horário daqui a ~29 min do navegador,
  // etapa de 1 h de novo — a confirmação antiga valia para o horário anterior.
  const [current] = await owner<{ version: number }[]>`
    select version from meetings where id = ${meeting!.id}`;
  const moved = await page.request.patch(`/api/meetings/${meeting!.id}`, {
    data: { version: current!.version, scheduledAt: new Date(start + 90 * MIN).toISOString() },
  });
  expect(moved.status()).toBe(200);
  await expect(reminder).toContainText('1 h antes', { timeout: 10_000 });
  await expect(confirm).toBeVisible();
});
