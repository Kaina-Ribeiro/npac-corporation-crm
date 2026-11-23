import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/** NPAC-62 (Igor, 23/11/2026, "1A, 2A"): lançar na ficha a reunião que já aconteceu. */
const owner = ownerSql(E2E_DB);
const WIDTHS = [375, 768, 1024, 1440] as const;

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

/** `datetime-local` de Brasília, `dias` atrás, às 15:00. */
function brasiliaDaysAgo(dias: number) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(Date.now() - dias * 86_400_000),
  );
  return `${day}T15:00`;
}

test('SDR lança na ficha a reunião que já aconteceu e ela entra realizada', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  const stamp = Date.now().toString(36);
  const res = await page.request.post('/api/leads', {
    data: {
      name: `Lead reunião antiga ${stamp}`,
      instagram: `@reuniao.antiga.${stamp}`,
      incomeBand: 'R8_15K',
      source: 'BIO',
    },
  });
  expect(res.ok()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  await page.goto(`/leads/${id}`);

  const when = page.getByLabel('Horário da reunião (Brasília)', { exact: true });
  await expect(when).not.toHaveAttribute('max');
  await page.getByLabel('A reunião já aconteceu', { exact: true }).check();
  const past = page.getByLabel('Quando aconteceu (Brasília)', { exact: true });
  await expect(past).toHaveAttribute('max', /T/);
  await past.fill(brasiliaDaysAgo(3));
  await page.getByLabel('Closer da reunião', { exact: true }).selectOption({ label: 'Sônia' });
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `test-results/reuniao-ja-realizada-${w}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Lançar como realizada', exact: true }).click();

  await expect(
    page.getByText('Realizada', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const [m] = await owner<{ outcome: string; same: boolean }[]>`
    select outcome, outcome_at = scheduled_at as same from meetings where lead_id = ${id}`;
  expect(m).toEqual({ outcome: 'DONE', same: true });
  // Depois da reunião realizada, "Marcar venda" aparece na ficha.
  await expect(
    page.getByRole('button', { name: /Marcar venda/ }).filter({ visible: true }),
  ).toBeVisible();
});

test('o closer não vê a opção', async ({ page }) => {
  const [lead] = await owner<{ id: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    select 'Lead da Sônia ver', 'R8_15K', 'BIO', 'P1', s.id, a.id, a.id, ${`@closer.ver.${Date.now()}`}
    from pipeline_stages s, "user" a where s.key = 'EM_FOLLOW' and a.email = 'ale@npac.com.br'
    returning id`;
  await owner`insert into meetings (lead_id, closer_id, scheduled_at, origin, created_by)
    select ${lead!.id}, c.id, now() + interval '2 days', 'DIRETO', c.id
    from "user" c where c.email = 'sonia@npac.com.br'`;
  await login(page, 'sonia@npac.com.br');
  await page.goto(`/leads/${lead!.id}`);
  await expect(page.getByRole('heading', { name: 'Reuniões' })).toBeVisible();
  await expect(page.getByLabel('A reunião já aconteceu')).toHaveCount(0);
});
