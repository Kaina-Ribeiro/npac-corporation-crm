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

/** Cria um lead pela API (a liderança informa o SDR responsável) e devolve o ID. */
async function createLead(page: Page, name: string, sdrId: string) {
  const res = await page.request.post('/api/leads', {
    data: {
      name,
      sdrId,
      instagram: `@pref.${Date.now()}.${Math.floor(Math.random() * 1e6)}`,
      incomeBand: 'R5_8K',
      source: 'BIO',
    },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

const userId = async (email: string) =>
  (await owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;

test('pipeline lembra as colunas marcadas ao voltar', async ({ page, context }) => {
  await login(page, 'ale@npac.com.br');
  await page.goto('/pipeline');
  const column = page.getByRole('region', { name: 'Criando Relacionamento' });
  await expect(column).toBeVisible();
  await page.getByText('Colunas visíveis').click();
  const box = page.getByRole('checkbox', { name: 'Criando Relacionamento' });
  // O clique só vale depois da hidratação; logo após carregar ele pode se perder.
  await expect(async () => {
    await box.setChecked(false);
    await expect(column).toHaveCount(0, { timeout: 500 });
  }).toPass();

  // Só chaves de etapa no cookie, restrito ao /pipeline.
  const saved = (await context.cookies()).find((c) => c.name.startsWith('npac_pipe_'));
  expect(saved?.value).toBe('SONDAGEM');
  expect(saved?.path).toBe('/pipeline');

  await page.goto('/hoje');
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'Pipeline' }).first()).toBeVisible();
  await expect(column).toHaveCount(0);
  await page.getByText('Colunas visíveis').click();
  await expect(box).not.toBeChecked();

  // Tudo marcado de novo: o cookie some.
  await expect(async () => {
    await box.setChecked(true);
    await expect(column).toBeVisible({ timeout: 500 });
  }).toPass();
  expect((await context.cookies()).some((c) => c.name.startsWith('npac_pipe_'))).toBe(false);
});

test('hoje lembra o filtro de SDR e closer ao voltar', async ({ page, context }) => {
  await login(page, 'ana@npac.com.br');
  const [aleId, muriloId] = [await userId('ale@npac.com.br'), await userId('murilo@npac.com.br')];
  const doAle = await createLead(page, 'Filtro do Ale', aleId);
  const doMurilo = await createLead(page, 'Filtro do Murilo', muriloId);
  await owner`update leads set next_contact_at = now() - interval '1 hour' where id in ${owner([doAle, doMurilo])}`;

  await page.goto('/hoje');
  const sdr = page.getByLabel('SDR', { exact: true });
  const overdue = page.locator('section', {
    has: page.getByRole('heading', { name: /^Atrasados/ }),
  });
  await expect(overdue.getByText('Filtro do Murilo')).toBeVisible();
  await expect(async () => {
    await sdr.selectOption(aleId);
    await page.getByRole('button', { name: 'Filtrar Hoje' }).click();
    await expect(overdue.getByText('Filtro do Murilo')).toHaveCount(0, { timeout: 1000 });
  }).toPass();

  const saved = (await context.cookies()).find((c) => c.name.startsWith('npac_hoje_'));
  expect(saved?.path).toBe('/hoje');

  await page.goto('/leads');
  await page.goto('/hoje');
  await expect(sdr).toHaveValue(aleId);
  await expect(overdue.getByText('Filtro do Ale')).toBeVisible();
  await expect(overdue.getByText('Filtro do Murilo')).toHaveCount(0);

  // Voltar para "Todos" apaga o filtro salvo.
  await expect(async () => {
    await sdr.selectOption('');
    await page.getByRole('button', { name: 'Filtrar Hoje' }).click();
    await expect(overdue.getByText('Filtro do Murilo')).toBeVisible({ timeout: 1000 });
  }).toPass();
  expect((await context.cookies()).some((c) => c.name.startsWith('npac_hoje_'))).toBe(false);
});

test('hoje: liderança que atende vê de quem é cada reunião', async ({ browser }) => {
  const ana = await browser.newPage();
  await login(ana, 'ana@npac.com.br');
  const aleId = await userId('ale@npac.com.br');
  const minha = await createLead(ana, 'Selo do Ronaldo', aleId);
  const dela = await createLead(ana, 'Selo da Sonia', aleId);
  const [ronaldoId, soniaId, anaId] = [
    await userId('ronaldo@npac.com.br'),
    await userId('sonia@npac.com.br'),
    await userId('ana@npac.com.br'),
  ];
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by) values
    (${minha}, ${ronaldoId}, now() - interval '1 minute', 'DIRETO', ${anaId}),
    (${dela}, ${soniaId}, now() - interval '1 minute', 'DIRETO', ${anaId})`;

  const ronaldo = await browser.newPage();
  await login(ronaldo, 'ronaldo@npac.com.br');
  await ronaldo.goto('/hoje');
  const row = (name: string) => ronaldo.locator('article', { hasText: name });
  await expect(row('Selo do Ronaldo').getByRole('img', { name: 'Sua reunião' })).toBeVisible();
  await expect(row('Selo da Sonia').getByRole('img', { name: /^Reunião de S/ })).toBeVisible();
  await ronaldo.screenshot({ path: 'test-results/hoje-selo-closer.png', fullPage: true });

  // Quem não atende não precisa do selo.
  await ana.goto('/hoje');
  await expect(ana.locator('article', { hasText: 'Selo do Ronaldo' })).toBeVisible();
  await expect(ana.getByRole('img', { name: 'Sua reunião' })).toHaveCount(0);
  await expect(ana.getByRole('img', { name: /^Reunião de / })).toHaveCount(0);
  await ana.close();
  await ronaldo.close();
});
