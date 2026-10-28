import { gzipSync } from 'node:zlib';
import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { closeTestConnections, ownerSql } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

const owner = ownerSql(E2E_DB);

// O rate limit de login é real (5/min por IP); zera entre testes para não vazar de um para outro.
test.beforeEach(async () => {
  await owner`truncate rate_limit`;
});
test.afterAll(async () => closeTestConnections());

const errorAlert = (page: Page) =>
  page.getByRole('alert').and(page.getByText('E-mail ou senha inválidos'));

async function login(page: Page, email: string, password = E2E_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('SDR cadastra lead, escreve nota e conclui tarefa na ficha', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  await page.goto('/leads');
  await page.getByRole('link', { name: 'Novo lead', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Lead e2e CRM');
  await page.getByLabel('WhatsApp', { exact: true }).fill('11966665555');
  await page.getByLabel('Faixa de renda', { exact: true }).selectOption('R5_10K');
  await page.getByRole('button', { name: 'Cadastrar lead' }).click();
  await expect(page.getByRole('heading', { name: 'Lead e2e CRM', exact: true })).toBeVisible();
  await page.getByLabel('Nova nota', { exact: true }).fill('Retornar após a reunião');
  await page.getByRole('button', { name: 'Adicionar nota' }).click();
  await expect(page.getByText('Retornar após a reunião', { exact: true })).toBeVisible();
  await page.getByLabel('Nova tarefa', { exact: true }).fill('Enviar apresentação');
  await page.getByRole('button', { name: 'Adicionar tarefa' }).click();
  await page.getByRole('button', { name: 'Concluir Enviar apresentação', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reabrir Enviar apresentação' })).toBeVisible();
  await page.screenshot({ path: 'test-results/ficha.png', fullPage: true });
  await page.goto('/pipeline');
  await page
    .getByRole('combobox', { name: 'Mover Lead e2e CRM para', exact: true })
    .selectOption('EM_FOLLOW');
  await expect(
    page
      .getByRole('region', { name: 'Em Follow-up', exact: true })
      .getByText('Lead e2e CRM', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/pipeline.png', fullPage: true });
  await page.goto('/leads');
  await page.getByText('Filtrar e ordenar', { exact: true }).click();
  await page.getByLabel('Perfil do lead', { exact: true }).selectOption('P0');
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page.getByText('Lead e2e CRM', { exact: true })).toHaveCount(0);
});

test('SDR entra e vê só os próprios leads', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  await page.goto('/leads');
  await expect(page.getByText('Lead do Ale').filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Lead do Murilo')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/leads-desktop.png', fullPage: true });
});

test('senha errada mostra erro genérico', async ({ page }) => {
  await login(page, 'ale@npac.com.br', 'senha-errada-123');
  await expect(errorAlert(page)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('e-mail inexistente mostra o mesmo erro', async ({ page }) => {
  await login(page, 'ninguem@npac.com.br', 'senha-errada-123');
  await expect(errorAlert(page)).toBeVisible();
});

test('sem sessão redireciona para /login', async ({ page }) => {
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login/);
});

test('HEAD sem MFA é levado para configurar o autenticador', async ({ page }) => {
  await login(page, 'ana@npac.com.br');
  await expect(page).toHaveURL(/\/conta\/mfa/);
});

test('mobile mostra barra inferior', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  const nav = page.getByRole('navigation', { name: 'Navegação inferior' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('navigation', { name: 'Navegação lateral' })).toBeHidden();
  await page.goto('/leads');
  await page.screenshot({ path: 'test-results/leads-mobile.png', fullPage: true });
});

test('nada de dado pessoal no localStorage', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  await page.goto('/leads');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toMatch(/\d{8,}|@/);
});

test('página responde com CSP e sem cabeçalho do Next', async ({ page }) => {
  const res = await page.goto('/login');
  const headers = res?.headers() ?? {};
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/nonce-/);
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['referrer-policy']).toBe('no-referrer');
  await page.screenshot({ path: 'test-results/login.png', fullPage: true });
});

test('busca mantém contato fora da URL e alterna o tema', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  await page.goto('/leads');
  await page.getByRole('textbox').fill('@lead.do.ale');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByText('Lead do Ale').filter({ visible: true })).toBeVisible();
  expect(page.url()).not.toContain('lead.do.ale');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('lead.do.ale');
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

function totp(secret: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[19]! & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

for (const head of ['ana', 'ronaldo']) {
  test(`${head}: configura MFA e próximo login exige TOTP`, async ({ page }) => {
    await login(page, `${head}@npac.com.br`);
    await expect(page).toHaveURL(/\/conta\/mfa/);
    await page.getByLabel('Senha', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Continuar' }).click();
    const secret = await page.locator('code').innerText();
    await page.getByLabel('Código', { exact: true }).fill(totp(secret));
    await page.getByRole('button', { name: 'Ativar e entrar' }).click();
    await page.waitForURL(/\/hoje/);
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login/);
    await login(page, `${head}@npac.com.br`);
    await expect(page.getByRole('heading', { name: 'Confirme que é você' })).toBeVisible();
    await page.getByLabel('Código', { exact: true }).fill(totp(secret));
    await page.getByRole('button', { name: 'Verificar e entrar' }).click();
    await page.waitForURL(/\/hoje/);
  });
}

test('primeiro acesso exige trocar a senha', async ({ page }) => {
  await owner`update "user" set must_change_password = true where email = 'igor@npac.com.br'`;
  await login(page, 'igor@npac.com.br');
  await expect(page).toHaveURL(/\/conta\/senha/);
  await page.getByLabel('Senha atual', { exact: true }).fill(E2E_PASSWORD);
  await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-do-igor-123');
  await page.getByLabel('Confirme a nova senha').fill('nova-senha-do-igor-123');
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await page.waitForURL(/\/hoje/);
});

test('primeira carga de /leads fica abaixo de 150 KB de JS (gzip)', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  const sizes: Promise<number>[] = [];
  page.on('response', (res) => {
    if (res.request().resourceType() === 'script') {
      sizes.push(res.body().then((b) => gzipSync(b).length));
    }
  });
  await page.goto('/leads', { waitUntil: 'networkidle' });
  const total = (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  console.log(`JS de /leads (gzip): ${(total / 1024).toFixed(1)} KB`);
  expect(total).toBeLessThan(150 * 1024);
});

test('sair encerra a sessão', async ({ page }) => {
  await login(page, 'ale@npac.com.br');
  await page.waitForURL(/\/hoje/);
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/leads');
  await expect(page).toHaveURL(/\/login/);
});
