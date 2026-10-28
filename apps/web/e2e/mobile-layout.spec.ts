import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

// Roda no projeto 'iphone' (WebKit): é onde data/hora e select ganham largura própria.
const owner = ownerSql(E2E_DB);
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

/** Campos e botões fora do card que os contém (ignora faixas com rolagem horizontal própria). */
function overflowing(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea, button')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('.overflow-x-auto, nav')) continue;
      const card = el.parentElement?.closest('section, article, form, .glass-card');
      const limit = card ? card.getBoundingClientRect().right : vw;
      if (r.right > Math.min(limit, vw) + 1)
        out.push(
          `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.getAttribute('name') ?? el.textContent?.trim().slice(0, 20)}] ${Math.round(r.right)} > ${Math.round(limit)}`,
        );
    }
    return { pageOverflow: document.documentElement.scrollWidth > vw + 1, fields: out };
  });
}

test('nenhum campo estoura o container no iPhone', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill('ale@npac.com.br');
  await page.getByLabel('Senha').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL(/\/dashboard/);
  const [lead] = await owner<{ id: string }[]>`select id from leads where name = 'Lead do Ale'`;
  const problems: Record<string, unknown> = {};
  for (const path of [
    '/hoje',
    '/dashboard',
    '/relatorios',
    '/leads',
    '/leads/new',
    `/leads/${lead!.id}`,
    '/pipeline',
    '/chat',
    '/equipe',
    '/playbook',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('load');
    const r = await overflowing(page);
    if (r.pageOverflow || r.fields.length) problems[path] = r;
  }
  expect(problems).toEqual({});
});
