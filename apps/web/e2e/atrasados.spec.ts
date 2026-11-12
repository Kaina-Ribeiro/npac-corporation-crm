import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

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

async function createLead(page: Page, name: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      instagram: `@atraso.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

const addMeeting = (leadId: string, at: Date) =>
  owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    select ${leadId}, c.id, ${at}, 'DIRETO', s.id from "user" c, "user" s
    where c.email = 'sonia@npac.com.br' and s.email = 'ale@npac.com.br'`;

const section = (page: Page, title: RegExp) =>
  page.locator('section', { has: page.getByRole('heading', { name: title }) });

test('reunião de outro dia sem resultado fica em Atrasados até registrar', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const id = await createLead(page, 'Reunião Esquecida');
  await addMeeting(id, new Date(Date.now() - 3 * 86_400_000));
  await page.goto('/hoje');
  const row = section(page, /^Atrasados/).locator('[data-lead-row]', {
    hasText: 'Reunião Esquecida',
  });
  await expect(row).toBeVisible();
  await expect(row.getByText('Reunião', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/hoje-atrasados.png', fullPage: true });

  await expect(async () => {
    await row.getByRole('button', { name: 'Ação rápida' }).click({ timeout: 1000 });
    await expect(row.getByRole('button', { name: 'Realizada', exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass();
  await row.getByRole('button', { name: 'Realizada', exact: true }).click();
  await expect(row).toHaveCount(0);
});

test('tarefa vencida aparece em Atrasados e sai ao concluir', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const id = await createLead(page, 'Lead da Tarefa');
  const res = await page.request.post(`/api/leads/${id}/tasks`, {
    data: {
      title: 'Tarefa Esquecida',
      dueAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/hoje');
  const row = section(page, /^Atrasados/).locator('[data-lead-row]', {
    hasText: 'Tarefa Esquecida',
  });
  await expect(row).toBeVisible();
  await expect(row.getByText('Tarefa', { exact: true })).toBeVisible();
  await expect(section(page, /^Tarefas/).getByText('Tarefa Esquecida')).toHaveCount(0);

  const concluir = row.getByRole('button', { name: 'Concluir Tarefa Esquecida' });
  await expect(async () => {
    // Clica de novo só se o botão segue ali e livre (o clique antes da hidratação se perde). O
    // clique que funcionou tira a linha da lista; repetir o clique esperava por um botão que não
    // existe mais e estourava o tempo do teste no CI lento.
    if (await concluir.isEnabled({ timeout: 500 }).catch(() => false)) {
      await concluir.click({ timeout: 1000 });
    }
    await expect(row).toHaveCount(0, { timeout: 3000 });
  }).toPass();
});

test('reunião e tarefa que vencem com a página aberta vão para Atrasados pelo navegador', async ({
  page,
}) => {
  const now = Date.now();
  const end = new Date(
    `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)}T23:59:00-03:00`,
  ).getTime();
  test.skip(now + 5 * 60_000 > end, 'perto da meia-noite de Brasília');
  await page.clock.install({ time: now });
  await login(page, 'ale@npac.com.br');
  const id = await createLead(page, 'Vence Agora');
  await addMeeting(id, new Date(now + 90_000));
  const res = await page.request.post(`/api/leads/${id}/tasks`, {
    data: { title: 'Tarefa Vence', dueAt: new Date(now + 90_000).toISOString() },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/hoje');
  const overdue = section(page, /^Atrasados/);
  await expect(section(page, /^Tarefas/).getByText('Tarefa Vence')).toBeVisible();
  await expect(overdue.getByText('Vence Agora')).toHaveCount(0);

  await page.clock.fastForward('03:00');
  await expect(overdue.getByText('Tarefa Vence')).toBeVisible();
  await expect(overdue.locator('[data-lead-row]', { hasText: 'Reunião' })).toContainText(
    'Vence Agora',
  );
  await expect(section(page, /^Tarefas/).getByText('Tarefa Vence')).toHaveCount(0);
  // A agenda do dia continua mostrando a reunião.
  await expect(section(page, /^Reuniões de hoje/).getByText('Vence Agora')).toBeVisible();
});
