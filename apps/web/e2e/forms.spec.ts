import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_FORMS_TOKEN, E2E_PASSWORD } from './env.js';

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

test('resposta do Forms cria o lead, avisa no Hoje e aparece na ficha', async ({ page }) => {
  const stamp = Date.now();
  const name = `Pessoa Forms ${stamp}`;
  const res = await page.request.post('/api/webhooks/forms', {
    headers: { 'x-forms-token': E2E_FORMS_TOKEN },
    data: {
      responseId: `e2e-${stamp}`,
      submittedAt: new Date().toISOString(),
      name,
      instagram: `@forms.${stamp}`,
      incomeBand: 'R15_50K',
      answers: [{ q: 'Pergunta do teste', a: 'Resposta do teste' }],
    },
  });
  expect(await res.json()).toEqual({ status: 'created' });

  await login(page, 'ale@npac.com.br');
  await page.goto('/avisos');
  await expect(page.getByText(`${name} preencheu o formulário`)).toBeVisible();

  await page.goto('/hoje');
  const block = page.locator('section', {
    has: page.getByRole('heading', { name: /^Formulários novos/ }),
  });
  await expect(block.getByText(name)).toBeVisible();
  await page.screenshot({ path: 'test-results/hoje-formularios.png', fullPage: true });

  // Bloco e card sem estouro lateral nos tamanhos de tela do CRM.
  const [lead] = await owner<{ id: string }[]>`select id from leads where name = ${name}`;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1024, 768],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [label, path] of [
      ['hoje', '/hoje'],
      ['ficha', `/leads/${lead!.id}`],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `test-results/forms-${label}-${width}.png`, fullPage: true });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/hoje');

  await block.getByRole('link', { name: `Abrir ficha de ${name}` }).click();
  await page.waitForURL(/\/leads\/[0-9a-f-]{36}$/);
  const card = page.locator('section', {
    has: page.getByRole('heading', { name: 'Respostas do formulário' }),
  });
  await expect(card.getByText('Pergunta do teste')).toBeVisible();
  await expect(card.getByText('Resposta do teste')).toBeVisible();

  await expect(async () => {
    await page.goto('/hoje');
    await expect(page.getByRole('heading', { name: /^Formulários novos/ })).toHaveCount(0, {
      timeout: 1000,
    });
  }).toPass();
});
